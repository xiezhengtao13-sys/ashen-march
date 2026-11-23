import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MaterialLibrary } from '../../src/engine/MaterialLibrary';
import { QUALITY_CONFIGS, QualityManager } from '../../src/engine/QualityManager';

describe('Visual Overhaul PBR MaterialLibrary & QualityManager', () => {
  it('generates procedural PBR albedo, normal, and roughness maps cleanly', () => {
    const lib = new MaterialLibrary();
    expect(lib.terrain.map).toBeInstanceOf(THREE.DataTexture);
    expect(lib.terrain.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(lib.cobblestone.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(lib.roofShingles.normalMap).toBeDefined();
    expect(lib.water.normalMap).toBeDefined();
    expect(lib.dungeonFloor.roughnessMap).toBeDefined();
  });

  it('tracks quality presets and frame telemetry accurately', () => {
    const qm = new QualityManager();
    expect(qm.getPreset()).toBe('high');
    expect(QUALITY_CONFIGS.low.vegetationDensity).toBeLessThan(QUALITY_CONFIGS.high.vegetationDensity);
    expect(QUALITY_CONFIGS.low.shadowMapSize).toBeLessThan(QUALITY_CONFIGS.high.shadowMapSize);

    for (let i = 0; i < 40; i++) {
      qm.recordFrame(1 / 60);
    }
    const fakeRenderer = {
      info: {
        render: { calls: 95, triangles: 42000 },
        memory: { geometries: 48, textures: 24 },
      },
    } as unknown as THREE.WebGLRenderer;

    const tel = qm.getTelemetry(fakeRenderer);
    expect(tel.fps).toBe(60);
    expect(tel.drawCalls).toBe(95);
    expect(tel.triangles).toBe(42000);
  });
});
