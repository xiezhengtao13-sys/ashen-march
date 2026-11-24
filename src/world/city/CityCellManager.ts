import * as THREE from 'three';
import type { Vec3 } from '../../core/types';
import type { NPCInstance } from '../../npc/NPCSystem';
import type { CityAssetLoader, PropInstanceTransform, StaticBatchEntry } from './CityAssetLoader';
import type { GroundChunkData } from './CityGroundBuilder';
import { CityPortalVisibility, type CellVisibilityState, type CityCellDefinition } from './CityPortalVisibility';

export interface VirtualCityLight {
  id: string;
  cellId: string;
  position: Vec3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  alwaysOn: boolean;
  phase: number;
}

export interface CityCellTelemetry {
  activeCellId: string;
  activeCellName: string;
  activeCells: string[];
  activeCellCount: number;
  vistaCells: string[];
  openPortals: string[];
  isOverlookVista: boolean;
  visibleBuildings: number;
  totalBuildings: number;
  visibleNpcs: number;
  activePointLights: number;
  loadedCells: number;
  lastCellSwitchMs: number;
  debugEnabled: boolean;
}

interface InteriorRule {
  id: string;
  cellId: string;
  group: THREE.Group;
  center: Vec3;
  halfExtentXZ: number;
  minYOffset: number;
  maxYOffset: number;
}

interface CellRuntimeBucket {
  def: CityCellDefinition;
  rootGroup: THREE.Group;
  archEntries: StaticBatchEntry[];
  propEntries: Map<string, { list: PropInstanceTransform[]; castShadow: boolean }>;
  interiorSpecs: Array<{
    id: string;
    entry: StaticBatchEntry;
    halfExtentXZ: number;
    minYOffset: number;
    maxYOffset: number;
  }>;
  buildingCount: number;
  state: 'unloaded' | 'loading' | 'ready';
  loadPromise: Promise<void> | null;
  loadDurationMs: number;
}

const LIGHT_POOL_SIZE = 6;

export class CityCellManager {
  readonly portalVis = new CityPortalVisibility();
  private readonly buckets = new Map<string, CellRuntimeBucket>();
  private readonly interiorRules: InteriorRule[] = [];
  private readonly groundByCell = new Map<string, THREE.Mesh[]>();
  private readonly alwaysGround: THREE.Mesh[] = [];
  private readonly virtualLights: VirtualCityLight[] = [];
  private readonly lightPool: THREE.PointLight[] = [];

  private loader: CityAssetLoader | null = null;
  private skipAssetFetch = false;
  private totalBuildings = 0;
  private visibleBuildings = 0;
  private visibleNpcs = 0;
  private activePointLights = 0;
  private prevActiveCellId = '';
  private lastCellSwitchMs = 0;
  private lastState: CellVisibilityState | null = null;

  constructor(parent: THREE.Group, options: { loader: CityAssetLoader; skipAssetFetch?: boolean }) {
    this.loader = options.loader;
    this.skipAssetFetch = Boolean(options.skipAssetFetch);

    for (const def of this.portalVis.cells) {
      const grp = new THREE.Group();
      grp.name = def.id === 'cell_08_undercroft_cellars' ? 'CityZone_UndercroftSublevel' : `CityCell_${def.id}`;
      parent.add(grp);
      this.buckets.set(def.id, {
        def,
        rootGroup: grp,
        archEntries: [],
        propEntries: new Map(),
        interiorSpecs: [],
        buildingCount: 0,
        state: this.skipAssetFetch ? 'ready' : 'unloaded',
        loadPromise: null,
        loadDurationMs: 0,
      });
    }

    // Fixed 6-light WebGL pool prevents dynamic NUM_POINT_LIGHTS shader recompilation stalls
    const lightPoolGroup = new THREE.Group();
    lightPoolGroup.name = 'CityLightPool_6';
    parent.add(lightPoolGroup);
    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const pl = new THREE.PointLight(0xffa44c, 0, 16, 1.55);
      pl.position.set(0, -500, 0);
      lightPoolGroup.add(pl);
      this.lightPool.push(pl);
    }

    this.portalVis.attachDebugGroup(parent);
  }

  getCellGroup(cellId: string): THREE.Group | undefined {
    return this.buckets.get(cellId)?.rootGroup;
  }

  /**
   * Maps a world 3D coordinate (+ optional district hint) to one of the 8 Cell IDs.
   */
  classifyPositionToCell(pos: Vec3, districtHint?: string, modelName?: string): string {
    if (modelName?.includes('undercroft') || pos.y < -0.55) {
      return 'cell_08_undercroft_cellars';
    }
    if (districtHint === 'ashenhold_undercroft') return 'cell_08_undercroft_cellars';
    if (districtHint === 'ashenhold_artisan_quarter' && pos.x < -16.0) return 'cell_04_artisan_quarter';
    if (districtHint === 'ashenhold_residential_quarter' && pos.x > 16.0) return 'cell_05_residential_heights';
    if (districtHint === 'ashenhold_castle_approach' || pos.z <= -103.5) return 'cell_07_lord_castle';
    if (districtHint === 'ashenhold_temple_acropolis' && pos.z <= -52.8) return 'cell_06_temple_acropolis';

    // Exact 3D bounds lookup without hysteresis
    for (const c of this.portalVis.cells) {
      if (c.isUnderground) continue;
      const b = c.bounds;
      if (pos.x >= b.minX && pos.x <= b.maxX && pos.z >= b.minZ && pos.z <= b.maxZ) {
        return c.id;
      }
    }
    return this.portalVis.resolveActiveCell(pos).id;
  }

  registerGroundChunks(chunks: GroundChunkData[]): void {
    for (const ch of chunks) {
      const n = ch.mesh.name;
      if (n.includes('Cell04')) {
        this.pushGround('cell_04_artisan_quarter', ch.mesh);
      } else if (n.includes('Cell05')) {
        this.pushGround('cell_05_residential_heights', ch.mesh);
      } else if (n.includes('Cell06')) {
        this.pushGround('cell_06_temple_acropolis', ch.mesh);
      } else if (n.includes('Cell07')) {
        this.pushGround('cell_07_lord_castle', ch.mesh);
      } else if (n.includes('Cell03')) {
        this.pushGround('cell_03_market_plaza', ch.mesh);
      } else if (n.includes('Cell01_02')) {
        this.pushGround('cell_01_barbican_gate', ch.mesh);
        this.pushGround('cell_02_trade_street', ch.mesh);
      } else {
        // Outer mountain ridges remain visible anywhere on surface, hidden deep underground
        this.alwaysGround.push(ch.mesh);
      }
    }
  }

  private pushGround(cellId: string, mesh: THREE.Mesh): void {
    const arr = this.groundByCell.get(cellId) ?? [];
    arr.push(mesh);
    this.groundByCell.set(cellId, arr);
  }

  registerArchitecture(cellId: string, entry: StaticBatchEntry): void {
    const b = this.buckets.get(cellId);
    if (!b) return;
    b.archEntries.push(entry);
    b.buildingCount++;
    this.totalBuildings++;
  }

  registerInterior(
    cellId: string,
    id: string,
    entry: StaticBatchEntry,
    halfExtentXZ = 10.8,
    minYOffset = -1.4,
    maxYOffset = 7.8,
  ): void {
    const b = this.buckets.get(cellId);
    if (!b) return;
    b.interiorSpecs.push({ id, entry, halfExtentXZ, minYOffset, maxYOffset });
  }

  registerProp(cellId: string, modelName: string, transform: PropInstanceTransform, castShadow: boolean): void {
    const b = this.buckets.get(cellId);
    if (!b) return;
    let rec = b.propEntries.get(modelName);
    if (!rec) {
      rec = { list: [], castShadow };
      b.propEntries.set(modelName, rec);
    }
    rec.list.push(transform);
  }

  registerVirtualLight(light: Omit<VirtualCityLight, 'color'> & { color: string }): void {
    this.virtualLights.push({
      ...light,
      color: new THREE.Color(light.color),
    });
  }

  /**
   * Streams/builds static & instanced GPU batches for a specific Cell on demand and caches them.
   */
  ensureCellLoaded(cellId: string): Promise<void> {
    const bucket = this.buckets.get(cellId);
    if (!bucket || bucket.state === 'ready' || this.skipAssetFetch || !this.loader || typeof fetch === 'undefined') {
      if (bucket) bucket.state = 'ready';
      return Promise.resolve();
    }
    if (bucket.loadPromise) return bucket.loadPromise;

    bucket.state = 'loading';
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const loader = this.loader;

    const tasks: Promise<unknown>[] = [];
    if (bucket.archEntries.length > 0) {
      tasks.push(
        loader.createDistrictStaticBatch(`CellBatch_${cellId}`, bucket.archEntries, bucket.rootGroup),
      );
    }
    for (const spec of bucket.interiorSpecs) {
      tasks.push(
        loader
          .createDistrictStaticBatch(`CellInterior_${spec.id}`, [spec.entry], bucket.rootGroup)
          .then((grp) => {
            this.interiorRules.push({
              id: spec.id,
              cellId,
              group: grp,
              center: { x: spec.entry.x, y: spec.entry.y, z: spec.entry.z },
              halfExtentXZ: spec.halfExtentXZ,
              minYOffset: spec.minYOffset,
              maxYOffset: spec.maxYOffset,
            });
          }),
      );
    }
    for (const [modelName, rec] of bucket.propEntries.entries()) {
      if (rec.list.length > 0) {
        tasks.push(loader.createInstancedPropBatch(modelName, rec.list, bucket.rootGroup, rec.castShadow));
      }
    }

    bucket.loadPromise = Promise.all(tasks).then(() => {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      bucket.loadDurationMs = Number((t1 - t0).toFixed(2));
      bucket.state = 'ready';
    });
    return bucket.loadPromise;
  }

  /**
   * Initial bootstrap: loads the starting Cell + immediate portal neighbors first, then
   * preloads remaining cells asynchronously in background order so initial startup is fast
   * and portal crossings never stutter.
   */
  async bootstrapInitialCells(spawnPos: Vec3, awaitAllForDeterministicScreenshots = true): Promise<void> {
    const initial = this.portalVis.evaluate(spawnPos);
    const priorityIds = new Set<string>([initial.activeCellId, ...initial.visibleCellIds]);
    for (const p of this.portalVis.getPortalsForCell(initial.activeCellId)) {
      priorityIds.add(p.cellA);
      priorityIds.add(p.cellB);
    }

    await Promise.all([...priorityIds].map((id) => this.ensureCellLoaded(id)));

    const remainingIds = this.portalVis.cells.map((c) => c.id).filter((id) => !priorityIds.has(id));
    const bgPromise = Promise.all(remainingIds.map((id) => this.ensureCellLoaded(id)));
    if (awaitAllForDeterministicScreenshots) {
      await bgPromise;
    } else {
      void bgPromise;
    }
  }

  /**
   * Updates per-frame Cell & Portal visibility, Room-level Interior culling, NPC culling,
   * Ground chunk culling, and Pooled 6-PointLight assignment.
   */
  update(
    elapsed: number,
    nightBlend: number,
    playerPos: Vec3,
    lookDir?: Vec3,
    cityNpcs?: NPCInstance[],
    fovDeg = 68,
    aspect = 16 / 9,
  ): CellVisibilityState {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const state = this.portalVis.evaluate(playerPos, lookDir, fovDeg, aspect);
    this.lastState = state;

    // Trigger non-blocking preload of any neighbor cell connected to activeCell
    for (const p of this.portalVis.getPortalsForCell(state.activeCellId)) {
      void this.ensureCellLoaded(p.cellA);
      void this.ensureCellLoaded(p.cellB);
    }

    // 1. Toggle Cell Root Groups & Count Visible Architecture
    let visBuildings = 0;
    for (const [cellId, bucket] of this.buckets) {
      const isVis = state.visibleCellIds.has(cellId);
      bucket.rootGroup.visible = isVis;
      if (isVis) {
        visBuildings += bucket.buildingCount;
      }
    }
    this.visibleBuildings = visBuildings;

    // 2. Toggle Room-Level Interiors inside Visible Cells
    for (const rule of this.interiorRules) {
      if (!state.visibleCellIds.has(rule.cellId)) {
        rule.group.visible = false;
        continue;
      }
      const inRange =
        Math.abs(playerPos.x - rule.center.x) <= rule.halfExtentXZ &&
        Math.abs(playerPos.z - rule.center.z) <= rule.halfExtentXZ &&
        playerPos.y >= rule.center.y + rule.minYOffset &&
        playerPos.y <= rule.center.y + rule.maxYOffset;
      rule.group.visible = inRange;
    }

    // 3. Toggle Ground Chunks (hide surface chunks when deep underground away from stairwells; cull far wings)
    const inDeepUndercroft =
      state.activeCellId === 'cell_08_undercroft_cellars' && state.visibleCellIds.size === 1;
    const processedMeshes = new Set<THREE.Mesh>();
    for (const meshes of this.groundByCell.values()) {
      for (const m of meshes) {
        m.visible = false;
        processedMeshes.add(m);
      }
    }
    if (!inDeepUndercroft) {
      for (const [cellId, meshes] of this.groundByCell) {
        // Keep activeCell + visibleCells + immediate neighbor ground visible so terrain seams never show
        const showGround =
          state.visibleCellIds.has(cellId) ||
          cellId === 'cell_01_barbican_gate' ||
          cellId === 'cell_02_trade_street' ||
          cellId === 'cell_03_market_plaza';
        if (showGround) {
          for (const m of meshes) {
            if (processedMeshes.has(m)) m.visible = true;
          }
        }
      }
    }
    for (const ridge of this.alwaysGround) {
      ridge.visible = !inDeepUndercroft;
    }

    // 4. Dynamic NPC Visibility per Cell
    let visNpcCount = 0;
    if (cityNpcs) {
      for (const npc of cityNpcs) {
        if (npc.def.zone !== 'ashenhold_city') continue;
        const npcCell = this.classifyPositionToCell(npc.group.position);
        const show = state.visibleCellIds.has(npcCell);
        npc.group.visible = show;
        if (show) visNpcCount++;
      }
    }
    this.visibleNpcs = visNpcCount;

    // 5. Assign Fixed 6-PointLight GPU Pool to Highest-Priority Visible Lights
    const lightScale = THREE.MathUtils.lerp(0.24, 1.35, nightBlend);
    const scored: Array<{ vl: VirtualCityLight; score: number; dist: number }> = [];
    for (const vl of this.virtualLights) {
      if (!state.visibleCellIds.has(vl.cellId)) continue;
      const dx = vl.position.x - playerPos.x;
      const dy = vl.position.y - (playerPos.y + 1.4);
      const dz = vl.position.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > vl.distance * 2.35) continue;
      const bonus = vl.cellId === state.activeCellId ? 18.0 : 0.0;
      const alwaysBonus = vl.alwaysOn ? 10.0 : 0.0;
      scored.push({ vl, score: bonus + alwaysBonus - dist, dist });
    }
    scored.sort((a, b) => b.score - a.score);

    let activeLights = 0;
    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const slot = this.lightPool[i];
      const pick = scored[i];
      if (!pick) {
        slot.intensity = 0;
        slot.position.set(0, -500, 0);
        continue;
      }
      const { vl, dist } = pick;
      const distFade = 1.0 - THREE.MathUtils.smoothstep(dist, vl.distance * 1.45, vl.distance * 2.3);
      const flicker =
        Math.sin(elapsed * 7.6 + vl.phase) * 0.11 + Math.sin(elapsed * 12.9 + vl.phase) * 0.05;
      const scale = vl.alwaysOn ? THREE.MathUtils.lerp(1.05, 1.35, nightBlend) : lightScale;
      const finalIntensity = Math.max(0, (vl.intensity + flicker) * scale * distFade);

      slot.color.copy(vl.color);
      slot.distance = vl.distance;
      slot.position.set(vl.position.x, vl.position.y, vl.position.z);
      slot.intensity = finalIntensity;
      if (finalIntensity > 0.05) activeLights++;
    }
    this.activePointLights = activeLights;

    if (state.activeCellId !== this.prevActiveCellId) {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const bucketLoad = this.buckets.get(state.activeCellId)?.loadDurationMs ?? 0;
      this.lastCellSwitchMs = Number(Math.max(t1 - t0, bucketLoad * 0.05).toFixed(2));
      this.prevActiveCellId = state.activeCellId;
    }

    return state;
  }

  setCellDebug(enabled: boolean): void {
    this.portalVis.setDebugEnabled(enabled);
  }

  getTelemetry(): CityCellTelemetry {
    const st = this.lastState;
    let loadedCells = 0;
    for (const b of this.buckets.values()) {
      if (b.state === 'ready') loadedCells++;
    }
    return {
      activeCellId: st?.activeCellId ?? 'cell_01_barbican_gate',
      activeCellName: st?.activeCell.name ?? '南城门与瓮城',
      activeCells: st ? [...st.visibleCellIds] : ['cell_01_barbican_gate'],
      activeCellCount: st?.visibleCellIds.size ?? 1,
      vistaCells: st ? [...st.vistaCellIds] : [],
      openPortals: st ? [...st.openPortalIds] : [],
      isOverlookVista: st?.isOverlookActive ?? false,
      visibleBuildings: this.visibleBuildings,
      totalBuildings: this.totalBuildings,
      visibleNpcs: this.visibleNpcs,
      activePointLights: this.activePointLights,
      loadedCells,
      lastCellSwitchMs: this.lastCellSwitchMs,
      debugEnabled: this.portalVis.isDebugEnabled(),
    };
  }

  dispose(): void {
    this.portalVis.dispose();
  }
}
