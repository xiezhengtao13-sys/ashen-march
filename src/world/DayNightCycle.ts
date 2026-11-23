import * as THREE from 'three';
import type { GameState } from '../core/GameState';
import { CityAmbientProbe, type CitySkyLightingInput } from './city/CityLighting';

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStarAlpha;
varying vec3 vWorldDir;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 d = normalize(vWorldDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizonColor, uZenithColor, pow(h, 0.52));

  float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sunAmt, 12.0) * 0.42;
  col += uSunColor * smoothstep(0.997, 0.9994, sunAmt) * 1.4;

  if (uStarAlpha > 0.01 && h > 0.06) {
    float s = hash31(floor(d * 260.0));
    if (s > 0.9965) {
      col += vec3(0.85, 0.9, 1.0) * uStarAlpha * smoothstep(0.06, 0.3, h);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class DayNightCycle {
  private readonly scene: THREE.Scene;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  private readonly cityProbe: CityAmbientProbe;
  private readonly probeInput: CitySkyLightingInput = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    bounce: new THREE.Color(),
    sunDir: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(),
    sunLobe: 0,
    gain: 1,
  };
  private lastProbeKey = '';
  private readonly skyMesh: THREE.Mesh;
  private readonly skyUniforms: {
    uZenithColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uStarAlpha: { value: number };
  };

  private readonly dayZenith = new THREE.Color(0x4f759c);
  private readonly dayHorizon = new THREE.Color(0xa6bdd1);
  private readonly sunsetZenith = new THREE.Color(0x3a3b5c);
  private readonly sunsetHorizon = new THREE.Color(0xd18254);
  private readonly nightZenith = new THREE.Color(0x0b111f);
  private readonly nightHorizon = new THREE.Color(0x1b263d);
  private readonly cryptBg = new THREE.Color(0x0b0d14);

  private readonly hoursPerSecond = 24 / 720;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.hemiLight = new THREE.HemisphereLight(0xdbe8f5, 0x3b3528, 0.72);
    this.scene.add(this.hemiLight);
    this.cityProbe = new CityAmbientProbe(this.scene);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 1.45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 360;
    const d = 140;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.skyUniforms = {
      uZenithColor: { value: this.dayZenith.clone() },
      uHorizonColor: { value: this.dayHorizon.clone() },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xffe6b8) },
      uStarAlpha: { value: 0 },
    };

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 16), skyMat);
    this.skyMesh.name = 'SkyDome';
    this.scene.add(this.skyMesh);
  }

  private setShadowBounds(halfExtent: number, targetX: number, targetY: number, targetZ: number): void {
    const cam = this.sunLight.shadow.camera;
    if (cam.right !== halfExtent) {
      cam.left = -halfExtent;
      cam.right = halfExtent;
      cam.top = halfExtent;
      cam.bottom = -halfExtent;
      cam.updateProjectionMatrix();
    }
    this.sunLight.target.position.set(targetX, targetY, targetZ);
    this.sunLight.target.updateMatrixWorld();
  }

  update(dt: number, state: GameState, fogMultiplier = 1.0): void {
    if (!state.isPaused) {
      state.world.timeOfDay = (state.world.timeOfDay + dt * this.hoursPerSecond) % 24;
    }

    this.skyMesh.position.set(state.player.position.x, state.player.position.y, state.player.position.z);

    if (state.player.currentZone === 'ancient_crypt') {
      this.skyMesh.visible = false;
      this.scene.background = this.cryptBg;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(this.cryptBg);
        this.scene.fog.density = 0.017 * fogMultiplier;
      }
      this.sunLight.intensity = 0.05;
      this.hemiLight.intensity = 0.45;
      this.cityProbe.update(this.probeInput, false);
      this.lastProbeKey = '';
      return;
    }

    this.skyMesh.visible = true;
    const isCity = state.player.currentZone === 'ashenhold_city';
    const t = state.world.timeOfDay;
    const solarAngle = ((t - 6) / 24) * Math.PI * 2;
    const sunY = Math.sin(solarAngle);
    const sunX = Math.cos(solarAngle);

    if (isCity) {
      // Snap shadow camera around the player on a coarse texel grid so crisp 2048px shadows cover
      // the full 200x240m city without swimming as the player walks.
      const halfExt = 48;
      const texel = (halfExt * 2) / 1024;
      const snapX = Math.round(state.player.position.x / texel) * texel;
      const snapY = Math.round(state.player.position.y / texel) * texel;
      const snapZ = Math.round(state.player.position.z / texel) * texel;
      this.setShadowBounds(halfExt, snapX, snapY, snapZ);
      const sunOffX = sunX * 68 + (sunY > 0.4 ? 12 : 0);
      const sunOffY = sunY > 0 ? Math.max(12, sunY * 82) : 48;
      const sunOffZ = sunY > 0 ? 42 : -36;
      const citySunDir = new THREE.Vector3(sunOffX, sunOffY, sunOffZ).normalize();
      this.sunLight.position.set(snapX + citySunDir.x * 115, snapY + citySunDir.y * 115, snapZ + citySunDir.z * 115);
      this.skyUniforms.uSunDir.value.copy(citySunDir);
    } else {
      this.setShadowBounds(140, 0, 0, 0);
      this.sunLight.position.set(sunX * 140, Math.max(18, sunY * 140), 55);
      this.skyUniforms.uSunDir.value.set(sunX, sunY, 0.38).normalize();
    }

    if (sunY > 0.22) {
      this.skyUniforms.uZenithColor.value.copy(this.dayZenith);
      this.skyUniforms.uHorizonColor.value.copy(isCity ? new THREE.Color(0xc4ccd4) : this.dayHorizon);
      this.skyUniforms.uSunColor.value.setHex(0xffe8bf);
      this.skyUniforms.uStarAlpha.value = 0;

      this.sunLight.color.setHex(isCity ? 0xffeacc : 0xfff0d4);
      this.sunLight.intensity = (isCity ? 1.15 : 0.78) + sunY * 0.85;
      this.hemiLight.color.setHex(isCity ? 0xc2daf2 : 0xd3e4f5);
      this.hemiLight.groundColor.setHex(isCity ? 0x5c4b3b : 0x473e30);
      this.hemiLight.intensity = (isCity ? 0.62 : 0.48) + sunY * 0.28;
    } else if (sunY > -0.15) {
      const k = (sunY + 0.15) / 0.37;
      const warmBlend = Math.sin(k * Math.PI * 0.88);
      this.skyUniforms.uZenithColor.value.copy(this.nightZenith).lerp(this.sunsetZenith, warmBlend).lerp(this.dayZenith, Math.max(0, k - 0.55) * 1.6);
      this.skyUniforms.uHorizonColor.value.copy(this.nightHorizon).lerp(this.sunsetHorizon, warmBlend).lerp(this.dayHorizon, Math.max(0, k - 0.55) * 1.6);
      this.skyUniforms.uSunColor.value.setHex(0xff8c47);
      this.skyUniforms.uStarAlpha.value = Math.max(0, 1 - k * 2.2) * 0.6;

      this.sunLight.color.setHex(0xff9b5e);
      this.sunLight.intensity = 0.32 + Math.max(0, k) * 0.62;
      this.hemiLight.color.setHex(0xd19a7e);
      this.hemiLight.intensity = 0.34 + Math.max(0, k) * 0.22;
    } else {
      this.skyUniforms.uZenithColor.value.copy(this.nightZenith);
      this.skyUniforms.uHorizonColor.value.copy(this.nightHorizon);
      this.skyUniforms.uSunColor.value.setHex(0x8db2eb);
      this.skyUniforms.uStarAlpha.value = 0.92;

      this.sunLight.color.setHex(0x7ca6e8);
      this.sunLight.intensity = 0.36;
      this.hemiLight.color.setHex(0x4a638c);
      this.hemiLight.groundColor.setHex(0x181c26);
      this.hemiLight.intensity = 0.32;
    }

    if (isCity) {
      this.applyCityLighting(sunY);
    } else if (this.lastProbeKey !== 'off') {
      this.cityProbe.update(this.probeInput, false);
      this.lastProbeKey = 'off';
    }

    this.scene.background = this.skyUniforms.uHorizonColor.value.clone();
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.skyUniforms.uHorizonColor.value);
      this.scene.fog.density = (isCity ? 0.0028 : 0.0044) * fogMultiplier;
    }
  }

  /**
   * City-specific lighting: SH sky probe provides directional ambient (replacing most of the flat
   * hemisphere term) and the sun is boosted to a physically plausible illuminance relative to
   * the albedo of stone / timber / slate. Re-projected only when the sky meaningfully changes.
   */
  private applyCityLighting(sunY: number): void {
    // Clear blue daytime zenith & airy sunlit horizon for Ashenhold, smoothly blending into
    // warm golden hour below sunY=0.52 (e.g. 17:00 has sunY=0.26 -> clear amber-gold dusk).
    if (sunY > 0.14) {
      const golden = 1 - THREE.MathUtils.smoothstep(sunY, 0.14, 0.56);
      const cityZenith = new THREE.Color(0x5b8ec4).lerp(new THREE.Color(0x434d76), golden);
      const cityHorizon = new THREE.Color(0xd2e0ec).lerp(new THREE.Color(0xe59456), golden);
      const citySunCol = new THREE.Color(0xfff3de).lerp(new THREE.Color(0xff9f52), golden);

      this.skyUniforms.uZenithColor.value.copy(cityZenith);
      this.skyUniforms.uHorizonColor.value.copy(cityHorizon);
      this.skyUniforms.uSunColor.value.copy(citySunCol);
      this.sunLight.color.copy(citySunCol);
      this.sunLight.intensity = (2.15 + sunY * 1.45) * (1 - golden * 0.30);
      this.hemiLight.intensity = 0.10;
    } else {
      this.sunLight.intensity = Math.max(0.45, this.sunLight.intensity * 1.45);
      this.hemiLight.intensity *= 0.22;
    }

    const day = THREE.MathUtils.smoothstep(sunY, -0.05, 0.45);
    const dusk = (1 - THREE.MathUtils.smoothstep(sunY, 0.12, 0.54)) * THREE.MathUtils.smoothstep(sunY, -0.22, 0.05);
    const input = this.probeInput;
    input.zenith.copy(this.skyUniforms.uZenithColor.value);
    input.horizon.copy(this.skyUniforms.uHorizonColor.value);
    input.sunDir.copy(this.skyUniforms.uSunDir.value);
    input.sunColor.copy(this.sunLight.color);
    input.sunLobe = 0.18 * day + 0.16 * dusk + 0.06;
    // Warm sunlit masonry bounce (with extra golden warmth at dusk, cool blue at night)
    input.bounce.setRGB(0.32 + dusk * 0.10, 0.25 + dusk * 0.02, 0.18 - dusk * 0.03)
      .multiplyScalar(0.32 + day * 0.96);
    input.gain = 0.85 + day * 1.25;

    const key = `${input.zenith.getHexString()}${input.horizon.getHexString()}${input.sunDir.x.toFixed(2)}${input.sunDir.y.toFixed(2)}${input.gain.toFixed(2)}`;
    if (key !== this.lastProbeKey) {
      this.cityProbe.update(input, true);
      this.lastProbeKey = key;
    }
  }

  static formatTime(timeOfDay: number): string {
    const h = Math.floor(timeOfDay) % 24;
    const m = Math.floor((timeOfDay - Math.floor(timeOfDay)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
