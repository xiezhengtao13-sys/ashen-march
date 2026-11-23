import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function allocRGBA(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(size * size * 4));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function tileableNoise2D(x: number, y: number, period: number, seed: number): number {
  const ix0 = ((Math.floor(x) % period) + period) % period;
  const iy0 = ((Math.floor(y) % period) + period) % period;
  const ix1 = (ix0 + 1) % period;
  const iy1 = (iy0 + 1) % period;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const hash = (gx: number, gy: number): number => {
    let n = Math.imul(gx, 374761393) + Math.imul(gy, 668265263) + Math.imul(seed, 1442695041);
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  return lerp(
    lerp(hash(ix0, iy0), hash(ix1, iy0), ux),
    lerp(hash(ix0, iy1), hash(ix1, iy1), ux),
    uy,
  );
}

function tileableFbm(u: number, v: number, baseFreq: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileableNoise2D(u * freq, v * freq, freq, seed + i * 73);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function buildNormalFromHeight(height: Float32Array, size: number, strength: number): THREE.DataTexture {
  const data = allocRGBA(size);
  const sample = (x: number, y: number): number => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = tr + 2 * r + br - (tl + 2 * l + bl);
      const dy = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      data[idx] = clampByte((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function createDataTex(
  data: Uint8Array<ArrayBuffer>,
  size: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

interface PBRMaps {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

function makeMasonryMaps(
  size: number,
  rows: number,
  cols: number,
  baseRgb: [number, number, number],
  mortarRgb: [number, number, number],
  seed: number,
  normalStrength = 2.6,
  wetnessGloss = 0,
): PBRMaps {
  const albedo = allocRGBA(size);
  const rough = allocRGBA(size);
  const height = new Float32Array(size * size);
  const rng = new SeededRandom(seed);

  const rowTints: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(rng.range(-18, 18));
    }
    rowTints.push(row);
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const fy = v * rows;
    const rowIdx = Math.floor(fy) % rows;
    const rowFrac = fy - Math.floor(fy);
    const stagger = (rowIdx % 2) * 0.5;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fx = u * cols + stagger;
      const colIdx = ((Math.floor(fx) % cols) + cols) % cols;
      const colFrac = fx - Math.floor(fx);

      const grain = tileableFbm(u, v, 8, seed + 19, 4);
      const fine = tileableFbm(u, v, 32, seed + 91, 2);

      // Edge distance with organic noise perturbation
      const edgeNoise = (grain - 0.5) * 0.08;
      const dx = Math.min(colFrac, 1 - colFrac) + edgeNoise;
      const dy = Math.min(rowFrac, 1 - rowFrac) + edgeNoise;
      const edge = Math.min(dx * (cols / rows), dy);

      const isMortar = edge < 0.055;
      const bevel = Math.max(0, Math.min(1, (edge - 0.04) / 0.12));
      const stoneShade = rowTints[rowIdx][colIdx];

      const hVal = isMortar ? 0.12 + fine * 0.1 : 0.35 + bevel * 0.42 + grain * 0.22;
      height[y * size + x] = hVal;

      const idx = (y * size + x) * 4;
      if (isMortar) {
        albedo[idx] = clampByte(mortarRgb[0] + (fine - 0.5) * 16);
        albedo[idx + 1] = clampByte(mortarRgb[1] + (fine - 0.5) * 16);
        albedo[idx + 2] = clampByte(mortarRgb[2] + (fine - 0.5) * 16);
        const rVal = clampByte(240 - wetnessGloss * 25);
        rough[idx] = rough[idx + 1] = rough[idx + 2] = rVal;
      } else {
        const mod = stoneShade + (grain - 0.5) * 34 + (fine - 0.5) * 18;
        albedo[idx] = clampByte(baseRgb[0] + mod);
        albedo[idx + 1] = clampByte(baseRgb[1] + mod);
        albedo[idx + 2] = clampByte(baseRgb[2] + mod * 0.92);
        const rVal = clampByte(218 - grain * 38 - wetnessGloss * 60);
        rough[idx] = rough[idx + 1] = rough[idx + 2] = rVal;
      }
      albedo[idx + 3] = 255;
      rough[idx + 3] = 255;
    }
  }

  return {
    map: createDataTex(albedo, size, true),
    normalMap: buildNormalFromHeight(height, size, normalStrength),
    roughnessMap: createDataTex(rough, size, false),
  };
}

function makeWoodMaps(
  size: number,
  planks: number,
  baseRgb: [number, number, number],
  seed: number,
): PBRMaps {
  const albedo = allocRGBA(size);
  const rough = allocRGBA(size);
  const height = new Float32Array(size * size);
  const rng = new SeededRandom(seed);
  const plankOffsets = Array.from({ length: planks }, () => rng.range(-12, 12));

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const pIdx = Math.floor(u * planks) % planks;
      const pFrac = u * planks - Math.floor(u * planks);
      const seam = planks > 1 ? Math.min(pFrac, 1 - pFrac) < 0.035 : false;

      // Elongated wood grain along V
      const grain = tileableFbm(u * 3.0, v * 0.45, 8, seed + pIdx * 17, 4);
      const ring = Math.sin((u * 28 + grain * 5.5 + pIdx * 1.7) * Math.PI) * 0.5 + 0.5;
      const tone = plankOffsets[pIdx] + (ring - 0.5) * 24 + (grain - 0.5) * 18;

      height[y * size + x] = seam ? 0.08 : 0.48 + ring * 0.24 + grain * 0.16;

      const idx = (y * size + x) * 4;
      if (seam) {
        albedo[idx] = clampByte(baseRgb[0] * 0.42);
        albedo[idx + 1] = clampByte(baseRgb[1] * 0.42);
        albedo[idx + 2] = clampByte(baseRgb[2] * 0.42);
        rough[idx] = rough[idx + 1] = rough[idx + 2] = 240;
      } else {
        albedo[idx] = clampByte(baseRgb[0] + tone);
        albedo[idx + 1] = clampByte(baseRgb[1] + tone * 0.85);
        albedo[idx + 2] = clampByte(baseRgb[2] + tone * 0.65);
        rough[idx] = rough[idx + 1] = rough[idx + 2] = clampByte(192 + ring * 38);
      }
      albedo[idx + 3] = 255;
      rough[idx + 3] = 255;
    }
  }

  return {
    map: createDataTex(albedo, size, true),
    normalMap: buildNormalFromHeight(height, size, 2.0),
    roughnessMap: createDataTex(rough, size, false),
  };
}

function makeShingleMaps(size: number, rows: number, cols: number, baseRgb: [number, number, number], seed: number): PBRMaps {
  const albedo = allocRGBA(size);
  const rough = allocRGBA(size);
  const height = new Float32Array(size * size);
  const rng = new SeededRandom(seed);
  const tints = Array.from({ length: rows * cols }, () => rng.range(-16, 16));

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const fy = v * rows;
    const r = Math.floor(fy) % rows;
    const rf = fy - Math.floor(fy);
    const stagger = (r % 2) * 0.5;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fx = u * cols + stagger;
      const c = ((Math.floor(fx) % cols) + cols) % cols;
      const cf = fx - Math.floor(fx);

      const grain = tileableFbm(u, v, 16, seed + 44, 3);
      const isGap = Math.min(cf, 1 - cf) < 0.045 || rf < 0.08;
      // Sloped shingle ramp from top to bottom of tile
      const hVal = isGap ? 0.15 : 0.35 + (1 - rf) * 0.45 + grain * 0.14;
      height[y * size + x] = hVal;

      const idx = (y * size + x) * 4;
      const shade = tints[r * cols + c] + (grain - 0.5) * 22 - rf * 24;
      const factor = isGap ? 0.48 : 1.0;
      albedo[idx] = clampByte((baseRgb[0] + shade) * factor);
      albedo[idx + 1] = clampByte((baseRgb[1] + shade * 0.9) * factor);
      albedo[idx + 2] = clampByte((baseRgb[2] + shade * 0.85) * factor);
      rough[idx] = rough[idx + 1] = rough[idx + 2] = clampByte(isGap ? 235 : 185 + grain * 45);
      albedo[idx + 3] = 255;
      rough[idx + 3] = 255;
    }
  }

  return {
    map: createDataTex(albedo, size, true),
    normalMap: buildNormalFromHeight(height, size, 2.8),
    roughnessMap: createDataTex(rough, size, false),
  };
}

function makePlasterMaps(size: number, baseRgb: [number, number, number], seed: number): PBRMaps {
  const albedo = allocRGBA(size);
  const rough = allocRGBA(size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const broad = tileableFbm(u, v, 4, seed, 4);
      const fine = tileableFbm(u, v, 16, seed + 303, 3);
      height[y * size + x] = broad * 0.65 + fine * 0.35;

      const delta = (broad - 0.5) * 28 + (fine - 0.5) * 14;
      const idx = (y * size + x) * 4;
      albedo[idx] = clampByte(baseRgb[0] + delta);
      albedo[idx + 1] = clampByte(baseRgb[1] + delta * 0.96);
      albedo[idx + 2] = clampByte(baseRgb[2] + delta * 0.88);
      rough[idx] = rough[idx + 1] = rough[idx + 2] = clampByte(224 + (fine - 0.5) * 30);
      albedo[idx + 3] = 255;
      rough[idx + 3] = 255;
    }
  }

  return {
    map: createDataTex(albedo, size, true),
    normalMap: buildNormalFromHeight(height, size, 1.5),
    roughnessMap: createDataTex(rough, size, false),
  };
}

function makeTerrainDetailMaps(size: number, seed: number): PBRMaps {
  const albedo = allocRGBA(size);
  const rough = allocRGBA(size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = tileableFbm(u, v, 6, seed, 4);
      const micro = tileableFbm(u, v, 24, seed + 211, 3);
      height[y * size + x] = macro * 0.55 + micro * 0.45;

      // Bright neutral modulation around 225 so vertexColors keep natural hues
      const val = 212 + (macro - 0.5) * 36 + (micro - 0.5) * 32;
      const idx = (y * size + x) * 4;
      albedo[idx] = clampByte(val);
      albedo[idx + 1] = clampByte(val + 3);
      albedo[idx + 2] = clampByte(val - 2);
      rough[idx] = rough[idx + 1] = rough[idx + 2] = clampByte(228 + (micro - 0.5) * 26);
      albedo[idx + 3] = 255;
      rough[idx + 3] = 255;
    }
  }

  const map = createDataTex(albedo, size, true, 64, 64);
  const normalMap = buildNormalFromHeight(height, size, 1.9);
  normalMap.repeat.set(64, 64);
  const roughnessMap = createDataTex(rough, size, false, 64, 64);

  return { map, normalMap, roughnessMap };
}

function makeWaterNormalMap(size: number, seed: number): THREE.DataTexture {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w1 = Math.sin((u * 4 + v * 3) * Math.PI * 2) * 0.25;
      const w2 = tileableFbm(u, v, 8, seed, 3) * 0.75;
      height[y * size + x] = w1 + w2;
    }
  }
  const tex = buildNormalFromHeight(height, size, 2.2);
  tex.repeat.set(6, 26);
  return tex;
}

function makeBrushedMetalMaps(size: number, baseRgb: [number, number, number], seed: number): PBRMaps {
  const albedo = allocRGBA(size);
  const rough = allocRGBA(size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const streak = tileableFbm(u * 0.5, v * 4.0, 8, seed, 3);
      height[y * size + x] = streak;

      const delta = (streak - 0.5) * 26;
      const idx = (y * size + x) * 4;
      albedo[idx] = clampByte(baseRgb[0] + delta);
      albedo[idx + 1] = clampByte(baseRgb[1] + delta);
      albedo[idx + 2] = clampByte(baseRgb[2] + delta);
      rough[idx] = rough[idx + 1] = rough[idx + 2] = clampByte(95 + streak * 55);
      albedo[idx + 3] = 255;
      rough[idx + 3] = 255;
    }
  }

  return {
    map: createDataTex(albedo, size, true),
    normalMap: buildNormalFromHeight(height, size, 0.9),
    roughnessMap: createDataTex(rough, size, false),
  };
}

export class MaterialLibrary {
  readonly terrain: THREE.MeshStandardMaterial;
  readonly cobblestone: THREE.MeshStandardMaterial;
  readonly darkStone: THREE.MeshStandardMaterial;
  readonly tudorPlaster: THREE.MeshStandardMaterial;
  readonly darkTimber: THREE.MeshStandardMaterial;
  readonly oakPlanks: THREE.MeshStandardMaterial;
  readonly roofShingles: THREE.MeshStandardMaterial;
  readonly thatch: THREE.MeshStandardMaterial;
  readonly dungeonWall: THREE.MeshStandardMaterial;
  readonly dungeonFloor: THREE.MeshStandardMaterial;
  readonly forgedIron: THREE.MeshStandardMaterial;
  readonly brushedSteel: THREE.MeshStandardMaterial;
  readonly agedBronze: THREE.MeshStandardMaterial;
  readonly water: THREE.MeshStandardMaterial;
  readonly treeBark: THREE.MeshStandardMaterial;
  readonly pineNeedles: THREE.MeshStandardMaterial;
  readonly oakFoliage: THREE.MeshStandardMaterial;
  readonly fernFoliage: THREE.MeshStandardMaterial;
  readonly warmGlass: THREE.MeshStandardMaterial;

  readonly waterNormalMap: THREE.DataTexture;

  constructor() {
    const texSize = 128;

    const terrainMaps = makeTerrainDetailMaps(texSize, 4001);
    this.terrain = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: terrainMaps.map,
      normalMap: terrainMaps.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: terrainMaps.roughnessMap,
      roughness: 0.92,
      metalness: 0.02,
    });

    const cobbleMaps = makeMasonryMaps(texSize, 6, 4, [122, 118, 110], [72, 68, 62], 101, 2.8);
    cobbleMaps.map.repeat.set(2, 2);
    cobbleMaps.normalMap.repeat.set(2, 2);
    cobbleMaps.roughnessMap.repeat.set(2, 2);
    this.cobblestone = new THREE.MeshStandardMaterial({
      map: cobbleMaps.map,
      normalMap: cobbleMaps.normalMap,
      roughnessMap: cobbleMaps.roughnessMap,
      roughness: 0.88,
      metalness: 0.04,
    });

    const darkStoneMaps = makeMasonryMaps(texSize, 5, 3, [86, 88, 94], [48, 49, 54], 202, 3.0);
    darkStoneMaps.map.repeat.set(2, 2);
    darkStoneMaps.normalMap.repeat.set(2, 2);
    darkStoneMaps.roughnessMap.repeat.set(2, 2);
    this.darkStone = new THREE.MeshStandardMaterial({
      map: darkStoneMaps.map,
      normalMap: darkStoneMaps.normalMap,
      roughnessMap: darkStoneMaps.roughnessMap,
      roughness: 0.9,
      metalness: 0.05,
    });

    const plasterMaps = makePlasterMaps(texSize, [202, 189, 165], 303);
    this.tudorPlaster = new THREE.MeshStandardMaterial({
      map: plasterMaps.map,
      normalMap: plasterMaps.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: plasterMaps.roughnessMap,
      roughness: 0.94,
    });

    const darkTimberMaps = makeWoodMaps(texSize, 2, [74, 49, 31], 404);
    this.darkTimber = new THREE.MeshStandardMaterial({
      map: darkTimberMaps.map,
      normalMap: darkTimberMaps.normalMap,
      roughnessMap: darkTimberMaps.roughnessMap,
      roughness: 0.86,
    });

    const plankMaps = makeWoodMaps(texSize, 5, [118, 82, 52], 505);
    plankMaps.map.repeat.set(2, 2);
    plankMaps.normalMap.repeat.set(2, 2);
    plankMaps.roughnessMap.repeat.set(2, 2);
    this.oakPlanks = new THREE.MeshStandardMaterial({
      map: plankMaps.map,
      normalMap: plankMaps.normalMap,
      roughnessMap: plankMaps.roughnessMap,
      roughness: 0.84,
    });

    const shingleMaps = makeShingleMaps(texSize, 7, 6, [84, 54, 46], 606);
    shingleMaps.map.repeat.set(3, 3);
    shingleMaps.normalMap.repeat.set(3, 3);
    shingleMaps.roughnessMap.repeat.set(3, 3);
    this.roofShingles = new THREE.MeshStandardMaterial({
      map: shingleMaps.map,
      normalMap: shingleMaps.normalMap,
      roughnessMap: shingleMaps.roughnessMap,
      roughness: 0.82,
    });

    const thatchMaps = makeWoodMaps(texSize, 12, [138, 114, 70], 650);
    thatchMaps.map.repeat.set(3, 2);
    thatchMaps.normalMap.repeat.set(3, 2);
    this.thatch = new THREE.MeshStandardMaterial({
      map: thatchMaps.map,
      normalMap: thatchMaps.normalMap,
      roughness: 0.95,
    });

    const dWallMaps = makeMasonryMaps(texSize, 5, 4, [72, 76, 86], [36, 38, 44], 707, 3.2, 0.3);
    dWallMaps.map.repeat.set(3, 2);
    dWallMaps.normalMap.repeat.set(3, 2);
    dWallMaps.roughnessMap.repeat.set(3, 2);
    this.dungeonWall = new THREE.MeshStandardMaterial({
      map: dWallMaps.map,
      normalMap: dWallMaps.normalMap,
      roughnessMap: dWallMaps.roughnessMap,
      roughness: 0.78,
      metalness: 0.08,
    });

    const dFloorMaps = makeMasonryMaps(texSize, 4, 4, [58, 62, 70], [28, 30, 36], 808, 2.4, 0.55);
    dFloorMaps.map.repeat.set(10, 20);
    dFloorMaps.normalMap.repeat.set(10, 20);
    dFloorMaps.roughnessMap.repeat.set(10, 20);
    this.dungeonFloor = new THREE.MeshStandardMaterial({
      map: dFloorMaps.map,
      normalMap: dFloorMaps.normalMap,
      roughnessMap: dFloorMaps.roughnessMap,
      roughness: 0.65,
      metalness: 0.1,
    });

    const ironMaps = makeBrushedMetalMaps(texSize, [68, 72, 78], 901);
    this.forgedIron = new THREE.MeshStandardMaterial({
      map: ironMaps.map,
      normalMap: ironMaps.normalMap,
      roughnessMap: ironMaps.roughnessMap,
      roughness: 0.45,
      metalness: 0.82,
    });

    const steelMaps = makeBrushedMetalMaps(texSize, [188, 198, 208], 902);
    this.brushedSteel = new THREE.MeshStandardMaterial({
      map: steelMaps.map,
      normalMap: steelMaps.normalMap,
      roughnessMap: steelMaps.roughnessMap,
      roughness: 0.28,
      metalness: 0.9,
    });

    const bronzeMaps = makeBrushedMetalMaps(texSize, [188, 148, 86], 903);
    this.agedBronze = new THREE.MeshStandardMaterial({
      map: bronzeMaps.map,
      normalMap: bronzeMaps.normalMap,
      roughnessMap: bronzeMaps.roughnessMap,
      roughness: 0.36,
      metalness: 0.85,
    });

    this.waterNormalMap = makeWaterNormalMap(texSize, 950);
    this.water = new THREE.MeshStandardMaterial({
      color: 0x24566b,
      normalMap: this.waterNormalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.14,
      metalness: 0.3,
      transparent: true,
      opacity: 0.84,
    });

    const barkMaps = makeWoodMaps(texSize, 1, [78, 57, 42], 1100);
    this.treeBark = new THREE.MeshStandardMaterial({
      map: barkMaps.map,
      normalMap: barkMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: barkMaps.roughnessMap,
      roughness: 0.94,
    });

    const leafMaps = makePlasterMaps(texSize, [52, 78, 48], 1200);
    this.pineNeedles = new THREE.MeshStandardMaterial({
      map: leafMaps.map,
      normalMap: leafMaps.normalMap,
      roughness: 0.88,
    });

    const oakMaps = makePlasterMaps(texSize, [74, 92, 54], 1201);
    this.oakFoliage = new THREE.MeshStandardMaterial({
      map: oakMaps.map,
      normalMap: oakMaps.normalMap,
      roughness: 0.86,
    });

    const fernMaps = makePlasterMaps(texSize, [78, 102, 58], 1202);
    this.fernFoliage = new THREE.MeshStandardMaterial({
      map: fernMaps.map,
      normalMap: fernMaps.normalMap,
      roughness: 0.84,
    });

    this.warmGlass = new THREE.MeshStandardMaterial({
      color: 0xffd18a,
      emissive: 0xd98632,
      emissiveIntensity: 0.72,
      roughness: 0.3,
      metalness: 0.1,
    });
  }
}
