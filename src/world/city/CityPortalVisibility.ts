import * as THREE from 'three';
import type { RegionId, Vec3 } from '../../core/types';
import cityCellsRaw from '../../data/cityCells.json';
import cityPortalsRaw from '../../data/cityPortals.json';

export interface CellBounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface CityCellDefinition {
  id: string;
  index: number;
  name: string;
  nameEn: string;
  regionId: RegionId;
  priority: number;
  bounds: CellBounds3D;
  hysteresis: number;
  ambientZoneId: string;
  reverbPreset: string;
  isUnderground: boolean;
  overlookMinY?: number;
  vistaCells: string[];
  budget: {
    maxDrawCalls: number;
    maxTriangles: number;
  };
}

export interface CityPortalDefinition {
  id: string;
  cellA: string;
  cellB: string;
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  maxSightDist: number;
}

export interface CellVisibilityState {
  activeCellId: string;
  activeCell: CityCellDefinition;
  visibleCellIds: Set<string>;
  vistaCellIds: Set<string>;
  openPortalIds: Set<string>;
  isOverlookActive: boolean;
}

function containsWithMargin(b: CellBounds3D, p: Vec3, mx: number, my: number, mz: number): boolean {
  return (
    p.x >= b.minX - mx &&
    p.x <= b.maxX + mx &&
    p.y >= b.minY - my &&
    p.y <= b.maxY + my &&
    p.z >= b.minZ - mz &&
    p.z <= b.maxZ + mz
  );
}

function boxDistanceSq(b: CellBounds3D, p: Vec3): number {
  const dx = p.x < b.minX ? b.minX - p.x : p.x > b.maxX ? p.x - b.maxX : 0;
  const dy = p.y < b.minY ? b.minY - p.y : p.y > b.maxY ? p.y - b.maxY : 0;
  const dz = p.z < b.minZ ? b.minZ - p.z : p.z > b.maxZ ? p.z - b.maxZ : 0;
  return dx * dx + dy * dy + dz * dz;
}

export class CityPortalVisibility {
  readonly cells: CityCellDefinition[];
  readonly portals: CityPortalDefinition[];
  private readonly cellMap = new Map<string, CityCellDefinition>();
  private readonly portalsByCell = new Map<string, CityPortalDefinition[]>();

  private currentCellId = 'cell_01_barbican_gate';
  private debugEnabled = false;
  private debugGroup: THREE.Group | null = null;
  private readonly cellWireframes = new Map<string, THREE.LineSegments>();
  private readonly portalWireframes = new Map<string, THREE.LineLoop>();

  constructor() {
    this.cells = [...(cityCellsRaw.cells as CityCellDefinition[])].sort((a, b) => b.priority - a.priority);
    this.portals = cityPortalsRaw.portals as CityPortalDefinition[];

    for (const c of this.cells) {
      this.cellMap.set(c.id, c);
      this.portalsByCell.set(c.id, []);
    }
    for (const p of this.portals) {
      this.portalsByCell.get(p.cellA)?.push(p);
      this.portalsByCell.get(p.cellB)?.push(p);
    }
  }

  getCell(id: string): CityCellDefinition | undefined {
    return this.cellMap.get(id);
  }

  getPortalsForCell(cellId: string): CityPortalDefinition[] {
    return this.portalsByCell.get(cellId) ?? [];
  }

  /**
   * Resolves the active Cell containing `feetPos` with hysteresis padding to prevent
   * boundary oscillation when walking back and forth across a doorway threshold.
   */
  resolveActiveCell(feetPos: Vec3): CityCellDefinition {
    // 1. Underground cell takes crisp priority whenever feet descend below -0.55m
    const undercroft = this.cellMap.get('cell_08_undercroft_cellars');
    if (undercroft && feetPos.y < -0.55 && containsWithMargin(undercroft.bounds, feetPos, 2.0, 1.0, 2.0)) {
      this.currentCellId = undercroft.id;
      return undercroft;
    }

    // 2. Check strict containment among surface cells (sorted by priority)
    let strictMatch: CityCellDefinition | null = null;
    for (const c of this.cells) {
      if (c.isUnderground) continue;
      if (containsWithMargin(c.bounds, feetPos, 0, 0, 0)) {
        strictMatch = c;
        break;
      }
    }

    const prevCell = this.cellMap.get(this.currentCellId);
    if (prevCell && !prevCell.isUnderground) {
      const h = prevCell.hysteresis;
      // Stay in prevCell if still within its hysteresis band AND either no strict match or near shared border
      if (containsWithMargin(prevCell.bounds, feetPos, h, 1.2, h)) {
        if (!strictMatch || strictMatch.id === prevCell.id || containsWithMargin(prevCell.bounds, feetPos, 0.75, 0.8, 0.75)) {
          return prevCell;
        }
      }
    }

    if (strictMatch) {
      this.currentCellId = strictMatch.id;
      return strictMatch;
    }

    // 3. Nearest-AABB fallback (e.g. outer approach road or high tower parapet)
    let best = this.cells[1] ?? this.cells[0];
    let bestDist = Infinity;
    for (const c of this.cells) {
      if (c.isUnderground && feetPos.y >= -0.45) continue;
      const d = boxDistanceSq(c.bounds, feetPos);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    this.currentCellId = best.id;
    return best;
  }

  /**
   * Evaluates visible Cells, open Portals, and high-elevation Vista targets.
   */
  evaluate(
    feetPos: Vec3,
    lookDir?: Vec3,
    fovDeg = 68,
    aspect = 16 / 9,
  ): CellVisibilityState {
    const activeCell = this.resolveActiveCell(feetPos);
    const eyePos: Vec3 = { x: feetPos.x, y: feetPos.y + 1.65, z: feetPos.z };

    const visibleCellIds = new Set<string>([activeCell.id]);
    const vistaCellIds = new Set<string>();
    const openPortalIds = new Set<string>();

    const fovRad = THREE.MathUtils.degToRad(fovDeg);
    const halfDiagFov = Math.atan(Math.tan(fovRad * 0.5) * Math.hypot(1, aspect));

    const isPortalVisible = (portal: CityPortalDefinition, maxDistScale = 1.0): boolean => {
      const dx = portal.center.x - eyePos.x;
      const dy = portal.center.y - eyePos.y;
      const dz = portal.center.z - eyePos.z;
      const dist = Math.hypot(dx, dy, dz);
      const maxDist = portal.maxSightDist * maxDistScale;
      if (dist > maxDist) return false;

      // Unconditionally open when standing right inside or adjacent to the doorway/stairwell mouth
      const nearThreshold = portal.cellA === 'cell_08_undercroft_cellars' || portal.cellB === 'cell_08_undercroft_cellars' ? 3.8 : 5.4;
      if (dist <= nearThreshold) return true;

      if (!lookDir) return true;

      const invDist = 1 / Math.max(1e-4, dist);
      const dirX = dx * invDist;
      const dirY = dy * invDist;
      const dirZ = dz * invDist;
      const portalRadius = Math.hypot(portal.width, portal.height) * 0.62;
      const angularSlack = Math.atan2(portalRadius, dist) + 0.24;
      const cosLimit = Math.cos(Math.min(Math.PI, halfDiagFov + angularSlack));
      const dot = dirX * lookDir.x + dirY * lookDir.y + dirZ * lookDir.z;
      return dot >= cosLimit;
    };

    // Depth-1 Portals directly connected to activeCell
    const depth1Neighbors: Array<{ cellId: string; viaPortal: CityPortalDefinition }> = [];
    for (const p of this.getPortalsForCell(activeCell.id)) {
      const neighborId = p.cellA === activeCell.id ? p.cellB : p.cellA;
      if (isPortalVisible(p, 1.0)) {
        openPortalIds.add(p.id);
        visibleCellIds.add(neighborId);
        depth1Neighbors.push({ cellId: neighborId, viaPortal: p });
      }
    }

    // Depth-2 Portals (through an aligned open doorway into a second connected cell, never underground-to-surface-to-far)
    for (const { cellId: midCellId, viaPortal: p1 } of depth1Neighbors) {
      const midCell = this.cellMap.get(midCellId);
      if (!midCell || midCell.isUnderground) continue;
      const v1x = p1.center.x - eyePos.x;
      const v1z = p1.center.z - eyePos.z;
      const len1 = Math.hypot(v1x, v1z);
      if (len1 < 1e-3) continue;

      for (const p2 of this.getPortalsForCell(midCellId)) {
        if (p2.id === p1.id) continue;
        const farCellId = p2.cellA === midCellId ? p2.cellB : p2.cellA;
        if (visibleCellIds.has(farCellId)) continue;
        const farCell = this.cellMap.get(farCellId);
        if (farCell?.isUnderground) continue;

        const v2x = p2.center.x - p1.center.x;
        const v2z = p2.center.z - p1.center.z;
        const len2 = Math.hypot(v2x, v2z);
        if (len2 < 1e-3) continue;

        // Require sightline alignment through both portals (corners & bends stay occluded!)
        const align = (v1x * v2x + v1z * v2z) / (len1 * len2);
        if (align >= 0.52 && isPortalVisible(p2, 0.78)) {
          openPortalIds.add(p2.id);
          visibleCellIds.add(farCellId);
        }
      }
    }

    // High-Elevation Overlook / Rampart / Bell-Tower Vista Mode
    const isOverlookActive =
      !activeCell.isUnderground &&
      activeCell.overlookMinY !== undefined &&
      feetPos.y >= activeCell.overlookMinY;

    if (isOverlookActive) {
      for (const vId of activeCell.vistaCells) {
        vistaCellIds.add(vId);
        visibleCellIds.add(vId);
      }
    }

    const state: CellVisibilityState = {
      activeCellId: activeCell.id,
      activeCell,
      visibleCellIds,
      vistaCellIds,
      openPortalIds,
      isOverlookActive,
    };

    if (this.debugEnabled) {
      this.syncDebugVisuals(state);
    }
    return state;
  }

  /**
   * Computes whether a sound source in `sourceCellId` at `sourcePos` has an open portal
   * acoustic path to `listenerEyePos` in `listenerCellId`.
   * Returns occlusion factor in [0 = clear LOS, 1 = muffled behind thick masonry wall].
   */
  computeAcousticOcclusion(
    listenerCellId: string,
    listenerPos: Vec3,
    sourceCellId: string,
    sourcePos: Vec3,
  ): number {
    if (listenerCellId === sourceCellId) return 0.0;
    const shared = this.getPortalsForCell(listenerCellId).filter(
      (p) => p.cellA === sourceCellId || p.cellB === sourceCellId,
    );
    if (shared.length === 0) {
      return 0.92; // Separated by >= 2 cells / thick mountain masonry
    }

    // Check detour ratio through the nearest connecting portal
    const directDist = Math.max(0.5, Math.hypot(sourcePos.x - listenerPos.x, sourcePos.y - listenerPos.y, sourcePos.z - listenerPos.z));
    let minDetour = Infinity;
    for (const p of shared) {
      const dA = Math.hypot(p.center.x - listenerPos.x, p.center.y - listenerPos.y, p.center.z - listenerPos.z);
      const dB = Math.hypot(sourcePos.x - p.center.x, sourcePos.y - p.center.y, sourcePos.z - p.center.z);
      minDetour = Math.min(minDetour, (dA + dB) / directDist);
    }
    // detour ~ 1.0 means straight through open portal; detour > 1.35 means tucked around stone corner
    return THREE.MathUtils.clamp((minDetour - 1.03) / 0.45, 0.12, 0.85);
  }

  attachDebugGroup(parent: THREE.Group): THREE.Group {
    if (this.debugGroup) return this.debugGroup;
    const grp = new THREE.Group();
    grp.name = 'CityDebug_CellsAndPortals';
    grp.visible = this.debugEnabled;

    for (const c of this.cells) {
      const b = c.bounds;
      const sx = b.maxX - b.minX;
      const sy = b.maxY - b.minY;
      const sz = b.maxZ - b.minZ;
      const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const mat = new THREE.LineBasicMaterial({ color: 0x556677, transparent: true, opacity: 0.55, depthTest: true });
      const wire = new THREE.LineSegments(edges, mat);
      wire.position.set((b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5, (b.minZ + b.maxZ) * 0.5);
      wire.renderOrder = 999;
      grp.add(wire);
      this.cellWireframes.set(c.id, wire);
    }

    for (const p of this.portals) {
      const hw = p.width * 0.5;
      const hh = p.height * 0.5;
      const pts = [
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3(hw, -hh, 0),
        new THREE.Vector3(hw, hh, 0),
        new THREE.Vector3(-hw, hh, 0),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0xd94444, linewidth: 2 });
      const loop = new THREE.LineLoop(geo, mat);
      loop.position.set(p.center.x, p.center.y, p.center.z);
      const target = new THREE.Vector3(
        p.center.x + p.normal.x,
        p.center.y + p.normal.y,
        p.center.z + p.normal.z,
      );
      loop.lookAt(target);
      loop.renderOrder = 1000;
      grp.add(loop);
      this.portalWireframes.set(p.id, loop);
    }

    parent.add(grp);
    this.debugGroup = grp;
    return grp;
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (this.debugGroup) {
      this.debugGroup.visible = enabled;
    }
  }

  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  private syncDebugVisuals(state: CellVisibilityState): void {
    for (const [id, wire] of this.cellWireframes) {
      const mat = wire.material as THREE.LineBasicMaterial;
      if (id === state.activeCellId) {
        mat.color.setHex(0xffcf56); // Gold: Active Cell
        mat.opacity = 0.95;
      } else if (state.vistaCellIds.has(id)) {
        mat.color.setHex(0xc078ff); // Purple: Overlook Vista Cell
        mat.opacity = 0.72;
      } else if (state.visibleCellIds.has(id)) {
        mat.color.setHex(0x4ad8ff); // Cyan: Portal-Visible Neighbor Cell
        mat.opacity = 0.82;
      } else {
        mat.color.setHex(0x49535e); // Dim Slate: Culled Cell
        mat.opacity = 0.25;
      }
    }
    for (const [pid, loop] of this.portalWireframes) {
      const mat = loop.material as THREE.LineBasicMaterial;
      mat.color.setHex(state.openPortalIds.has(pid) ? 0x3ef07c : 0xe04848);
    }
  }

  dispose(): void {
    for (const w of this.cellWireframes.values()) {
      w.geometry.dispose();
      (w.material as THREE.Material).dispose();
    }
    for (const p of this.portalWireframes.values()) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.cellWireframes.clear();
    this.portalWireframes.clear();
  }
}
