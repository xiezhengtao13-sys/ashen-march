import 'fake-indexeddb/auto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/GameState';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { applySavePayloadToState, SaveSystem } from '../../src/save/SaveSystem';
import { getCityGroundHeight, getCityRoadCenterX } from '../../src/world/city/CityGroundBuilder';
import { buildAshenholdCity, getCityRegionAt } from '../../src/world/city/CityPhase1Builder';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

describe('Ashenhold Compact Hillside — Tier 0 Gatehouse, S-Curved Trade Street & Walkable Interiors', () => {
  it('computes deterministic S-curved Tier 0 street, gutter profile, and upward hillside grade', () => {
    const hCenterGate = getCityGroundHeight(0, 18);
    const hGutterGate = getCityGroundHeight(2.6, 18);
    const hSidewalkGate = getCityGroundHeight(3.6, 18);
    expect(hCenterGate).toBe(getCityGroundHeight(0, 18));
    expect(hCenterGate).toBeGreaterThan(hGutterGate);
    expect(hSidewalkGate).toBeGreaterThan(hGutterGate);

    // S-curve deflects gently off centerline between South Gate and Market Bridge Arch
    expect(Math.abs(getCityRoadCenterX(3.0))).toBeGreaterThan(0.5);
    expect(getCityRoadCenterX(18)).toBe(0);

    // Significant climb from South Gate (0m) -> Market Terrace (+3.5m)
    const hMarket = getCityGroundHeight(0, -35);
    expect(hMarket).toBeGreaterThan(hCenterGate + 3.2);

    expect(getCityRegionAt(0, 15)).toBe('ashenhold_gate');
    expect(getCityRegionAt(0, -2)).toBe('ashenhold_main_street');
  });

  it('builds isolated city physics: passes Gate arch, enters A1 Guardhouse & B1 Warehouse, blocks solid piers', async () => {
    const physics = new PhysicsWorld();
    await physics.init({ x: 0, y: 5, z: 58 });

    const registry = new InteractableRegistry();
    const cityGroup = new THREE.Group();
    let exited = false;

    const built = await buildAshenholdCity(
      cityGroup,
      physics,
      registry,
      {
        onExitCity: () => {
          exited = true;
        },
        onLoreRead: () => {},
      },
      { skipAssetFetch: true },
    );

    physics.setActiveZone('ashenhold_city');
    physics.teleportPlayer({ x: 0, y: 1.5, z: 22.0 });

    // Settle onto cobbled approach outside South Gate
    let pos = physics.getPlayerFeetPosition();
    let grounded = false;
    for (let i = 0; i < 60; i++) {
      const res = physics.movePlayer({ x: 0, y: 0, z: 0 }, false, 1 / 60);
      pos = res.position;
      grounded = res.grounded;
    }
    expect(grounded).toBe(true);
    expect(pos.y).toBeCloseTo(getCityGroundHeight(0, 22.0), 0.25);

    // 1. Walk straight north through South Gatehouse arched tunnel (z = 18.5 -> z < 9.5)
    physics.teleportPlayer({ x: 0, y: 0.3, z: 18.5 });
    for (let i = 0; i < 90; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.12 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeLessThan(9.5);

    // 2. Solid Gatehouse pier at x = -3.7 blocks movement toward z = 14
    physics.teleportPlayer({ x: -3.7, y: 0.3, z: 19.0 });
    for (let i = 0; i < 40; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.15 }, false, 1 / 60).position;
    }
    expect(pos.z).toBeGreaterThan(17.1);

    // 3. Walk inside A1 Guardhouse open arched doorway (x = -3.2 -> < -6.2 at z = 5.5)
    physics.teleportPlayer({ x: -3.2, y: 0.85, z: 5.5 });
    for (let i = 0; i < 50; i++) {
      pos = physics.movePlayer({ x: -0.1, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeLessThan(-6.2);

    // 4. Walk inside B1 Caravan Warehouse flung-open barn doors (x = -4.2 -> < -7.5 at z = -4.5)
    physics.teleportPlayer({ x: -4.2, y: 1.78, z: -4.5 });
    for (let i = 0; i < 50; i++) {
      pos = physics.movePlayer({ x: -0.1, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeLessThan(-7.5);

    // 5. Portal exit callback works
    registry.get('portal:city_exit')?.onInteract();
    expect(exited).toBe(true);

    built.dispose();
    physics.dispose();
  });

  it('persists and restores ashenhold_city zone & region in IndexedDB SaveSystem', async () => {
    const stateA = new GameState();
    stateA.player.currentZone = 'ashenhold_city';
    stateA.player.currentRegion = 'ashenhold_main_street';
    stateA.player.position = { x: -1.5, y: 0.85, z: -6.0 };
    stateA.player.yaw = 0.42;
    stateA.markLocationDiscovered('ashenhold_gate', '灰烬城 · 南城门');

    const saveSystem = new SaveSystem();
    await saveSystem.saveSlot('city_slot', stateA, '灰烬城 · 城门贸易街');
    const loaded = await saveSystem.loadSlot('city_slot');
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    const stateB = new GameState();
    applySavePayloadToState(loaded, stateB);
    expect(stateB.player.currentZone).toBe('ashenhold_city');
    expect(stateB.player.currentRegion).toBe('ashenhold_main_street');
    expect(stateB.player.position.z).toBeCloseTo(-6.0);
    expect(stateB.world.discoveredLocations).toContain('ashenhold_gate');
  });
});
