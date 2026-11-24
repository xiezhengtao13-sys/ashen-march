import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { QualityManager } from '../../src/engine/QualityManager';
import { CityMaterialLibrary } from '../../src/world/city/CityMaterialLibrary';
import { buildAshenholdCity } from '../../src/world/city/CityPhase1Builder';
import { CityPostFX } from '../../src/world/city/CityPostFX';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

describe('Ashenhold V4 Visual Polish: Packed ORM, 3-Pass Telemetry, Pipeline Stages & Sub-Level Culling', () => {
  it('binds full Packed ORM channels (aoMap + roughnessMap + metalnessMap) and physical dielectric vs forged-iron metalness', () => {
    const mats = new CityMaterialLibrary(8);

    for (const stoneOrWood of [
      'limestone_weathered',
      'citadel_masonry',
      'damp_slate_stone',
      'aged_oak_timber',
      'broken_flagstone',
      'mountain_crag_rock',
    ]) {
      const m = mats.getMaterial(stoneOrWood, true);
      expect(m.aoMap).toBeDefined();
      expect(m.roughnessMap).toBeDefined();
      expect(m.metalnessMap).toBeDefined();
      expect(m.aoMap).toBe(m.roughnessMap);
      expect(m.roughnessMap).toBe(m.metalnessMap);
      expect(m.metalness).toBe(0.0);
    }

    const iron = mats.getMaterial('iron_forged', true);
    expect(iron.aoMap).toBeDefined();
    expect(iron.roughnessMap).toBeDefined();
    expect(iron.metalnessMap).toBeDefined();
    expect(iron.metalness).toBe(1.0);

    mats.dispose();
  });

  it('supports 4-stage render pipeline toggles (Raw -> Tonemap -> Tonemap+FXAA -> Final) with subtle sharpening and dither', () => {
    const post = new CityPostFX();
    expect(post.options.tonemap).toBe(true);
    expect(post.options.fxaa).toBe(true);
    expect(post.options.sharpen).toBe(true);
    expect(post.options.grain).toBe(true);
    expect(post.options.sharpenStrength).toBeLessThanOrEqual(0.25);
    expect(post.options.grainStrength).toBeLessThanOrEqual(0.005);

    post.options.tonemap = false;
    post.options.fxaa = false;
    post.options.sharpen = false;
    post.options.grain = false;
    expect(post.options.tonemap).toBe(false);
    post.dispose();
  });

  it('records separated Main Pass, Shadow Pass, and Post-FX Pass draw calls & triangles with backend attribution', () => {
    const qm = new QualityManager();
    qm.recordPassBreakdown(
      { drawCalls: 86, triangles: 142000 },
      { drawCalls: 184, triangles: 245000 },
      { drawCalls: 1, triangles: 2 },
    );

    const fakeRenderer = {
      getContext: () => ({
        RENDERER: 0x1f01,
        getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
        getParameter: () => 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
      }),
      info: {
        render: { calls: 184, triangles: 245000 },
        memory: { geometries: 210, textures: 56 },
      },
    } as unknown as THREE.WebGLRenderer;

    const tel = qm.getTelemetry(fakeRenderer);
    expect(tel.rendererBackend).toBe('SwiftShader (CPU Software)');
    expect(tel.mainPass).toEqual({ drawCalls: 184, triangles: 245000 });
    expect(tel.shadowPass).toEqual({ drawCalls: 86, triangles: 142000 });
    expect(tel.postPass).toEqual({ drawCalls: 1, triangles: 2 });
    expect(tel.total).toEqual({ drawCalls: 271, triangles: 387002 });
  });

  it('culls the -4m Undercroft sub-level on the surface away from portals and reveals it near stairwells or underground', async () => {
    const physics = new PhysicsWorld();
    await physics.init({ x: 0, y: 0.45, z: 18.4 });
    const registry = new InteractableRegistry();
    const cityGroup = new THREE.Group();
    const built = await buildAshenholdCity(
      cityGroup,
      physics,
      registry,
      { onExitCity: () => {}, onLoreRead: () => {} },
      { skipAssetFetch: true },
    );

    const undercroftZone = cityGroup.getObjectByName('CityZone_UndercroftSublevel');
    expect(undercroftZone).toBeDefined();

    // Culled at South Gate (z = 16.2) and central Market Fountain (z = -24.5)
    built.update(1.0, 1 / 60, 13.0, { x: 0.0, y: 0.45, z: 16.2 });
    expect(undercroftZone!.visible).toBe(false);

    built.update(1.1, 1 / 60, 13.0, { x: 0.0, y: 3.85, z: -24.5 });
    expect(undercroftZone!.visible).toBe(false);

    // Visible at South Stairwell portal (-4.2, 1.35, -7.5) and deep inside -4m Undercroft (-12.5, -3.6, -18.0)
    built.update(1.2, 1 / 60, 13.0, { x: -4.2, y: 1.35, z: -7.5 });
    expect(undercroftZone!.visible).toBe(true);

    built.update(1.3, 1 / 60, 13.0, { x: -12.5, y: -3.6, z: -18.0 });
    expect(undercroftZone!.visible).toBe(true);

    built.dispose();
    physics.dispose();
  });
});
