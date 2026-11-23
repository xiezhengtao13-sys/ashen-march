import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import cityLayout from '../../src/data/cityLayout.json';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { getCityGroundHeight } from '../../src/world/city/CityGroundBuilder';
import { CityMaterialLibrary } from '../../src/world/city/CityMaterialLibrary';
import { buildAshenholdCity, getCityRegionAt } from '../../src/world/city/CityPhase1Builder';
import { CityPostFX } from '../../src/world/city/CityPostFX';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

/**
 * Walks the Rapier player capsule smoothly toward target (tx, tz) using real movePlayer steps
 * without teleporting, returning final feet position.
 */
function walkToward(
  physics: PhysicsWorld,
  tx: number,
  tz: number,
  maxSteps = 260,
  stepSize = 0.11,
): { x: number; y: number; z: number } {
  let pos = physics.getPlayerFeetPosition();
  for (let i = 0; i < maxSteps; i++) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) break;
    const s = Math.min(stepSize, dist);
    pos = physics.movePlayer({ x: (dx / dist) * s, y: 0, z: (dz / dist) * s }, false, 1 / 60).position;
  }
  return pos;
}

describe('Ashenhold V3 Stormveil Gothic Citadel: 4-Layer Continuous Non-Teleport Verticality & Material Diagnostics', () => {
  it('enforces compact bounds, vertical layer metadata, and V3 PBR diagnostic material modes', () => {
    expect(cityLayout.bounds.explorable.maxX - cityLayout.bounds.explorable.minX).toBeLessThanOrEqual(60);
    expect(cityLayout.bounds.explorable.maxZ - cityLayout.bounds.explorable.minZ).toBeLessThanOrEqual(110);

    const interiorPacks = cityLayout.architecture.filter((a) => (a as { isInterior?: boolean }).isInterior);
    expect(interiorPacks.length).toBeGreaterThanOrEqual(2);

    const stalls = cityLayout.architecture.filter((a) => a.model.startsWith('stall_'));
    expect(stalls.length).toBeGreaterThanOrEqual(6);

    expect(getCityRegionAt(0, 15)).toBe('ashenhold_gate');
    expect(getCityRegionAt(0, -2)).toBe('ashenhold_main_street');
    expect(getCityRegionAt(0, -35)).toBe('ashenhold_market_plaza');

    // Verify all 6 V3 Stormveil PBR materials + live diagnostic modes + PostFX toggleability
    const mats = new CityMaterialLibrary(4);
    for (const key of [
      'limestone_weathered',
      'citadel_masonry',
      'damp_slate_stone',
      'aged_oak_timber',
      'broken_flagstone',
      'mountain_crag_rock',
    ]) {
      expect(mats.getMaterial(key, true)).toBeDefined();
    }
    for (const mode of ['albedo', 'normal', 'roughness', 'no_ao', 'no_post', 'final'] as const) {
      expect(() => mats.setDebugMode(mode)).not.toThrow();
    }
    mats.dispose();

    const postFx = new CityPostFX();
    expect(postFx.options.enabled).toBe(true);
    postFx.options.enabled = false;
    expect(postFx.options.enabled).toBe(false);
    postFx.dispose();
  });

  it('walks continuously WITHOUT teleport across all 4 vertical layers: South Gate (0m) -> Undercroft (-4m) -> Market (+3.5m) -> Overlook (+7.5m) -> Bridge (+9.5m) -> Summit (+19.5m)', async () => {
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

    physics.setActiveZone('ashenhold_city');

    // 1. Start at South Gate Approach (0.0m) and walk continuously North through Gate Arch -> Trade Alley -> South Undercroft Portal
    physics.teleportPlayer({ x: 0.0, y: getCityGroundHeight(0, 18.4) + 0.3, z: 18.4 });
    let pos = walkToward(physics, 0.0, 10.0, 140);
    expect(pos.z).toBeLessThan(11.0);
    pos = walkToward(physics, 0.0, -7.0, 220);
    expect(pos.z).toBeLessThan(-6.0);

    // 2. Descend South Undercroft Stone Stairway continuously into -4.0m Vaulted Stone Cistern! (ZERO TELEPORT)
    pos = walkToward(physics, -3.2, -7.0, 80);
    pos = walkToward(physics, -12.3, -7.0, 180);
    expect(pos.x).toBeLessThan(-11.0);
    expect(pos.y).toBeLessThan(-3.2);

    // 3. Walk North through the -4.0m Damp Vaulted Cistern -> climb North Undercroft Stairway up into +3.5m Market Plaza!
    pos = walkToward(physics, -12.1, -24.5, 220);
    expect(pos.y).toBeLessThan(-3.2);
    pos = walkToward(physics, -9.3, -37.2, 220);
    expect(pos.z).toBeLessThan(-35.5);
    expect(pos.y).toBeGreaterThan(3.1);

    // 4. Walk across Market Plaza (+3.5m) -> climb Market North Bastion West Switchback Stair to +7.5m Overlook!
    pos = walkToward(physics, -11.6, -46.8, 160);
    pos = walkToward(physics, -11.6, -49.35, 80);
    pos = walkToward(physics, -3.6, -49.35, 160);
    pos = walkToward(physics, -3.6, -53.2, 80);
    expect(pos.y).toBeGreaterThan(7.1);

    // 5. Climb West Rampart Steps (+7.5m -> +9.5m) -> walk South along West Battlement -> cross Overhead Gothic Bridge (+9.5m)!
    pos = walkToward(physics, -13.5, -55.0, 180);
    pos = walkToward(physics, -13.5, -47.5, 140);
    expect(pos.y).toBeGreaterThan(9.1);
    pos = walkToward(physics, -13.5, -14.5, 380);
    pos = walkToward(physics, 0.0, -14.5, 180);
    expect(pos.y).toBeGreaterThan(9.1);
    expect(Math.abs(pos.x)).toBeLessThan(1.0);

    // 6. Return along Bridge -> West Market Rampart -> North Overlook (+7.5m) -> climb Cliffside Outer Stairway Flight 1 & Flight 2 to +19.5m Watchtower Summit!
    pos = walkToward(physics, -13.5, -14.5, 180);
    pos = walkToward(physics, -13.5, -55.0, 440);
    pos = walkToward(physics, 10.6, -55.0, 280);
    pos = walkToward(physics, 10.6, -57.2, 80);
    // Flight 1 (+7.5m -> +13.5m)
    pos = walkToward(physics, -10.8, -57.2, 280);
    expect(pos.y).toBeGreaterThan(13.0);
    // Mid-Cliff Landing -> Flight 2 (+13.5m -> +19.5m)
    pos = walkToward(physics, -10.8, -61.2, 80);
    pos = walkToward(physics, 9.0, -61.2, 280);
    expect(pos.y).toBeGreaterThan(19.0);
    // Step onto +19.5m Citadel Watchtower Summit Platform!
    pos = walkToward(physics, 9.0, -65.0, 90);
    pos = walkToward(physics, 0.0, -65.0, 140);
    expect(pos.y).toBeGreaterThan(19.0);
    expect(pos.z).toBeLessThan(-63.0);

    // Data-driven 4-layer lore points registered
    expect(registry.get('lore:ashenhold_charter')).toBeDefined();
    expect(registry.get('lore:undercroft_journal')).toBeDefined();
    expect(registry.get('lore:tavern_ledger')).toBeDefined();
    expect(registry.get('lore:summit_beacon')).toBeDefined();

    built.dispose();
    physics.dispose();
  });
});
