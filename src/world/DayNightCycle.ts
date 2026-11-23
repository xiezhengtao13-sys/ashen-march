import * as THREE from 'three';
import type { GameState } from '../core/GameState';

export class DayNightCycle {
  private readonly scene: THREE.Scene;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;

  private readonly daySky = new THREE.Color(0x8bb0d1);
  private readonly sunsetSky = new THREE.Color(0xc97b54);
  private readonly nightSky = new THREE.Color(0x131a2c);
  private readonly cryptBg = new THREE.Color(0x0a0c12);
  private readonly tmpSky = new THREE.Color();

  // 24 game hours in ~12 real minutes
  private readonly hoursPerSecond = 24 / 720;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.hemiLight = new THREE.HemisphereLight(0xdbe8f5, 0x3b3528, 0.75);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 1.35);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 360;
    const d = 140;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
  }

  update(dt: number, state: GameState): void {
    if (!state.isPaused) {
      state.world.timeOfDay = (state.world.timeOfDay + dt * this.hoursPerSecond) % 24;
    }

    if (state.player.currentZone === 'ancient_crypt') {
      this.scene.background = this.cryptBg;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(this.cryptBg);
        this.scene.fog.density = 0.018;
      }
      this.sunLight.intensity = 0.05;
      this.hemiLight.intensity = 0.45;
      return;
    }

    const t = state.world.timeOfDay;
    // Solar elevation angle: 6h=0, 12h=PI/2, 18h=PI, 24h=-PI/2
    const solarAngle = ((t - 6) / 24) * Math.PI * 2;
    const sunY = Math.sin(solarAngle);
    const sunX = Math.cos(solarAngle);

    this.sunLight.position.set(sunX * 140, Math.max(15, sunY * 140), 55);

    if (sunY > 0.22) {
      // Clear daylight
      this.tmpSky.copy(this.daySky);
      this.sunLight.color.setHex(0xfff1d6);
      this.sunLight.intensity = 0.7 + sunY * 0.85;
      this.hemiLight.intensity = 0.5 + sunY * 0.35;
    } else if (sunY > -0.15) {
      // Dawn or Dusk
      const k = (sunY + 0.15) / 0.37;
      this.tmpSky.copy(this.nightSky).lerp(this.sunsetSky, Math.sin(k * Math.PI * 0.85)).lerp(this.daySky, Math.max(0, k - 0.5) * 1.4);
      this.sunLight.color.setHex(0xff9b5e);
      this.sunLight.intensity = 0.25 + Math.max(0, k) * 0.55;
      this.hemiLight.intensity = 0.3 + Math.max(0, k) * 0.25;
    } else {
      // Moonlit night
      this.tmpSky.copy(this.nightSky);
      this.sunLight.color.setHex(0x7ca6e8);
      this.sunLight.intensity = 0.32;
      this.hemiLight.intensity = 0.28;
    }

    this.scene.background = this.tmpSky.clone();
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.tmpSky);
      this.scene.fog.density = 0.0058;
    }
  }

  static formatTime(timeOfDay: number): string {
    const h = Math.floor(timeOfDay) % 24;
    const m = Math.floor((timeOfDay - Math.floor(timeOfDay)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
