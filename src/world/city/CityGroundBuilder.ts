import * as THREE from 'three';
import {
  getCityRoadCenterX,
  getCityStreetBaseY,
  isCityTerrainHole,
  noise2,
  sampleCityNetwork,
  smoothstep,
} from './CityRoadNetwork';

export { getCityRoadCenterX, getCityStreetBaseY };

/**
 * Deterministic ground elevation for the compact 104x144m 5-Tier Hillside Ashenhold.
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
    const microSettle =
      (sample.plazaWeight > 0.2 || sample.roadDist <= 0.4) && sample.stepWeight < 0.1
        ? (noise2(x * 1.35 + 3.1, z * 1.35 - 7.4) - 0.5) * 0.028
        : 0;
    const y = sample.height + microSettle;
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

    // Crisp metric UVs (1024px tile = 2.15m -> ~0.48px/mm high close-up texel density!)
    uvAttr.setXY(i, x / 2.15, z / 2.15);

    const nA = noise2(x * 0.24 + 5.1, z * 0.24 - 2.3);
    const nB = noise2(x * 0.55 - 1.7, z * 0.55 + 4.9);

    let cobble = 0;
    let dirt = 0;
    let moss = 0;
    let puddle = 0;

    // Steep hillside retaining slopes show mossy mountain rock/earth
    const slopeAmt = 1.0 - invLen;

    if (slopeAmt > 0.12) {
      dirt = 0.82;
      moss = 0.18;
      cobble = 0.0;
    } else if (sample.plazaWeight > 0.25 || sample.roadDist <= 0.35) {
      cobble = 0.94;
      dirt = 0.06;
      if (sample.stepWeight > 0.2) {
        cobble = 0.97;
        dirt = 0.03;
      } else if (sample.roadDist > -0.75 && sample.roadDist < 0.30 && sample.plazaWeight < 0.4) {
        // Curbside drainage gutter: gritty silt, patchy moss & damp rainwater sheen
        dirt = 0.18 + 0.12 * nA;
        moss = 0.16 * smoothstep(0.45, 0.85, nB);
        puddle = smoothstep(0.56, 0.84, nA) * 0.52;
      } else if (sample.plazaWeight > 0.5) {
        // Subtle worn stone patches in Central Market square
        dirt = 0.08 * nA;
        puddle = smoothstep(0.76, 0.94, nA * nB) * 0.24;
      }
    } else if (sample.roadDist <= 2.6) {
      const f = smoothstep(0.35, 2.6, sample.roadDist);
      cobble = (1 - f) * 0.62;
      dirt = 0.38 + f * 0.46;
      moss = f * (0.20 + 0.22 * nB);
    } else {
      // Mountain hillside turf & rocky earth outside paved terraces
      dirt = 0.55 + 0.18 * nA;
      moss = 0.45 - 0.12 * nA;
      if (Math.abs(x) > 52 || z < -126) {
        dirt = 0.44 + 0.15 * nA;
        moss = 0.56 - 0.1 * nA;
      }
    }

    const sum = Math.max(0.001, cobble + dirt + moss);
    splats[i * 4] = cobble / sum;
    splats[i * 4 + 1] = dirt / sum;
    splats[i * 4 + 2] = moss / sum;
    splats[i * 4 + 3] = puddle;

    // Crisp bright natural daylight stone albedo modulation with darker gutter silt
    let shade = 0.94 + 0.06 * nA;
    if (sample.curbOffset < -0.02) {
      shade *= 0.84;
    } else if (sample.plazaWeight > 0.5) {
      shade *= 1.03;
    }
    colors[i * 3] = Math.min(1, shade * 1.01);
    colors[i * 3 + 1] = Math.min(1, shade * 1.0);
    colors[i * 3 + 2] = Math.min(1, shade * 0.98);
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aSplat', new THREE.BufferAttribute(splats, 4));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const rawIndexAttr = geometry.getIndex();
  let indices = new Uint32Array(0);
  if (rawIndexAttr) {
    const srcIdx = rawIndexAttr.array as ArrayLike<number>;
    const kept: number[] = [];
    for (let t = 0; t < srcIdx.length; t += 3) {
      const i0 = srcIdx[t];
      const i1 = srcIdx[t + 1];
      const i2 = srcIdx[t + 2];
      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
      if (!isCityTerrainHole(cx, cz)) {
        kept.push(i0, i1, i2);
      }
    }
    indices = new Uint32Array(kept);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  geometry.computeTangents();

  const mesh = new THREE.Mesh(geometry, streetMaterial);
  mesh.name = name;
  mesh.receiveShadow = true;

  const vertices = new Float32Array(posAttr.array as ArrayLike<number>);

  return { mesh, vertices, indices };
}

/**
 * Builds the chunked 104x144m Hillside Ashenhold terrain + flanking mountain backdrop skirts.
 * Finer resolution (0.50m) on the S-curved Gateward street, Market Bridge Steps, and Compact Market Plaza;
 * medium resolution (0.85m) on upper wings/acropolis/citadel; coarse (2.5m) on outer mountain ridges.
 */
export function buildCityGroundMesh(streetMaterial: THREE.Material): CityGroundResult {
  const root = new THREE.Group();
  root.name = 'AshenholdHillsideGround';

  const specs: Array<[number, number, number, number, number, string]> = [
    // Cell 01 Barbican & Cell 02 S-Curved Trade Street + Bridge Steps (high-res 0.50m)
    [-22, 22, -20, 40, 0.5, 'Ground_Cell01_02_GateAndTrade'],
    // Cell 03 Compact Central Market Terrace + North Retaining Wall Step (high-res 0.55m)
    [-22, 22, -64, -20, 0.55, 'Ground_Cell03_MarketAndOverlook'],
    // Cell 04 West Artisan Wing (0.75m)
    [-54, -22, -84, 14, 0.75, 'Ground_Cell04_WestArtisan'],
    // Cell 05 East Residential Heights Wing (0.75m)
    [22, 54, -84, 14, 0.75, 'Ground_Cell05_EastResidential'],
    // Cell 06 Temple Acropolis (-104..-64, 0.75m)
    [-32, 32, -104, -64, 0.75, 'Ground_Cell06_TempleAcropolis'],
    // Cell 07 Lord's Castle Bailey & Keep Crag (-150..-104, 0.75m)
    [-36, 36, -150, -104, 0.75, 'Ground_Cell07_LordCastle'],
    // Flanking Mountain Ridges (West / East / North / South skirts at 2.4m)
    [-92, -54, -150, 46, 2.4, 'Ground_Ridge_West'],
    [54, 92, -150, 46, 2.4, 'Ground_Ridge_East'],
    [-92, 92, -172, -150, 2.4, 'Ground_Ridge_North'],
    [-54, 54, 40, 58, 2.2, 'Ground_Approach_South'],
    [-54, -32, -104, -84, 1.8, 'Ground_Ridge_NW1'],
    [32, 54, -104, -84, 1.8, 'Ground_Ridge_NE1'],
    [-54, -36, -150, -104, 2.0, 'Ground_Ridge_NW2'],
    [36, 54, -150, -104, 2.0, 'Ground_Ridge_NE2'],
  ];

  const chunks: GroundChunkData[] = [];
  for (const [x0, x1, z0, z1, step, name] of specs) {
    const chunk = buildGroundChunk(streetMaterial, x0, x1, z0, z1, step, name);
    root.add(chunk.mesh);
    chunks.push(chunk);
  }

  return {
    mesh: root,
    chunks,
    vertices: chunks[0].vertices,
    indices: chunks[0].indices,
  };
}
