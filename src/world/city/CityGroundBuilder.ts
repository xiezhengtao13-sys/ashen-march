import * as THREE from 'three';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
}

export function getCityRoadCenterX(z: number): number {
  if (z >= -14) return 0;
  return smoothstep(-14, -36, z) * 4.4;
}

export function getCityStreetBaseY(z: number): number {
  return smoothstep(18, -32, z) * 1.25;
}

/**
 * Deterministic ground elevation for Ashenhold Phase 1 (Gatehouse & Main Street).
 * Used identically by the visual street terrain mesh, Rapier trimesh collider,
 * building plinth alignment, prop scatter, and fireball raycast checks.
 */
export function getCityGroundHeight(x: number, z: number): number {
  const baseY = getCityStreetBaseY(z);
  const cx = getCityRoadCenterX(z);
  const dx = Math.abs(x - cx);

  // Outside the South Gate (z > 17.5): cobbled road flanked by gentle packed-earth shoulders
  if (z > 17.5) {
    const outBlend = smoothstep(17.5, 21.0, z);
    const roadCrown = dx <= 3.3 ? 0.06 * (1 - (dx / 3.3) ** 2) : 0;
    const outerBank = smoothstep(5.5, 16.0, dx) * 0.65 + (noise2(x * 0.18, z * 0.18) - 0.5) * 0.16 * smoothstep(4.5, 12.0, dx);
    const insideUrban = getStreetCrossSectionOffset(dx);
    return baseY + (1 - outBlend) * insideUrban + outBlend * (roadCrown + outerBank);
  }

  return baseY + getStreetCrossSectionOffset(dx);
}

function getStreetCrossSectionOffset(dx: number): number {
  // Crowned cobbled carriageway (0..3.05m)
  if (dx <= 3.05) {
    return 0.065 * (1 - (dx / 3.05) ** 2);
  }
  // Depressed stone drainage gutter channel (3.05..3.65m)
  if (dx <= 3.65) {
    const t = Math.sin(((dx - 3.05) / 0.6) * Math.PI);
    return -0.055 * t;
  }
  // Raised granite curb & flagstone sidewalk (3.65m+)
  const curbRise = smoothstep(3.62, 3.84, dx);
  return curbRise * 0.12;
}

export interface CityGroundResult {
  mesh: THREE.Mesh;
  vertices: Float32Array;
  indices: Uint32Array;
}

export function buildCityGroundMesh(streetMaterial: THREE.Material): CityGroundResult {
  const width = 56;
  const length = 74;
  const segX = 112;
  const segZ = 148;

  const geometry = new THREE.PlaneGeometry(width, length, segX, segZ);
  geometry.rotateX(-Math.PI / 2);

  // Shift Z so ground covers z in [-38, +36]
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
  const count = posAttr.count;

  const splats = new Float32Array(count * 4); // x: cobble, y: dirt/gravel, z: moss/grass, w: puddle
  const colors = new Float32Array(count * 3); // vertex AO & organic stain modulation

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i) - 1.0;
    const y = getCityGroundHeight(x, z);
    posAttr.setXYZ(i, x, y, z);

    // Metric UVs (1 UV unit = 2.6m)
    uvAttr.setXY(i, x / 2.6, z / 2.6);

    const cx = getCityRoadCenterX(z);
    const dx = Math.abs(x - cx);
    const n1 = noise2(x * 0.35 + 11, z * 0.35 - 7);
    const n2 = noise2(x * 0.85 - 5, z * 0.85 + 19);

    let cobble = 1.0;
    let dirt = 0.0;
    let moss = 0.0;
    let puddle = 0.0;

    if (z > 17.5) {
      // Outside gate: cobbled road core fading naturally into packed earth & verge grass
      const roadKeep = 1.0 - smoothstep(2.9, 4.4, dx + (n1 - 0.5) * 0.9);
      cobble = roadKeep;
      dirt = (1 - roadKeep) * (1 - smoothstep(5.8, 12.5, dx + (n1 - 0.5) * 1.8));
      moss = Math.max(0, 1 - cobble - dirt * 0.75);
      if (dx > 2.4 && dx < 4.5 && z > 19.5 && z < 26.5) {
        puddle = smoothstep(0.56, 0.78, n1) * 0.85;
      }
    } else {
      // Inside city: cobble carriageway + dirt/wear in gutters/cart tracks + moss along curbs/wall bases
      const gutterBand = Math.exp(-((dx - 3.35) ** 2) / 0.16);
      const trackBand = Math.exp(-((dx - 1.35) ** 2) / 0.28) * 0.42;
      dirt = Math.min(1, gutterBand * 0.55 + trackBand * n1 + smoothstep(0.65, 0.88, n1) * 0.25);
      moss = gutterBand * smoothstep(0.52, 0.80, n2) * 0.52 + smoothstep(4.6, 5.2, dx) * smoothstep(0.58, 0.82, n2) * 0.35;
      cobble = Math.max(0.25, 1.0 - dirt * 0.65 - moss * 0.5);

      // Puddles in low gutter depressions & specific narrative puddles along street
      const puddleSeeds =
        Math.exp(-((x + 2.8) ** 2 + (z - 7.5) ** 2) / 2.6) +
        Math.exp(-((x - 3.1) ** 2 + (z + 4.5) ** 2) / 3.0) +
        Math.exp(-((x + 3.0) ** 2 + (z + 15.0) ** 2) / 2.2) +
        gutterBand * smoothstep(0.64, 0.82, n1) * 0.9;
      puddle = Math.max(0, Math.min(1, puddleSeeds));
    }

    const sum = cobble + dirt + moss || 1;
    splats[i * 4] = cobble / sum;
    splats[i * 4 + 1] = dirt / sum;
    splats[i * 4 + 2] = moss / sum;
    splats[i * 4 + 3] = puddle;

    // Subtle organic surface shading & wall-base darkening along sidewalks
    const wallShadow = smoothstep(4.3, 5.4, dx) * (z <= 17.5 ? 0.18 : 0.04);
    const gutterAO = Math.exp(-((dx - 3.35) ** 2) / 0.14) * (z <= 17.5 ? 0.14 : 0.0);
    const microTint = (n2 - 0.5) * 0.10;
    const vShade = Math.max(0.62, Math.min(1.04, 1.0 - wallShadow - gutterAO + microTint));
    colors[i * 3] = vShade;
    colors[i * 3 + 1] = vShade * 0.99;
    colors[i * 3 + 2] = vShade * 0.96;
  }

  geometry.computeVertexNormals();
  geometry.setAttribute('aSplat', new THREE.BufferAttribute(splats, 4));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geometry, streetMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'AshenholdStreetGround';

  const indexAttr = geometry.getIndex();
  const vertices = new Float32Array(posAttr.array as ArrayLike<number>);
  const indices = indexAttr
    ? new Uint32Array(indexAttr.array as ArrayLike<number>)
    : new Uint32Array(0);

  return { mesh, vertices, indices };
}
