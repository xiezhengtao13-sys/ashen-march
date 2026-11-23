import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import cityLayout from '../../src/data/cityLayout.json';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { getCityGroundHeight } from '../../src/world/city/CityGroundBuilder';
import { buildAshenholdCity, getCityRegionAt } from '../../src/world/city/CityPhase1Builder';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

describe('Ashenhold Compact Hillside Phase 2: 5-Tier Elevation, 2-Story Tavern, Apothecary Interior & Overlook Stairs', () => {
  it('enforces 5-tier hillside elevation progression (0m -> 3.5m -> 7.5m -> 12.2m -> 18m -> 21m) and compact bounds', () => {
    const yGate = getCityGroundHeight(0, 16);
    const yMarket = getCityGroundHeight(0, -30);
    const yOverlook = getCityGroundHeight(0, -58);
    const yWestWing = getCityGroundHeight(-35, -45);
    const yEastWing = getCityGroundHeight(35, -45);
    const yAcropolis = getCityGroundHeight(0, -85);
    const yForecourt = getCityGroundHeight(0, -112);
    const yKeep = getCityGroundHeight(0, -132);

    expect(yGate).toBeCloseTo(0.0, 0.25);
    expect(yMarket).toBeCloseTo(3.5, 0.25);
    expect(yOverlook).toBeCloseTo(7.5, 0.25);
    expect(yWestWing).toBeCloseTo(7.0, 0.35);
    expect(yEastWing).toBeCloseTo(7.5, 0.35);
    expect(yAcropolis).toBeCloseTo(12.2, 0.35);
    expect(yForecourt).toBeCloseTo(18.0, 0.35);
    expect(yKeep).toBeCloseTo(21.0, 0.35);

    // Compact 104x144m bounds & interior packs present
    expect(cityLayout.bounds.explorable.maxX - cityLayout.bounds.explorable.minX).toBeLessThanOrEqual(110);
    expect(cityLayout.bounds.explorable.maxZ - cityLayout.bounds.explorable.minZ).toBeLessThanOrEqual(155);

    const interiorPacks = cityLayout.architecture.filter((a) => (a as { isInterior?: boolean }).isInterior);
    expect(interiorPacks.length).toBeGreaterThanOrEqual(2);

    const stalls = cityLayout.architecture.filter((a) => a.model.startsWith('stall_'));
    expect(stalls.length).toBeGreaterThanOrEqual(6);

    expect(getCityRegionAt(0, 15)).toBe('ashenhold_gate');
    expect(getCityRegionAt(0, -2)).toBe('ashenhold_main_street');
    expect(getCityRegionAt(0, -35)).toBe('ashenhold_market_plaza');
    expect(getCityRegionAt(-35, -45)).toBe('ashenhold_artisan_quarter');
    expect(getCityRegionAt(35, -45)).toBe('ashenhold_residential_quarter');
    expect(getCityRegionAt(0, -85)).toBe('ashenhold_temple_acropolis');
    expect(getCityRegionAt(0, -114)).toBe('ashenhold_castle_approach');
  });

  it('traverses Market Bridge Arch, enters A2 2-Story Tavern & climbs oak stairs to 2F balcony, enters A3 Apothecary, and climbs 4.2m North Retaining Wall Stairs to +7.5m Overlook', async () => {
    const physics = new PhysicsWorld();
    await physics.init({ x: 0, y: 5, z: 58 });

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
    let pos = physics.getPlayerFeetPosition();

    // 1. Enter A2 Double-Story Tavern 1F through front doorway (x = 4.0 -> > 7.5 at z = -4.0)
    physics.teleportPlayer({ x: 4.0, y: 1.82, z: -4.0 });
    for (let i = 0; i < 60; i++) {
      pos = physics.movePlayer({ x: 0.1, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeGreaterThan(7.5);

    // 2. Climb A2 Tavern interior oak staircase smoothly from 1F (y~1.6) up to 2nd Floor Gallery (y >= 4.9)!
    //    With yaw = -PI/2, local +X climbs along world +Z at x = 11.75 from z = -7.0 -> z = -1.2
    physics.teleportPlayer({ x: 11.75, y: 1.82, z: -6.9 });
    for (let i = 0; i < 95; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: 0.085 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeGreaterThan(-1.8);
    expect(pos.y).toBeGreaterThan(4.8);

    // 3. Climb Gateward Grand Steps UNDER Market Covered Bridge-Arch (z = -10.5 -> z < -21, y rises to ~3.5m)
    physics.teleportPlayer({ x: 0.0, y: getCityGroundHeight(0, -10.5) + 0.35, z: -10.5 });
    for (let i = 0; i < 120; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.12 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeLessThan(-21.0);
    expect(pos.y).toBeGreaterThan(3.25);

    // 4. Enter A3 Iron Anchor Apothecary interior through open front stone arch (x = -10.4 -> < -13.4 at z = -28.0)
    physics.teleportPlayer({ x: -10.4, y: 3.75, z: -28.0 });
    for (let i = 0; i < 50; i++) {
      pos = physics.movePlayer({ x: -0.1, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeLessThan(-13.4);

    // 5. Climb the 4.2m North Retaining Wall West Grand Staircase smoothly from Market (+3.5m) to +7.5m Overlook!
    //    West stair lies at z = -49.75 climbing along +X from x = -12.0 -> x = -2.5
    physics.teleportPlayer({ x: -12.2, y: 3.85, z: -49.75 });
    for (let i = 0; i < 130; i++) {
      pos = physics.movePlayer({ x: 0.095, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeGreaterThan(-3.5);
    expect(pos.y).toBeGreaterThan(7.25);

    // 6. Phase 4 North Barricade at z = -61.8 blocks premature passage off the +7.5m Overlook
    physics.teleportPlayer({ x: 0.0, y: 7.85, z: -59.0 });
    for (let i = 0; i < 60; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.14 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeGreaterThan(-61.6);

    // Data-driven lore interactables registered
    expect(registry.get('lore:city_guardhouse_log')).toBeDefined();
    expect(registry.get('lore:city_tavern_ledger')).toBeDefined();
    expect(registry.get('lore:city_apothecary_notes')).toBeDefined();
    expect(registry.get('lore:city_warehouse_manifest')).toBeDefined();
    expect(registry.get('lore:city_overlook_banner_sign')).toBeDefined();

    built.dispose();
    physics.dispose();
  });
});
