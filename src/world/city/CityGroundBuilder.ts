import * as THREE from 'three';
import {
  getCityRoadCenterX,
  getCityStreetBaseY,
  noise2,
  sampleCityNetwork,
  smoothstep,
} from './CityRoadNetwork';

export { getCityRoadCenterX, getCityStreetBaseY };

/**
 * Deterministic ground elevation for 200x240m Ashenhold.
 * Preserves Phase 1 south gate & main street coordinates while smoothly generating
 * the Central Market Plaza, West Artisan loop, East Weavers' Hill terrace, and Castle Causeway.
 */
export function getCityGroundHeight(x: number, z: number): number {
  return sampleCityNetwork(x, z).height;
}

export interface GroundChunkData {
  mesh: THREE.Mesh;
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface CityGroundResult {
  mesh: THREE.Group;
  chunks: GroundChunkData[];
  vertices: Float32Array;
  indices: Uint32Array;
}

function buildGroundChunk(
  streetMaterial: THREE.Material,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  stepMeters: number,
  name: string,
): GroundChunkData {
  const width = x1 - x0;
  const length = z1 - z0;
  const segX = Math.max(4, Math.round(width / stepMeters));
  const segZ = Math.max(4, Math.round(length / stepMeters));

  const geometry = new THREE.PlaneGeometry(width, length, segX, segZ);
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
  const count = posAttr.count;

  const splats = new Float32Array(count * 4); // x: cobble, y: dirt/gravel, z: moss/grass, w: puddle
  const colors = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);

  const cxMid = (x0 + x1) * 0.5;
  const czMid = (z0 + z1) * 0.5;
  const eps = 0.25;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i) + cxMid;
    const z = posAttr.getZ(i) + czMid;

    const sample = sampleCityNetwork(x, z);
    const y = sample.height;
    posAttr.setXYZ(i, x, y, z);

    // Analytic finite-difference normals eliminate visible seams across chunk borders
    const hx0 = sampleCityNetwork(x - eps, z).height;
    const hx1 = sampleCityNetwork(x + eps, z).height;
    const hz0 = sampleCityNetwork(x, z - eps).height;
    const hz1 = sampleCityNetwork(x, z + eps).height;
    const nx = (hx0 - hx1) / (2 * eps);
    const nz = (hz0 - hz1) / (2 * eps);
    const invLen = 1 / Math.hypot(nx, 1.0, nz);
    normals[i * 3] = nx * invLen;
    normals[i * 3 + 1] = invLen;
    normals[i * 3 + 2] = nz * invLen;

    uvAttr.setXY(i, x / 2.6, z / 2.6);

    const n1 = noise2(x * 0.35 + 11, z * 0.35 - 7);
    const n2 = noise2(x * 0.85 - 5, z * 0.85 + 19);
    const nLarge = noise2(x * 0.14 + 31, z * 0.14 + 41);

    let cobble = 1.0;
    let dirt = 0.0;
    let moss = 0.0;
    let puddle = 0.0;

    const outsideWall =
      Math.abs(x) > 72 || z > 17.5 || z < -176;

    if (z > 17.5 && Math.abs(x) < 16) {
      const roadCenter = getCityRoadCenterX(z);
      const dx = Math.abs(x - roadCenter);
      const roadKeep = 1.0 - smoothstep(2.9, 4.4, dx + (n1 - 0.5) * 0.9);
      cobble = roadKeep;
      dirt = (1 - roadKeep) * (1 - smoothstep(5.8, 12.5, dx + (n1 - 0.5) * 1.8));
      moss = Math.max(0, 1 - cobble - dirt * 0.75);
      if (dx > 2.4 && dx < 4.5 && z > 19.5 && z < 26.5) {
        puddle = smoothstep(0.56, 0.78, n1) * 0.85;
      }
    } else if (outsideWall) {
      // Countryside meadows & outer earth ramparts outside curtain walls
      cobble = 0.04 * (1 - smoothstep(0.5, 4.0, Math.abs(sample.roadDist)));
      dirt = (1 - smoothstep(0.4, 0.8, nLarge)) * 0.36;
      moss = 1.0 - cobble - dirt;
    } else {
      // Interior urban streets, market plaza, alleys & courtyards
      const roadEdge = Math.exp(-((sample.roadDist + 0.55) ** 2) / 0.32);
      const wheelWear = Math.exp(-((sample.roadDist + 1.4) ** 2) / 0.45) * 0.36;
      const offRoad = smoothstep(-0.2, 2.4, sample.roadDist);

      dirt = Math.min(
        1,
        roadEdge * 0.48 + wheelWear * n1 + offRoad * (0.45 + n1 * 0.35) + smoothstep(0.66, 0.90, n1) * 0.2,
      );
      moss =
        roadEdge * smoothstep(0.54, 0.82, n2) * 0.42 +
        offRoad * smoothstep(0.42, 0.76, n2) * 0.52;
      // Stepped stone stairs stay cleaner cobble/stone
      dirt *= 1 - sample.stepWeight * 0.7;
      moss *= 1 - sample.stepWeight * 0.65;
      // Central plaza shows clean flagstone/cobble ring + subtle cart wear
      if (sample.plazaWeight > 0.1) {
        dirt *= 1 - sample.plazaWeight * 0.55;
      }
      cobble = Math.max(0.28, 1.0 - dirt * 0.65 - moss * 0.5);

      const narrativePuddles =
        Math.exp(-((x + 2.8) ** 2 + (z - 7.5) ** 2) / 2.6) +
        Math.exp(-((x - 3.1) ** 2 + (z + 4.5) ** 2) / 3.0) +
        Math.exp(-((x + 3.0) ** 2 + (z + 15.0) ** 2) / 2.2) +
        Math.exp(-((x + 12.5) ** 2 + (z + 67.0) ** 2) / 3.2) +
        Math.exp(-((x - 20.5) ** 2 + (z + 77.0) ** 2) / 2.8) +
        Math.exp(-((x + 48.0) ** 2 + (z + 55.0) ** 2) / 2.8) +
        roadEdge * smoothstep(0.68, 0.86, n1) * 0.72;
      puddle = Math.max(0, Math.min(0.92, narrativePuddles * (1 - sample.stepWeight)));
    }

    const sum = cobble + dirt + moss || 1;
    splats[i * 4] = cobble / sum;
    splats[i * 4 + 1] = dirt / sum;
    splats[i * 4 + 2] = moss / sum;
    splats[i * 4 + 3] = puddle;

    // Gentle organic edge AO without muddying midday shading
    const gutterAO = Math.exp(-((sample.roadDist + 0.55) ** 2) / 0.25) * (outsideWall ? 0 : 0.08);
    const edgeShade = smoothstep(0.0, 2.5, sample.roadDist) * (outsideWall ? 0.04 : 0.10);
    const microTint = (n2 - 0.5) * 0.08;
    const vShade = Math.max(0.76, Math.min(1.04, 1.0 - edgeShade - gutterAO + microTint));
    colors[i * 3] = vShade;
    colors[i * 3 + 1] = vShade * 0.99;
    colors[i * 3 + 2] = vShade * 0.96;
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aSplat', new THREE.BufferAttribute(splats, 4));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geometry, streetMaterial);
  mesh.receiveShadow = true;
  mesh.name = name;

  const indexAttr = geometry.getIndex();
  const vertices = new Float32Array(posAttr.array as ArrayLike<number>);
  const indices = indexAttr
    ? new Uint32Array(indexAttr.array as ArrayLike<number>)
    : new Uint32Array(0);

  return { mesh, vertices, indices };
}

/**
 * Builds tiled/chunked cobblestone + gravel + moss + puddle terrain across the full
 * ~200x240m Ashenhold city domain so frustum culling and Rapier trimesh checks stay fast.
 */
export function buildCityGroundMesh(streetMaterial: THREE.Material): CityGroundResult {
  const group = new THREE.Group();
  group.name = 'AshenholdGroundChunks';

  const chunks: GroundChunkData[] = [];
  // Inner urban tiles (~0.6m resolution) spanning x in [-72, +72], z in [-176, +36]
  const xBands = [-72, -36, 0, 36, 72];
  const zBands = [-176, -134, -92, -50, -8, 36];

  for (let zi = 0; zi < zBands.length - 1; zi++) {
    for (let xi = 0; xi < xBands.length - 1; xi++) {
      const x0 = xBands[xi];
      const x1 = xBands[xi + 1];
      const z0 = zBands[zi];
      const z1 = zBands[zi + 1];
      // Core South Gate & Central Market corridors get finer 0.55m mesh; outer blocks get 0.8m
      const isHeroStrip = x0 >= -36 && x1 <= 36 && z1 > -140;
      const step = isHeroStrip ? 0.55 : 0.8;
      const c = buildGroundChunk(streetMaterial, x0, x1, z0, z1, step, `CityGround_${xi}_${zi}`);
      group.add(c.mesh);
      chunks.push(c);
    }
  }

  // Outer Perimeter Hillside Skirt Strips (beyond x=±72 or north of z=-176, coarse 2.5m mesh)
  const skirtBoxes: Array<[number, number, number, number, string]> = [
    [-108, -72, -210, 38, 'SkirtWest'],
    [72, 108, -210, 38, 'SkirtEast'],
    [-72, 72, -210, -176, 'SkirtNorth'],
  ];
  for (const [x0, x1, z0, z1, label] of skirtBoxes) {
    const c = buildGroundChunk(streetMaterial, x0, x1, z0, z1, 2.5, label);
    group.add(c.mesh);
    chunks.push(c);
  }

  // Primary Gate-Street chunk vertices/indices kept for backward compatibility
  const primary = chunks.find((c) => c.mesh.name === 'CityGround_1_4') ?? chunks[0];
  return {
    mesh: group,
    chunks,
    vertices: primary.vertices,
    indices: primary.indices,
  };
}
