import type * as THREE from 'three';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface QualityConfig {
  preset: QualityPreset;
  label: string;
  pixelRatioMax: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  vegetationDensity: number;
  drawDistance: number;
  fogMultiplier: number;
  particleMultiplier: number;
  toneExposure: number;
}

export interface PerformanceTelemetry {
  preset: QualityPreset;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export const QUALITY_CONFIGS: Record<QualityPreset, QualityConfig> = {
  low: {
    preset: 'low',
    label: '低 (Low)',
    pixelRatioMax: 1.0,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    vegetationDensity: 0.45,
    drawDistance: 260,
    fogMultiplier: 1.25,
    particleMultiplier: 0.45,
    toneExposure: 1.04,
  },
  medium: {
    preset: 'medium',
    label: '中 (Medium)',
    pixelRatioMax: 1.35,
    shadowMapSize: 1536,
    shadowsEnabled: true,
    vegetationDensity: 0.75,
    drawDistance: 380,
    fogMultiplier: 1.0,
    particleMultiplier: 0.75,
    toneExposure: 1.06,
  },
  high: {
    preset: 'high',
    label: '高 (High)',
    pixelRatioMax: 2.0,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    vegetationDensity: 1.0,
    drawDistance: 500,
    fogMultiplier: 0.88,
    particleMultiplier: 1.0,
    toneExposure: 1.08,
  },
};

export class QualityManager {
  private currentPreset: QualityPreset = 'high';
  private frameCount = 0;
  private accumTime = 0;
  private fps = 60;
  private frameTimeMs = 16.7;

  getPreset(): QualityPreset {
    return this.currentPreset;
  }

  getConfig(): QualityConfig {
    return QUALITY_CONFIGS[this.currentPreset];
  }

  applyPreset(
    preset: QualityPreset,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    sunLight?: THREE.DirectionalLight,
    onVegetationDensity?: (density: number) => void,
  ): QualityConfig {
    this.currentPreset = preset;
    const cfg = QUALITY_CONFIGS[preset];

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    renderer.setPixelRatio(Math.min(dpr, cfg.pixelRatioMax));
    renderer.shadowMap.enabled = cfg.shadowsEnabled;
    renderer.toneMappingExposure = cfg.toneExposure;

    camera.far = cfg.drawDistance;
    camera.updateProjectionMatrix();

    if (sunLight) {
      sunLight.castShadow = cfg.shadowsEnabled;
      if (sunLight.shadow.mapSize.x !== cfg.shadowMapSize) {
        sunLight.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
        if (sunLight.shadow.map) {
          sunLight.shadow.map.dispose();
          sunLight.shadow.map = null;
        }
      }
    }

    onVegetationDensity?.(cfg.vegetationDensity);
    return cfg;
  }

  recordFrame(dt: number): void {
    if (dt <= 0) return;
    this.frameCount++;
    this.accumTime += dt;
    if (this.accumTime >= 0.5) {
      this.fps = Math.round(this.frameCount / this.accumTime);
      this.frameTimeMs = Number(((this.accumTime / this.frameCount) * 1000).toFixed(1));
      this.frameCount = 0;
      this.accumTime = 0;
    }
  }

  getTelemetry(renderer: THREE.WebGLRenderer): PerformanceTelemetry {
    return {
      preset: this.currentPreset,
      fps: this.fps,
      frameTimeMs: this.frameTimeMs,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }
}
