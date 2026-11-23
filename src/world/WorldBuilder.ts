import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import type { Vec3 } from '../core/types';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import worldConfig from '../data/worldConfig.json';
import type { InteractableRegistry } from './InteractableRegistry';
import { createTorchBrazier, type FlameRef } from './PropFactory';
import { buildTerrainMesh, getRiverCenterX, getTerrainHeight } from './TerrainGenerator';

export interface WorldBuildCallbacks {
  onEnterCrypt: () => void;
  onLoreRead: (title: string, body: string) => void;
}

export interface BuiltWorld {
  flames: FlameRef[];
  waterMesh: THREE.Mesh;
  update: (elapsed: number) => void;
}

export function buildOverworld(
  parent: THREE.Group,
  physics: PhysicsWorld,
  registry: InteractableRegistry,
  callbacks: WorldBuildCallbacks,
): BuiltWorld {
  const flames: FlameRef[] = [];

  // 1. Deterministic Terrain + Collider
  const terrain = buildTerrainMesh(worldConfig.seed);
  parent.add(terrain.mesh);
  physics.addTerrainTrimesh(terrain.vertices, terrain.indices);

  // Shared procedural materials
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6d72, roughness: 0.92 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x4b4e54, roughness: 0.9 });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xc4b89f, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x66462c, roughness: 0.88 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x452d1a, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c342b, roughness: 0.85 });

  const addBoxColliderAndMesh = (
    size: Vec3,
    pos: Vec3,
    mat: THREE.Material,
    yaw = 0,
    castShadow = true,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.rotation.y = yaw;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    physics.addStaticBox({ x: size.x / 2, y: size.y / 2, z: size.z / 2 }, pos, yaw);
    return mesh;
  };

  // =========================================================================
  // 2. RAVENDALE VILLAGE (0, 40) - floor y = 4.0
  // =========================================================================
  const vy = 4.0;

  // 2A. Enterable Elder's Longhouse centered at (0, 4.0, 18), width 10 (x -5..5), depth 12 (z 12..24)
  // Front doorway opens at z=24 for x in [-1.4, 1.4]
  addBoxColliderAndMesh({ x: 10.4, y: 0.2, z: 12.4 }, { x: 0, y: vy + 0.05, z: 18 }, stoneMat, 0, false);
  // Back wall
  addBoxColliderAndMesh({ x: 10, y: 4.4, z: 0.5 }, { x: 0, y: vy + 2.2, z: 12 }, plasterMat);
  // Left & Right walls
  addBoxColliderAndMesh({ x: 0.5, y: 4.4, z: 12 }, { x: -5, y: vy + 2.2, z: 18 }, plasterMat);
  addBoxColliderAndMesh({ x: 0.5, y: 4.4, z: 12 }, { x: 5, y: vy + 2.2, z: 18 }, plasterMat);
  // Front left & right walls leaving 2.8m center doorway
  addBoxColliderAndMesh({ x: 3.6, y: 4.4, z: 0.5 }, { x: -3.2, y: vy + 2.2, z: 24 }, plasterMat);
  addBoxColliderAndMesh({ x: 3.6, y: 4.4, z: 0.5 }, { x: 3.2, y: vy + 2.2, z: 24 }, plasterMat);
  // Lintel above doorway
  addBoxColliderAndMesh({ x: 2.8, y: 1.2, z: 0.5 }, { x: 0, y: vy + 3.8, z: 24 }, woodMat);

  // Pitched Longhouse Roof (visual)
  const roofLeft = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 13.2), roofMat);
  roofLeft.position.set(-2.6, vy + 5.6, 18);
  roofLeft.rotation.z = 0.52;
  roofLeft.castShadow = true;
  parent.add(roofLeft);
  const roofRight = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 13.2), roofMat);
  roofRight.position.set(2.6, vy + 5.6, 18);
  roofRight.rotation.z = -0.52;
  roofRight.castShadow = true;
  parent.add(roofRight);

  // Longhouse interior hearth, table & interactive lore book
  addBoxColliderAndMesh({ x: 2.2, y: 1.6, z: 1.1 }, { x: 0, y: vy + 0.8, z: 13.0 }, darkStoneMat);
  createTorchBrazier(parent, { x: 0, y: vy + 0.2, z: 13.8 }, flames, { intensity: 2.8, distance: 16, scale: 0.75 });
  addBoxColliderAndMesh({ x: 2.4, y: 0.85, z: 1.2 }, { x: 2.2, y: vy + 0.42, z: 17.8 }, woodMat);

  // Lore Chronicle Book on the Longhouse table
  const loreMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x8a3b2e, emissive: 0x3b1a10, roughness: 0.6 }),
  );
  loreMesh.position.set(2.2, vy + 0.9, 17.8);
  parent.add(loreMesh);
  registry.register({
    id: 'lore:elder_chronicle',
    kind: 'lore',
    label: '阅读《边境守望者编年史》',
    zone: 'overworld',
    position: { x: 2.2, y: vy + 0.5, z: 17.8 },
    radius: 3.2,
    enabled: true,
    mesh: loreMesh,
    onInteract: () => {
      callbacks.onLoreRead(
        '《边境守望者编年史》',
        '三百年前，守望者骑士团在北方山麓铸造了古代墓穴，以星辉圣物封锁深渊余烬。\n如今东侧高地的哨塔重新燃起烽火，预示封印结界已然松动。唯有携带守望者之血或勇气的旅人，方能取回圣物并决定边境命运。',
      );
    },
  });

  // 2B. Merchant Smithy (-19, 4.0, 38)
  addBoxColliderAndMesh({ x: 7.5, y: 3.8, z: 6.5 }, { x: -19, y: vy + 1.9, z: 38 }, plasterMat);
  const smithyRoof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.6, 4), roofMat);
  smithyRoof.position.set(-19, vy + 5.1, 38);
  smithyRoof.rotation.y = Math.PI / 4;
  smithyRoof.castShadow = true;
  parent.add(smithyRoof);
  // Forge & Anvil outside smithy
  addBoxColliderAndMesh({ x: 1.6, y: 1.4, z: 1.6 }, { x: -14.5, y: vy + 0.7, z: 34.5 }, darkStoneMat);
  createTorchBrazier(parent, { x: -14.5, y: vy + 0.9, z: 34.5 }, flames, { scale: 0.7, intensity: 2.4 });
  addBoxColliderAndMesh({ x: 0.9, y: 0.8, z: 0.5 }, { x: -14.0, y: vy + 0.4, z: 40.5 }, darkStoneMat);

  // 2C. Hunter's Cabin (19, 4.0, 40)
  addBoxColliderAndMesh({ x: 7.0, y: 3.6, z: 6.0 }, { x: 19, y: vy + 1.8, z: 40 }, woodMat);
  const cabinRoof = new THREE.Mesh(new THREE.ConeGeometry(5.3, 2.5, 4), darkWoodMat);
  cabinRoof.position.set(19, vy + 4.8, 40);
  cabinRoof.rotation.y = Math.PI / 4;
  cabinRoof.castShadow = true;
  parent.add(cabinRoof);

  // 2D. Village Well at (0, 4.0, 42)
  const wellBase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.0, 12), stoneMat);
  wellBase.position.set(0, vy + 0.5, 42);
  wellBase.castShadow = true;
  parent.add(wellBase);
  physics.addStaticCylinder(0.5, 1.2, { x: 0, y: vy + 0.5, z: 42 });
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.1, 4), roofMat);
  wellRoof.position.set(0, vy + 2.7, 42);
  wellRoof.rotation.y = Math.PI / 4;
  parent.add(wellRoof);
  for (const dx of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), darkWoodMat);
    post.position.set(dx, vy + 1.4, 42);
    parent.add(post);
  }

  // Village Watch Braziers
  createTorchBrazier(parent, { x: -3.2, y: vy, z: 26 }, flames);
  createTorchBrazier(parent, { x: 3.2, y: vy, z: 26 }, flames);
  createTorchBrazier(parent, { x: -4.2, y: vy, z: 48 }, flames);
  createTorchBrazier(parent, { x: 4.2, y: vy, z: 48 }, flames);

  // =========================================================================
  // 3. RIVER VALLEY WATER & WOODEN BRIDGE (95, 55)
  // =========================================================================
  const waterGeo = new THREE.PlaneGeometry(36, 235, 18, 48);
  waterGeo.rotateX(-Math.PI / 2);
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wPos.count; i++) {
    const lx = wPos.getX(i);
    const lz = wPos.getZ(i) + 105;
    wPos.setX(i, getRiverCenterX(lz) + lx);
    wPos.setZ(i, lz);
  }
  waterGeo.computeVertexNormals();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f6d88,
    roughness: 0.2,
    metalness: 0.35,
    transparent: true,
    opacity: 0.78,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = 1.25;
  waterMesh.receiveShadow = true;
  parent.add(waterMesh);

  // Wooden Bridge spanning x: 80..110 at z = 55, deck y = 2.4
  addBoxColliderAndMesh({ x: 30, y: 0.45, z: 5.0 }, { x: 95, y: 2.35, z: 55 }, woodMat);
  // Approach ramps on both ends of bridge so step transition from terrain is seamless
  addBoxColliderAndMesh({ x: 5.0, y: 0.45, z: 5.0 }, { x: 78.5, y: 2.05, z: 55 }, darkWoodMat);
  addBoxColliderAndMesh({ x: 5.0, y: 0.45, z: 5.0 }, { x: 111.5, y: 2.05, z: 55 }, darkWoodMat);
  // Bridge railings
  addBoxColliderAndMesh({ x: 30, y: 0.9, z: 0.25 }, { x: 95, y: 3.0, z: 52.6 }, darkWoodMat);
  addBoxColliderAndMesh({ x: 30, y: 0.9, z: 0.25 }, { x: 95, y: 3.0, z: 57.4 }, darkWoodMat);
  createTorchBrazier(parent, { x: 81, y: 2.55, z: 52.8 }, flames, { scale: 0.85 });
  createTorchBrazier(parent, { x: 109, y: 2.55, z: 57.2 }, flames, { scale: 0.85 });

  // =========================================================================
  // 4. RUINED WATCHTOWER (105, 14.0, -65) — Enterable Tower + Spiral Ramp
  // =========================================================================
  const wx = 105;
  const wy = 14.0;
  const wz = -65;

  // Tower stone floor
  addBoxColliderAndMesh({ x: 11, y: 0.4, z: 11 }, { x: wx, y: wy - 0.1, z: wz }, stoneMat, 0, false);

  // 7 Stone wall segments around radius 5.6m leaving opening on South side (angle ~ PI/2 -> z+)
  const wallCount = 8;
  const wallRadius = 5.6;
  for (let i = 0; i < wallCount; i++) {
    const angle = (i / wallCount) * Math.PI * 2;
    // Leave south entrance open (angle near PI/2 => sin ≈ 1, cos ≈ 0)
    if (i === 2) continue;
    const segX = wx + Math.cos(angle) * wallRadius;
    const segZ = wz + Math.sin(angle) * wallRadius;
    const height = i % 2 === 0 ? 8.2 : 6.8;
    addBoxColliderAndMesh(
      { x: 0.9, y: height, z: 4.2 },
      { x: segX, y: wy + height / 2, z: segZ },
      darkStoneMat,
      -angle,
    );
  }

  // Upper lookout platform on North half of Watchtower interior (y = 19.5)
  addBoxColliderAndMesh({ x: 8.6, y: 0.45, z: 4.8 }, { x: wx, y: 19.25, z: wz - 1.6 }, stoneMat);

  // Climbable stepped/sloped wooden ramp from South-West (y=14.0) -> West -> North-West -> Upper Deck (y=19.5)
  const rampSteps = 10;
  for (let s = 0; s < rampSteps; s++) {
    const t = (s + 0.5) / rampSteps;
    const stepAngle = Math.PI * 0.72 + t * Math.PI * 0.72; // West arc toward North deck
    const r = 3.3;
    const sx = wx + Math.cos(stepAngle) * r;
    const sz = wz + Math.sin(stepAngle) * r;
    const sy = wy + 0.35 + t * 5.1;
    addBoxColliderAndMesh({ x: 2.2, y: 0.35, z: 1.75 }, { x: sx, y: sy, z: sz }, woodMat, -stepAngle);
  }

  // Signal Brazier on Watchtower top deck
  createTorchBrazier(parent, { x: wx, y: 19.5, z: wz - 2.6 }, flames, {
    color: 0xff6e24,
    intensity: 4.0,
    distance: 28,
    scale: 1.35,
  });

  // =========================================================================
  // 5. ANCIENT CRYPT EXTERIOR ARCHWAY (0, 12.0, -175)
  // =========================================================================
  const cx = 0;
  const cy = getTerrainHeight(0, -175);
  const cz = -175;
  addBoxColliderAndMesh({ x: 1.6, y: 5.5, z: 2.2 }, { x: cx - 3.2, y: cy + 2.75, z: cz }, darkStoneMat);
  addBoxColliderAndMesh({ x: 1.6, y: 5.5, z: 2.2 }, { x: cx + 3.2, y: cy + 2.75, z: cz }, darkStoneMat);
  addBoxColliderAndMesh({ x: 8.2, y: 1.5, z: 2.4 }, { x: cx, y: cy + 5.8, z: cz }, darkStoneMat);
  // Sealed stone portal backing
  addBoxColliderAndMesh({ x: 4.8, y: 4.8, z: 0.8 }, { x: cx, y: cy + 2.4, z: cz - 0.8 }, stoneMat);

  const portalGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 4.4),
    new THREE.MeshBasicMaterial({
      color: 0x3b86b8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  portalGlow.position.set(cx, cy + 2.3, cz - 0.35);
  parent.add(portalGlow);

  createTorchBrazier(parent, { x: cx - 3.4, y: cy, z: cz + 2.2 }, flames, { color: 0x5ab4ff, intensity: 2.5 });
  createTorchBrazier(parent, { x: cx + 3.4, y: cy, z: cz + 2.2 }, flames, { color: 0x5ab4ff, intensity: 2.5 });

  registry.register({
    id: 'portal:crypt_enter',
    kind: 'portal',
    label: worldConfig.portals.cryptEntrance.label,
    zone: 'overworld',
    position: { x: cx, y: cy, z: cz },
    radius: 4.5,
    enabled: true,
    mesh: portalGlow,
    onInteract: callbacks.onEnterCrypt,
  });

  // =========================================================================
  // 6. ASHWOOD FOREST, GOBLIN CAMP & HIDDEN SHRINE
  // =========================================================================
  const campY = getTerrainHeight(-108, -30);
  // Goblin camp wooden stakes & tent
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    if (i === 0) continue; // open entrance
    const px = -108 + Math.cos(a) * 6.5;
    const pz = -30 + Math.sin(a) * 6.5;
    const py = getTerrainHeight(px, pz);
    addBoxColliderAndMesh({ x: 0.45, y: 2.4, z: 0.45 }, { x: px, y: py + 1.1, z: pz }, darkWoodMat, a);
  }
  createTorchBrazier(parent, { x: -106.5, y: campY, z: -28 }, flames, { scale: 0.8 });

  // Hidden Shrine (-146, 7.5, -66)
  const shrineY = getTerrainHeight(-146, -66);
  const shrineCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.95, 0),
    new THREE.MeshStandardMaterial({
      color: 0x6ce5ff,
      emissive: 0x2c8bb8,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    }),
  );
  shrineCrystal.position.set(-146, shrineY + 2.2, -66);
  parent.add(shrineCrystal);
  const shrineLight = new THREE.PointLight(0x5ed6ff, 2.2, 16);
  shrineLight.position.set(-146, shrineY + 2.5, -66);
  parent.add(shrineLight);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const sx = -146 + Math.cos(a) * 4.5;
    const sz = -66 + Math.sin(a) * 4.5;
    addBoxColliderAndMesh({ x: 0.7, y: 3.2, z: 0.7 }, { x: sx, y: getTerrainHeight(sx, sz) + 1.5, z: sz }, darkStoneMat);
  }

  // Deterministic procedural trees & boulders
  const rng = new SeededRandom(worldConfig.seed + 1001);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4f3524, roughness: 0.95 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2c4a32, roughness: 0.9 });
  const ashLeafMat = new THREE.MeshStandardMaterial({ color: 0x4b5c43, roughness: 0.9 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.95 });

  let treesPlaced = 0;
  let attempts = 0;
  while (treesPlaced < 165 && attempts < 1200) {
    attempts++;
    // Bias heavily toward Ashwood Forest & valley outskirts
    const inForest = treesPlaced < 115;
    const tx = inForest ? rng.range(-210, -25) : rng.range(-215, 215);
    const tz = inForest ? rng.range(-135, 95) : rng.range(-195, 195);

    // Keep clear of village, roads, river, watchtower, crypt gate, camp & shrine
    if (Math.hypot(tx - 0, tz - 40) < 48) continue;
    if (Math.hypot(tx - 105, tz - -65) < 22) continue;
    if (Math.hypot(tx - 0, tz - -175) < 22) continue;
    if (Math.hypot(tx - -108, tz - -30) < 12) continue;
    if (Math.hypot(tx - -146, tz - -66) < 10) continue;
    if (Math.abs(tx) < 10 && tz > -170 && tz < 65) continue; // north road
    if (tz > -15 && Math.abs(tx - getRiverCenterX(tz)) < 16) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < 2.2) continue;

    const scale = rng.range(0.85, 1.55);
    const treeGroup = new THREE.Group();
    treeGroup.position.set(tx, ty - 0.15, tz);

    const trunkH = 3.2 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.38 * scale, trunkH, 7), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const isPine = rng.next() > 0.28;
    const crownMat = isPine ? pineMat : ashLeafMat;
    if (isPine) {
      for (let tier = 0; tier < 3; tier++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry((2.1 - tier * 0.42) * scale, (2.5 - tier * 0.25) * scale, 7),
          crownMat,
        );
        cone.position.y = trunkH * 0.72 + tier * 1.45 * scale;
        cone.castShadow = true;
        treeGroup.add(cone);
      }
    } else {
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9 * scale, 1), crownMat);
      canopy.position.y = trunkH + 1.1 * scale;
      canopy.castShadow = true;
      treeGroup.add(canopy);
    }

    parent.add(treeGroup);
    physics.addStaticCylinder(trunkH * 0.6, 0.42 * scale, { x: tx, y: ty + trunkH * 0.5, z: tz });
    treesPlaced++;
  }

  // Deterministic boulders
  for (let i = 0; i < 42; i++) {
    const rx = rng.range(-200, 200);
    const rz = rng.range(-190, 185);
    if (Math.hypot(rx, rz - 40) < 42) continue;
    if (Math.hypot(rx - 105, rz - -65) < 16) continue;
    if (Math.hypot(rx, rz - -175) < 16) continue;
    const ry = getTerrainHeight(rx, rz);
    const rScale = rng.range(0.7, 1.8);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rScale, 0), rockMat);
    rock.position.set(rx, ry + rScale * 0.4, rz);
    rock.rotation.set(rng.next() * 3, rng.next() * 3, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    parent.add(rock);
    physics.addStaticCylinder(rScale * 0.6, rScale * 0.85, { x: rx, y: ry + rScale * 0.5, z: rz });
  }

  return {
    flames,
    waterMesh,
    update: (elapsed: number) => {
      // Gentle river wave shimmer
      waterMesh.position.y = 1.24 + Math.sin(elapsed * 1.6) * 0.04;
      shrineCrystal.rotation.y = elapsed * 0.9;
      shrineCrystal.position.y = shrineY + 2.2 + Math.sin(elapsed * 2.1) * 0.18;
      for (const f of flames) {
        const flicker = Math.sin(elapsed * 9.5 + f.phase) * 0.22 + Math.sin(elapsed * 15.3 + f.phase) * 0.1;
        f.light.intensity = f.baseIntensity + flicker;
        f.mesh.scale.y = 1 + flicker * 0.25;
      }
    },
  };
}
