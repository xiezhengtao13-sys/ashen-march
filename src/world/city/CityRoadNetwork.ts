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

/**
 * Compact Hillside Redesign (~104m x 144m):
 * S-curved Tier 0 Gateward Trade Street centerline (z in [-15, +24]).
 * Breaks sterile linear corridor sightlines while staying aligned with Gatehouse (z=+14) and Market Bridge Arch (z=-15).
 */
export function getCityRoadCenterX(z: number): number {
  if (z >= 10.5 || z <= -12.5) return 0;
  const u = (10.5 - z) / 23.0; // 0 at south gate inner mouth -> 1 at Market Bridge Arch approach
  const env = Math.sin(u * Math.PI); // 0 at both ends for seamless tangent alignment
  return Math.sin(u * Math.PI * 1.85) * 1.95 * env;
}

/**
 * Tier 0 Gateward Trade Street base climb (0.0m at South Gate -> +1.70m at z=-11 -> +3.50m Market Terrace at z=-19.5).
 */
export function getCityStreetBaseY(z: number): number {
  if (z >= 11.0) return 0;
  if (z >= -11.0) {
    return smoothstep(11.0, -11.0, z) * 1.7;
  }
  return 1.7 + smoothstep(-11.0, -19.5, z) * 1.8;
}

function getStreetCrossSectionOffset(dx: number): number {
  if (dx <= 2.35) {
    return 0.05 * (1 - (dx / 2.35) ** 2);
  }
  if (dx <= 2.85) {
    const t = (dx - 2.35) / 0.5;
    return -0.055 * Math.sin(t * Math.PI);
  }
  if (dx <= 3.25) {
    return smoothstep(2.85, 3.25, dx) * 0.14;
  }
  return 0.14;
}

/**
 * 5-Tier Terraced Hillside Pads (0m -> +3.5m -> +7.5m -> +12.2m -> +18.0m / +21.0m).
 */
export const CITY_PLAZA_PADS: CityPlazaPad[] = [
  // Tier 0: South Gate Outer & Inner Apron
  { id: 'tier0_gate_approach', cx: 0, cz: 17.5, halfX: 9.5, halfZ: 7.0, elevation: 0.0, cornerRadius: 2.0, feather: 2.2 },
  // Tier 1: Compact Central Market Terrace (26m x 28m tight hub)
  { id: 'tier1_market_plaza', cx: 0, cz: -35.0, halfX: 16.5, halfZ: 15.0, elevation: 3.5, cornerRadius: 3.0, feather: 2.0 },
  // Tier 1 Focal Point: Phoenix Fountain Octagonal Dais
  { id: 'tier1_fountain_dais', cx: 0, cz: -35.0, halfX: 4.5, halfZ: 4.5, elevation: 3.85, cornerRadius: 3.2, feather: 1.0 },
  // Tier 2 Center: Mid-Terrace Overlook atop 4.0m Market North Retaining Wall
  { id: 'tier2_mid_overlook', cx: 0, cz: -58.5, halfX: 18.0, halfZ: 6.0, elevation: 7.5, cornerRadius: 2.0, feather: 1.8 },
  // Tier 2 West Wing: Artisan Quarter Terrace (+7.0m)
  { id: 'tier2_west_artisan', cx: -35.5, cz: -46.0, halfX: 14.5, halfZ: 28.0, elevation: 7.0, cornerRadius: 3.0, feather: 2.2 },
  // Tier 2 East Wing: Residential Heights Terrace (+7.5m)
  { id: 'tier2_east_residential', cx: 35.5, cz: -46.0, halfX: 14.5, halfZ: 28.0, elevation: 7.5, cornerRadius: 3.0, feather: 2.2 },
  // Tier 3: Temple & Guild Acropolis (+12.2m)
  { id: 'tier3_temple_acropolis', cx: 0, cz: -85.0, halfX: 22.0, halfZ: 13.5, elevation: 12.2, cornerRadius: 3.0, feather: 2.2 },
  // Tier 4: Citadel Forecourt (+18.0m)
  { id: 'tier4_castle_forecourt', cx: 0, cz: -112.0, halfX: 19.0, halfZ: 9.0, elevation: 18.0, cornerRadius: 2.5, feather: 2.2 },
  // Tier 4 Crag: Sovereign Citadel Keep Plateau (+21.0m)
  { id: 'tier4_citadel_keep', cx: 0, cz: -132.0, halfX: 23.0, halfZ: 10.0, elevation: 21.0, cornerRadius: 3.0, feather: 2.6 },
];

/**
 * Authoritative Compact Hillside Road & Stair Network (used for ground splatting, path guidance, and [M] Map).
 */
export const CITY_ROAD_SEGMENTS: CityRoadSegment[] = [
  // Main Axis: South Gate -> S-Curved Trade Street -> Market Bridge Steps -> Central Market
  { id: 'main_gate', route: 'main', a: { x: 0, z: 22, y: 0.0, halfWidth: 4.0 }, b: { x: 0, z: 10.5, y: 0.0, halfWidth: 3.5 } },
  { id: 'main_trade_s1', route: 'main', a: { x: 0, z: 10.5, y: 0.0, halfWidth: 3.1 }, b: { x: 1.6, z: 3.0, y: 0.52, halfWidth: 2.9 } },
  { id: 'main_trade_s2', route: 'main', a: { x: 1.6, z: 3.0, y: 0.52, halfWidth: 2.9 }, b: { x: -1.4, z: -6.5, y: 1.32, halfWidth: 2.9 } },
  { id: 'main_trade_s3', route: 'main', a: { x: -1.4, z: -6.5, y: 1.32, halfWidth: 2.9 }, b: { x: 0, z: -11.5, y: 1.7, halfWidth: 3.0 } },
  {
    id: 'main_market_bridge_steps',
    route: 'main',
    a: { x: 0, z: -11.5, y: 1.7, halfWidth: 3.0 },
    b: { x: 0, z: -20.0, y: 3.5, halfWidth: 3.4 },
    stepped: true,
    stepCount: 10,
  },
  // Market North Switchback Ceremonial Stairs (Tier 1 +3.5m -> Tier 2 Mid-Terrace Overlook +7.5m)
  {
    id: 'main_switchback_west',
    route: 'main',
    a: { x: -11.5, z: -48.5, y: 3.5, halfWidth: 2.1 },
    b: { x: -3.0, z: -53.0, y: 7.5, halfWidth: 2.1 },
    stepped: true,
    stepCount: 16,
  },
  {
    id: 'main_switchback_east',
    route: 'main',
    a: { x: 11.5, z: -48.5, y: 3.5, halfWidth: 2.1 },
    b: { x: 3.0, z: -53.0, y: 7.5, halfWidth: 2.1 },
    stepped: true,
    stepCount: 16,
  },
  // Phase 4 Main Axis Continuation: Mid-Terrace (+7.5m) -> Temple Acropolis (+12.2m) -> Citadel Forecourt (+18.0m)
  {
    id: 'main_acropolis_stairs',
    route: 'castle',
    a: { x: 0, z: -61.0, y: 7.5, halfWidth: 3.2 },
    b: { x: 0, z: -72.0, y: 12.2, halfWidth: 3.4 },
    stepped: true,
    stepCount: 18,
  },
  {
    id: 'main_royal_causeway',
    route: 'castle',
    a: { x: 0, z: -96.0, y: 12.2, halfWidth: 3.5 },
    b: { x: 0, z: -108.0, y: 18.0, halfWidth: 3.6 },
    stepped: true,
    stepCount: 22,
  },

  // West Wing Artisan Loop (Phase 3 ready)
  {
    id: 'artisan_forge_ramp',
    route: 'artisan',
    a: { x: -15.5, z: -36.0, y: 3.5, halfWidth: 2.5 },
    b: { x: -29.0, z: -42.0, y: 7.0, halfWidth: 2.4 },
    stepped: true,
    stepCount: 12,
  },
  { id: 'artisan_smithy_lane', route: 'artisan', a: { x: -29.0, z: -42.0, y: 7.0, halfWidth: 2.3 }, b: { x: -42.0, z: -58.0, y: 7.4, halfWidth: 2.1 } },
  { id: 'artisan_copper_alley', route: 'artisan', a: { x: -42.0, z: -58.0, y: 7.4, halfWidth: 2.0 }, b: { x: -38.0, z: -22.0, y: 6.4, halfWidth: 2.0 } },
  {
    id: 'artisan_return_steps',
    route: 'artisan',
    a: { x: -38.0, z: -22.0, y: 6.4, halfWidth: 2.0 },
    b: { x: -4.0, z: -7.5, y: 1.4, halfWidth: 2.0 },
    stepped: true,
    stepCount: 16,
  },

  // East Wing Residential Heights Loop (Phase 3 ready)
  {
    id: 'res_weaver_steps',
    route: 'residential',
    a: { x: 15.5, z: -36.0, y: 3.5, halfWidth: 2.3 },
    b: { x: 30.0, z: -42.0, y: 7.5, halfWidth: 2.2 },
    stepped: true,
    stepCount: 14,
  },
  { id: 'res_heights_walk', route: 'residential', a: { x: 30.0, z: -42.0, y: 7.5, halfWidth: 2.1 }, b: { x: 42.0, z: -60.0, y: 8.2, halfWidth: 1.9 } },
  { id: 'res_lantern_lane', route: 'residential', a: { x: 42.0, z: -60.0, y: 8.2, halfWidth: 1.9 }, b: { x: 36.0, z: -20.0, y: 6.6, halfWidth: 1.9 } },
  {
    id: 'res_return_steps',
    route: 'residential',
    a: { x: 36.0, z: -20.0, y: 6.6, halfWidth: 1.9 },
    b: { x: 4.0, z: -4.0, y: 1.1, halfWidth: 2.0 },
    stepped: true,
    stepCount: 16,
  },

  // Mid-Terrace Cross-Bridge Shortcut (+7.5m connecting West & East wings)
  { id: 'alley_mid_bridge', route: 'alley', a: { x: -24.0, z: -58.5, y: 7.5, halfWidth: 2.2 }, b: { x: 24.0, z: -58.5, y: 7.5, halfWidth: 2.2 } },
];

function roundedBoxSdf(px: number, pz: number, cx: number, cz: number, hx: number, hz: number, r: number): number {
  const dx = Math.abs(px - cx) - (hx - r);
  const dz = Math.abs(pz - cz) - (hz - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - r;
}

function segmentProjection(px: number, pz: number, seg: CityRoadSegment): { dist: number; t: number } {
  const vx = seg.b.x - seg.a.x;
  const vz = seg.b.z - seg.a.z;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - seg.a.x, pz - seg.a.z), t: 0 };
  }
  const t = clamp(((px - seg.a.x) * vx + (pz - seg.a.z) * vz) / lenSq, 0, 1);
  const qx = seg.a.x + vx * t;
  const qz = seg.a.z + vz * t;
  return { dist: Math.hypot(px - qx, pz - qz), t };
}

/**
 * Analytic 5-Tier Mountain Base Surface before carving roads & pads.
 * Produces crisp terraced elevation steps (0 -> 3.5 -> 7.5 -> 12.2 -> 18.0 -> 21.0m)
 * plus steep flanking mountain slopes outside |x| > 52 so the city genuinely hugs a rocky hillside.
 */
function sampleHillsideTerraceBase(x: number, z: number): number {
  const absX = Math.abs(x);

  // Central spine vertical tier ladder (North = -Z climbs sharply!)
  let spineY = 0.0;
  if (z >= 11.0) {
    spineY = 0.0;
  } else if (z >= -11.0) {
    spineY = smoothstep(11.0, -11.0, z) * 1.7;
  } else if (z >= -19.5) {
    spineY = 1.7 + smoothstep(-11.0, -19.5, z) * 1.8; // -> 3.5m Market Terrace
  } else if (z >= -50.2) {
    spineY = 3.5; // Flat compact Market Plaza
  } else if (z >= -53.2) {
    // Crisp 4.0m step behind North Retaining Wall!
    spineY = 3.5 + smoothstep(-50.2, -53.2, z) * 4.0; // -> 7.5m Mid-Terrace Overlook
  } else if (z >= -63.0) {
    spineY = 7.5;
  } else if (z >= -72.0) {
    spineY = 7.5 + smoothstep(-63.0, -72.0, z) * 4.7; // -> 12.2m Temple Acropolis
  } else if (z >= -97.0) {
    spineY = 12.2;
  } else if (z >= -106.5) {
    spineY = 12.2 + smoothstep(-97.0, -106.5, z) * 5.8; // -> 18.0m Citadel Forecourt
  } else if (z >= -121.0) {
    spineY = 18.0;
  } else if (z >= -125.0) {
    spineY = 18.0 + smoothstep(-121.0, -125.0, z) * 3.0; // -> 21.0m Citadel Keep Crag
  } else {
    spineY = 21.0;
  }

  // East & West Upper Wing Hillside Shelves (+7.0m West Artisan, +7.5m East Residential)
  // Flanking shelves rise crisply outside |x| > 18.5 along z in [-78, -14]
  const wingZMask = smoothstep(-10.0, -17.0, z) * (1 - smoothstep(-74.0, -82.0, z));
  const wingXMask = smoothstep(17.5, 22.0, absX) * (1 - smoothstep(49.5, 55.0, absX));
  const wingTargetY = x < 0 ? 7.0 : 7.5;
  let y = spineY;
  if (wingZMask > 0.001 && wingXMask > 0.001) {
    const blend = wingZMask * wingXMask;
    y = y * (1 - blend) + Math.max(y, wingTargetY) * blend;
  }

  // Natural mountain ridges rising outside the compact 104m x 144m city perimeter walls
  const outerX = smoothstep(52.0, 82.0, absX);
  const outerNorth = smoothstep(-132.0, -158.0, z);
  const outerSouth = smoothstep(24.0, 44.0, z);
  const cragNoise = (noise2(x * 0.055, z * 0.055) - 0.35) * 6.5;
  y += outerX * (5.5 + smoothstep(10, -110, z) * 9.0 + cragNoise);
  y += outerNorth * (7.5 + cragNoise * 0.8);
  y -= outerSouth * 2.2;

  return y;
}

/**
 * Unified 5-Tier Hillside Height & Road-Splat Sampler.
 */
export function sampleCityNetwork(x: number, z: number): GroundSample {
  let height = sampleHillsideTerraceBase(x, z);
  let minRoadDist = 999;
  let plazaWeight = 0;
  let stepWeight = 0;
  let curbOffset = 0;

  // 1. Level Tier 0 Gatehouse Approach & S-Curved Gateward Trade Street
  if (z >= -19.8 && z <= 25.0 && Math.abs(x) <= 17.0) {
    const roadX = getCityRoadCenterX(z);
    const dx = Math.abs(x - roadX);
    const streetBaseY = getCityStreetBaseY(z);
    const cOff = z <= -11.2 ? 0.0 : getStreetCrossSectionOffset(dx);

    // Building footprint pads beside Tier 0 street stay flush with adjacent curb
    const padBlend = 1 - smoothstep(13.5, 17.0, Math.abs(x));
    const microCobble =
      dx < 3.1 && z > -11.2 ? (noise2(x * 0.65, z * 0.65) - 0.5) * 0.018 : 0;

    // Smoothly ramp under Market Bridge Steps (z in [-11.5, -19.5]) with gentle visual step ribs
    let stepRib = 0;
    if (z <= -11.5 && z >= -19.5 && dx <= 3.3) {
      stepWeight = 1;
      const frac = ((-11.5 - z) / 8.0) * 10;
      stepRib = (frac - Math.floor(frac) - 0.5) * 0.02;
    }

    const targetY = streetBaseY + cOff + microCobble + stepRib;
    height = height * (1 - padBlend) + targetY * padBlend;

    const rDist = dx - 2.95;
    if (rDist < minRoadDist) {
      minRoadDist = rDist;
      curbOffset = cOff;
    }
  }

  // 2. Flatten Compact Central Market Plaza (+3.5m) & Phoenix Fountain Octagonal Dais (+3.85m)
  const marketSdf = roundedBoxSdf(x, z, 0, -35.0, 15.8, 14.5, 2.8);
  if (marketSdf < 2.2) {
    const w = 1 - smoothstep(-0.4, 2.2, marketSdf);
    const subtlePitch = (noise2(x * 0.2, z * 0.2) - 0.5) * 0.02;
    height = height * (1 - w) + (3.5 + subtlePitch) * w;
    plazaWeight = Math.max(plazaWeight, 1 - smoothstep(-0.6, 0.8, marketSdf));
    minRoadDist = Math.min(minRoadDist, marketSdf);
  }

  const daisSdf = roundedBoxSdf(x, z, 0, -35.0, 4.4, 4.4, 3.2);
  if (daisSdf < 0.9) {
    const w = 1 - smoothstep(-0.15, 0.9, daisSdf);
    height = height * (1 - w) + 3.85 * w;
    plazaWeight = Math.max(plazaWeight, w);
    minRoadDist = Math.min(minRoadDist, daisSdf);
  }

  // 3. Mid-Terrace Overlook (+7.5m) & Upper Tier Plazas (Temple +12.2m, Forecourt +18.0m)
  for (const pad of CITY_PLAZA_PADS) {
    if (pad.id === 'tier0_gate_approach' || pad.id === 'tier1_market_plaza' || pad.id === 'tier1_fountain_dais') {
      continue;
    }
    const sdf = roundedBoxSdf(x, z, pad.cx, pad.cz, pad.halfX, pad.halfZ, pad.cornerRadius);
    if (sdf < pad.feather) {
      const w = 1 - smoothstep(-0.3, pad.feather, sdf);
      height = height * (1 - w) + pad.elevation * w;
      if (pad.id === 'tier2_mid_overlook' || pad.id === 'tier3_temple_acropolis' || pad.id === 'tier4_castle_forecourt') {
        plazaWeight = Math.max(plazaWeight, 1 - smoothstep(-0.4, 0.6, sdf));
        minRoadDist = Math.min(minRoadDist, sdf);
      }
    }
  }

  // 4. Evaluate Road Segments for Cobblestone Splatting (plus smooth ramps for Phase 3/4 routes)
  for (const seg of CITY_ROAD_SEGMENTS) {
    const { dist, t } = segmentProjection(x, z, seg);
    const halfW = seg.a.halfWidth + (seg.b.halfWidth - seg.a.halfWidth) * t;
    const edgeDist = dist - halfW;
    if (edgeDist < minRoadDist) {
      minRoadDist = edgeDist;
      if (seg.stepped && edgeDist < 0.6) {
        stepWeight = Math.max(stepWeight, 1 - smoothstep(0, 0.6, Math.max(0, edgeDist)));
      }
    }
  }

  return {
    height,
    roadDist: minRoadDist,
    plazaWeight,
    stepWeight,
    curbOffset,
  };
}

/**
 * Maps world (x, z) coordinates to the 5-Tier Hillside Ashenhold RegionId for HUD compass & discovery.
 */
export function getCityRegionFromCoords(x: number, z: number): RegionId {
  if (z >= 9.0) return 'ashenhold_gate';
  if (z <= -100.0) return 'ashenhold_castle_approach';
  if (z <= -70.0 && Math.abs(x) <= 26.0) return 'ashenhold_temple_acropolis';
  if (x <= -21.0 && z <= -12.0 && z >= -86.0) return 'ashenhold_artisan_quarter';
  if (x >= 21.0 && z <= -12.0 && z >= -86.0) return 'ashenhold_residential_quarter';
  if (z <= -17.5 && z >= -64.0) return 'ashenhold_market_plaza';
  return 'ashenhold_main_street';
}
