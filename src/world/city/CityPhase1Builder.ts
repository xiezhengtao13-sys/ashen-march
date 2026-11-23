import * as THREE from 'three';
import type { RegionId, Vec3 } from '../../core/types';
import cityLayoutRaw from '../../data/cityLayout.json';
import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { InteractableRegistry } from '../InteractableRegistry';
import { CityAssetLoader, type PropInstanceTransform } from './CityAssetLoader';
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
  tier?: string;
  cullDist?: number;
  colliders?: Array<{ center: [number, number, number]; half: [number, number, number] }>;
  cylinderColliders?: Array<{ center: [number, number, number]; halfHeight: number; radius: number }>;
}

const cityLayout = cityLayoutRaw as unknown as {
  portals: {
    toRavendale: { position: Vec3; targetPosition: Vec3; targetYaw: number; label: string };
  };
  architecture: CityArchEntry[];
  propBatches: Record<string, Array<{ x: number; z: number; yaw: number; scale: number; yOffset?: number; collider?: boolean }>>;
  lights: Array<{ position: Vec3; color: string; intensity: number; distance: number }>;
};

export interface CityBuildCallbacks {
  onExitCity: () => void;
  onLoreRead: (title: string, body: string) => void;
}

export interface BuiltAshenholdCity {
  materials: CityMaterialLibrary;
  groundVertices: Float32Array;
  groundIndices: Uint32Array;
  update: (elapsed: number, dt: number, timeOfDay?: number, playerPos?: Vec3) => void;
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

export function getCityRegionAt(zOrX: number, zOpt?: number): RegionId {
  if (zOpt === undefined) {
    return getCityRegionFromCoords(0, zOrX);
  }
  return getCityRegionFromCoords(zOrX, zOpt);
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

  // 1. Chunked 200x240m Cobblestone, Gutter, Plaza, Terrace Steps & Foothill Ground + Trimesh Physics
  const ground = buildCityGroundMesh(materials.streetMaterial);
  parent.add(ground.mesh);
  for (const chunk of ground.chunks) {
    physics.addTerrainTrimesh(chunk.vertices, chunk.indices, 'ashenhold_city');
  }

  // Far outer horizon earth apron outside city envelope
  const skirtGeo = new THREE.PlaneGeometry(420, 420, 4, 4);
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x4b573b, roughness: 0.96, metalness: 0.0 });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(0, -1.2, -90);
  skirt.receiveShadow = true;
  parent.add(skirt);

  // Resolve final world positions for all Phase 1 + Phase 2 architecture & stalls
  const resolvedArch = cityLayout.architecture.map((arch) => {
    const baseY =
      arch.yMode === 'ground'
        ? getCityGroundHeight(arch.position.x, arch.position.z) + (arch.yOffset ?? 0)
        : arch.position.y;
    return {
      ...arch,
      worldPos: { x: arch.position.x, y: baseY, z: arch.position.z },
    };
  });

  // 2. Register Local-to-World Building, Stall, Arch & Closed Barbican Colliders
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
  }

  // 3. Register Selective Solid Prop Colliders (Carts, Troughs, Benches, Bollards, Stone Wells, Barrels, Crates)
  const propTransformsByModel = new Map<string, PropInstanceTransform[]>();
  for (const [modelName, entries] of Object.entries(cityLayout.propBatches)) {
    const list: PropInstanceTransform[] = [];
    for (const entry of entries) {
      const groundY = getCityGroundHeight(entry.x, entry.z);
      const y = groundY + (entry.yOffset ?? 0);
      list.push({ x: entry.x, y, z: entry.z, yaw: entry.yaw, scale: entry.scale });

      if (entry.collider) {
        if (modelName === 'prop_cart.glb') {
          physics.addStaticBox(
            { x: 0.78 * entry.scale, y: 0.65 * entry.scale, z: 1.15 * entry.scale },
            { x: entry.x, y: y + 0.65 * entry.scale, z: entry.z },
            entry.yaw,
            'ashenhold_city',
          );
        } else if (modelName === 'prop_trough.glb') {
          physics.addStaticBox(
            { x: 0.96, y: 0.45, z: 0.45 },
            { x: entry.x, y: y + 0.45, z: entry.z },
            entry.yaw,
            'ashenhold_city',
          );
        } else if (modelName === 'prop_bench.glb') {
          physics.addStaticBox(
            { x: 0.88 * entry.scale, y: 0.3, z: 0.24 * entry.scale },
            { x: entry.x, y: y + 0.25, z: entry.z },
            entry.yaw,
            'ashenhold_city',
          );
        } else if (modelName === 'prop_well_stone.glb') {
          physics.addStaticCylinder(0.8, 1.18 * entry.scale, { x: entry.x, y: y + 0.8, z: entry.z }, 'ashenhold_city');
        } else if (modelName === 'prop_bollard.glb') {
          physics.addStaticCylinder(0.45, 0.24, { x: entry.x, y: y + 0.45, z: entry.z }, 'ashenhold_city');
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

  // 4. Reflective Water Surfaces: Gate Horse Trough + Two-Tier Central Market Phoenix Fountain!
  const troughY = getCityGroundHeight(4.2, 8.2);
  const troughWater = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.56), materials.waterTroughMaterial);
  troughWater.rotation.x = -Math.PI / 2;
  troughWater.rotation.z = 1.57;
  troughWater.position.set(4.2, troughY + 0.76, 8.2);
  parent.add(troughWater);

  const fountainArch = resolvedArch.find((a) => a.id === 'landmark_market_fountain');
  if (fountainArch) {
    const fBaseY = fountainArch.worldPos.y;
    const lowerWater = new THREE.Mesh(new THREE.CircleGeometry(3.38, 8), materials.waterTroughMaterial);
    lowerWater.rotation.x = -Math.PI / 2;
    lowerWater.position.set(fountainArch.worldPos.x, fBaseY + 1.09, fountainArch.worldPos.z);
    const upperWater = new THREE.Mesh(new THREE.CircleGeometry(1.42, 12), materials.waterTroughMaterial);
    upperWater.rotation.x = -Math.PI / 2;
    upperWater.position.set(fountainArch.worldPos.x, fBaseY + 2.94, fountainArch.worldPos.z);
    parent.add(lowerWater, upperWater);
  }

  // 5. Auto-Instance Repeated Walls/Horizon & Statically Merge Buildings by District/Material
  const cullTargets: Array<{ group: THREE.Group; x: number; z: number; maxDistSq: number }> = [];
  if (!options.skipAssetFetch && typeof fetch !== 'undefined') {
    const INSTANCED_ARCH_MODELS = new Set([
      'perimeter_curtain_wall.glb',
      'city_retaining_wall.glb',
      'outer_decorative_horizon.glb',
    ]);

    const instancedArch = new Map<string, PropInstanceTransform[]>();
    const districtBuckets = new Map<
      string,
      { entries: import('./CityAssetLoader').StaticBatchEntry[]; cx: number; cz: number; maxDist: number }
    >();

    const ensureBucket = (key: string, cx: number, cz: number, maxDist: number) => {
      let b = districtBuckets.get(key);
      if (!b) {
        b = { entries: [], cx, cz, maxDist };
        districtBuckets.set(key, b);
      }
      return b;
    };

    for (const arch of resolvedArch) {
      if (INSTANCED_ARCH_MODELS.has(arch.model)) {
        const list = instancedArch.get(arch.model) ?? [];
        list.push({ x: arch.worldPos.x, y: arch.worldPos.y, z: arch.worldPos.z, yaw: arch.yaw, scale: 1 });
        instancedArch.set(arch.model, list);
        continue;
      }

      const isLandmark =
        arch.model === 'bldg_market_chapel.glb' ||
        arch.model === 'castle_barbican_gate.glb' ||
        arch.model === 'castle_citadel_keep.glb';

      let bucketKey: string;
      let cx: number;
      let cz: number;
      let maxDist: number;
      if (isLandmark) {
        bucketKey = 'skyline_landmarks';
        cx = 0;
        cz = -135;
        maxDist = 420;
      } else if (arch.district === 'ashenhold_gate' || arch.district === 'ashenhold_main_street') {
        bucketKey = 'gate_and_main';
        cx = 0;
        cz = -6;
        maxDist = 140;
      } else if (arch.district === 'ashenhold_market_plaza') {
        if (arch.worldPos.x <= 4) {
          bucketKey = 'market_west';
          cx = -10;
          cz = -74;
        } else {
          bucketKey = 'market_east';
          cx = 20;
          cz = -74;
        }
        maxDist = 140;
      } else if (arch.district === 'ashenhold_artisan_quarter') {
        bucketKey = 'artisan_quarter';
        cx = -48;
        cz = -50;
        maxDist = 125;
      } else if (arch.district === 'ashenhold_residential_quarter') {
        bucketKey = 'residential_quarter';
        cx = 48;
        cz = -42;
        maxDist = 125;
      } else {
        bucketKey = 'castle_forecourt';
        cx = 4;
        cz = -158;
        maxDist = 180;
      }

      const b = ensureBucket(bucketKey, cx, cz, maxDist);
      b.entries.push({
        filename: arch.model,
        x: arch.worldPos.x,
        y: arch.worldPos.y,
        z: arch.worldPos.z,
        yaw: arch.yaw,
        castShadow: arch.model !== 'castle_citadel_keep.glb' && arch.tier !== 'decorative',
        receiveShadow: true,
      });
    }

    const archBatchPromises = [...districtBuckets.entries()].map(async ([key, bucket]) => {
      const grp = await loader.createDistrictStaticBatch(`CityBatch_${key}`, bucket.entries, parent);
      cullTargets.push({ group: grp, x: bucket.cx, z: bucket.cz, maxDistSq: bucket.maxDist * bucket.maxDist });
    });

    const instArchPromises = [...instancedArch.entries()].map(async ([modelName, transforms]) => {
      const castShadow = modelName === 'city_retaining_wall.glb';
      await loader.createInstancedPropBatch(modelName, transforms, parent, castShadow);
    });

    const propPromises = [...propTransformsByModel.entries()].map(async ([modelName, transforms]) => {
      if (transforms.length === 0) return;
      const castShadow = modelName !== 'prop_debris_cluster.glb';
      await loader.createInstancedPropBatch(modelName, transforms, parent, castShadow);
    });

    await Promise.all([...archBatchPromises, ...instArchPromises, ...propPromises]);
  }

  // 6. Selective Local Warm Point Lights (<= 6 GPU light budget) & Soft Lantern Glow Sprites
  const lightRefs: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  const glowTex = createRadialGlowTexture();
  const glowSprites: THREE.Sprite[] = [];

  for (let i = 0; i < cityLayout.lights.length; i++) {
    const lCfg = cityLayout.lights[i];
    const light = new THREE.PointLight(lCfg.color, lCfg.intensity, lCfg.distance, 1.55);
    light.position.set(lCfg.position.x, lCfg.position.y, lCfg.position.z);
    parent.add(light);
    lightRefs.push({ light, base: lCfg.intensity, phase: i * 1.37 });
  }

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
      sp.position.set(bulbX, p.y + 2.63 * p.scale, bulbZ);
      sp.scale.set(1.15, 1.15, 1.15);
      parent.add(sp);
      glowSprites.push(sp);
    }

    for (const w of propTransformsByModel.get('prop_lantern_wall.glb') ?? []) {
      const bulbX = w.x - Math.sin(w.yaw) * 0.6;
      const bulbZ = w.z - Math.cos(w.yaw) * 0.6;
      const sp = new THREE.Sprite(glowMat);
      sp.position.set(bulbX, w.y - 0.2, bulbZ);
      sp.scale.set(0.95, 0.95, 0.95);
      parent.add(sp);
      glowSprites.push(sp);
    }
  }

  // 7. Gentle Chimney & Forge Smoke Wisps (Guardhouse, Tavern, Bakery & Smiths' Row Hearth)
  const smokePuffs: SmokePuff[] = [];
  const smokeTex = createSmokeTexture();
  if (smokeTex) {
    const chimneyOrigins: Vec3[] = [
      { x: -11.0, y: 12.1, z: 4.0 },
      { x: -11.6, y: 13.0, z: -10.8 },
      { x: -30.5, y: 11.2, z: -61.0 },
      { x: -45.5, y: 10.6, z: -80.2 },
    ];
    for (const origin of chimneyOrigins) {
      for (let i = 0; i < 6; i++) {
        const smMat = new THREE.SpriteMaterial({
          map: smokeTex,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        });
        const sp = new THREE.Sprite(smMat);
        sp.position.set(origin.x, origin.y, origin.z);
        parent.add(sp);
        smokePuffs.push({
          sprite: sp,
          origin,
          phase: i / 6,
          speed: 0.14 + (i % 3) * 0.025,
        });
      }
    }
  }

  // 8. Carved Stone Return Portal Milestone + Lore & Municipal Notices
  const portalPos = cityLayout.portals.toRavendale.position;
  const milestoneGroup = new THREE.Group();
  milestoneGroup.position.set(portalPos.x + 2.9, getCityGroundHeight(portalPos.x + 2.9, portalPos.z), portalPos.z);
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
  signPlank.position.set(-0.32, 1.28, 0);
  signPlank.rotation.y = 0.18;
  milestoneGroup.add(stonePost, signPlank);
  parent.add(milestoneGroup);

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

  // Guardhouse Interior Military Ledger
  const guardTableBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.07, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x6f2d21, roughness: 0.7 }),
  );
  guardTableBook.position.set(-9.2, 1.32, -0.6);
  parent.add(guardTableBook);
  registry.register({
    id: 'lore:city_guardhouse_log',
    kind: 'lore',
    label: '翻阅《灰烬城南门防务日志》',
    zone: 'ashenhold_city',
    position: { x: -9.2, y: 0.5, z: -0.6 },
    radius: 3.2,
    enabled: true,
    mesh: guardTableBook,
    onInteract: () => {
      callbacks.onLoreRead(
        '《灰烬城南门防务日志》',
        '【灰烬历 312 年 · 初秋】\n中央市集今日十座商摊全数开市！东西两条城区环路亦已打通：\n• 向西可经【铜角巷】与【铁匠街】巡查工坊区；\n• 向东可经【行会马车拱门】与【织坊高地】巡视居民高坡。\n北巅城堡前庭石阶已可通行，内堡大殿将于下一阶段【Phase 3】解封。',
      );
    },
  });

  // Ember & Flagon Tavern Bar Ledger
  const tavernLedger = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.08, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x423022, roughness: 0.72 }),
  );
  tavernLedger.position.set(-9.75, 2.02, -14.7);
  parent.add(tavernLedger);
  registry.register({
    id: 'lore:city_tavern_ledger',
    kind: 'lore',
    label: '翻阅《余烬酒馆账簿》',
    zone: 'ashenhold_city',
    position: { x: -9.75, y: 1.0, z: -14.7 },
    radius: 3.4,
    enabled: true,
    mesh: tavernLedger,
    onInteract: () => {
      callbacks.onLoreRead(
        '《余烬与酒杯酒馆账簿》',
        '1. 溪谷村铁匠葛伦订购麦芽黑啤 3 桶 —— 已结清 18 金币。\n2. 中央市集烘焙娘玛尔塔送来麦芽面包 —— 记账酒馆厨司。\n3. 铁匠街大师布伦南赊购烈酒 2 坛 —— 待月底结算。',
      );
    },
  });

  // Updated Municipal Charter Notice Board placed safely on curb beside Market Gate Mouth (-2.0, -24.5)
  const makeBoardMesh = (x: number, z: number): THREE.Group => {
    const g = new THREE.Group();
    const gy = getCityGroundHeight(x, z);
    g.position.set(x, gy, z);
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
    parent.add(g);
    return g;
  };

  const noticeGroup = makeBoardMesh(-2.0, -24.5);
  noticeGroup.rotation.y = 0.42;
  registry.register({
    id: 'lore:city_phase2_notice',
    kind: 'lore',
    label: '查看《灰烬城通衢告示》',
    zone: 'ashenhold_city',
    position: { x: -2.0, y: getCityGroundHeight(-2.0, -24.5), z: -24.5 },
    radius: 3.6,
    enabled: true,
    mesh: noticeGroup,
    onInteract: () => {
      callbacks.onLoreRead(
        '《灰烬城市政通衢告示》',
        '【灰烬城 · 中央市集与东西城区已正式贯通】\n\n' +
          '• 北行穿过集市拱门 → 【中央市集广场】（十座特色商摊、凤凰喷泉、钟楼圣堂）。\n' +
          '• 西行经【铜角巷】或市集西口 → 【铁匠工坊区】（锻造坊、制桶坊、制革坊，可作环形路线返回主街）。\n' +
          '• 东行经行会拱门或市集东阶 → 【织坊居民高地】（阶梯观景台与提灯古巷）。\n' +
          '• 按 [M] 随时查看全城街道舆图（含可探索区与未开放的 Phase 3 领主内堡标识）。',
      );
    },
  });

  // Citadel Barbican Portcullis Imperial Decree Board (Phase 3 Closure Boundary)
  const citadelSign = makeBoardMesh(7.6, -168.5);
  citadelSign.rotation.y = -0.35;
  registry.register({
    id: 'lore:city_castle_decree',
    kind: 'lore',
    label: '查看《领主城堡戒严令》',
    zone: 'ashenhold_city',
    position: { x: 7.6, y: getCityGroundHeight(7.6, -168.5), z: -168.5 },
    radius: 3.8,
    enabled: true,
    mesh: citadelSign,
    onInteract: () => {
      callbacks.onLoreRead(
        '《领主内堡 · 戒严公告 (Phase 3 筹备区)》',
        '此处为灰烬城北部【领主城堡瓮城前庭】。\n铁闸之后的主堡庭院与领主大厅归属【Phase 3】开发内容，目前落闸戒严、尚不可进入，敬请知悉。',
      );
    },
  });

  return {
    materials,
    groundVertices: ground.vertices,
    groundIndices: ground.indices,
    update: (elapsed: number, dt: number, timeOfDay = 12.0, playerPos?: Vec3) => {
      const solarY = Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2);
      const nightBlend = 1.0 - THREE.MathUtils.smoothstep(solarY, -0.08, 0.45);
      materials.setDayNightGlow(nightBlend);
      const lightScale = THREE.MathUtils.lerp(0.22, 1.35, nightBlend);
      const glowOpacity = THREE.MathUtils.lerp(0.24, 0.88, nightBlend);
      for (const sp of glowSprites) {
        sp.material.opacity = glowOpacity;
      }
      for (const lr of lightRefs) {
        const flicker = Math.sin(elapsed * 7.8 + lr.phase) * 0.12 + Math.sin(elapsed * 13.1 + lr.phase) * 0.06;
        lr.light.intensity = Math.max(0, (lr.base + flicker) * lightScale);
      }

      if (playerPos) {
        const px = playerPos.x;
        const pz = playerPos.z;
        for (const ct of cullTargets) {
          const dx = ct.x - px;
          const dz = ct.z - pz;
          ct.group.visible = dx * dx + dz * dz <= ct.maxDistSq;
        }
      }

      for (const puff of smokePuffs) {
        puff.phase = (puff.phase + dt * puff.speed) % 1;
        const t = puff.phase;
        puff.sprite.position.set(
          puff.origin.x + Math.sin(elapsed * 0.9 + t * 5.0) * (0.25 + t * 0.95) + t * 0.85,
          puff.origin.y + t * 5.8,
          puff.origin.z + Math.cos(elapsed * 0.7 + t * 4.0) * (0.2 + t * 0.55),
        );
        const s = 0.65 + t * 2.2;
        puff.sprite.scale.set(s, s, s);
        puff.sprite.material.opacity = Math.sin(t * Math.PI) * 0.34;
      }
    },
    dispose: () => {
      materials.dispose();
      glowTex?.dispose();
      smokeTex?.dispose();
    },
  };
}
