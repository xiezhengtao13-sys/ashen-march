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
  // Cell 01: South Gate & Bent-Axis Barbican Courtyard (0.0m)
  { id: 'tier0_gate_approach', cx: 0, cz: 23.5, halfX: 16.5, halfZ: 13.5, elevation: 0.0, cornerRadius: 2.5, feather: 2.2 },
  // Cell 03: Compact Central Market Terrace (28m x 30m enclosed hub, +3.5m)
  { id: 'tier1_market_plaza', cx: 0, cz: -35.0, halfX: 16.5, halfZ: 15.0, elevation: 3.5, cornerRadius: 3.0, feather: 2.0 },
  // Cell 03 Focal Point: Market Cistern Fountain Octagonal Dais (+3.85m)
  { id: 'tier1_fountain_dais', cx: 0, cz: -35.0, halfX: 4.5, halfZ: 4.5, elevation: 3.85, cornerRadius: 3.2, feather: 1.0 },
  // Mid-Terrace Overlook atop 4.0m Market North Bastion Wall (+7.5m)
  { id: 'tier2_mid_overlook', cx: 0, cz: -58.5, halfX: 18.0, halfZ: 6.0, elevation: 7.5, cornerRadius: 2.0, feather: 1.8 },
  // Cell 04: West Artisan & Forge Quarter Terrace (+7.0m)
  { id: 'tier2_west_artisan', cx: -33.5, cz: -44.0, halfX: 15.0, halfZ: 27.5, elevation: 7.0, cornerRadius: 3.0, feather: 2.0 },
  // Cell 05: East Residential Heights Terrace (+7.5m)
  { id: 'tier2_east_residential', cx: 33.5, cz: -44.0, halfX: 15.0, halfZ: 27.5, elevation: 7.5, cornerRadius: 3.0, feather: 2.0 },
  // Cell 06: Cathedral & Bell Tower Acropolis (+12.2m, north of Watchtower z=-70)
  { id: 'tier3_temple_acropolis', cx: 0, cz: -87.0, halfX: 25.0, halfZ: 13.5, elevation: 12.2, cornerRadius: 3.0, feather: 2.0 },
  // Cell 07: Lord's Castle Outer Bailey Courtyard (+18.0m)
  { id: 'tier4_castle_forecourt', cx: 0, cz: -116.5, halfX: 24.5, halfZ: 10.5, elevation: 18.0, cornerRadius: 2.5, feather: 2.0 },
  // Cell 07: Sovereign Citadel Inner Keep & Great Hall Plateau (+21.0m)
  { id: 'tier4_citadel_keep', cx: 0, cz: -135.5, halfX: 24.5, halfZ: 10.5, elevation: 21.0, cornerRadius: 3.0, feather: 2.4 },
];

/**
 * Authoritative 8-Cell Interconnected Hillside Road & Stair Network.
 */
export const CITY_ROAD_SEGMENTS: CityRoadSegment[] = [
  // Cell 01 Bent-Axis Barbican: Outer Gate (-6.2, 36 -> 22) -> Courtyard Turn -> Inner Gate (0, 22 -> 10.5)
  { id: 'barbican_outer_gate', route: 'main', a: { x: -6.2, z: 36.5, y: 0.0, halfWidth: 3.6 }, b: { x: -6.2, z: 22.0, y: 0.0, halfWidth: 3.6 } },
  { id: 'barbican_courtyard_turn', route: 'main', a: { x: -6.2, z: 22.0, y: 0.0, halfWidth: 3.8 }, b: { x: 0.0, z: 22.0, y: 0.0, halfWidth: 4.0 } },
  { id: 'main_gate', route: 'main', a: { x: 0, z: 22.5, y: 0.0, halfWidth: 4.0 }, b: { x: 0, z: 10.5, y: 0.0, halfWidth: 3.5 } },

  // Cell 02 S-Curved Trade Street -> Market Bridge Steps -> Cell 03 Central Market
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

  // Cell 03 -> Mid-Terrace Overlook (+7.5m)
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

  // Cell 06 -> Cell 07 Royal Causeway & Inner Keep Steps (+12.2m -> +18.0m -> +21.0m)
  {
    id: 'main_royal_causeway',
    route: 'castle',
    a: { x: 0, z: -96.5, y: 12.2, halfWidth: 3.6 },
    b: { x: 0, z: -108.0, y: 18.0, halfWidth: 3.8 },
    stepped: true,
    stepCount: 22,
  },
  { id: 'castle_bailey_walk', route: 'castle', a: { x: 0, z: -108.0, y: 18.0, halfWidth: 4.5 }, b: { x: 0, z: -122.0, y: 18.0, halfWidth: 4.5 } },
  {
    id: 'castle_keep_steps',
    route: 'castle',
    a: { x: 0, z: -122.0, y: 18.0, halfWidth: 3.8 },
    b: { x: 0, z: -127.5, y: 21.0, halfWidth: 3.8 },
    stepped: true,
    stepCount: 12,
  },

  // Cell 04 West Wing Artisan Quarter Routes
  {
    id: 'artisan_forge_ramp',
    route: 'artisan',
    a: { x: -15.2, z: -35.0, y: 3.5, halfWidth: 2.4 },
    b: { x: -24.5, z: -35.0, y: 7.0, halfWidth: 2.4 },
    stepped: true,
    stepCount: 14,
  },
  { id: 'artisan_smithy_lane', route: 'artisan', a: { x: -24.5, z: -22.0, y: 7.0, halfWidth: 2.6 }, b: { x: -26.5, z: -62.0, y: 7.0, halfWidth: 2.6 } },
  {
    id: 'artisan_temple_stairs',
    route: 'artisan',
    a: { x: -25.0, z: -62.0, y: 7.0, halfWidth: 2.4 },
    b: { x: -18.5, z: -76.5, y: 12.2, halfWidth: 2.4 },
    stepped: true,
    stepCount: 20,
  },

  // Cell 05 East Wing Residential Heights Routes
  {
    id: 'res_weaver_steps',
    route: 'residential',
    a: { x: 15.2, z: -35.0, y: 3.5, halfWidth: 2.4 },
    b: { x: 24.5, z: -35.0, y: 7.5, halfWidth: 2.4 },
    stepped: true,
    stepCount: 15,
  },
  { id: 'res_heights_walk', route: 'residential', a: { x: 24.5, z: -20.0, y: 7.5, halfWidth: 2.4 }, b: { x: 26.5, z: -62.0, y: 7.5, halfWidth: 2.4 } },
  {
    id: 'res_return_steps',
    route: 'residential',
    a: { x: 23.5, z: -16.0, y: 7.5, halfWidth: 2.1 },
    b: { x: 14.5, z: -6.5, y: 1.2, halfWidth: 2.1 },
    stepped: true,
    stepCount: 18,
  },
  {
    id: 'res_temple_stairs',
    route: 'residential',
    a: { x: 25.0, z: -62.0, y: 7.5, halfWidth: 2.4 },
    b: { x: 18.5, z: -76.5, y: 12.2, halfWidth: 2.4 },
    stepped: true,
    stepCount: 18,
  },

  // Mid-Terrace Cross-Overlook Link (+7.5m connecting West & East wings)
  { id: 'alley_mid_bridge', route: 'alley', a: { x: -24.5, z: -55.0, y: 7.2, halfWidth: 2.2 }, b: { x: 24.5, z: -55.0, y: 7.5, halfWidth: 2.2 } },
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
  } else if (z >= -69.5) {
    spineY = 7.5; // Overlook & Cliffside Watchtower Ascent base
  } else if (z >= -73.5) {
    spineY = 7.5 + smoothstep(-69.5, -73.5, z) * 4.7; // -> 12.2m Temple Acropolis
  } else if (z >= -99.5) {
    spineY = 12.2;
  } else if (z >= -106.5) {
    spineY = 12.2 + smoothstep(-99.5, -106.5, z) * 5.8; // -> 18.0m Castle Outer Bailey
  } else if (z >= -124.0) {
    spineY = 18.0;
  } else if (z >= -127.0) {
    spineY = 18.0 + smoothstep(-124.0, -127.0, z) * 3.0; // -> 21.0m Citadel Keep Crag
  } else {
    spineY = 21.0;
  }

  // East & West Upper Wing Hillside Shelves (+7.0m West Artisan, +7.5m East Residential)
  const wingZMask = smoothstep(-9.0, -15.0, z) * (1 - smoothstep(-72.0, -79.0, z));
  const wingXMask = smoothstep(17.2, 21.0, absX) * (1 - smoothstep(49.5, 55.0, absX));
  const wingTargetY = x < 0 ? 7.0 : 7.5;
  let y = spineY;
  if (wingZMask > 0.001 && wingXMask > 0.001) {
    const blend = wingZMask * wingXMask;
    y = y * (1 - blend) + Math.max(y, wingTargetY) * blend;
  }

  // Natural mountain ridges rising outside the city perimeter walls
  const outerX = smoothstep(51.0, 82.0, absX);
  const outerNorth = smoothstep(-145.0, -166.0, z);
  const outerSouth = smoothstep(38.5, 55.0, z);
  const cragNoise = (noise2(x * 0.055, z * 0.055) - 0.35) * 6.5;
  y += outerX * (6.0 + smoothstep(15, -130, z) * 10.0 + cragNoise);
  y += outerNorth * (8.5 + cragNoise * 0.8);
  y -= outerSouth * 2.2;

  return y;
}

/**
 * Unified 8-Cell Hillside Height & Road-Splat Sampler.
 */
export function sampleCityNetwork(x: number, z: number): GroundSample {
  let height = sampleHillsideTerraceBase(x, z);
  let minRoadDist = 999;
  let plazaWeight = 0;
  let stepWeight = 0;
  let curbOffset = 0;

  // 1. Level Tier 0 Barbican, Gatehouse Approach & S-Curved Gateward Trade Street
  if (z >= -19.8 && z <= 38.5 && Math.abs(x) <= 18.5) {
    const roadX = z > 22.0 ? smoothstep(21.0, 24.5, z) * -6.2 : getCityRoadCenterX(z);
    const dx = Math.abs(x - roadX);
    const streetBaseY = getCityStreetBaseY(z);
    const cOff = z <= -11.2 || z >= 21.5 ? 0.0 : getStreetCrossSectionOffset(dx);

    const padBlend = 1 - smoothstep(15.5, 18.5, Math.abs(x));
    const microCobble =
      dx < 3.4 && z > -11.2 ? (noise2(x * 0.65, z * 0.65) - 0.5) * 0.018 : 0;

    let stepRib = 0;
    if (z <= -11.5 && z >= -19.5 && dx <= 3.3) {
      stepWeight = 1;
      const frac = ((-11.5 - z) / 8.0) * 10;
      stepRib = (frac - Math.floor(frac) - 0.5) * 0.02;
    }

    const targetY = streetBaseY + cOff + microCobble + stepRib;
    height = height * (1 - padBlend) + targetY * padBlend;

    // Barbican courtyard flagstone weight (z in [15.8, 30.5])
    if (z >= 15.8 && z <= 30.5 && Math.abs(x) <= 15.2) {
      plazaWeight = Math.max(plazaWeight, 0.72);
      minRoadDist = Math.min(minRoadDist, 0.0);
    }

    const rDist = dx - 2.95;
    if (rDist < minRoadDist) {
      minRoadDist = rDist;
      curbOffset = cOff;
    }
  }

  // 2. Flatten Compact Central Market Plaza (+3.5m) & Fountain Octagonal Dais (+3.85m)
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

  // 3. Upper Tier Plazas (Mid Overlook +7.5m, Artisan +7.0m, Residential +7.5m, Temple +12.2m, Castle +18.0m/+21.0m)
  for (const pad of CITY_PLAZA_PADS) {
    if (pad.id === 'tier0_gate_approach' || pad.id === 'tier1_market_plaza' || pad.id === 'tier1_fountain_dais') {
      continue;
    }
    const sdf = roundedBoxSdf(x, z, pad.cx, pad.cz, pad.halfX, pad.halfZ, pad.cornerRadius);
    if (sdf < pad.feather) {
      const w = 1 - smoothstep(-0.3, pad.feather, sdf);
      height = height * (1 - w) + pad.elevation * w;
      plazaWeight = Math.max(plazaWeight, (1 - smoothstep(-0.4, 0.8, sdf)) * 0.85);
      minRoadDist = Math.min(minRoadDist, sdf);
    }
  }

  // 4. Evaluate Road & Stepped Stair Segments for Cobblestone Splatting + Smooth Terrain Ramps under Stairs
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
    // Depress terrain slightly beneath V5 inter-cell stone stair flights so sculpted steps never clip grass/dirt
    if (
      seg.id === 'artisan_forge_ramp' ||
      seg.id === 'artisan_temple_stairs' ||
      seg.id === 'res_weaver_steps' ||
      seg.id === 'res_return_steps' ||
      seg.id === 'res_temple_stairs' ||
      seg.id === 'main_royal_causeway' ||
      seg.id === 'castle_keep_steps'
    ) {
      if (edgeDist < 1.2) {
        const w = 1 - smoothstep(-0.2, 1.2, edgeDist);
        const segY = seg.a.y + (seg.b.y - seg.a.y) * t - 0.32;
        height = Math.min(height, height * (1 - w) + segY * w);
      }
    }
  }

  // 5. Cell 08 Sub-Level (-4.0m) Undercroft & Cellar Stairwell Cutouts
  // 5a. Main Vaulted Cistern Footprint: x in [-15.4, -9.6], z in [-25.8, -5.2]
  if (x >= -16.4 && x <= -8.6 && z >= -26.8 && z <= -4.4) {
    const wx = smoothstep(-16.4, -15.2, x) * (1 - smoothstep(-9.8, -8.6, x));
    const wz = smoothstep(-26.8, -25.4, z) * (1 - smoothstep(-5.6, -4.4, z));
    const w = wx * wz;
    if (w > 0.001) {
      height = height * (1 - w) + Math.min(height, -4.55) * w;
      plazaWeight *= 1 - w;
    }
  }
  // 5b. Trade Street South Undercroft Stairwell Cutout: x in [-12.5, -3.5], z around -7.0
  if (x >= -13.0 && x <= -3.2 && z >= -9.0 && z <= -5.0) {
    const t = clamp((x + 12.3) / 9.0, 0, 1);
    const stairFloorY = -4.0 + t * 5.35 - 0.55;
    const wz = 1 - smoothstep(1.25, 2.0, Math.abs(z + 7.0));
    const wx = smoothstep(-13.0, -12.0, x) * (1 - smoothstep(-4.2, -3.2, x));
    const w = wx * wz;
    if (w > 0.001) {
      height = Math.min(height, height * (1 - w) + stairFloorY * w);
    }
  }
  // 5c. Market SW Undercroft Stairwell Cutout: (-12.1, -24.5, -4.0m) -> (-9.3, -36.8, +3.5m)
  if (z >= -37.4 && z <= -23.8 && x >= -15.0 && x <= -6.8) {
    const u = clamp((-24.5 - z) / 12.3, 0, 1);
    const cx = -12.1 + u * 2.8;
    const stairFloorY = -4.0 + u * 7.5 - 0.55;
    const wx = 1 - smoothstep(1.25, 2.1, Math.abs(x - cx));
    const wz = smoothstep(-23.8, -24.8, z) * (1 - smoothstep(-36.2, -37.2, z));
    const w = wx * wz;
    if (w > 0.001) {
      height = Math.min(height, height * (1 - w) + stairFloorY * w);
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
 * Returns true if a terrain triangle centroid (x, z) falls inside an open stone stairwell
 * or underground cistern tunnel portal mouth where sculpted GLB steps/vaults replace the surface sheet.
 */
export function isCityTerrainHole(x: number, z: number): boolean {
  // 1. Cell 01 West Barbican Undercroft Stairway: (-12.5, 0.0, 27.2) <-> (-12.5, -4.0, 16.5)
  if (x >= -13.7 && x <= -11.3 && z >= 16.0 && z <= 27.15) return true;
  // 2. Cell 02 Warehouse Courtyard Wine Cellar Stairway: (13.6, 0.35, 2.8) <-> (13.6, -4.0, 11.4)
  if (x >= 12.5 && x <= 14.7 && z >= 2.85 && z <= 12.0) return true;
  // 3. Cell 07 Enclosed East Castle Armory 4-Flight Secret Cliff Shaft (+18m <-> -4m)
  if (x >= 13.5 && x <= 20.2 && z >= -123.0 && z <= -113.1) return true;
  // 4. Cell 08 Central Cistern East Tunnel Archway under West Retaining Wall (z = -21.0)
  if (x >= -10.2 && x <= -8.2 && z >= -22.8 && z <= -19.2) return true;
  // 5. Cell 08 Central Cistern South Tunnel Archway under West Trade Foundations (x = -12.5, z = -5.0)
  if (x >= -14.3 && x <= -10.7 && z >= -6.0 && z <= -4.0) return true;
  return false;
}

export type CitySurfaceMaterial =
  | 'stone_flagstone'
  | 'stone_stair'
  | 'wood_plank'
  | 'dirt'
  | 'grass'
  | 'shallow_water';

/**
 * Classifies exact surface material beneath player feet for procedural FootstepAudioSystem.
 */
export function getCitySurfaceMaterial(x: number, y: number, z: number): CitySurfaceMaterial {
  // Underground drainage channel water vs damp slate floor
  if (y < -0.55) {
    if (Math.abs(x + 12.5) < 0.65 && z >= -25.5 && z <= -6.0 && y < -3.85) {
      return 'shallow_water';
    }
    return 'stone_flagstone';
  }
  // Market fountain basin water
  if (Math.hypot(x, z + 35.0) < 3.45 && y >= 3.7 && y <= 5.2) {
    return 'shallow_water';
  }
  // Timber-floored interiors & balconies (Ember Tavern 1F/2F, Market Shop 2F, Weaver Townhouse, Smithy 2F Loft)
  if (
    (x >= 4.2 && x <= 13.8 && z >= -8.6 && z <= 2.2 && y >= 1.4 && y <= 8.5) ||
    (x >= 13.2 && x <= 18.2 && z >= -31.5 && z <= -22.5 && y >= 7.0 && y <= 10.5) ||
    (x >= 24.5 && x <= 33.5 && z >= -33.5 && z <= -23.0 && y >= 7.3 && y <= 13.5) ||
    (x >= -38.5 && x <= -28.0 && z >= -41.0 && z <= -31.0 && y >= 9.8 && y <= 13.5)
  ) {
    return 'wood_plank';
  }
  // Elevated stone bridges, ramparts, and stairs above terrain
  const sample = sampleCityNetwork(x, z);
  if (y > sample.height + 0.65) {
    return 'stone_flagstone';
  }
  if (sample.stepWeight > 0.35) {
    return 'stone_stair';
  }
  if (sample.plazaWeight > 0.25 || sample.roadDist <= 0.45) {
    return 'stone_flagstone';
  }
  if (sample.roadDist <= 2.8) {
    return 'dirt';
  }
  return 'grass';
}

/**
 * Maps world (x, z, y) coordinates to the 8-Cell Hillside Ashenhold RegionId for HUD compass & discovery.
 */
export function getCityRegionFromCoords(x: number, z: number, y?: number): RegionId {
  if (y !== undefined && y < -0.55) return 'ashenhold_undercroft';
  if (z >= 9.0) return 'ashenhold_gate';
  if (z <= -103.5) return 'ashenhold_castle_approach';
  if (z <= -69.5 && Math.abs(x) <= 29.0) return 'ashenhold_temple_acropolis';
  if (x <= -17.5 && z <= -12.0 && z >= -75.0) return 'ashenhold_artisan_quarter';
  if (x >= 17.5 && z <= -10.0 && z >= -75.0) return 'ashenhold_residential_quarter';
  if (z <= -17.5 && z >= -69.5) return 'ashenhold_market_plaza';
  return 'ashenhold_main_street';
}
