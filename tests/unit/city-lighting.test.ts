import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CITY_TONE, OVERWORLD_TONE, computeSkySH, sampleSkyRadiance, type CitySkyLightingInput } from '../../src/world/city/CityLighting';

describe('City SH ambient lighting probe', () => {
  it('produces stronger upward sky irradiance than downward bounce and scales with solar daytime gain', () => {
    const shDay = new THREE.SphericalHarmonics3();
    const shNight = new THREE.SphericalHarmonics3();

    const noonInput: CitySkyLightingInput = {
      zenith: new THREE.Color(0x5b8ec4),
      horizon: new THREE.Color(0xd2e0ec),
      bounce: new THREE.Color(0.32, 0.25, 0.18).multiplyScalar(1.25),
      sunDir: new THREE.Vector3(-0.2, 0.9, 0.4).normalize(),
      sunColor: new THREE.Color(0xfff3de),
      sunLobe: 0.24,
      gain: 2.1,
    };

    const nightInput: CitySkyLightingInput = {
      zenith: new THREE.Color(0x0b111f),
      horizon: new THREE.Color(0x1b263d),
      bounce: new THREE.Color(0.08, 0.06, 0.05),
      sunDir: new THREE.Vector3(0.4, -0.5, 0.4).normalize(),
      sunColor: new THREE.Color(0x7ea8eb),
      sunLobe: 0.06,
      gain: 0.85,
    };

    computeSkySH(noonInput, shDay);
    computeSkySH(nightInput, shNight);

    const upIrr = new THREE.Vector3();
    const downIrr = new THREE.Vector3();
    const nightUp = new THREE.Vector3();
    shDay.getIrradianceAt(new THREE.Vector3(0, 1, 0), upIrr);
    shDay.getIrradianceAt(new THREE.Vector3(0, -1, 0), downIrr);
    shNight.getIrradianceAt(new THREE.Vector3(0, 1, 0), nightUp);

    expect(upIrr.x).toBeGreaterThan(0.5);
    expect(upIrr.z).toBeGreaterThan(downIrr.z);
    expect(downIrr.x).toBeGreaterThan(downIrr.z);
    expect(upIrr.y).toBeGreaterThan(nightUp.y * 4);

    const out = new THREE.Color();
    sampleSkyRadiance(new THREE.Vector3(0, 1, 0), noonInput, out);
    expect(out.b).toBeGreaterThan(out.r);
  });

  it('keeps ACES for overworld while using NeutralToneMapping in Ashenhold', () => {
    expect(OVERWORLD_TONE.mapping).toBe(THREE.ACESFilmicToneMapping);
    expect(CITY_TONE.mapping).toBe(THREE.NeutralToneMapping);
    expect(CITY_TONE.exposure).toBe(1.0);
  });
});
