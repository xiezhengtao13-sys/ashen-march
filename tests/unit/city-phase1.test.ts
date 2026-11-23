import 'fake-indexeddb/auto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/GameState';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { applySavePayloadToState, SaveSystem } from '../../src/save/SaveSystem';
import { getCityGroundHeight, getCityRoadCenterX } from '../../src/world/city/CityGroundBuilder';
import { buildAshenholdCity, getCityRegionAt } from '../../src/world/city/CityPhase1Builder';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

describe('Ashenhold City Phase 1: Gatehouse, Main Street & Isolated Physics', () => {
  it('computes deterministic street cross-section with crowned roadway, gutters, curbs, and upward grade', () => {
    const hCenterGate = getCityGroundHeight(0, 20);
    const hGutterGate = getCityGroundHeight(3.35, 20);
    const hSidewalkGate = getCityGroundHeight(4.5, 20);
    expect(hCenterGate).toBe(getCityGroundHeight(0, 20));
    expect(hCenterGate).toBeGreaterThan(hGutterGate);
    expect(hSidewalkGate).toBeGreaterThan(hGutterGate);

    const hNorthStreet = getCityGroundHeight(getCityRoadCenterX(-20), -20);
    expect(hNorthStreet).toBeGreaterThan(hCenterGate);

    expect(getCityRegionAt(15)).toBe('ashenhold_gate');
    expect(getCityRegionAt(-5)).toBe('ashenhold_main_street');
  });

  it('builds isolated city physics: settles on ground, passes through gate arch & tavern doorway, blocks solid piers', async () => {
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
    physics.teleportPlayer({ x: 0, y: 1.5, z: 25.5 });

    // Settle onto cobbled approach outside South Gate
    let pos = physics.getPlayerFeetPosition();
    let grounded = false;
    for (let i = 0; i < 60; i++) {
      const res = physics.movePlayer({ x: 0, y: 0, z: 0 }, false, 1 / 60);
      pos = res.position;
      grounded = res.grounded;
    }
    expect(grounded).toBe(true);
    expect(pos.y).toBeCloseTo(getCityGroundHeight(0, 25.5), 0.25);

    // 1. Walk straight north through the Gatehouse arched tunnel (z = 18 -> z < 9.5)
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

    // 3. Walk inside Guardhouse open arched doorway (x = -4.2 -> -7.5 at z = 1.5)
    physics.teleportPlayer({ x: -4.2, y: 0.65, z: 1.5 });
    for (let i = 0; i < 45; i++) {
      pos = physics.movePlayer({ x: -0.1, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.x).toBeLessThan(-7.0);

    // 4. Portal exit callback works
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
    await saveSystem.saveSlot('city_slot', stateA, '灰烬城 · 门卫主街');
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
