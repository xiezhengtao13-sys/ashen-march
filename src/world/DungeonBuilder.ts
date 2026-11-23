import * as THREE from 'three';
import type { Vec3 } from '../core/types';
import worldConfig from '../data/worldConfig.json';
import { MaterialLibrary } from '../engine/MaterialLibrary';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { InteractableRegistry } from './InteractableRegistry';
import { createTorchBrazier, type FlameRef } from './PropFactory';

export interface DungeonBuildCallbacks {
  onExitCrypt: () => void;
}

export interface BuiltDungeon {
  flames: FlameRef[];
  update: (elapsed: number) => void;
}

export function buildAncientCrypt(
  parent: THREE.Group,
  physics: PhysicsWorld,
  registry: InteractableRegistry,
  callbacks: DungeonBuildCallbacks,
  materialLib?: MaterialLibrary,
): BuiltDungeon {
  const mats = materialLib ?? new MaterialLibrary();
  const flames: FlameRef[] = [];
  const baseY = -500;

  const addBlock = (size: Vec3, pos: Vec3, mat: THREE.Material, collider = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    parent.add(mesh);
    if (collider) {
      physics.addStaticBox({ x: size.x / 2, y: size.y / 2, z: size.z / 2 }, pos);
    }
    return mesh;
  };

  const addColumn = (px: number, pz: number, width = 1.0): void => {
    addBlock({ x: width, y: 6.4, z: width }, { x: px, y: baseY + 3.2, z: pz }, mats.dungeonWall, true);
    addBlock({ x: width + 0.35, y: 0.45, z: width + 0.35 }, { x: px, y: baseY + 0.22, z: pz }, mats.darkStone, false);
    addBlock({ x: width + 0.35, y: 0.45, z: width + 0.35 }, { x: px, y: baseY + 6.6, z: pz }, mats.darkStone, false);
  };

  const addSarcophagus = (px: number, pz: number, yaw = 0): void => {
    const g = new THREE.Group();
    g.position.set(px, baseY, pz);
    g.rotation.y = yaw;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 2.5), mats.darkStone);
    base.position.y = 0.425;
    base.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.24, 2.62), mats.cobblestone);
    lid.position.y = 0.96;
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 1.8), mats.agedBronze);
    crest.position.y = 1.12;
    g.add(base, lid, crest);
    parent.add(g);
    physics.addStaticBox({ x: 0.75, y: 0.55, z: 1.3 }, { x: px, y: baseY + 0.55, z: pz }, yaw);
  };

  const cryptAmbient = new THREE.HemisphereLight(0x637ea6, 0x191c24, 0.82);
  parent.add(cryptAmbient);

  // 1. Flagstone Floor & Vaulted Ceiling
  addBlock({ x: 42, y: 0.5, z: 92 }, { x: 0, y: baseY - 0.25, z: -38 }, mats.dungeonFloor);
  addBlock({ x: 42, y: 0.5, z: 92 }, { x: 0, y: baseY + 7.2, z: -38 }, mats.darkStone, false);

  // 2. Entry Hall & Central Corridor
  addBlock({ x: 13, y: 7.0, z: 1.0 }, { x: 0, y: baseY + 3.5, z: 4.5 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 7.0, z: 52 }, { x: -6.0, y: baseY + 3.5, z: -22 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 7.0, z: 32 }, { x: 6.0, y: baseY + 3.5, z: -12 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 7.0, z: 12 }, { x: 6.0, y: baseY + 3.5, z: -42 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 2.5, z: 8 }, { x: 6.0, y: baseY + 5.75, z: -32 }, mats.dungeonWall);

  // 3. Side Treasury Room
  addBlock({ x: 12, y: 7.0, z: 1.0 }, { x: 12, y: baseY + 3.5, z: -24 }, mats.dungeonWall);
  addBlock({ x: 12, y: 7.0, z: 1.0 }, { x: 12, y: baseY + 3.5, z: -40 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 7.0, z: 16 }, { x: 18, y: baseY + 3.5, z: -32 }, mats.dungeonWall);
  addSarcophagus(10.5, -26.5, Math.PI / 2);
  createTorchBrazier(parent, { x: 15.5, y: baseY, z: -27 }, flames, { color: 0xffaa44, intensity: 2.6 });

  // 4. Grand Burial Sanctum
  addBlock({ x: 12.5, y: 7.0, z: 1.0 }, { x: -12.25, y: baseY + 3.5, z: -48 }, mats.dungeonWall);
  addBlock({ x: 12.5, y: 7.0, z: 1.0 }, { x: 12.25, y: baseY + 3.5, z: -48 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 7.0, z: 32 }, { x: -18.0, y: baseY + 3.5, z: -64 }, mats.dungeonWall);
  addBlock({ x: 1.0, y: 7.0, z: 32 }, { x: 18.0, y: baseY + 3.5, z: -64 }, mats.dungeonWall);
  addBlock({ x: 37, y: 7.0, z: 1.0 }, { x: 0, y: baseY + 3.5, z: -80 }, mats.dungeonWall);

  // Columns & Overhead Ribbed Stone Arches along corridor
  for (const pz of [-12, -24, -36, -46]) {
    addColumn(-4.2, pz, 0.95);
    addColumn(4.2, pz, 0.95);
    addBlock({ x: 10.2, y: 0.75, z: 0.9 }, { x: 0, y: baseY + 6.75, z: pz }, mats.darkStone, false);
  }
  for (const pz of [-56, -70]) {
    addColumn(-10, pz, 1.25);
    addColumn(10, pz, 1.25);
    addBlock({ x: 22, y: 0.85, z: 1.1 }, { x: 0, y: baseY + 6.7, z: pz }, mats.darkStone, false);
  }

  // Sarcophagi flanking the Burial Sanctum
  addSarcophagus(-14.5, -56, 0);
  addSarcophagus(14.5, -56, 0);
  addSarcophagus(-14.5, -70, 0);
  addSarcophagus(14.5, -70, 0);

  // Raised Stepped Runic Altar Platform at (0, -500, -74)
  addBlock({ x: 8.0, y: 0.28, z: 5.5 }, { x: 0, y: baseY + 0.14, z: -74 }, mats.darkStone);
  addBlock({ x: 5.8, y: 0.28, z: 4.0 }, { x: 0, y: baseY + 0.4, z: -74 }, mats.cobblestone);
  const runeRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 2.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x56c7ff, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
  );
  runeRing.rotation.x = -Math.PI / 2;
  runeRing.position.set(0, baseY + 0.56, -74);
  parent.add(runeRing);

  // Torch Braziers
  createTorchBrazier(parent, { x: -4.2, y: baseY, z: -8 }, flames, { color: 0xff8c38, intensity: 2.5 });
  createTorchBrazier(parent, { x: 4.2, y: baseY, z: -8 }, flames, { color: 0xff8c38, intensity: 2.5 });
  createTorchBrazier(parent, { x: -4.2, y: baseY, z: -20 }, flames, { color: 0xff8c38, intensity: 2.4 });
  createTorchBrazier(parent, { x: 4.2, y: baseY, z: -42 }, flames, { color: 0xff8c38, intensity: 2.4 });
  createTorchBrazier(parent, { x: -9.5, y: baseY, z: -62 }, flames, { color: 0x5ab8ff, intensity: 3.0, distance: 24 });
  createTorchBrazier(parent, { x: 9.5, y: baseY, z: -62 }, flames, { color: 0x5ab8ff, intensity: 3.0, distance: 24 });
  createTorchBrazier(parent, { x: -3.5, y: baseY + 0.45, z: -74 }, flames, { color: 0x6ce5ff, intensity: 3.2, distance: 22 });
  createTorchBrazier(parent, { x: 3.5, y: baseY + 0.45, z: -74 }, flames, { color: 0x6ce5ff, intensity: 3.2, distance: 22 });

  // Framed Exit Portal
  addBlock({ x: 0.9, y: 4.4, z: 0.9 }, { x: -2.0, y: baseY + 2.2, z: 3.8 }, mats.darkStone, false);
  addBlock({ x: 0.9, y: 4.4, z: 0.9 }, { x: 2.0, y: baseY + 2.2, z: 3.8 }, mats.darkStone, false);
  addBlock({ x: 4.9, y: 0.9, z: 1.0 }, { x: 0, y: baseY + 4.4, z: 3.8 }, mats.darkStone, false);

  const exitGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 4.0),
    new THREE.MeshBasicMaterial({
      color: 0x5ab8ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  exitGlow.position.set(0, baseY + 2.1, 3.85);
  parent.add(exitGlow);

  registry.register({
    id: 'portal:crypt_exit',
    kind: 'portal',
    label: worldConfig.portals.cryptExit.label,
    zone: 'ancient_crypt',
    position: { ...worldConfig.portals.cryptExit.position },
    radius: 4.2,
    enabled: true,
    mesh: exitGlow,
    onInteract: callbacks.onExitCrypt,
  });

  return {
    flames,
    update: (elapsed: number) => {
      runeRing.rotation.z = elapsed * 0.25;
      for (const f of flames) {
        const flicker = Math.sin(elapsed * 8.5 + f.phase) * 0.25 + Math.cos(elapsed * 14 + f.phase) * 0.1;
        f.light.intensity = f.baseIntensity + flicker;
        f.mesh.scale.y = 1 + flicker * 0.24;
      }
    },
  };
}
