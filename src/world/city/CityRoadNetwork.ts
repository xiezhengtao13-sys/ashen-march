import type { RegionId } from '../../core/types';

export interface RoadNode {
  x: number;
  z: number;
  y: number;
  halfWidth: number;
}

export interface CityRoadSegment {
  id: string;
  route: 'main' | 'artisan' | 'residential' | 'castle' | 'alley';
  a: RoadNode;
  b: RoadNode;
  stepped?: boolean;
  stepCount?: number;
}

export interface CityPlazaPad {
  id: string;
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
  elevation: number;
  cornerRadius: number;
  feather: number;
}

export interface GroundSample {
  height: number;
  /** dist <= 0 means directly on cobblestone carriageway / plaza pad */
  roadDist: number;
  /** 1 inside plaza courtyard flagstones, 0 on regular roads */
  plazaWeight: number;
  /** 1 near stepped hill / stair flights */
  stepWeight: number;
  /** Normalized sidewalk / curb proximity */
  curbOffset: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function noise2(x: number, z: number): number {
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
  return a + (b - a) * ux + (c + (d - c) * ux - (a + (b - a) * ux)) * uz;
}

/** Phase-1 preserved street centerline X (z in [+36, -36]) */
export function getCityRoadCenterX(z: number): number {
  if (z >= -14) return 0;
  return smoothstep(-14, -36, z) * 4.4;
}

/** Phase-1 preserved street base grade (z in [+18, -32]) */
export function getCityStreetBaseY(z: number): number {
  return smoothstep(18, -32, z) * 1.25;
}

function getStreetCrossSectionOffset(dx: number): number {
  if (dx <= 3.05) {
    return 0.065 * (1 - (dx / 3.05) ** 2);
  }
  if (dx <= 3.65) {
    const t = Math.sin(((dx - 3.05) / 0.6) * Math.PI);
    return -0.055 * t;
  }
  return smoothstep(3.62, 3.84, dx) * 0.12;
}

function phase1GroundHeight(x: number, z: number): number {
  const baseY = getCityStreetBaseY(z);
  const cx = getCityRoadCenterX(z);
  const dx = Math.abs(x - cx);
  if (z > 17.5) {
    const outBlend = smoothstep(17.5, 21.0, z);
    const roadCrown = dx <= 3.3 ? 0.06 * (1 - (dx / 3.3) ** 2) : 0;
    const outerBank =
      smoothstep(5.5, 16.0, dx) * 0.65 +
      (noise2(x * 0.18, z * 0.18) - 0.5) * 0.16 * smoothstep(4.5, 12.0, dx);
    return baseY + (1 - outBlend) * getStreetCrossSectionOffset(dx) + outBlend * (roadCrown + outerBank);
  }
  return baseY + getStreetCrossSectionOffset(dx);
}

/**
 * Authoritative road polyline network covering ~200x240m Ashenhold:
 * South Gate -> Gateward Street -> Market Arch -> Central Market Plaza,
 * branching into West Artisan Loop, East Weavers' Hill Overlook Loop,
 * shortcuts, and North King's Causeway to Castle Barbican Forecourt.
 */
export const CITY_ROAD_SEGMENTS: CityRoadSegment[] = [
  // Market Gate Arch -> South edge of Central Market Plaza (seamless ramp from Phase-1 curve x=2.5 up to Plaza mouth x=4.4)
  { id: 'main_north_approach', route: 'main', a: { x: 2.5, z: -26, y: 1.17, halfWidth: 3.4 }, b: { x: 4.4, z: -36, y: 1.55, halfWidth: 3.7 } },
  { id: 'main_market_mouth',   route: 'main', a: { x: 4.4, z: -36, y: 1.55, halfWidth: 3.9 }, b: { x: 4.0, z: -50, y: 2.45, halfWidth: 5.5 } },

  // Route A — West Artisan Quarter (Smiths' Row -> Coopers' Lane -> Copperhorn Alley -> Main Street north of Tavern)
  { id: 'artisan_smiths_1',    route: 'artisan', a: { x: -20, z: -72, y: 2.45, halfWidth: 4.5 }, b: { x: -39, z: -72, y: 2.75, halfWidth: 4.5 } },
  { id: 'artisan_smiths_2',    route: 'artisan', a: { x: -39, z: -72, y: 2.75, halfWidth: 4.3 }, b: { x: -55, z: -69, y: 3.05, halfWidth: 4.0 } },
  { id: 'artisan_coopers_1',   route: 'artisan', a: { x: -55, z: -69, y: 3.05, halfWidth: 3.6 }, b: { x: -58, z: -46, y: 2.65, halfWidth: 3.4 } },
  { id: 'artisan_coopers_2',   route: 'artisan', a: { x: -58, z: -46, y: 2.65, halfWidth: 3.4 }, b: { x: -53, z: -22, y: 2.15, halfWidth: 3.3 } },
  { id: 'artisan_copperhorn_1', route: 'artisan', a: { x: -53, z: -22, y: 2.15, halfWidth: 3.1 }, b: { x: -27, z: -21.5, y: 1.58, halfWidth: 3.0 } },
  { id: 'artisan_copperhorn_2', route: 'artisan', a: { x: -27, z: -21.5, y: 1.58, halfWidth: 3.0 }, b: { x: -4.2, z: -22.0, y: 1.16, halfWidth: 2.9 } },
  { id: 'artisan_copperhorn_jct', route: 'artisan', a: { x: -4.2, z: -22.0, y: 1.16, halfWidth: 2.9 }, b: { x: 1.2, z: -22.0, y: 1.04, halfWidth: 2.8 } },

  // Shortcut A: Shoemakers' Alley linking Coopers' Lane diagonally to SW Market corner
  { id: 'alley_shoemakers',    route: 'alley', a: { x: -54, z: -48, y: 2.65, halfWidth: 2.2 }, b: { x: -23, z: -53, y: 2.45, halfWidth: 2.3 } },

  // Route B — East Residential & Weavers' Hill (Weavers' Terrace Steps -> Lantern Walk -> Guildhouse Cart-Arch Alley)
  { id: 'res_weavers_steps',   route: 'residential', a: { x: 28, z: -70, y: 2.45, halfWidth: 4.1 }, b: { x: 45, z: -69, y: 3.85, halfWidth: 4.0 }, stepped: true, stepCount: 8 },
  { id: 'res_weavers_crest',   route: 'residential', a: { x: 45, z: -69, y: 3.85, halfWidth: 4.0 }, b: { x: 54, z: -66, y: 4.35, halfWidth: 3.8 } },
  { id: 'res_lantern_1',       route: 'residential', a: { x: 54, z: -66, y: 4.35, halfWidth: 3.5 }, b: { x: 56, z: -41, y: 3.70, halfWidth: 3.3 } },
  { id: 'res_lantern_2',       route: 'residential', a: { x: 56, z: -41, y: 3.70, halfWidth: 3.3 }, b: { x: 49, z: -13, y: 2.85, halfWidth: 3.2 } },
  { id: 'res_guild_alley_1',   route: 'residential', a: { x: 49, z: -13, y: 2.85, halfWidth: 2.8 }, b: { x: 27, z: -8.8, y: 1.78, halfWidth: 2.7 } },
  { id: 'res_guild_alley_2',   route: 'residential', a: { x: 27, z: -8.8, y: 1.78, halfWidth: 2.6 }, b: { x: 12.5, z: -8.3, y: 1.06, halfWidth: 2.3 } },
  { id: 'res_guild_arch',      route: 'residential', a: { x: 12.5, z: -8.3, y: 1.06, halfWidth: 1.9 }, b: { x: 4.2, z: -8.3, y: 0.84, halfWidth: 1.8 } },

  // Shortcut B: Bakers' Step-Alley linking Lantern Walk directly down to SE Market Plaza
  { id: 'alley_bakers',        route: 'alley', a: { x: 53, z: -49, y: 3.92, halfWidth: 2.2 }, b: { x: 29, z: -53, y: 2.45, halfWidth: 2.3 }, stepped: true, stepCount: 9 },

  // North King's Castle Causeway (Stepped Grand Processional Way up to Castle Barbican Forecourt)
  { id: 'castle_way_lower',    route: 'castle', a: { x: 4.0, z: -96, y: 2.45, halfWidth: 5.4 }, b: { x: 4.0, z: -116, y: 4.95, halfWidth: 5.0 }, stepped: true, stepCount: 14 },
  { id: 'castle_way_landing',  route: 'castle', a: { x: 4.0, z: -116, y: 4.95, halfWidth: 5.4 }, b: { x: 4.0, z: -125, y: 5.20, halfWidth: 5.4 } },
  { id: 'castle_way_upper',    route: 'castle', a: { x: 4.0, z: -125, y: 5.20, halfWidth: 5.0 }, b: { x: 4.0, z: -148, y: 9.80, halfWidth: 5.2 }, stepped: true, stepCount: 24 },
];

export const CITY_PLAZA_PADS: CityPlazaPad[] = [
  { id: 'central_market_plaza', cx: 4.0, cz: -73.0, halfX: 27.0, halfZ: 24.5, elevation: 2.45, cornerRadius: 4.5, feather: 2.2 },
  { id: 'castle_forecourt',     cx: 4.0, cz: -159.0, halfX: 19.0, halfZ: 13.0, elevation: 9.80, cornerRadius: 3.5, feather: 2.5 },
  { id: 'castle_keep_plateau',  cx: 4.0, cz: -190.0, halfX: 28.0, halfZ: 16.0, elevation: 13.5, cornerRadius: 4.0, feather: 4.0 },
];

function roundedRectSDF(x: number, z: number, pad: CityPlazaPad): number {
  const qx = Math.abs(x - pad.cx) - (pad.halfX - pad.cornerRadius);
  const qz = Math.abs(z - pad.cz) - (pad.halfZ - pad.cornerRadius);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  const inDist = Math.min(Math.max(qx, qz), 0);
  return outDist + inDist - pad.cornerRadius;
}

function projectToSegment(px: number, pz: number, a: RoadNode, b: RoadNode): { t: number; dist: number; halfWidth: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq > 1e-6 ? clamp(((px - a.x) * dx + (pz - a.z) * dz) / lenSq, 0, 1) : 0;
  const cx = a.x + dx * t;
  const cz = a.z + dz * t;
  return {
    t,
    dist: Math.hypot(px - cx, pz - cz),
    halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
  };
}

/**
 * Sample city road network elevation & surface distances cleanly at any (x, z)
 * across the 200x240m Ashenhold footprint.
 */
export function sampleCityNetwork(x: number, z: number): GroundSample {
  // Exact Phase-1 south corridor (preserving gatehouse, curtain wall & main street colliders)
  const cx1 = getCityRoadCenterX(z);
  const dx1 = Math.abs(x - cx1);
  const inEastArchOpening = x > 4.1 && Math.abs(z + 8.3) < 2.2;
  const inWestAlleyOpening = x < -4.1 && Math.abs(z + 22.0) < 2.9;

  if (z >= -20.5 && dx1 <= 5.4 && !inEastArchOpening && !inWestAlleyOpening) {
    return {
      height: phase1GroundHeight(x, z),
      roadDist: dx1 - 3.6,
      plazaWeight: 0,
      stepWeight: 0,
      curbOffset: dx1 <= 3.05 ? 0 : smoothstep(3.62, 3.84, dx1),
    };
  }

  let bestRoadDist = 999;
  let wSum = 0;
  let hSum = 0;
  let stepAccum = 0;

  // Include continuous Phase-1 anchor south of z = -19 for smooth outside-alley blending
  if (z >= -26 && z <= 36) {
    const d1 = Math.max(0, dx1 - 4.2);
    const w = 1 / (d1 * d1 + 1.2);
    wSum += w;
    hSum += phase1GroundHeight(clamp(x, cx1 - 12, cx1 + 12), z) * w;
    if (d1 < bestRoadDist) bestRoadDist = dx1 - 3.8;
  }

  // Evaluate road network segments
  for (const seg of CITY_ROAD_SEGMENTS) {
    const proj = projectToSegment(x, z, seg.a, seg.b);
    const signedD = proj.dist - proj.halfWidth;
    if (signedD < bestRoadDist) bestRoadDist = signedD;

    let y = seg.a.y + (seg.b.y - seg.a.y) * proj.t;
    if (seg.stepped && seg.stepCount && proj.t > 0.03 && proj.t < 0.97) {
      // Gentle tactile step modulation kept < 0.14m so Rapier autostep walks cleanly
      const stepPhase = proj.t * seg.stepCount;
      const frac = stepPhase - Math.floor(stepPhase);
      const stairRipple = (smoothstep(0.15, 0.45, frac) - frac) * 0.16;
      y += stairRipple;
    }

    // Gentle cobbled camber along segment interior
    if (proj.dist < proj.halfWidth) {
      const u = proj.dist / proj.halfWidth;
      if (u < 0.72) {
        y += 0.045 * (1 - (u / 0.72) ** 2);
      } else if (u < 0.84) {
        const g = Math.sin(((u - 0.72) / 0.12) * Math.PI);
        y -= 0.035 * g;
      } else {
        y += 0.06 * smoothstep(0.84, 0.96, u);
      }
    }

    const effD = Math.max(0, signedD);
    // Tighter kernel for alleys & lanes so intersections transition sharply without bumps
    const softness = signedD <= 0 ? 0.06 : 3.2;
    const w = 1 / (effD * effD + softness);
    wSum += w;
    hSum += y * w;
    if (seg.stepped && signedD <= 0.4) {
      stepAccum = Math.max(stepAccum, 1 - smoothstep(-0.3, 0.4, signedD));
    }
  }

  // Evaluate Plaza & Citadel pads
  let plazaWeight = 0;
  for (const pad of CITY_PLAZA_PADS) {
    const sdf = roundedRectSDF(x, z, pad);
    if (sdf < bestRoadDist) bestRoadDist = sdf;

    let padY = pad.elevation;
    if (pad.id === 'central_market_plaza') {
      // Inner stepped octagonal dais around the Phoenix Fountain at (4, -74)
      const distCenter = Math.hypot(x - 4.0, z + 74.0);
      const tier1 = 1 - smoothstep(9.2, 11.2, distCenter);
      const tier2 = 1 - smoothstep(6.2, 8.0, distCenter);
      padY += tier1 * 0.18 + tier2 * 0.18;
      if (sdf <= 0) {
        plazaWeight = Math.max(plazaWeight, 1 - smoothstep(-2.0, 0.5, sdf));
      }
    }

    const effD = Math.max(0, sdf);
    const w = sdf <= 0 ? 18.0 : 1 / (effD * effD + pad.feather);
    wSum += w;
    hSum += padY * w;
  }

  let baseHeight = wSum > 0 ? hSum / wSum : 1.0;

  // Outside city perimeter walls: soft organic meadow rolling terrain skirt
  const outerX = smoothstep(68, 96, Math.abs(x));
  const outerZSouth = smoothstep(22, 36, z);
  const outerZNorth = smoothstep(-178, -206, z);
  const outerMask = clamp(Math.max(outerX, outerZNorth) * (1 - outerZSouth * 0.5), 0, 1);
  if (outerMask > 0.001) {
    const hillNoise = (noise2(x * 0.07 + 3, z * 0.07 - 5) - 0.35) * 2.8;
    const northSlope = smoothstep(-20, -180, z) * 9.5;
    baseHeight = baseHeight * (1 - outerMask) + (0.6 + northSlope + hillNoise) * outerMask;
  }

  // Smoothly preserve Phase-1 street core right around x in [-6, 6], z in [-20.5, 36]
  if (z >= -21.5 && dx1 <= 6.2 && !inEastArchOpening && !inWestAlleyOpening) {
    const blendX = 1 - smoothstep(4.9, 6.2, dx1);
    const blendZ = smoothstep(-21.5, -19.0, z);
    const p1Mix = blendX * blendZ;
    baseHeight = baseHeight * (1 - p1Mix) + phase1GroundHeight(x, z) * p1Mix;
  }

  return {
    height: baseHeight,
    roadDist: bestRoadDist,
    plazaWeight,
    stepWeight: stepAccum,
    curbOffset: clamp(smoothstep(-0.8, 0.2, bestRoadDist), 0, 1),
  };
}

/**
 * Determine player's named Ashenhold district from (x, z) world coordinates.
 * Preserves Phase 1 getCityRegionAt(z) single-arg callers when x omitted.
 */
export function getCityRegionFromCoords(x: number, z: number): RegionId {
  if (z >= 8.0) return 'ashenhold_gate';
  if (z <= -100.0) return 'ashenhold_castle_approach';
  if (x <= -25.0 && z > -95.0 && z < -10.0) return 'ashenhold_artisan_quarter';
  if (x >= 33.0 && z > -95.0 && z < -4.0) return 'ashenhold_residential_quarter';
  if (z <= -43.0 && z > -100.0 && x > -26.0 && x < 34.0) return 'ashenhold_market_plaza';
  return 'ashenhold_main_street';
}
