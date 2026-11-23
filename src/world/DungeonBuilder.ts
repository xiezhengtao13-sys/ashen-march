import * as THREE from 'three';
import type { Vec3 } from '../core/types';
import worldConfig from '../data/worldConfig.json';
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
): BuiltDungeon {
  const flames: FlameRef[] = [];
  const baseY = -500;

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x383b42, roughness: 0.92 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4b4f59, roughness: 0.9 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5c606b, roughness: 0.85 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x26282e, roughness: 0.95 });

  const addBlock = (size: Vec3, pos: Vec3, mat: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    parent.add(mesh);
    physics.addStaticBox({ x: size.x / 2, y: size.y / 2, z: size.z / 2 }, pos);
    return mesh;
  };

  // Ambient + subtle dungeon fill light inside crypt group
  const cryptAmbient = new THREE.HemisphereLight(0x526b8c, 0x16181f, 0.45);
  parent.add(cryptAmbient);

  // 1. Main Dungeon Floor & Ceiling spanning entire crypt footprint
  addBlock({ x: 42, y: 0.5, z: 92 }, { x: 0, y: baseY - 0.25, z: -38 }, floorMat);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(42, 0.5, 92), ceilingMat);
  ceiling.position.set(0, baseY + 7.2, -38);
  parent.add(ceiling);

  // 2. Entry Hall & Central Corridor (x in [-6, 6], z in [-48, 4])
  // South entrance wall (z = 4.5)
  addBlock({ x: 13, y: 7.0, z: 1.0 }, { x: 0, y: baseY + 3.5, z: 4.5 }, wallMat);
  // West corridor wall (x = -6, z = 4..-48)
  addBlock({ x: 1.0, y: 7.0, z: 52 }, { x: -6.0, y: baseY + 3.5, z: -22 }, wallMat);
  // East corridor walls leaving open doorway to Side Treasury at z in [-36, -28]
  addBlock({ x: 1.0, y: 7.0, z: 32 }, { x: 6.0, y: baseY + 3.5, z: -12 }, wallMat);
  addBlock({ x: 1.0, y: 7.0, z: 12 }, { x: 6.0, y: baseY + 3.5, z: -42 }, wallMat);
  // Lintel above treasury doorway
  addBlock({ x: 1.0, y: 2.5, z: 8 }, { x: 6.0, y: baseY + 5.75, z: -32 }, wallMat);

  // 3. Side Treasury Room (x in [6, 18], z in [-40, -24])
  addBlock({ x: 12, y: 7.0, z: 1.0 }, { x: 12, y: baseY + 3.5, z: -24 }, wallMat);
  addBlock({ x: 12, y: 7.0, z: 1.0 }, { x: 12, y: baseY + 3.5, z: -40 }, wallMat);
  addBlock({ x: 1.0, y: 7.0, z: 16 }, { x: 18, y: baseY + 3.5, z: -32 }, wallMat);
  createTorchBrazier(parent, { x: 15.5, y: baseY, z: -27 }, flames, { color: 0xffaa44, intensity: 2.4 });

  // 4. Grand Burial Sanctum (x in [-18, 18], z in [-80, -48])
  // Transition walls between corridor (x=±6) and sanctum (x=±18) at z = -48
  addBlock({ x: 12.5, y: 7.0, z: 1.0 }, { x: -12.25, y: baseY + 3.5, z: -48 }, wallMat);
  addBlock({ x: 12.5, y: 7.0, z: 1.0 }, { x: 12.25, y: baseY + 3.5, z: -48 }, wallMat);
  // Sanctum West, East, and North walls
  addBlock({ x: 1.0, y: 7.0, z: 32 }, { x: -18.0, y: baseY + 3.5, z: -64 }, wallMat);
  addBlock({ x: 1.0, y: 7.0, z: 32 }, { x: 18.0, y: baseY + 3.5, z: -64 }, wallMat);
  addBlock({ x: 37, y: 7.0, z: 1.0 }, { x: 0, y: baseY + 3.5, z: -80 }, wallMat);

  // Corridor & Sanctum Pillars
  for (const pz of [-16, -28, -40]) {
    for (const px of [-3.8, 3.8]) {
      addBlock({ x: 0.9, y: 7.0, z: 0.9 }, { x: px, y: baseY + 3.5, z: pz }, pillarMat);
    }
  }
  for (const pz of [-56, -70]) {
    for (const px of [-10, 10]) {
      addBlock({ x: 1.2, y: 7.0, z: 1.2 }, { x: px, y: baseY + 3.5, z: pz }, pillarMat);
    }
  }

  // Raised Sanctum Altar Platform at (0, -500, -74)
  addBlock({ x: 6.4, y: 0.4, z: 4.5 }, { x: 0, y: baseY + 0.15, z: -74 }, pillarMat);

  // Torch Braziers along corridor & sanctum
  createTorchBrazier(parent, { x: -4.2, y: baseY, z: -8 }, flames, { color: 0xff8c38, intensity: 2.3 });
  createTorchBrazier(parent, { x: 4.2, y: baseY, z: -8 }, flames, { color: 0xff8c38, intensity: 2.3 });
  createTorchBrazier(parent, { x: -4.2, y: baseY, z: -22 }, flames, { color: 0xff8c38, intensity: 2.2 });
  createTorchBrazier(parent, { x: 4.2, y: baseY, z: -44 }, flames, { color: 0xff8c38, intensity: 2.2 });
  createTorchBrazier(parent, { x: -9.5, y: baseY, z: -62 }, flames, { color: 0x5ab8ff, intensity: 2.8, distance: 22 });
  createTorchBrazier(parent, { x: 9.5, y: baseY, z: -62 }, flames, { color: 0x5ab8ff, intensity: 2.8, distance: 22 });
  createTorchBrazier(parent, { x: -3.5, y: baseY + 0.35, z: -74 }, flames, { color: 0x6ce5ff, intensity: 3.0, distance: 20 });
  createTorchBrazier(parent, { x: 3.5, y: baseY + 0.35, z: -74 }, flames, { color: 0x6ce5ff, intensity: 3.0, distance: 20 });

  // Exit Portal at south wall (0, -500, 2.5)
  const exitGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 4.0),
    new THREE.MeshBasicMaterial({
      color: 0x5ab8ff,
      transparent: true,
      opacity: 0.45,
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
      for (const f of flames) {
        const flicker = Math.sin(elapsed * 8.5 + f.phase) * 0.25 + Math.cos(elapsed * 14 + f.phase) * 0.1;
        f.light.intensity = f.baseIntensity + flicker;
        f.mesh.scale.y = 1 + flicker * 0.24;
      }
    },
  };
}
