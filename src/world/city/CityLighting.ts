import * as THREE from 'three';

/**
 * Ashenhold city lighting model.
 *
 * Previous (Phase 1) lighting relied on a single hemisphere light, which gives a flat,
 * direction-less ambient term: street-facing walls that sit in the sun's shadow only received a
 * dim uniform grey, and since `scene.environment` was removed for software-render performance,
 * nothing resembled sky-bounce light. This module provides:
 *
 *  1. `CityAmbientProbe` – an analytic-sky **spherical-harmonics light probe** (SH9). It is cheap
 *     (9 coefficients, no cubemap sampling) and gives walls a physically-shaped ambient term:
 *     bright blue-white sky from above, warm sunlit-masonry bounce from below/sides.
 *  2. `computeSkySH` – pure function used by the probe (unit-testable, no WebGL required).
 *  3. Tone-mapping presets: ACES stays for the open world / crypt (no regression), the city
 *     uses a neutral (Khronos PBR Neutral) curve that preserves material hue and albedo.
 */

export interface CitySkyLightingInput {
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Bounce colour of sunlit masonry / cobbles seen from below the horizon. */
  bounce: THREE.Color;
  /** Sun direction (towards the sun, normalised) used to add a warm forward-scatter lobe. */
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  /** Strength of the warm sun-side lobe (0..1). */
  sunLobe: number;
  /** Global radiance gain applied to the analytic sky (acts like sky illuminance). */
  gain: number;
}

const SH_BASIS = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const TMP_DIR = new THREE.Vector3();
const TMP_COL = new THREE.Color();

/** Radiance of the analytic sky dome in a given direction (linear RGB). */
export function sampleSkyRadiance(dir: THREE.Vector3, input: CitySkyLightingInput, out: THREE.Color): THREE.Color {
  const y = dir.y;
  if (y >= 0) {
    out.copy(input.horizon).lerp(input.zenith, Math.pow(y, 0.52));
  } else {
    out.copy(input.horizon).multiplyScalar(0.55).lerp(input.bounce, Math.min(1, -y * 1.8));
  }
  const sd = Math.max(0, dir.dot(input.sunDir));
  if (sd > 0 && input.sunLobe > 0) {
    out.r += input.sunColor.r * Math.pow(sd, 4) * input.sunLobe;
    out.g += input.sunColor.g * Math.pow(sd, 4) * input.sunLobe;
    out.b += input.sunColor.b * Math.pow(sd, 4) * input.sunLobe;
  }
  out.multiplyScalar(input.gain);
  return out;
}

/** Project the analytic sky onto SH9 radiance coefficients (same convention as THREE.LightProbeGenerator). */
export function computeSkySH(input: CitySkyLightingInput, sh: THREE.SphericalHarmonics3, lonSteps = 16, latSteps = 10): void {
  for (const c of sh.coefficients) c.set(0, 0, 0);
  let totalWeight = 0;
  const samples: Array<{ dir: THREE.Vector3; w: number }> = [];
  for (let i = 0; i < latSteps; i++) {
    const theta = ((i + 0.5) / latSteps) * Math.PI; // 0 = up
    const w = Math.sin(theta);
    for (let j = 0; j < lonSteps; j++) {
      const phi = ((j + 0.5) / lonSteps) * Math.PI * 2;
      samples.push({
        dir: new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)),
        w,
      });
      totalWeight += w;
    }
  }
  const norm = (4 * Math.PI) / totalWeight;
  for (const s of samples) {
    TMP_DIR.copy(s.dir);
    sampleSkyRadiance(TMP_DIR, input, TMP_COL);
    THREE.SphericalHarmonics3.getBasisAt(TMP_DIR, SH_BASIS);
    for (let k = 0; k < 9; k++) {
      sh.coefficients[k].x += TMP_COL.r * SH_BASIS[k] * s.w * norm;
      sh.coefficients[k].y += TMP_COL.g * SH_BASIS[k] * s.w * norm;
      sh.coefficients[k].z += TMP_COL.b * SH_BASIS[k] * s.w * norm;
    }
  }
}

export class CityAmbientProbe {
  readonly probe: THREE.LightProbe;

  constructor(scene: THREE.Scene) {
    this.probe = new THREE.LightProbe();
    this.probe.intensity = 0;
    scene.add(this.probe);
  }

  update(input: CitySkyLightingInput, enabled: boolean): void {
    if (!enabled) {
      this.probe.intensity = 0;
      return;
    }
    computeSkySH(input, this.probe.sh);
    this.probe.intensity = 1;
  }
}

export interface ToneMappingPreset {
  mapping: THREE.ToneMapping;
  exposure: number;
}

export const OVERWORLD_TONE: ToneMappingPreset = { mapping: THREE.ACESFilmicToneMapping, exposure: 1.08 };
export const CITY_TONE: ToneMappingPreset = { mapping: THREE.NeutralToneMapping, exposure: 1.0 };
