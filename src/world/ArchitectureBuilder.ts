import * as THREE from 'three';
import type { Vec3 } from '../core/types';
import type { MaterialLibrary } from '../engine/MaterialLibrary';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { InteractableRegistry } from './InteractableRegistry';
import { createTorchBrazier, type FlameRef } from './PropFactory';
import { getTerrainHeight } from './TerrainGenerator';

export interface ArchitectureCallbacks {
  onEnterCrypt: () => void;
  onLoreRead: (title: string, body: string) => void;
}

export function buildAllArchitecture(
  parent: THREE.Group,
  physics: PhysicsWorld,
  mats: MaterialLibrary,
  registry: InteractableRegistry,
  flames: FlameRef[],
  callbacks: ArchitectureCallbacks,
): void {
  const addBox = (
    size: Vec3,
    pos: Vec3,
    mat: THREE.Material,
    options: { yaw?: number; rotX?: number; rotZ?: number; collider?: boolean; shadow?: boolean } = {},
  ): THREE.Mesh => {
    const { yaw = 0, rotX = 0, rotZ = 0, collider = true, shadow = true } = options;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.rotation.set(rotX, yaw, rotZ);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collider) {
      physics.addStaticBox({ x: size.x / 2, y: size.y / 2, z: size.z / 2 }, pos, yaw);
    }
    return mesh;
  };

  const addWindow = (pos: Vec3, yaw = 0): void => {
    const g = new THREE.Group();
    g.position.set(pos.x, pos.y, pos.z);
    g.rotation.y = yaw;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.32, 0.14), mats.darkTimber);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.06, 0.16), mats.warmGlass);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.12, 0.18), mats.darkTimber);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.18), mats.darkTimber);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.12, 0.28), mats.darkTimber);
    sill.position.y = -0.68;
    const shutterL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.18, 0.08), mats.oakPlanks);
    shutterL.position.set(-0.88, 0, 0.04);
    const shutterR = shutterL.clone();
    shutterR.position.x = 0.88;
    g.add(frame, glass, barV, barH, sill, shutterL, shutterR);
    parent.add(g);
  };

  const addBarrel = (pos: Vec3): void => {
    const g = new THREE.Group();
    g.position.set(pos.x, pos.y, pos.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.92, 12), mats.oakPlanks);
    body.position.y = 0.46;
    body.castShadow = true;
    body.receiveShadow = true;
    const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.025, 6, 14), mats.forgedIron);
    band1.rotation.x = Math.PI / 2;
    band1.position.y = 0.24;
    const band2 = band1.clone();
    band2.position.y = 0.7;
    g.add(body, band1, band2);
    parent.add(g);
    physics.addStaticCylinder(0.46, 0.38, { x: pos.x, y: pos.y + 0.46, z: pos.z });
  };

  const addCrate = (pos: Vec3, scale = 1, yaw = 0): void => {
    const s = 0.85 * scale;
    addBox({ x: s, y: s, z: s }, { x: pos.x, y: pos.y + s / 2, z: pos.z }, mats.oakPlanks, { yaw });
    // Corner iron straps (visual)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.08, s + 0.04), mats.darkTimber);
    rim.position.set(pos.x, pos.y + s - 0.06, pos.z);
    rim.rotation.y = yaw;
    parent.add(rim);
  };

  const addLampPost = (pos: Vec3, flameColor = 0xffa44d): void => {
    const g = new THREE.Group();
    g.position.set(pos.x, pos.y, pos.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8), mats.darkTimber);
    post.position.y = 1.6;
    post.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.1), mats.darkTimber);
    arm.position.set(0.32, 3.05, 0);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.08), mats.darkTimber);
    brace.position.set(0.18, 2.82, 0);
    brace.rotation.z = 0.72;
    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 4), mats.forgedIron);
    lanternCap.position.set(0.62, 2.88, 0);
    lanternCap.rotation.y = Math.PI / 4;
    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.12, 0.28, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffd58f,
        emissive: new THREE.Color(flameColor),
        emissiveIntensity: 2.0,
      }),
    );
    lanternGlass.position.set(0.62, 2.68, 0);
    const light = new THREE.PointLight(flameColor, 1.9, 15, 1.6);
    light.position.set(0.62, 2.62, 0);
    g.add(post, arm, brace, lanternCap, lanternGlass, light);
    parent.add(g);
    flames.push({ light, mesh: lanternGlass, baseIntensity: 1.9, phase: pos.x + pos.z });
  };

  const vy = 4.0;

  // =========================================================================
  // 1. ELDER'S GREAT HALL (0, 4.0, 18) — Enterable Medieval Timber Longhouse
  // =========================================================================
  // Stone foundation & oak floor
  addBox({ x: 10.8, y: 0.22, z: 12.8 }, { x: 0, y: vy + 0.05, z: 18 }, mats.cobblestone, { shadow: false });
  addBox({ x: 9.4, y: 0.06, z: 11.4 }, { x: 0, y: vy + 0.18, z: 18 }, mats.oakPlanks, { collider: false, shadow: false });

  // Stone lower plinth walls (1.0m high) + Plaster upper walls (3.4m)
  // Back wall (z=12)
  addBox({ x: 10.2, y: 1.1, z: 0.6 }, { x: 0, y: vy + 0.55, z: 12 }, mats.cobblestone);
  addBox({ x: 10.0, y: 3.3, z: 0.48 }, { x: 0, y: vy + 2.75, z: 12 }, mats.tudorPlaster);
  // Left & Right walls (x=±5)
  addBox({ x: 0.6, y: 1.1, z: 12.2 }, { x: -5, y: vy + 0.55, z: 18 }, mats.cobblestone);
  addBox({ x: 0.48, y: 3.3, z: 12.0 }, { x: -5, y: vy + 2.75, z: 18 }, mats.tudorPlaster);
  addBox({ x: 0.6, y: 1.1, z: 12.2 }, { x: 5, y: vy + 0.55, z: 18 }, mats.cobblestone);
  addBox({ x: 0.48, y: 3.3, z: 12.0 }, { x: 5, y: vy + 2.75, z: 18 }, mats.tudorPlaster);

  // Front walls leaving 2.8m open doorway (x in [-1.4, 1.4], z = 24)
  addBox({ x: 3.7, y: 1.1, z: 0.6 }, { x: -3.2, y: vy + 0.55, z: 24 }, mats.cobblestone);
  addBox({ x: 3.6, y: 3.3, z: 0.48 }, { x: -3.2, y: vy + 2.75, z: 24 }, mats.tudorPlaster);
  addBox({ x: 3.7, y: 1.1, z: 0.6 }, { x: 3.2, y: vy + 0.55, z: 24 }, mats.cobblestone);
  addBox({ x: 3.6, y: 3.3, z: 0.48 }, { x: 3.2, y: vy + 2.75, z: 24 }, mats.tudorPlaster);
  addBox({ x: 2.8, y: 1.2, z: 0.52 }, { x: 0, y: vy + 3.8, z: 24 }, mats.tudorPlaster);

  // Exposed Tudor Half-Timbering Frame (vertical posts, horizontal rails, gable triangles)
  for (const bx of [-5.05, -1.45, 1.45, 5.05]) {
    addBox({ x: 0.24, y: 4.5, z: 0.62 }, { x: bx, y: vy + 2.25, z: 24 }, mats.darkTimber, { collider: false });
    addBox({ x: 0.24, y: 4.5, z: 0.62 }, { x: bx, y: vy + 2.25, z: 12 }, mats.darkTimber, { collider: false });
  }
  for (const bz of [12, 15, 18, 21, 24]) {
    addBox({ x: 0.62, y: 4.5, z: 0.24 }, { x: -5, y: vy + 2.25, z: bz }, mats.darkTimber, { collider: false });
    addBox({ x: 0.62, y: 4.5, z: 0.24 }, { x: 5, y: vy + 2.25, z: bz }, mats.darkTimber, { collider: false });
  }
  // Horizontal wall plate beams
  addBox({ x: 10.5, y: 0.22, z: 0.62 }, { x: 0, y: vy + 4.4, z: 24 }, mats.darkTimber, { collider: false });
  addBox({ x: 10.5, y: 0.22, z: 0.62 }, { x: 0, y: vy + 4.4, z: 12 }, mats.darkTimber, { collider: false });
  addBox({ x: 0.62, y: 0.22, z: 12.4 }, { x: -5, y: vy + 4.4, z: 18 }, mats.darkTimber, { collider: false });
  addBox({ x: 0.62, y: 0.22, z: 12.4 }, { x: 5, y: vy + 4.4, z: 18 }, mats.darkTimber, { collider: false });
  addBox({ x: 0.62, y: 0.18, z: 12.2 }, { x: -5, y: vy + 1.12, z: 18 }, mats.darkTimber, { collider: false });
  addBox({ x: 0.62, y: 0.18, z: 12.2 }, { x: 5, y: vy + 1.12, z: 18 }, mats.darkTimber, { collider: false });

  // Gable wall triangular pediments at z=12 and z=24
  for (const gz of [12, 24]) {
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-5.1, 0);
    gableShape.lineTo(5.1, 0);
    gableShape.lineTo(0, 2.95);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.44, bevelEnabled: false });
    const gable = new THREE.Mesh(gableGeo, mats.tudorPlaster);
    gable.position.set(0, vy + 4.4, gz - 0.22);
    gable.castShadow = true;
    parent.add(gable);

    // King post & diagonal gable beams
    addBox({ x: 0.22, y: 2.8, z: 0.56 }, { x: 0, y: vy + 5.75, z: gz }, mats.darkTimber, { collider: false });
    addBox({ x: 3.1, y: 0.18, z: 0.56 }, { x: -1.8, y: vy + 5.5, z: gz }, mats.darkTimber, { rotZ: 0.55, collider: false });
    addBox({ x: 3.1, y: 0.18, z: 0.56 }, { x: 1.8, y: vy + 5.5, z: gz }, mats.darkTimber, { rotZ: -0.55, collider: false });
  }

  // Overhanging Shingled Roof with Exposed Rafters & Ridge Pole
  addBox({ x: 6.8, y: 0.26, z: 13.8 }, { x: -2.9, y: vy + 5.85, z: 18 }, mats.roofShingles, { rotZ: 0.52, collider: false });
  addBox({ x: 6.8, y: 0.26, z: 13.8 }, { x: 2.9, y: vy + 5.85, z: 18 }, mats.roofShingles, { rotZ: -0.52, collider: false });
  addBox({ x: 0.34, y: 0.34, z: 14.0 }, { x: 0, y: vy + 7.45, z: 18 }, mats.darkTimber, { collider: false });
  for (let rz = 12; rz <= 24; rz += 2.4) {
    addBox({ x: 11.4, y: 0.18, z: 0.2 }, { x: 0, y: vy + 4.35, z: rz }, mats.darkTimber, { collider: false });
  }

  // Stone Chimney on Back-Left
  addBox({ x: 1.4, y: 8.6, z: 1.4 }, { x: -3.2, y: vy + 4.3, z: 12.6 }, mats.darkStone);
  addBox({ x: 1.7, y: 0.3, z: 1.7 }, { x: -3.2, y: vy + 8.65, z: 12.6 }, mats.cobblestone, { collider: false });

  // Covered Front Porch & Windows
  addBox({ x: 3.4, y: 0.18, z: 2.2 }, { x: 0, y: vy + 0.08, z: 25.1 }, mats.cobblestone);
  addBox({ x: 0.22, y: 3.2, z: 0.22 }, { x: -1.6, y: vy + 1.65, z: 25.8 }, mats.darkTimber);
  addBox({ x: 0.22, y: 3.2, z: 0.22 }, { x: 1.6, y: vy + 1.65, z: 25.8 }, mats.darkTimber);
  addBox({ x: 4.0, y: 0.22, z: 2.4 }, { x: 0, y: vy + 3.45, z: 25.0 }, mats.roofShingles, { rotX: 0.22, collider: false });
  addWindow({ x: -3.2, y: vy + 2.4, z: 24.22 }, 0);
  addWindow({ x: 3.2, y: vy + 2.4, z: 24.22 }, 0);
  addWindow({ x: -5.22, y: vy + 2.4, z: 16.5 }, Math.PI / 2);
  addWindow({ x: -5.22, y: vy + 2.4, z: 20.5 }, Math.PI / 2);
  addWindow({ x: 5.22, y: vy + 2.4, z: 16.5 }, Math.PI / 2);
  addWindow({ x: 5.22, y: vy + 2.4, z: 20.5 }, Math.PI / 2);

  // Interior Fireplace Hearth, Council Table, Bookshelf & Lore Lectern
  addBox({ x: 2.5, y: 2.2, z: 1.2 }, { x: 0, y: vy + 1.1, z: 13.0 }, mats.darkStone);
  addBox({ x: 2.8, y: 0.2, z: 1.4 }, { x: 0, y: vy + 2.25, z: 13.0 }, mats.darkTimber, { collider: false });
  createTorchBrazier(parent, { x: 0, y: vy + 0.15, z: 13.8 }, flames, { intensity: 3.1, distance: 18, scale: 0.72 });

  // Hanging iron chandelier inside Great Hall
  const chandLight = new THREE.PointLight(0xffb566, 2.2, 16, 1.5);
  chandLight.position.set(0, vy + 4.1, 18.5);
  parent.add(chandLight);
  const chandRing = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.04, 6, 16), mats.forgedIron);
  chandRing.rotation.x = Math.PI / 2;
  chandRing.position.set(0, vy + 4.1, 18.5);
  parent.add(chandRing);

  // Oak Council Table & Chronicle Lectern
  addBox({ x: 2.4, y: 0.12, z: 1.3 }, { x: 2.2, y: vy + 0.92, z: 17.8 }, mats.oakPlanks);
  for (const lx of [1.2, 3.2]) {
    for (const lz of [17.3, 18.3]) {
      addBox({ x: 0.14, y: 0.85, z: 0.14 }, { x: lx, y: vy + 0.45, z: lz }, mats.darkTimber, { collider: false });
    }
  }
  // Bookshelf along left interior wall
  addBox({ x: 0.55, y: 2.4, z: 2.2 }, { x: -4.2, y: vy + 1.2, z: 16.5 }, mats.darkTimber);

  const loreGroup = new THREE.Group();
  loreGroup.position.set(2.2, vy + 1.0, 17.8);
  const loreCover = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.08, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x70261e, roughness: 0.65 }),
  );
  const lorePages = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.09, 0.33),
    new THREE.MeshStandardMaterial({ color: 0xe6d6b3, roughness: 0.85 }),
  );
  lorePages.position.y = 0.02;
  loreGroup.add(loreCover, lorePages);
  parent.add(loreGroup);

  registry.register({
    id: 'lore:elder_chronicle',
    kind: 'lore',
    label: '阅读《边境守望者编年史》',
    zone: 'overworld',
    position: { x: 2.2, y: vy + 0.6, z: 17.8 },
    radius: 3.4,
    enabled: true,
    mesh: loreGroup,
    onInteract: () => {
      callbacks.onLoreRead(
        '《边境守望者编年史》',
        '三百年前，守望者骑士团在北方山麓铸造了古代墓穴，以星辉圣物封锁深渊余烬。\n如今东侧高地的哨塔重新燃起烽火，预示封印结界已然松动。唯有携带守望者之血或勇气的旅人，方能取回圣物并决定边境命运。',
      );
    },
  });

  // =========================================================================
  // 2. GARRICK'S BLACKSMITH & OPEN FORGE (-19, 4.0, 38)
  // =========================================================================
  addBox({ x: 8.2, y: 1.2, z: 7.2 }, { x: -19, y: vy + 0.6, z: 38 }, mats.cobblestone);
  addBox({ x: 7.8, y: 2.8, z: 6.8 }, { x: -19, y: vy + 2.6, z: 38 }, mats.tudorPlaster);
  // Smithy timber frame & gabled roof
  for (const dx of [-22.8, -15.2]) {
    for (const dz of [34.6, 41.4]) {
      addBox({ x: 0.24, y: 4.0, z: 0.24 }, { x: dx, y: vy + 2.0, z: dz }, mats.darkTimber, { collider: false });
    }
  }
  addBox({ x: 5.2, y: 0.24, z: 8.2 }, { x: -20.8, y: vy + 4.9, z: 38 }, mats.roofShingles, { rotZ: 0.54, collider: false });
  addBox({ x: 5.2, y: 0.24, z: 8.2 }, { x: -17.2, y: vy + 4.9, z: 38 }, mats.roofShingles, { rotZ: -0.54, collider: false });
  addBox({ x: 1.2, y: 7.2, z: 1.2 }, { x: -21.5, y: vy + 3.6, z: 35.6 }, mats.darkStone);
  addWindow({ x: -15.05, y: vy + 2.4, z: 36.4 }, Math.PI / 2);
  addWindow({ x: -15.05, y: vy + 2.4, z: 39.6 }, Math.PI / 2);

  // Open-air Timber Forge Shelter & Furnace (-14.5, 4.0, 34.5)
  for (const px of [-15.2, -12.6]) {
    addBox({ x: 0.22, y: 3.1, z: 0.22 }, { x: px, y: vy + 1.55, z: 33.4 }, mats.darkTimber);
  }
  addBox({ x: 3.6, y: 0.18, z: 4.2 }, { x: -14.0, y: vy + 3.2, z: 34.8 }, mats.roofShingles, { rotZ: -0.25, collider: false });
  addBox({ x: 1.8, y: 1.7, z: 1.6 }, { x: -14.4, y: vy + 0.85, z: 34.5 }, mats.darkStone);
  addBox({ x: 0.85, y: 2.2, z: 0.85 }, { x: -14.6, y: vy + 2.3, z: 34.5 }, mats.darkStone, { collider: false });
  createTorchBrazier(parent, { x: -14.2, y: vy + 0.9, z: 34.5 }, flames, { color: 0xff621a, scale: 0.65, intensity: 2.6 });

  // Sculpted Horn Anvil on Oak Stump (-13.8, 4.0, 40.5)
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.6, 10), mats.treeBark);
  stump.position.set(-13.8, vy + 0.3, 40.5);
  stump.castShadow = true;
  const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.26, 0.36), mats.forgedIron);
  anvilBase.position.set(-13.8, vy + 0.72, 40.5);
  const anvilTop = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.18, 0.32), mats.forgedIron);
  anvilTop.position.set(-13.8, vy + 0.92, 40.5);
  const anvilHorn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 6), mats.forgedIron);
  anvilHorn.rotation.z = -Math.PI / 2;
  anvilHorn.position.set(-13.25, vy + 0.92, 40.5);
  parent.add(stump, anvilBase, anvilTop, anvilHorn);
  physics.addStaticBox({ x: 0.5, y: 0.55, z: 0.4 }, { x: -13.8, y: vy + 0.55, z: 40.5 });

  // Weapon rack & barrels by Smithy
  addBarrel({ x: -14.8, y: vy, z: 41.8 });
  addCrate({ x: -15.6, y: vy, z: 42.6 }, 0.9, 0.2);

  // =========================================================================
  // 3. LYRA'S HUNTER LODGE (19, 4.0, 40)
  // =========================================================================
  addBox({ x: 7.6, y: 1.0, z: 6.6 }, { x: 19, y: vy + 0.5, z: 40 }, mats.cobblestone);
  addBox({ x: 7.2, y: 2.8, z: 6.2 }, { x: 19, y: vy + 2.4, z: 40 }, mats.oakPlanks);
  addBox({ x: 5.0, y: 0.24, z: 7.8 }, { x: 17.3, y: vy + 4.75, z: 40 }, mats.thatch, { rotZ: 0.56, collider: false });
  addBox({ x: 5.0, y: 0.24, z: 7.8 }, { x: 20.7, y: vy + 4.75, z: 40 }, mats.thatch, { rotZ: -0.56, collider: false });
  addBox({ x: 1.0, y: 6.6, z: 1.0 }, { x: 21.4, y: vy + 3.3, z: 41.8 }, mats.darkStone);
  addWindow({ x: 15.32, y: vy + 2.3, z: 38.6 }, Math.PI / 2);
  addWindow({ x: 15.32, y: vy + 2.3, z: 41.4 }, Math.PI / 2);
  // Front wooden porch & Archery Target
  addBox({ x: 1.8, y: 0.22, z: 4.8 }, { x: 14.5, y: vy + 0.11, z: 40 }, mats.darkTimber);
  addBox({ x: 0.2, y: 2.8, z: 0.2 }, { x: 13.7, y: vy + 1.4, z: 37.8 }, mats.darkTimber);
  addBox({ x: 0.2, y: 2.8, z: 0.2 }, { x: 13.7, y: vy + 1.4, z: 42.2 }, mats.darkTimber);
  addBox({ x: 2.2, y: 0.16, z: 5.2 }, { x: 14.4, y: vy + 2.95, z: 40 }, mats.roofShingles, { rotZ: 0.24, collider: false });

  // Archery Target at (14.4, 4.0, 44.5)
  const targetDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.65, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: 0xc9ab72, roughness: 0.9 }),
  );
  targetDisc.rotation.z = Math.PI / 2;
  targetDisc.position.set(14.4, vy + 1.25, 44.5);
  const bullseye = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xa63228, roughness: 0.8 }),
  );
  bullseye.rotation.z = Math.PI / 2;
  bullseye.position.set(14.4, vy + 1.25, 44.5);
  const standPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), mats.darkTimber);
  standPost.position.set(14.6, vy + 0.75, 44.5);
  standPost.rotation.z = -0.25;
  parent.add(targetDisc, bullseye, standPost);
  physics.addStaticCylinder(0.75, 0.5, { x: 14.4, y: vy + 0.75, z: 44.5 });

  // =========================================================================
  // 4. VILLAGE PLAZA: WELL, COBBLESTONE PATHS, CART, FENCES, SIGNPOST & LAMPS
  // =========================================================================
  // Central Cobblestone Plaza Apron & Path Stones
  for (let pz = 26; pz <= 56; pz += 3.2) {
    addBox({ x: 4.4, y: 0.05, z: 2.8 }, { x: 0, y: vy + 0.025, z: pz }, mats.cobblestone, {
      collider: false,
      shadow: false,
    });
  }
  for (let px = -12; px <= 12; px += 3.0) {
    if (Math.abs(px) < 2) continue;
    addBox({ x: 2.6, y: 0.05, z: 2.6 }, { x: px, y: vy + 0.025, z: 39.5 }, mats.cobblestone, {
      collider: false,
      shadow: false,
    });
  }

  // Upgraded Masonry Stone Well at (0, 4.0, 42)
  const wellWall = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.28, 0.95, 16), mats.cobblestone);
  wellWall.position.set(0, vy + 0.475, 42);
  wellWall.castShadow = true;
  wellWall.receiveShadow = true;
  const wellRim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.13, 8, 16), mats.darkStone);
  wellRim.rotation.x = Math.PI / 2;
  wellRim.position.set(0, vy + 0.98, 42);
  const wellWater = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), mats.water);
  wellWater.rotation.x = -Math.PI / 2;
  wellWater.position.set(0, vy + 0.65, 42);
  parent.add(wellWall, wellRim, wellWater);
  physics.addStaticCylinder(0.55, 1.25, { x: 0, y: vy + 0.55, z: 42 });

  for (const dx of [-1.05, 1.05]) {
    addBox({ x: 0.16, y: 2.3, z: 0.16 }, { x: dx, y: vy + 1.45, z: 42 }, mats.darkTimber, { collider: false });
  }
  // Winch axle & hanging bucket
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), mats.oakPlanks);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, vy + 2.05, 42);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.28, 8), mats.oakPlanks);
  bucket.position.set(0, vy + 1.45, 42);
  parent.add(axle, bucket);
  addBox({ x: 1.5, y: 0.16, z: 2.3 }, { x: -0.58, y: vy + 2.85, z: 42 }, mats.roofShingles, { rotZ: 0.55, collider: false });
  addBox({ x: 1.5, y: 0.16, z: 2.3 }, { x: 0.58, y: vy + 2.85, z: 42 }, mats.roofShingles, { rotZ: -0.55, collider: false });

  // Wooden Cargo Cart (-5.8, 4.0, 50.5)
  const cartGroup = new THREE.Group();
  cartGroup.position.set(-5.8, vy, 50.5);
  cartGroup.rotation.y = 0.35;
  const cartBed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 2.9), mats.oakPlanks);
  cartBed.position.y = 0.68;
  cartBed.castShadow = true;
  const cartSideL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 2.9), mats.darkTimber);
  cartSideL.position.set(-0.84, 1.02, 0);
  const cartSideR = cartSideL.clone();
  cartSideR.position.x = 0.84;
  cartGroup.add(cartBed, cartSideL, cartSideR);
  for (const wx of [-0.98, 0.98]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 14), mats.darkTimber);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(wx, 0.58, 0);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8), mats.forgedIron);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.58, 0);
    cartGroup.add(wheel, hub);
  }
  parent.add(cartGroup);
  physics.addStaticBox({ x: 1.1, y: 0.8, z: 1.5 }, { x: -5.8, y: vy + 0.8, z: 50.5 }, 0.35);
  addBarrel({ x: -5.6, y: vy + 0.78, z: 50.2 });

  // Three-way Wooden Signpost at Village South Fork (3.4, 4.0, 48.5)
  addBox({ x: 0.18, y: 2.6, z: 0.18 }, { x: 3.4, y: vy + 1.3, z: 48.5 }, mats.darkTimber);
  addBox({ x: 1.1, y: 0.24, z: 0.08 }, { x: 3.9, y: vy + 2.35, z: 48.5 }, mats.oakPlanks, { yaw: 0.25, collider: false });
  addBox({ x: 1.1, y: 0.24, z: 0.08 }, { x: 2.9, y: vy + 2.02, z: 48.5 }, mats.oakPlanks, { yaw: -0.35, collider: false });

  // Split-rail Timber Fences along Village Edge
  for (const side of [-1, 1]) {
    for (let fx = 4.5; fx <= 13.5; fx += 3.0) {
      addBox({ x: 0.16, y: 1.1, z: 0.16 }, { x: side * fx, y: vy + 0.55, z: 56 }, mats.darkTimber);
      if (fx < 13.5) {
        addBox({ x: 3.0, y: 0.1, z: 0.1 }, { x: side * (fx + 1.5), y: vy + 0.85, z: 56 }, mats.oakPlanks, { collider: false });
        addBox({ x: 3.0, y: 0.1, z: 0.1 }, { x: side * (fx + 1.5), y: vy + 0.45, z: 56 }, mats.oakPlanks, { collider: false });
      }
    }
  }

  // Street Lantern Posts & Entrance Braziers
  addLampPost({ x: -3.2, y: vy, z: 29 });
  addLampPost({ x: 3.2, y: vy, z: 29 });
  addLampPost({ x: -4.2, y: vy, z: 47 });
  addLampPost({ x: 4.2, y: vy, z: 47 });
  createTorchBrazier(parent, { x: -3.6, y: vy, z: 56 }, flames, { scale: 0.9 });
  createTorchBrazier(parent, { x: 3.6, y: vy, z: 56 }, flames, { scale: 0.9 });
  addCrate({ x: 12.2, y: vy, z: 37.5 }, 0.85, 0.4);
  addBarrel({ x: 12.8, y: vy, z: 38.4 });

  // =========================================================================
  // 5. RIVER BRIDGE (95, 2.35, 55) — Stone Abutments, Pilings & Timber Deck
  // =========================================================================
  addBox({ x: 30, y: 0.45, z: 5.0 }, { x: 95, y: 2.35, z: 55 }, mats.oakPlanks);
  addBox({ x: 5.0, y: 0.45, z: 5.0 }, { x: 78.5, y: 2.05, z: 55 }, mats.oakPlanks);
  addBox({ x: 5.0, y: 0.45, z: 5.0 }, { x: 111.5, y: 2.05, z: 55 }, mats.oakPlanks);
  // Stone abutments at banks
  addBox({ x: 2.4, y: 2.6, z: 5.8 }, { x: 80.5, y: 1.2, z: 55 }, mats.cobblestone);
  addBox({ x: 2.4, y: 2.6, z: 5.8 }, { x: 109.5, y: 1.2, z: 55 }, mats.cobblestone);
  // Submerged bridge pilings
  for (const bx of [86, 95, 104]) {
    for (const bz of [52.8, 57.2]) {
      addBox({ x: 0.36, y: 3.2, z: 0.36 }, { x: bx, y: 0.9, z: bz }, mats.darkTimber, { collider: false });
    }
  }
  // Railings & posts
  addBox({ x: 30, y: 0.16, z: 0.24 }, { x: 95, y: 3.35, z: 52.6 }, mats.darkTimber);
  addBox({ x: 30, y: 0.16, z: 0.24 }, { x: 95, y: 3.35, z: 57.4 }, mats.darkTimber);
  addBox({ x: 30, y: 0.12, z: 0.18 }, { x: 95, y: 2.85, z: 52.6 }, mats.oakPlanks, { collider: false });
  addBox({ x: 30, y: 0.12, z: 0.18 }, { x: 95, y: 2.85, z: 57.4 }, mats.oakPlanks, { collider: false });
  addLampPost({ x: 81.5, y: 2.55, z: 52.6 });
  addLampPost({ x: 108.5, y: 2.55, z: 57.4 });

  // =========================================================================
  // 6. RUINED WATCHTOWER (105, 14.0, -65) — Buttresses, Battlements & Ramp
  // =========================================================================
  const wx = 105;
  const wy = 14.0;
  const wz = -65;

  addBox({ x: 11.8, y: 0.45, z: 11.8 }, { x: wx, y: wy - 0.1, z: wz }, mats.cobblestone, { shadow: false });
  const wallCount = 8;
  const wallRadius = 5.6;
  for (let i = 0; i < wallCount; i++) {
    const angle = (i / wallCount) * Math.PI * 2;
    if (i === 2) continue; // South doorway
    const segX = wx + Math.cos(angle) * wallRadius;
    const segZ = wz + Math.sin(angle) * wallRadius;
    const height = i % 2 === 0 ? 8.6 : 7.0;
    addBox({ x: 0.95, y: height, z: 4.3 }, { x: segX, y: wy + height / 2, z: segZ }, mats.darkStone, {
      yaw: -angle,
    });
    // Corner buttress & top crenel
    const buttX = wx + Math.cos(angle) * (wallRadius + 0.55);
    const buttZ = wz + Math.sin(angle) * (wallRadius + 0.55);
    addBox({ x: 0.7, y: 4.0, z: 0.7 }, { x: buttX, y: wy + 2.0, z: buttZ }, mats.cobblestone, {
      yaw: -angle,
      collider: false,
    });
    if (i % 2 === 0) {
      addBox({ x: 0.95, y: 1.0, z: 1.2 }, { x: segX, y: wy + height + 0.5, z: segZ }, mats.darkStone, {
        yaw: -angle,
        collider: false,
      });
    }
  }

  // Upper wooden/stone lookout deck (y = 19.5) & interior ramp
  addBox({ x: 8.6, y: 0.45, z: 4.8 }, { x: wx, y: 19.25, z: wz - 1.6 }, mats.oakPlanks);
  const rampSteps = 10;
  for (let s = 0; s < rampSteps; s++) {
    const t = (s + 0.5) / rampSteps;
    const stepAngle = Math.PI * 0.72 + t * Math.PI * 0.72;
    const r = 3.3;
    const sx = wx + Math.cos(stepAngle) * r;
    const sz = wz + Math.sin(stepAngle) * r;
    const sy = wy + 0.35 + t * 5.1;
    addBox({ x: 2.2, y: 0.35, z: 1.75 }, { x: sx, y: sy, z: sz }, mats.oakPlanks, { yaw: -stepAngle });
  }
  createTorchBrazier(parent, { x: wx, y: 19.5, z: wz - 2.6 }, flames, {
    color: 0xff6e24,
    intensity: 4.2,
    distance: 30,
    scale: 1.35,
  });

  // =========================================================================
  // 7. ANCIENT CRYPT MONUMENTAL ARCHWAY (0, 12.0, -175)
  // =========================================================================
  const cx = 0;
  const cy = getTerrainHeight(0, -175);
  const cz = -175;
  addBox({ x: 1.8, y: 5.8, z: 2.4 }, { x: cx - 3.3, y: cy + 2.9, z: cz }, mats.darkStone);
  addBox({ x: 1.8, y: 5.8, z: 2.4 }, { x: cx + 3.3, y: cy + 2.9, z: cz }, mats.darkStone);
  addBox({ x: 8.8, y: 1.6, z: 2.6 }, { x: cx, y: cy + 6.1, z: cz }, mats.darkStone);
  addBox({ x: 9.8, y: 0.65, z: 3.0 }, { x: cx, y: cy + 7.1, z: cz }, mats.cobblestone, { collider: false });
  addBox({ x: 5.0, y: 4.8, z: 0.9 }, { x: cx, y: cy + 2.4, z: cz - 0.85 }, mats.dungeonWall);
  // Flanking ruined stone pillars
  addBox({ x: 1.1, y: 3.6, z: 1.1 }, { x: cx - 5.4, y: cy + 1.8, z: cz + 1.5 }, mats.cobblestone);
  addBox({ x: 1.1, y: 4.2, z: 1.1 }, { x: cx + 5.4, y: cy + 2.1, z: cz + 1.5 }, mats.cobblestone);

  // Iron portcullis teeth along upper doorway
  for (let gx = -1.5; gx <= 1.5; gx += 0.6) {
    addBox({ x: 0.1, y: 1.2, z: 0.1 }, { x: cx + gx, y: cy + 4.7, z: cz + 0.35 }, mats.forgedIron, { collider: false });
  }

  const portalGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 4.4),
    new THREE.MeshBasicMaterial({
      color: 0x3b86b8,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
    }),
  );
  portalGlow.position.set(cx, cy + 2.3, cz - 0.32);
  parent.add(portalGlow);

  createTorchBrazier(parent, { x: cx - 3.6, y: cy, z: cz + 2.4 }, flames, { color: 0x5ab4ff, intensity: 2.6 });
  createTorchBrazier(parent, { x: cx + 3.6, y: cy, z: cz + 2.4 }, flames, { color: 0x5ab4ff, intensity: 2.6 });

  registry.register({
    id: 'portal:crypt_enter',
    kind: 'portal',
    label: '进入古代墓穴 (Ancient Crypt)',
    zone: 'overworld',
    position: { x: cx, y: cy, z: cz },
    radius: 4.5,
    enabled: true,
    mesh: portalGlow,
    onInteract: callbacks.onEnterCrypt,
  });
}
