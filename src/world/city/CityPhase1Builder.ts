import * as THREE from 'three';
import type { RegionId, Vec3 } from '../../core/types';
import cityLayoutRaw from '../../data/cityLayout.json';
import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { NPCInstance } from '../../npc/NPCSystem';
import type { InteractableRegistry } from '../InteractableRegistry';
import { CityAssetLoader, type PropInstanceTransform } from './CityAssetLoader';
import { CityCellManager } from './CityCellManager';
import { buildCityGroundMesh, getCityGroundHeight } from './CityGroundBuilder';
import { CityMaterialLibrary } from './CityMaterialLibrary';
import { getCityRegionFromCoords } from './CityRoadNetwork';

interface CityArchEntry {
  id: string;
  model: string;
  position: { x: number; y: number; z: number };
  yMode?: 'ground' | 'fixed';
  yOffset?: number;
  yaw: number;
  district?: string;
  cellId?: string;
  tier?: string;
  buildingClass?: string;
  isInterior?: boolean;
  cullDist?: number;
  colliders?: Array<{ center: [number, number, number]; half: [number, number, number] }>;
  cylinderColliders?: Array<{ center: [number, number, number]; halfHeight: number; radius: number }>;
  orientedColliders?: Array<{
    center: [number, number, number];
    half: [number, number, number];
    rot: [number, number, number];
  }>;
}

interface CityLoreEntry {
  id: string;
  label: string;
  title: string;
  body: string;
  position: Vec3;
  radius?: number;
  meshKind?: 'book' | 'board';
}

export interface CityChestEntry {
  id: string;
  label: string;
  position: Vec3;
  gold: number;
  items: Array<{ itemId: string; quantity: number }>;
}

interface CityBellEntry {
  id: string;
  label: string;
  position: Vec3;
  radius?: number;
}

const cityLayout = cityLayoutRaw as unknown as {
  spawnPoint: Vec3;
  portals: {
    toRavendale: { position: Vec3; targetPosition: Vec3; targetYaw: number; label: string };
  };
  architecture: CityArchEntry[];
  propBatches: Record<string, Array<{ x: number; z: number; yaw: number; scale: number; yOffset?: number; collider?: boolean }>>;
  lights: Array<{ id?: string; cellId?: string; position: Vec3; color: string; intensity: number; distance: number; alwaysOn?: boolean }>;
  loreInteractables?: CityLoreEntry[];
  cityChests?: CityChestEntry[];
  bellInteractables?: CityBellEntry[];
};

export interface CityBuildCallbacks {
  onExitCity: () => void;
  onLoreRead: (title: string, body: string) => void;
  onChestOpen?: (chest: CityChestEntry) => boolean;
  isChestOpened?: (chestId: string) => boolean;
  onRingBell?: () => void;
}

export interface BuiltAshenholdCity {
  materials: CityMaterialLibrary;
  cellManager: CityCellManager;
  groundVertices: Float32Array;
  groundIndices: Uint32Array;
  syncChestStates: () => void;
  update: (
    elapsed: number,
    dt: number,
    timeOfDay?: number,
    playerPos?: Vec3,
    lookDir?: Vec3,
    cityNpcs?: NPCInstance[],
    fovDeg?: number,
    aspect?: number,
  ) => void;
  dispose: () => void;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  origin: Vec3;
  phase: number;
  speed: number;
}

function createRadialGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 224, 150, 0.92)');
    grad.addColorStop(0.35, 'rgba(255, 166, 68, 0.42)');
    grad.addColorStop(0.7, 'rgba(255, 118, 36, 0.12)');
    grad.addColorStop(1.0, 'rgba(255, 96, 24, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

function createSmokeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(218, 214, 208, 0.34)');
    grad.addColorStop(0.5, 'rgba(198, 194, 190, 0.16)');
    grad.addColorStop(1.0, 'rgba(180, 178, 175, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  } catch {
    return null;
  }
}

export function getCityRegionAt(zOrX: number, zOpt?: number, yOpt?: number): RegionId {
  if (zOpt === undefined) {
    return getCityRegionFromCoords(0, zOrX);
  }
  return getCityRegionFromCoords(zOrX, zOpt, yOpt);
}

export async function buildAshenholdCity(
  parent: THREE.Group,
  physics: PhysicsWorld,
  registry: InteractableRegistry,
  callbacks: CityBuildCallbacks,
  options: { maxAnisotropy?: number; skipAssetFetch?: boolean; metalEnvMap?: THREE.Texture | null } = {},
): Promise<BuiltAshenholdCity> {
  const materials = new CityMaterialLibrary(options.maxAnisotropy ?? 8);
  materials.setMetalEnvironment(options.metalEnvMap ?? null);
  const loader = new CityAssetLoader(materials);
  const cellManager = new CityCellManager(parent, { loader, skipAssetFetch: options.skipAssetFetch });

  // 1. Chunked 8-Cell Hillside Terrain + Rapier Trimesh Physics
  const ground = buildCityGroundMesh(materials.streetMaterial);
  parent.add(ground.mesh);
  cellManager.registerGroundChunks(ground.chunks);
  for (const chunk of ground.chunks) {
    physics.addTerrainTrimesh(chunk.vertices, chunk.indices, 'ashenhold_city');
  }

  const skirtGeo = new THREE.PlaneGeometry(460, 460, 4, 4);
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x4b573b, roughness: 0.96, metalness: 0.0 });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(0, -5.2, -90);
  skirt.receiveShadow = true;
  parent.add(skirt);

  const resolvedArch = cityLayout.architecture.map((arch) => {
    const baseY =
      arch.yMode === 'ground'
        ? getCityGroundHeight(arch.position.x, arch.position.z) + (arch.yOffset ?? 0)
        : arch.position.y;
    const worldPos = { x: arch.position.x, y: baseY, z: arch.position.z };
    const cellId = arch.cellId ?? cellManager.classifyPositionToCell(worldPos, arch.district, arch.model);
    return {
      ...arch,
      worldPos,
      resolvedCellId: cellId,
    };
  });

  // 2. Register Exact Rapier Static Box, Cylinder & Oriented Ramp Colliders Across All 8 Cells
  for (const arch of resolvedArch) {
    if (arch.tier === 'decorative') continue;
    const pos = arch.worldPos;
    const yaw = arch.yaw;
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);

    if (arch.colliders) {
      for (const col of arch.colliders) {
        const [lx, ly, lz] = col.center;
        const [hx, hy, hz] = col.half;
        const wx = pos.x + lx * ca + lz * sa;
        const wz = pos.z - lx * sa + lz * ca;
        physics.addStaticBox({ x: hx, y: hy, z: hz }, { x: wx, y: pos.y + ly, z: wz }, yaw, 'ashenhold_city');
      }
    }
    if (arch.cylinderColliders) {
      for (const col of arch.cylinderColliders) {
        const [lx, ly, lz] = col.center;
        const wx = pos.x + lx * ca + lz * sa;
        const wz = pos.z - lx * sa + lz * ca;
        physics.addStaticCylinder(col.halfHeight, col.radius, { x: wx, y: pos.y + ly, z: wz }, 'ashenhold_city');
      }
    }
    if (arch.orientedColliders) {
      for (const col of arch.orientedColliders) {
        const [lx, ly, lz] = col.center;
        const [hx, hy, hz] = col.half;
        const [lpitch, lyaw, lroll] = col.rot;
        const wx = pos.x + lx * ca + lz * sa;
        const wz = pos.z - lx * sa + lz * ca;
        physics.addStaticOrientedBox(
          { x: hx, y: hy, z: hz },
          { x: wx, y: pos.y + ly, z: wz },
          { x: lpitch, y: yaw + lyaw, z: lroll },
          'ashenhold_city',
        );
      }
    }
  }

  // 3. Register Props & Partition into Owning Cells
  const SHADOW_CASTING_PROPS = new Set([
    'prop_cart.glb',
    'prop_lantern_post.glb',
    'sv_prop_timber_scaffold.glb',
    'sv_prop_iron_brazier.glb',
  ]);
  const propTransformsByModel = new Map<string, PropInstanceTransform[]>();

  for (const [modelName, entries] of Object.entries(cityLayout.propBatches)) {
    const list: PropInstanceTransform[] = [];
    const castShadow = SHADOW_CASTING_PROPS.has(modelName);
    for (const entry of entries) {
      const groundY = getCityGroundHeight(entry.x, entry.z);
      const y = groundY + (entry.yOffset ?? 0);
      const tf: PropInstanceTransform = { x: entry.x, y, z: entry.z, yaw: entry.yaw, scale: entry.scale };
      list.push(tf);

      const propCell = cellManager.classifyPositionToCell({ x: entry.x, y, z: entry.z });
      cellManager.registerProp(propCell, modelName, tf, castShadow);

      if (entry.collider) {
        if (modelName === 'prop_cart.glb') {
          physics.addStaticBox(
            { x: 0.78 * entry.scale, y: 0.65 * entry.scale, z: 1.15 * entry.scale },
            { x: entry.x, y: y + 0.65 * entry.scale, z: entry.z },
            entry.yaw,
            'ashenhold_city',
          );
        } else if (modelName === 'prop_trough.glb') {
          physics.addStaticBox({ x: 0.96, y: 0.45, z: 0.45 }, { x: entry.x, y: y + 0.45, z: entry.z }, entry.yaw, 'ashenhold_city');
        } else if (modelName === 'prop_bench.glb') {
          physics.addStaticBox(
            { x: 0.88 * entry.scale, y: 0.3, z: 0.24 * entry.scale },
            { x: entry.x, y: y + 0.25, z: entry.z },
            entry.yaw,
            'ashenhold_city',
          );
        } else {
          physics.addStaticCylinder(
            0.46 * entry.scale,
            0.42 * entry.scale,
            { x: entry.x, y: y + 0.46 * entry.scale, z: entry.z },
            'ashenhold_city',
          );
        }
      }
    }
    propTransformsByModel.set(modelName, list);
  }

  // 4. Reflective Water Surfaces Parented into Owning Cell Groups
  const troughEntry = (cityLayout.propBatches['prop_trough.glb'] ?? [])[0];
  if (troughEntry) {
    const troughY = getCityGroundHeight(troughEntry.x, troughEntry.z);
    const troughWater = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.56), materials.waterTroughMaterial);
    troughWater.rotation.x = -Math.PI / 2;
    troughWater.rotation.z = troughEntry.yaw;
    troughWater.position.set(troughEntry.x, troughY + 0.76, troughEntry.z);
    (cellManager.getCellGroup('cell_01_barbican_gate') ?? parent).add(troughWater);
  }

  const fountainArch = resolvedArch.find((a) => a.id === 'landmark_market_fountain');
  if (fountainArch) {
    const fBaseY = fountainArch.worldPos.y;
    const lowerWater = new THREE.Mesh(new THREE.CircleGeometry(3.38, 8), materials.waterTroughMaterial);
    lowerWater.rotation.x = -Math.PI / 2;
    lowerWater.position.set(fountainArch.worldPos.x, fBaseY + 1.09, fountainArch.worldPos.z);
    const upperWater = new THREE.Mesh(new THREE.CircleGeometry(1.42, 12), materials.waterTroughMaterial);
    upperWater.rotation.x = -Math.PI / 2;
    upperWater.position.set(fountainArch.worldPos.x, fBaseY + 2.94, fountainArch.worldPos.z);
    (cellManager.getCellGroup('cell_03_market_plaza') ?? parent).add(lowerWater, upperWater);
  }

  // Smithy quench trough water (Cell 04) & Residential courtyard well water (Cell 05)
  const quenchWater = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.42), materials.waterTroughMaterial);
  quenchWater.rotation.x = -Math.PI / 2;
  quenchWater.position.set(-33.5, 7.78, -32.4);
  (cellManager.getCellGroup('cell_04_artisan_quarter') ?? parent).add(quenchWater);

  const wellWater = new THREE.Mesh(new THREE.CircleGeometry(0.86, 8), materials.waterTroughMaterial);
  wellWater.rotation.x = -Math.PI / 2;
  wellWater.position.set(37.2, 8.22, -47.2);
  (cellManager.getCellGroup('cell_05_residential_heights') ?? parent).add(wellWater);

  const undercroftGroup = cellManager.getCellGroup('cell_08_undercroft_cellars') ?? parent;
  const undercroftArch = resolvedArch.find((a) => a.model === 'sv_hero_undercroft.glb');
  if (undercroftArch) {
    const drainWater = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 20.4), materials.waterTroughMaterial);
    drainWater.rotation.x = -Math.PI / 2;
    drainWater.position.set(undercroftArch.worldPos.x, undercroftArch.worldPos.y - 0.14, undercroftArch.worldPos.z + 1.5);
    undercroftGroup.add(drainWater);
  }

  // 5. Register Architecture & Room-Level Interiors into CityCellManager
  for (const arch of resolvedArch) {
    const batchEntry = {
      filename: arch.model,
      x: arch.worldPos.x,
      y: arch.worldPos.y,
      z: arch.worldPos.z,
      yaw: arch.yaw,
      castShadow: !arch.isInterior && arch.resolvedCellId !== 'cell_08_undercroft_cellars' && arch.tier !== 'decorative',
      receiveShadow: true,
    };

    if (arch.isInterior) {
      const extent = arch.cullDist ?? 28;
      cellManager.registerInterior(arch.resolvedCellId, arch.id, batchEntry, extent * 0.65, -2.5, 11.5);
    } else {
      cellManager.registerArchitecture(arch.resolvedCellId, batchEntry);
    }
  }

  await cellManager.bootstrapInitialCells(cityLayout.spawnPoint ?? { x: -6.2, y: 0.35, z: 34.8 }, true);

  // 6. Register Virtual Warm Point Lights Across All 8 Cells (Pooled onto <= 6 Active GPU Lights)
  for (let i = 0; i < cityLayout.lights.length; i++) {
    const lCfg = cityLayout.lights[i];
    const cellId = lCfg.cellId ?? cellManager.classifyPositionToCell(lCfg.position);
    cellManager.registerVirtualLight({
      id: lCfg.id ?? `vlight_${i}`,
      cellId,
      position: lCfg.position,
      color: lCfg.color,
      intensity: lCfg.intensity,
      distance: lCfg.distance,
      alwaysOn: Boolean(lCfg.alwaysOn) || lCfg.position.y < 0.0,
      phase: i * 1.37,
    });
  }

  const glowTex = createRadialGlowTexture();
  const glowSprites: THREE.Sprite[] = [];
  if (glowTex) {
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb862,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (const p of propTransformsByModel.get('prop_lantern_post.glb') ?? []) {
      const bulbX = p.x + Math.cos(-p.yaw) * 0.72 * p.scale;
      const bulbZ = p.z + Math.sin(-p.yaw) * 0.72 * p.scale;
      const sp = new THREE.Sprite(glowMat);
      sp.position.set(bulbX, p.y + 2.48 * p.scale, bulbZ);
      sp.scale.set(0.85, 0.85, 0.85);
      const cid = cellManager.classifyPositionToCell(sp.position);
      (cellManager.getCellGroup(cid) ?? parent).add(sp);
      glowSprites.push(sp);
    }
  }

  // 7. Distance-Culled Chimney Smoke Wisps (Tavern, Market Bakery & Twin Artisan Forge Chimneys!)
  const smokePuffs: SmokePuff[] = [];
  const smokeTex = createSmokeTexture();
  if (smokeTex) {
    const chimneyOrigins: Array<{ pos: Vec3; cellId: string }> = [
      { pos: { x: 11.8, y: 12.6, z: -6.0 }, cellId: 'cell_02_trade_street' },
      { pos: { x: 17.2, y: 14.2, z: -24.8 }, cellId: 'cell_03_market_plaza' },
      { pos: { x: -39.2, y: 22.8, z: -33.0 }, cellId: 'cell_04_artisan_quarter' },
      { pos: { x: -39.2, y: 21.2, z: -36.5 }, cellId: 'cell_04_artisan_quarter' },
    ];
    for (const { pos: origin, cellId } of chimneyOrigins) {
      const cellGrp = cellManager.getCellGroup(cellId) ?? parent;
      for (let i = 0; i < 2; i++) {
        const smMat = new THREE.SpriteMaterial({
          map: smokeTex,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
        });
        const sp = new THREE.Sprite(smMat);
        sp.position.set(origin.x, origin.y, origin.z);
        cellGrp.add(sp);
        smokePuffs.push({
          sprite: sp,
          origin,
          phase: i * 0.5,
          speed: 0.13 + i * 0.03,
        });
      }
    }
  }

  // 8. Return Portal Milestone, Lore Books/Boards, Interactive Belfry Bell & 5 Reward Chests
  const portalPos = cityLayout.portals.toRavendale.position;
  const milestoneGroup = new THREE.Group();
  milestoneGroup.position.set(portalPos.x - 1.8, getCityGroundHeight(portalPos.x - 1.8, portalPos.z), portalPos.z);
  const stonePost = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 1.55, 0.38),
    materials.getMaterial('stone_trim', false),
  );
  stonePost.position.y = 0.78;
  stonePost.castShadow = true;
  const signPlank = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.28, 0.09),
    materials.getMaterial('planks_oak', false),
  );
  signPlank.position.set(0.32, 1.28, 0);
  signPlank.rotation.y = -0.18;
  milestoneGroup.add(stonePost, signPlank);
  (cellManager.getCellGroup('cell_01_barbican_gate') ?? parent).add(milestoneGroup);

  registry.register({
    id: 'portal:city_exit',
    kind: 'portal',
    label: cityLayout.portals.toRavendale.label,
    zone: 'ashenhold_city',
    position: { ...portalPos },
    radius: 4.0,
    enabled: true,
    mesh: milestoneGroup,
    onInteract: callbacks.onExitCity,
  });

  const makeBoardMesh = (x: number, y: number, z: number, targetParent: THREE.Object3D): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const postA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), materials.getMaterial('timber_oak', false));
    postA.position.set(-0.58, 0.95, 0);
    const postB = postA.clone();
    postB.position.x = 0.58;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.86, 0.08), materials.getMaterial('planks_oak', false));
    board.position.y = 1.35;
    const parchment = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.62, 0.095),
      new THREE.MeshStandardMaterial({ color: 0xdfd0b0, roughness: 0.9 }),
    );
    parchment.position.y = 1.35;
    g.add(postA, postB, board, parchment);
    targetParent.add(g);
    return g;
  };

  for (const lore of cityLayout.loreInteractables ?? []) {
    const cid = cellManager.classifyPositionToCell(lore.position);
    const targetParent = cellManager.getCellGroup(cid) ?? parent;
    let loreMesh: THREE.Object3D;
    if (lore.meshKind === 'board') {
      loreMesh = makeBoardMesh(lore.position.x, lore.position.y, lore.position.z, targetParent);
    } else {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.08, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x6f2d21, roughness: 0.72 }),
      );
      book.position.set(lore.position.x, lore.position.y, lore.position.z);
      targetParent.add(book);
      loreMesh = book;
    }
    registry.register({
      id: lore.id,
      kind: 'lore',
      label: lore.label,
      zone: 'ashenhold_city',
      position: { ...lore.position },
      radius: lore.radius ?? 3.4,
      enabled: true,
      mesh: loreMesh,
      onInteract: () => callbacks.onLoreRead(lore.title, lore.body),
    });
  }

  const cityChestVisuals: Array<{ id: string; lidMesh: THREE.Mesh }> = [];
  for (const chest of cityLayout.cityChests ?? []) {
    const cid = cellManager.classifyPositionToCell(chest.position);
    const targetParent = cellManager.getCellGroup(cid) ?? parent;
    const chestGroup = new THREE.Group();
    chestGroup.position.set(chest.position.x, chest.position.y, chest.position.z);
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.56, 0.62),
      materials.getMaterial('aged_oak_timber', false),
    );
    boxMesh.position.y = 0.28;
    boxMesh.castShadow = true;
    const lidMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.16, 0.66),
      materials.getMaterial('iron_forged', false),
    );
    lidMesh.position.y = 0.62;
    chestGroup.add(boxMesh, lidMesh);
    targetParent.add(chestGroup);
    cityChestVisuals.push({ id: chest.id, lidMesh });

    const alreadyOpened = callbacks.isChestOpened?.(chest.id) ?? false;
    if (alreadyOpened) {
      lidMesh.rotation.x = -0.65;
      lidMesh.position.set(0, 0.76, -0.22);
    }
    registry.register({
      id: chest.id,
      kind: 'chest',
      label: chest.label,
      zone: 'ashenhold_city',
      position: { ...chest.position },
      radius: 3.2,
      enabled: !alreadyOpened,
      mesh: chestGroup,
      onInteract: () => {
        const ok = callbacks.onChestOpen ? callbacks.onChestOpen(chest) : true;
        if (ok) {
          lidMesh.rotation.x = -0.65;
          lidMesh.position.set(0, 0.76, -0.22);
          registry.setEnabled(chest.id, false);
        }
      },
    });
  }

  for (const bell of cityLayout.bellInteractables ?? []) {
    const cid = cellManager.classifyPositionToCell(bell.position);
    const targetParent = cellManager.getCellGroup(cid) ?? parent;
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6),
      materials.getMaterial('cloth_ochre', false),
    );
    rope.position.set(bell.position.x, bell.position.y + 1.2, bell.position.z);
    targetParent.add(rope);
    registry.register({
      id: bell.id,
      kind: 'lore',
      label: bell.label,
      zone: 'ashenhold_city',
      position: { ...bell.position },
      radius: bell.radius ?? 3.8,
      enabled: true,
      mesh: rope,
      onInteract: () => callbacks.onRingBell?.(),
    });
  }

  return {
    materials,
    cellManager,
    groundVertices: ground.vertices,
    groundIndices: ground.indices,
    syncChestStates: () => {
      for (const cv of cityChestVisuals) {
        const opened = callbacks.isChestOpened?.(cv.id) ?? false;
        cv.lidMesh.rotation.x = opened ? -0.65 : 0;
        cv.lidMesh.position.set(0, opened ? 0.76 : 0.62, opened ? -0.22 : 0);
        registry.setEnabled(cv.id, !opened);
      }
    },
    update: (
      elapsed: number,
      dt: number,
      timeOfDay = 12.0,
      playerPos?: Vec3,
      lookDir?: Vec3,
      cityNpcs?: NPCInstance[],
      fovDeg = 68,
      aspect = 16 / 9,
    ) => {
      const solarY = Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2);
      const nightBlend = 1.0 - THREE.MathUtils.smoothstep(solarY, -0.08, 0.45);
      materials.setDayNightGlow(nightBlend);

      const glowOpacity = THREE.MathUtils.lerp(0.24, 0.88, nightBlend);
      for (const sp of glowSprites) {
        sp.material.opacity = glowOpacity;
      }

      if (playerPos) {
        cellManager.update(elapsed, nightBlend, playerPos, lookDir, cityNpcs, fovDeg, aspect);
      }

      for (const puff of smokePuffs) {
        if (playerPos) {
          const dx = puff.origin.x - playerPos.x;
          const dz = puff.origin.z - playerPos.z;
          const inRange = playerPos.y >= -0.5 && dx * dx + dz * dz <= 4225;
          puff.sprite.visible = inRange;
          if (!inRange) continue;
        }
        puff.phase = (puff.phase + dt * puff.speed) % 1;
        const t = puff.phase;
        puff.sprite.position.set(
          puff.origin.x + Math.sin(elapsed * 0.9 + t * 5.0) * (0.25 + t * 0.95) + t * 0.85,
          puff.origin.y + t * 5.8,
          puff.origin.z + Math.cos(elapsed * 0.7 + t * 4.0) * (0.2 + t * 0.55),
        );
        const s = 0.65 + t * 2.2;
        puff.sprite.scale.set(s, s, s);
        puff.sprite.material.opacity = Math.sin(t * Math.PI) * 0.28;
      }
    },
    dispose: () => {
      cellManager.dispose();
      materials.dispose();
      glowTex?.dispose();
      smokeTex?.dispose();
    },
  };
}
