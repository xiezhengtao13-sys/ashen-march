import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import cityLayout from '../../src/data/cityLayout.json';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { getCityGroundHeight } from '../../src/world/city/CityGroundBuilder';
import { buildAshenholdCity, getCityRegionAt } from '../../src/world/city/CityPhase1Builder';
import { CITY_ROAD_SEGMENTS } from '../../src/world/city/CityRoadNetwork';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

describe('Ashenhold Phase 2: 200x240m Layout, Dual Routes, Central Market & Barriers', () => {
  it('defines >= 10 distinct market stalls, multiple district routes, and explicit closed/decorative flags', () => {
    const stalls = cityLayout.architecture.filter((a) => a.model.startsWith('stall_'));
    expect(stalls.length).toBeGreaterThanOrEqual(10);
    expect(new Set(stalls.map((s) => s.model)).size).toBe(stalls.length);

    const closed = cityLayout.architecture.filter((a) => a.tier === 'landmark_closed');
    const decorative = cityLayout.architecture.filter((a) => a.tier === 'decorative');
    expect(closed.some((a) => a.model === 'castle_barbican_gate.glb')).toBe(true);
    expect(closed.some((a) => a.model === 'castle_citadel_keep.glb')).toBe(true);
    expect(decorative.length).toBeGreaterThanOrEqual(4);

    // Every road segment remains smoothly traversable without steep cliff jumps
    for (const seg of CITY_ROAD_SEGMENTS) {
      const steps = 12;
      let prevH = getCityGroundHeight(seg.a.x, seg.a.z);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = seg.a.x + (seg.b.x - seg.a.x) * t;
        const z = seg.a.z + (seg.b.z - seg.a.z) * t;
        const h = getCityGroundHeight(x, z);
        const stepLen = Math.hypot((seg.b.x - seg.a.x) / steps, (seg.b.z - seg.a.z) / steps);
        const grade = Math.abs(h - prevH) / Math.max(0.25, stepLen);
        expect(grade).toBeLessThan(0.55);
        prevH = h;
      }
    }

    expect(getCityRegionAt(0, 20)).toBe('ashenhold_gate');
    expect(getCityRegionAt(0, -5)).toBe('ashenhold_main_street');
    expect(getCityRegionAt(4, -74)).toBe('ashenhold_market_plaza');
    expect(getCityRegionAt(-45, -72)).toBe('ashenhold_artisan_quarter');
    expect(getCityRegionAt(52, -55)).toBe('ashenhold_residential_quarter');
    expect(getCityRegionAt(4, -155)).toBe('ashenhold_castle_approach');
  });

  it('allows real Rapier traversal through Market Gate Arch, East Guild Arch & West Alley Arch, and blocks closed Citadel Portcullis', async () => {
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

    // 1. Walk straight north UNDER Market Gate Arch (z = -24 -> z < -37)
    physics.teleportPlayer({ x: 3.3, y: getCityGroundHeight(3.3, -24) + 0.35, z: -24 });
    let pos = physics.getPlayerFeetPosition();
    for (let i = 0; i < 120; i++) {
      pos = physics.movePlayer({ x: 0.015, y: 0, z: -0.13 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeLessThan(-37);

    // 2. Walk east UNDER Guildhouse Cart Arch & Lantern Arch into East Residential District (z = -8.3)
    physics.teleportPlayer({ x: 4.5, y: getCityGroundHeight(4.5, -8.3) + 0.35, z: -8.3 });
    for (let i = 0; i < 150; i++) {
      pos = physics.movePlayer({ x: 0.14, y: 0, z: -0.01 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeGreaterThan(24.0);

    // 3. Walk west UNDER Copperhorn Alley Arch into West Artisan Quarter (z = -21.8)
    physics.teleportPlayer({ x: -8.5, y: getCityGroundHeight(-8.5, -21.8) + 0.35, z: -21.8 });
    for (let i = 0; i < 110; i++) {
      pos = physics.movePlayer({ x: -0.13, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeLessThan(-20.0);

    // 4. Closed Citadel Barbican Portcullis at z = -173 physically blocks passage
    physics.teleportPlayer({ x: 4.0, y: getCityGroundHeight(4.0, -166) + 0.35, z: -166 });
    for (let i = 0; i < 80; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.15 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeGreaterThan(-170.5);

    expect(registry.get('lore:city_castle_decree')).toBeDefined();
    expect(registry.get('lore:city_phase2_notice')).toBeDefined();

    built.dispose();
    physics.dispose();
  });
});
