import * as THREE from 'three';
import type { RegionId } from '../core/types';
import worldConfig from '../data/worldConfig.json';

export const WORLD_SIZE = worldConfig.worldSize; // 512
export const HALF_WORLD = WORLD_SIZE / 2; // 256
export const TERRAIN_SEGMENTS = 144;

function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);

  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

function fbm2D(x: number, z: number, seed: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, z * frequency, seed + i * 101);
    frequency *= 2.04;
    amplitude *= 0.5;
  }
  return value;
}

export function getRiverCenterX(z: number): number {
  return 95 + Math.sin((z - 55) * 0.024) * 10;
}

/**
 * Deterministic terrain height function used identically by:
 * - Visual terrain mesh generation
 * - Rapier static terrain collider
 * - Prop, tree, NPC, chest, and enemy placement
 */
export function getTerrainHeight(x: number, z: number, seed = worldConfig.seed): number {
  // Base rolling hills
  let h = 4.5 + fbm2D(x * 0.011, z * 0.011, seed, 4) * 7.5 + fbm2D(x * 0.035, z * 0.035, seed + 55, 2) * 1.4;

  // 1. Ravendale Village plateau around (0, 40) -> flat 4.0m
  const distVillage = Math.hypot(x - 0, z - 40);
  const villageMask = 1 - smoothstep(32, 62, distVillage);
  h = lerp(h, 4.0, villageMask);

  // 2. Ashwood Forest rolling undulations + flat camp / shrine pockets
  const distCamp = Math.hypot(x - -108, z - -30);
  const campMask = 1 - smoothstep(10, 22, distCamp);
  h = lerp(h, 6.0, campMask);

  const distShrine = Math.hypot(x - -146, z - -66);
  const shrineMask = 1 - smoothstep(8, 18, distShrine);
  h = lerp(h, 7.5, shrineMask);

  // 3. Ruined Watchtower hill around (105, -65) -> elevated ridge at 14.0m
  const distWatchtower = Math.hypot(x - 105, z - -65);
  const watchtowerPlateau = 1 - smoothstep(14, 48, distWatchtower);
  h = lerp(h, 14.0, watchtowerPlateau);

  // 4. River Valley channel south of z = -10 along x ≈ 95
  if (z > -25) {
    const riverX = getRiverCenterX(z);
    const distRiver = Math.abs(x - riverX);
    const riverDepthMask = (1 - smoothstep(7, 24, distRiver)) * smoothstep(-25, 10, z);
    h = lerp(h, -0.2, riverDepthMask);
  }

  // 5. Ancient Crypt entrance clearing at (0, -175) -> plateau at 12.0m
  const distCryptGate = Math.hypot(x - 0, z - -168);
  const cryptGateMask = 1 - smoothstep(14, 34, distCryptGate);
  h = lerp(h, 12.0, cryptGateMask);

  // 6. Northern mountain ridge behind Crypt entrance (z < -184)
  if (z < -180) {
    const northSlope = smoothstep(-180, -245, z);
    const ridgeNoise = Math.abs(fbm2D(x * 0.022, z * 0.022, seed + 777, 3)) * 18;
    // Leave small pass right at x=0, z=-175 so gate is accessible
    const gateNotch = 1 - (1 - smoothstep(0, 14, Math.abs(x))) * (1 - smoothstep(-190, -176, z));
    h += northSlope * (24 + ridgeNoise) * gateNotch;
  }

  // World outer perimeter gentle rise to naturally frame the 512x512 valley
  const edgeDist = Math.max(Math.abs(x), Math.abs(z));
  if (edgeDist > 225) {
    const rim = smoothstep(225, 256, edgeDist);
    h += rim * 18;
  }

  return h;
}

export function getRegionAt(x: number, z: number): RegionId {
  let closest: RegionId = 'ravendale_village';
  let bestScore = Infinity;

  for (const r of worldConfig.regions) {
    const d = Math.hypot(x - r.center.x, z - r.center.z);
    const normalized = d / r.radius;
    if (normalized < bestScore) {
      bestScore = normalized;
      closest = r.id as RegionId;
    }
  }
  return closest;
}

export function getRegionDisplayName(regionId: RegionId): string {
  const found = worldConfig.regions.find((r) => r.id === regionId);
  return found ? found.name : '灰烬边境';
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return Math.hypot(px - (ax + t * abx), pz - (az + t * abz));
}

function isOnRoad(x: number, z: number): number {
  const segments: Array<[number, number, number, number]> = [
    [0, 58, 0, 26],       // Village main square
    [0, 38, -105, -25],   // Village -> Ashwood Forest
    [0, 38, 78, 55],      // Village -> River Bridge west
    [110, 55, 105, -52],  // River Bridge east -> Ruined Watchtower
    [0, 20, 0, -165],     // Village -> Ancient Crypt North Road
  ];
  let minD = Infinity;
  for (const [ax, az, bx, bz] of segments) {
    const d = distanceToSegment(x, z, ax, az, bx, bz);
    if (d < minD) minD = d;
  }
  return 1 - smoothstep(2.2, 5.2, minD);
}

export interface TerrainBuildResult {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  vertices: Float32Array;
  indices: Uint32Array;
}

export function buildTerrainMesh(
  seed = worldConfig.seed,
  customMaterial?: THREE.Material,
): TerrainBuildResult {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const cGrass = new THREE.Color(0x4c623d);
  const cForest = new THREE.Color(0x36492d);
  const cVillage = new THREE.Color(0x636746);
  const cRoad = new THREE.Color(0x75644e);
  const cSand = new THREE.Color(0x82755b);
  const cRock = new THREE.Color(0x5b5f66);
  const cSnow = new THREE.Color(0xc2cad3);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getTerrainHeight(x, z, seed);
    posAttr.setY(i, y);

    const roadFactor = isOnRoad(x, z);
    const forestFactor = 1 - smoothstep(35, 95, Math.hypot(x - -105, z - -25));
    const villageFactor = 1 - smoothstep(14, 42, Math.hypot(x, z - 40));

    tmp.copy(cGrass).lerp(cForest, forestFactor * 0.78).lerp(cVillage, villageFactor * 0.45);

    if (y < 1.8) {
      const bank = 1 - smoothstep(0.2, 1.8, y);
      tmp.lerp(cSand, bank * 0.88);
    }

    if (y > 12.5) {
      const rockMix = smoothstep(12.5, 22, y);
      tmp.lerp(cRock, rockMix * 0.85);
    }

    if (y > 27) {
      const snowMix = smoothstep(27, 36, y);
      tmp.lerp(cSnow, snowMix);
    }

    if (roadFactor > 0.01 && y > 1.3) {
      tmp.lerp(cRoad, roadFactor * 0.86);
    }

    const tint = valueNoise2D(x * 0.14, z * 0.14, seed + 900) * 0.06;
    colors[i * 3] = Math.max(0, Math.min(1, tmp.r + tint));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, tmp.g + tint));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, tmp.b + tint));
  }

  geometry.computeVertexNormals();
  const normAttr = geometry.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const ny = normAttr.getY(i);
    if (ny < 0.9) {
      const slopeRock = smoothstep(0.9, 0.72, ny);
      tmp.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]).lerp(cRock, slopeRock * 0.78);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material =
    customMaterial ??
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
    });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'OverworldTerrain';

  const indexAttr = geometry.getIndex();
  const vertices = new Float32Array(posAttr.array as ArrayLike<number>);
  const indices = indexAttr
    ? new Uint32Array(indexAttr.array as ArrayLike<number>)
    : new Uint32Array(0);

  return { mesh, geometry, vertices, indices };
}
