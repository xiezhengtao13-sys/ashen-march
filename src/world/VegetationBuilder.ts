import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import worldConfig from '../data/worldConfig.json';
import type { MaterialLibrary } from '../engine/MaterialLibrary';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { getRiverCenterX, getTerrainHeight } from './TerrainGenerator';

export interface VegetationController {
  setDensity: (ratio: number) => void;
}

export function buildInstancedVegetation(
  parent: THREE.Group,
  physics: PhysicsWorld,
  mats: MaterialLibrary,
): VegetationController {
  const rng = new SeededRandom(worldConfig.seed + 1001);
  const dummy = new THREE.Object3D();

  interface TreeTransform {
    x: number;
    y: number;
    z: number;
    scale: number;
    yaw: number;
  }

  const pineTransforms: TreeTransform[] = [];
  const oakTransforms: TreeTransform[] = [];
  const deadTransforms: TreeTransform[] = [];
  const bushTransforms: TreeTransform[] = [];
  const fernTransforms: TreeTransform[] = [];
  const rockTransforms: TreeTransform[] = [];

  const isClearOfBuildings = (x: number, z: number): boolean => {
    if (Math.hypot(x - 0, z - 40) < 42) return false;
    if (Math.hypot(x - 105, z - -65) < 20) return false;
    if (Math.hypot(x - 0, z - -175) < 20) return false;
    if (Math.hypot(x - -108, z - -30) < 11) return false;
    if (Math.hypot(x - -146, z - -66) < 10) return false;
    if (Math.abs(x) < 8 && z > -170 && z < 65) return false;
    if (z > -15 && Math.abs(x - getRiverCenterX(z)) < 15) return false;
    return true;
  };

  // 1. Trees (190 total: 110 Pine, 55 Oak, 25 Deadwood)
  let attempts = 0;
  while (pineTransforms.length + oakTransforms.length + deadTransforms.length < 190 && attempts < 1800) {
    attempts++;
    const inForest = attempts < 1150;
    const tx = inForest ? rng.range(-215, -24) : rng.range(-215, 215);
    const tz = inForest ? rng.range(-145, 105) : rng.range(-195, 195);
    if (!isClearOfBuildings(tx, tz)) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < 2.2) continue;

    const scale = rng.range(0.85, 1.55);
    const yaw = rng.range(0, Math.PI * 2);
    const roll = rng.next();

    if (roll < 0.58 && pineTransforms.length < 110) {
      pineTransforms.push({ x: tx, y: ty, z: tz, scale, yaw });
      physics.addStaticCylinder(2.1 * scale, 0.36 * scale, { x: tx, y: ty + 2.0 * scale, z: tz });
    } else if (roll < 0.87 && oakTransforms.length < 55) {
      oakTransforms.push({ x: tx, y: ty, z: tz, scale, yaw });
      physics.addStaticCylinder(1.8 * scale, 0.42 * scale, { x: tx, y: ty + 1.8 * scale, z: tz });
    } else if (deadTransforms.length < 25) {
      deadTransforms.push({ x: tx, y: ty, z: tz, scale, yaw });
      physics.addStaticCylinder(1.7 * scale, 0.32 * scale, { x: tx, y: ty + 1.6 * scale, z: tz });
    }
  }

  // 2. Woodland Bushes (200)
  attempts = 0;
  while (bushTransforms.length < 200 && attempts < 1500) {
    attempts++;
    const bx = rng.range(-210, 200);
    const bz = rng.range(-180, 180);
    if (Math.hypot(bx, bz - 40) < 28) continue; // Keep inner village plaza clean
    if (Math.hypot(bx - 105, bz - -65) < 12) continue;
    if (bz > -15 && Math.abs(bx - getRiverCenterX(bz)) < 13) continue;
    const by = getTerrainHeight(bx, bz);
    if (by < 1.8 || by > 19) continue;
    bushTransforms.push({ x: bx, y: by, z: bz, scale: rng.range(0.65, 1.35), yaw: rng.range(0, Math.PI * 2) });
  }

  // 3. Ferns & Tall Grass Tufts (480)
  attempts = 0;
  while (fernTransforms.length < 480 && attempts < 2200) {
    attempts++;
    const fx = rng.range(-195, 195);
    const fz = rng.range(-175, 175);
    if (Math.hypot(fx, fz - 40) < 24) continue;
    if (fz > -15 && Math.abs(fx - getRiverCenterX(fz)) < 11) continue;
    const fy = getTerrainHeight(fx, fz);
    if (fy < 1.5 || fy > 17) continue;
    fernTransforms.push({ x: fx, y: fy, z: fz, scale: rng.range(0.7, 1.45), yaw: rng.range(0, Math.PI * 2) });
  }

  // 4. Boulders & Riverbank Stones (80)
  attempts = 0;
  while (rockTransforms.length < 80 && attempts < 900) {
    attempts++;
    const alongRiver = rockTransforms.length < 32;
    const rz = alongRiver ? rng.range(5, 165) : rng.range(-185, 185);
    const rx = alongRiver
      ? getRiverCenterX(rz) + (rng.next() > 0.5 ? 1 : -1) * rng.range(11, 17)
      : rng.range(-200, 200);
    if (!alongRiver && !isClearOfBuildings(rx, rz)) continue;
    if (alongRiver && Math.abs(rz - 55) < 10) continue; // Keep bridge approaches open

    const ry = getTerrainHeight(rx, rz);
    const rScale = rng.range(0.65, 1.75);
    rockTransforms.push({ x: rx, y: ry, z: rz, scale: rScale, yaw: rng.range(0, Math.PI * 2) });
    if (rScale > 1.0) {
      physics.addStaticCylinder(rScale * 0.55, rScale * 0.8, { x: rx, y: ry + rScale * 0.4, z: rz });
    }
  }

  const managedMeshes: Array<{ mesh: THREE.InstancedMesh; fullCount: number }> = [];

  const createInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    castShadow = true,
  ): THREE.InstancedMesh => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    im.castShadow = castShadow;
    im.receiveShadow = true;
    parent.add(im);
    managedMeshes.push({ mesh: im, fullCount: count });
    return im;
  };

  // Populate Northern Pines
  if (pineTransforms.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 3.6, 8);
    const c1Geo = new THREE.ConeGeometry(2.1, 2.7, 8);
    const c2Geo = new THREE.ConeGeometry(1.6, 2.3, 8);
    const c3Geo = new THREE.ConeGeometry(1.05, 1.9, 8);

    const trunks = createInstanced(trunkGeo, mats.treeBark, pineTransforms.length);
    const c1s = createInstanced(c1Geo, mats.pineNeedles, pineTransforms.length);
    const c2s = createInstanced(c2Geo, mats.pineNeedles, pineTransforms.length);
    const c3s = createInstanced(c3Geo, mats.pineNeedles, pineTransforms.length);

    pineTransforms.forEach((t, i) => {
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.setScalar(t.scale);

      dummy.position.set(t.x, t.y + 1.65 * t.scale, t.z);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.y + 3.0 * t.scale, t.z);
      dummy.updateMatrix();
      c1s.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.y + 4.45 * t.scale, t.z);
      dummy.updateMatrix();
      c2s.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.y + 5.75 * t.scale, t.z);
      dummy.updateMatrix();
      c3s.setMatrixAt(i, dummy.matrix);
    });
  }

  // Populate Ashwood Oaks
  if (oakTransforms.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 3.1, 8);
    const crownGeo = new THREE.DodecahedronGeometry(1.95, 1);
    const subCrownGeo = new THREE.DodecahedronGeometry(1.35, 1);

    const trunks = createInstanced(trunkGeo, mats.treeBark, oakTransforms.length);
    const crowns = createInstanced(crownGeo, mats.oakFoliage, oakTransforms.length);
    const subCrowns = createInstanced(subCrownGeo, mats.oakFoliage, oakTransforms.length);

    oakTransforms.forEach((t, i) => {
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.setScalar(t.scale);

      dummy.position.set(t.x, t.y + 1.45 * t.scale, t.z);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.y + 3.9 * t.scale, t.z);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);

      dummy.position.set(
        t.x + Math.cos(t.yaw) * 1.15 * t.scale,
        t.y + 3.4 * t.scale,
        t.z + Math.sin(t.yaw) * 1.15 * t.scale,
      );
      dummy.updateMatrix();
      subCrowns.setMatrixAt(i, dummy.matrix);
    });
  }

  // Populate Twisted Deadwood
  if (deadTransforms.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 3.5, 7);
    const branchGeo = new THREE.CylinderGeometry(0.06, 0.14, 1.8, 6);

    const trunks = createInstanced(trunkGeo, mats.darkTimber, deadTransforms.length);
    const branches = createInstanced(branchGeo, mats.darkTimber, deadTransforms.length);

    deadTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 1.65 * t.scale, t.z);
      dummy.rotation.set(0.06, t.yaw, 0.08);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x + Math.cos(t.yaw) * 0.45 * t.scale, t.y + 2.8 * t.scale, t.z);
      dummy.rotation.set(0.4, t.yaw, -0.85);
      dummy.updateMatrix();
      branches.setMatrixAt(i, dummy.matrix);
    });
  }

  // Populate Bushes
  if (bushTransforms.length > 0) {
    const bushGeo = new THREE.DodecahedronGeometry(0.75, 1);
    const bushes = createInstanced(bushGeo, mats.oakFoliage, bushTransforms.length, false);
    bushTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 0.38 * t.scale, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(t.scale * 1.25, t.scale * 0.78, t.scale * 1.1);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
    });
  }

  // Populate Ferns & Tall Grass Tufts
  if (fernTransforms.length > 0) {
    const tuftGeo = new THREE.ConeGeometry(0.45, 0.65, 5);
    const tufts = createInstanced(tuftGeo, mats.fernFoliage, fernTransforms.length, false);
    fernTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 0.25 * t.scale, t.z);
      dummy.rotation.set(0.1, t.yaw, 0);
      dummy.scale.set(t.scale, t.scale * 0.85, t.scale);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    });
  }

  // Populate Boulders
  if (rockTransforms.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rocks = createInstanced(rockGeo, mats.darkStone, rockTransforms.length, true);
    rockTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y + t.scale * 0.35, t.z);
      dummy.rotation.set(t.yaw * 0.4, t.yaw, t.yaw * 0.2);
      dummy.scale.set(t.scale * 1.15, t.scale * 0.78, t.scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
  }

  for (const item of managedMeshes) {
    item.mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    setDensity: (ratio: number) => {
      const clamped = Math.max(0.2, Math.min(1.0, ratio));
      for (const item of managedMeshes) {
        item.mesh.count = Math.max(1, Math.floor(item.fullCount * clamped));
      }
    },
  };
}
