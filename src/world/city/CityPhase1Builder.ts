import * as THREE from 'three';
import type { RegionId, Vec3 } from '../../core/types';
import cityConfig from '../../data/cityPhase1Config.json';
import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { InteractableRegistry } from '../InteractableRegistry';
import { CityAssetLoader, type PropInstanceTransform } from './CityAssetLoader';
import { buildCityGroundMesh, getCityGroundHeight } from './CityGroundBuilder';
import { CityMaterialLibrary } from './CityMaterialLibrary';

export interface CityBuildCallbacks {
  onExitCity: () => void;
  onLoreRead: (title: string, body: string) => void;
}

export interface BuiltAshenholdCity {
  materials: CityMaterialLibrary;
  groundVertices: Float32Array;
  groundIndices: Uint32Array;
  update: (elapsed: number, dt: number, timeOfDay?: number) => void;
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

export function getCityRegionAt(z: number): RegionId {
  return z >= 8.0 ? 'ashenhold_gate' : 'ashenhold_main_street';
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

  // 1. Contoured Cobblestone, Gutter, Curb, Dirt & Puddle Ground + Physics Trimesh
  const ground = buildCityGroundMesh(materials.streetMaterial);
  parent.add(ground.mesh);
  physics.addTerrainTrimesh(ground.vertices, ground.indices, 'ashenhold_city');

  // Subtle surrounding valley backdrop grass skirts outside city walls so distant seams stay clean
  const skirtGeo = new THREE.PlaneGeometry(240, 220, 8, 8);
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x4b573b, roughness: 0.96, metalness: 0.0 });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(0, -0.35, -35);
  skirt.receiveShadow = true;
  parent.add(skirt);

  // 2. Register Exact Local-to-World Building & Wall Colliders (Gatehouse tunnel & interior doors stay open!)
  for (const arch of cityConfig.architecture) {
    const pos = arch.position;
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

  // 3. Register Selective Prop Colliders (Only solid obstacles, zero colliders for tiny scatter)
  const propTransformsByModel = new Map<string, PropInstanceTransform[]>();
  for (const [modelName, entries] of Object.entries(cityConfig.propBatches)) {
    const list: PropInstanceTransform[] = [];
    for (const entry of entries as Array<{
      x: number;
      z: number;
      yaw: number;
      scale: number;
      yOffset?: number;
      collider?: boolean;
    }>) {
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

  // 4. Water Surface Inside Stone Horse Trough
  const troughY = getCityGroundHeight(4.2, 8.2);
  const troughWater = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.56), materials.waterTroughMaterial);
  troughWater.rotation.x = -Math.PI / 2;
  troughWater.rotation.z = 1.57;
  troughWater.position.set(4.2, troughY + 0.76, 8.2);
  parent.add(troughWater);

  // 5. Load All Blender-Exported GLB Architecture & Instanced Prop Batches
  if (!options.skipAssetFetch && typeof fetch !== 'undefined') {
    const archPromises = cityConfig.architecture.map(async (arch) => {
      const group = await loader.instantiateModel(arch.model, {
        castShadow: arch.id !== 'skyline_distant',
        receiveShadow: true,
      });
      group.name = `CityArch_${arch.id}`;
      group.position.set(arch.position.x, arch.position.y, arch.position.z);
      group.rotation.y = arch.yaw;
      parent.add(group);
    });

    const propPromises = [...propTransformsByModel.entries()].map(async ([modelName, transforms]) => {
      const castShadow = modelName !== 'prop_debris_cluster.glb';
      await loader.createInstancedPropBatch(modelName, transforms, parent, castShadow);
    });

    await Promise.all([...archPromises, ...propPromises]);
  }

  // 6. Selective Local Warm Point Lights (Strict <= 6 light budget) & Soft Lantern Glow Sprites
  const lightRefs: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  const glowTex = createRadialGlowTexture();
  const glowSprites: THREE.Sprite[] = [];

  for (let i = 0; i < cityConfig.lights.length; i++) {
    const lCfg = cityConfig.lights[i];
    const light = new THREE.PointLight(lCfg.color, lCfg.intensity, lCfg.distance, 1.55);
    light.position.set(lCfg.position.x, lCfg.position.y, lCfg.position.z);
    parent.add(light);
    lightRefs.push({ light, base: lCfg.intensity, phase: i * 1.37 });
  }

  // Place warm glow sprites inside every lantern post & wall lantern bulb
  if (glowTex) {
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb862,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const postList = propTransformsByModel.get('prop_lantern_post.glb') ?? [];
    for (const p of postList) {
      const bulbX = p.x + Math.cos(-p.yaw) * 0.72 * p.scale;
      const bulbZ = p.z + Math.sin(-p.yaw) * 0.72 * p.scale;
      const sp = new THREE.Sprite(glowMat);
      sp.position.set(bulbX, p.y + 2.63 * p.scale, bulbZ);
      sp.scale.set(1.15, 1.15, 1.15);
      parent.add(sp);
      glowSprites.push(sp);
    }

    const wallLanterns = propTransformsByModel.get('prop_lantern_wall.glb') ?? [];
    for (const w of wallLanterns) {
      const bulbX = w.x - Math.sin(w.yaw) * 0.6;
      const bulbZ = w.z - Math.cos(w.yaw) * 0.6;
      const sp = new THREE.Sprite(glowMat);
      sp.position.set(bulbX, w.y - 0.2, bulbZ);
      sp.scale.set(0.95, 0.95, 0.95);
      parent.add(sp);
      glowSprites.push(sp);
    }
  }

  // 7. Gentle Chimney Smoke Wisps rising from Guardhouse & Tavern chimneys
  const smokePuffs: SmokePuff[] = [];
  const smokeTex = createSmokeTexture();
  if (smokeTex) {
    const chimneyOrigins: Vec3[] = [
      { x: -11.0, y: 12.1, z: 4.0 },
      { x: -11.6, y: 13.0, z: -10.8 },
    ];
    for (const origin of chimneyOrigins) {
      for (let i = 0; i < 8; i++) {
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
          phase: i / 8,
          speed: 0.14 + (i % 3) * 0.025,
        });
      }
    }
  }

  // 8. Carved Stone Return Portal Milestone Outside South Gate + City Lore Interactables
  const portalPos = cityConfig.portals.toRavendale.position;
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
    label: cityConfig.portals.toRavendale.label,
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
        '【灰烬历 312 年 · 初秋】\n今日清晨城门吊闸照常升起。商队马车已通过门卫大道前往内城工坊区，铁匠铺与药铺门前石板积水已派工匠疏通。\n领主城堡近期加派了东侧塔楼的巡夜哨卫，告诫旅人天黑后切勿擅自靠近北境荒野。',
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
        '1. 溪谷村铁匠葛伦订购麦芽黑啤 3 桶 —— 已结清 18 金币。\n2. 南门卫队夜班热汤与烤面包 —— 记账城防司。\n3. 药剂师伊琳娜收购北方灰烬草干叶 12 束 —— 待货到付款。',
      );
    },
  });

  // North Street Phase 2 Municipal Notice Board
  const noticeGroup = new THREE.Group();
  const noticeY = getCityGroundHeight(1.3, -22.2);
  noticeGroup.position.set(1.3, noticeY, -22.2);
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
  noticeGroup.add(postA, postB, board, parchment);
  parent.add(noticeGroup);

  registry.register({
    id: 'lore:city_phase2_notice',
    kind: 'lore',
    label: '查看《灰烬城市政扩建公告》',
    zone: 'ashenhold_city',
    position: { x: 1.3, y: noticeY, z: -22.2 },
    radius: 3.6,
    enabled: true,
    mesh: noticeGroup,
    onInteract: () => {
      callbacks.onLoreRead(
        '《灰烬城市政扩建公告》',
        '灰烬城当前已开放：【Phase 1 · 南城门与门卫主街】。\n\n前方北侧工坊拱门后方为正在筹备中的【Phase 2 · 中央市集广场】、【Phase 3 · 高地领主城堡】及【Phase 4 · 居民商业街区】，敬请期待后续阶段逐步打通开放。',
      );
    },
  });

  return {
    materials,
    groundVertices: ground.vertices,
    groundIndices: ground.indices,
    update: (elapsed: number, dt: number, timeOfDay = 12.0) => {
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
