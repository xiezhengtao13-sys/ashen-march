import * as THREE from 'three';
import worldConfig from '../data/worldConfig.json';
import { MaterialLibrary } from '../engine/MaterialLibrary';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { buildAllArchitecture } from './ArchitectureBuilder';
import type { InteractableRegistry } from './InteractableRegistry';
import { createTorchBrazier, type FlameRef } from './PropFactory';
import { buildTerrainMesh, getRiverCenterX, getTerrainHeight } from './TerrainGenerator';
import { buildInstancedVegetation, type VegetationController } from './VegetationBuilder';

export interface WorldBuildCallbacks {
  onEnterCrypt: () => void;
  onLoreRead: (title: string, body: string) => void;
}

export interface BuiltWorld {
  flames: FlameRef[];
  waterMesh: THREE.Mesh;
  vegetation: VegetationController;
  update: (elapsed: number, dt?: number) => void;
}

export function buildOverworld(
  parent: THREE.Group,
  physics: PhysicsWorld,
  registry: InteractableRegistry,
  callbacks: WorldBuildCallbacks,
  materialLib?: MaterialLibrary,
): BuiltWorld {
  const mats = materialLib ?? new MaterialLibrary();
  const flames: FlameRef[] = [];

  // 1. Deterministic Terrain with PBR Detail Texture + Rapier Collider
  const terrain = buildTerrainMesh(worldConfig.seed, mats.terrain);
  parent.add(terrain.mesh);
  physics.addTerrainTrimesh(terrain.vertices, terrain.indices);

  // 2. Modular Medieval Architecture (Village, Bridge, Watchtower, Crypt Archway)
  buildAllArchitecture(parent, physics, mats, registry, flames, callbacks);

  // 3. River Valley Flowing Water
  const waterGeo = new THREE.PlaneGeometry(36, 235, 22, 56);
  waterGeo.rotateX(-Math.PI / 2);
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wPos.count; i++) {
    const lx = wPos.getX(i);
    const lz = wPos.getZ(i) + 105;
    wPos.setX(i, getRiverCenterX(lz) + lx);
    wPos.setZ(i, lz);
  }
  waterGeo.computeVertexNormals();
  const waterMesh = new THREE.Mesh(waterGeo, mats.water);
  waterMesh.position.y = 1.25;
  waterMesh.receiveShadow = true;
  parent.add(waterMesh);

  // 4. Goblin Camp & Hidden Shrine Landmarks
  const campY = getTerrainHeight(-108, -30);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.35;
    if (i === 0) continue;
    const px = -108 + Math.cos(a) * 6.8;
    const pz = -30 + Math.sin(a) * 6.8;
    const py = getTerrainHeight(px, pz);
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.5, 6), mats.darkTimber);
    stake.position.set(px, py + 1.15, pz);
    stake.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.08;
    stake.castShadow = true;
    parent.add(stake);
    physics.addStaticCylinder(1.2, 0.25, { x: px, y: py + 1.15, z: pz });
  }
  // Goblin camp tent canopy
  const tentFrame = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.5, 5), mats.thatch);
  tentFrame.position.set(-111.5, campY + 1.25, -33.5);
  tentFrame.castShadow = true;
  parent.add(tentFrame);
  physics.addStaticCylinder(1.2, 2.1, { x: -111.5, y: campY + 1.2, z: -33.5 });
  createTorchBrazier(parent, { x: -106.5, y: campY, z: -28 }, flames, { scale: 0.85 });

  // Hidden Shrine (-146, 7.5, -66)
  const shrineY = getTerrainHeight(-146, -66);
  const shrineDais = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.45, 8), mats.cobblestone);
  shrineDais.position.set(-146, shrineY + 0.2, -66);
  shrineDais.receiveShadow = true;
  parent.add(shrineDais);
  const shrineCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.95, 0),
    new THREE.MeshStandardMaterial({
      color: 0x6ce5ff,
      emissive: 0x2c8bb8,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.2,
    }),
  );
  shrineCrystal.position.set(-146, shrineY + 2.35, -66);
  parent.add(shrineCrystal);
  const shrineLight = new THREE.PointLight(0x5ed6ff, 2.4, 18);
  shrineLight.position.set(-146, shrineY + 2.6, -66);
  parent.add(shrineLight);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const sx = -146 + Math.cos(a) * 4.5;
    const sz = -66 + Math.sin(a) * 4.5;
    const sy = getTerrainHeight(sx, sz);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 3.4, 0.75), mats.darkStone);
    pillar.position.set(sx, sy + 1.6, sz);
    pillar.castShadow = true;
    parent.add(pillar);
    physics.addStaticBox({ x: 0.38, y: 1.7, z: 0.38 }, { x: sx, y: sy + 1.6, z: sz });
  }

  // 5. High-Performance Instanced Vegetation & Boulders
  const vegetation = buildInstancedVegetation(parent, physics, mats);

  return {
    flames,
    waterMesh,
    vegetation,
    update: (elapsed: number, dt = 0.016) => {
      // Animate flowing water normal ripples
      mats.waterNormalMap.offset.y = (mats.waterNormalMap.offset.y + dt * 0.14) % 1;
      mats.waterNormalMap.offset.x = Math.sin(elapsed * 0.25) * 0.05;
      waterMesh.position.y = 1.24 + Math.sin(elapsed * 1.4) * 0.025;

      shrineCrystal.rotation.y = elapsed * 0.8;
      shrineCrystal.position.y = shrineY + 2.35 + Math.sin(elapsed * 2.0) * 0.16;

      for (const f of flames) {
        const flicker = Math.sin(elapsed * 9.5 + f.phase) * 0.22 + Math.sin(elapsed * 15.3 + f.phase) * 0.1;
        f.light.intensity = f.baseIntensity + flicker;
        f.mesh.scale.y = 1 + flicker * 0.22;
      }
    },
  };
}
