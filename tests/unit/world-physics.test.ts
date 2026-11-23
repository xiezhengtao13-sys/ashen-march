import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';
import { buildTerrainMesh, getRegionAt, getTerrainHeight } from '../../src/world/TerrainGenerator';
import { buildOverworld } from '../../src/world/WorldBuilder';

describe('Stage 1 World, Terrain & Rapier Physics', () => {
  it('generates deterministic terrain heights and region zones', () => {
    const h1 = getTerrainHeight(0, 58);
    const h2 = getTerrainHeight(0, 58);
    expect(h1).toBe(h2);
    expect(h1).toBeCloseTo(4.0, 0.5);

    expect(getTerrainHeight(105, -65)).toBeCloseTo(14.0, 0.5);
    expect(getTerrainHeight(95, 55)).toBeLessThan(1.2);
    expect(getTerrainHeight(0, -175)).toBeCloseTo(12.0, 0.8);

    expect(getRegionAt(0, 40)).toBe('ravendale_village');
    expect(getRegionAt(-105, -25)).toBe('ashwood_forest');
    expect(getRegionAt(105, -65)).toBe('ruined_watchtower');
    expect(getRegionAt(0, -175)).toBe('ancient_crypt');
    expect(getRegionAt(95, 75)).toBe('river_valley');
  });

  it('settles player onto terrain under gravity, blocks walls, and passes open doorway', async () => {
    const physics = new PhysicsWorld();
    await physics.init({ x: 0, y: 8.5, z: 58 });

    const registry = new InteractableRegistry();
    const group = new THREE.Group();

    buildOverworld(group, physics, registry, {
      onEnterCrypt: () => {},
      onLoreRead: () => {},
    });

    // Step gravity for ~1.2s so player settles on Ravendale plateau (~4.0m)
    let grounded = false;
    let pos = physics.getPlayerFeetPosition();
    for (let i = 0; i < 60; i++) {
      const res = physics.movePlayer({ x: 0, y: 0, z: 0 }, false, 1 / 60);
      pos = res.position;
      grounded = res.grounded;
    }
    expect(grounded).toBe(true);
    expect(pos.y).toBeCloseTo(4.0, 0.35);

    // Teleport right in front of Elder's Longhouse back solid wall (z = 13.5, walking toward z = 12)
    physics.teleportPlayer({ x: 0, y: 4.1, z: 13.5 });
    for (let i = 0; i < 30; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.15 }, false, 1 / 60).position;
    }
    // Back wall is at z=12 (thickness 0.5 => z=12.25) + player radius 0.38 => stopped > 12.5
    expect(pos.z).toBeGreaterThan(12.4);

    // Teleport outside Elder's Longhouse doorway (x = 0, z = 25.5) and walk inside through doorway (z = 24)
    physics.teleportPlayer({ x: 0, y: 4.1, z: 25.5 });
    for (let i = 0; i < 45; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: -0.1 }, false, 1 / 60).position;
    }
    // Player should pass cleanly inside the building past z = 23.0
    expect(pos.z).toBeLessThan(23.0);

    physics.dispose();
  });

  it('builds terrain geometry cleanly and selects closest interactable', () => {
    const terrain = buildTerrainMesh();
    expect(terrain.vertices.length).toBeGreaterThan(1000);
    expect(terrain.indices.length).toBeGreaterThan(1000);

    const registry = new InteractableRegistry();
    registry.register({
      id: 'test_npc',
      kind: 'npc',
      label: '村长',
      zone: 'overworld',
      position: { x: 0, y: 4, z: 31 },
      radius: 3.5,
      enabled: true,
      onInteract: () => {},
    });

    const hit = registry.findBestInteractable(
      { x: 0, y: 5.65, z: 33.5 },
      { x: 0, y: -0.1, z: -1 },
      'overworld',
    );
    expect(hit?.id).toBe('test_npc');
  });
});
