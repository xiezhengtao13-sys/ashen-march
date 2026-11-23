import 'fake-indexeddb/auto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/GameState';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld';
import { InventorySystem } from '../../src/inventory/InventorySystem';
import { QuestSystem } from '../../src/quests/QuestSystem';
import {
  applySavePayloadToState,
  CURRENT_SAVE_SCHEMA_VERSION,
  migrateSavePayload,
  SaveSystem,
} from '../../src/save/SaveSystem';
import { buildAncientCrypt } from '../../src/world/DungeonBuilder';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';
import { WorldSpawner } from '../../src/world/WorldSpawner';

describe('Stage 4 Ancient Crypt Dungeon & IndexedDB Save/Load', () => {
  it('builds Ancient Crypt physics floor/walls and enforces boss lock on Relic Chest', async () => {
    const physics = new PhysicsWorld();
    await physics.init({ x: 0, y: -499.5, z: -4 });

    const state = new GameState();
    const inventory = new InventorySystem(state);
    const registry = new InteractableRegistry();
    const overworldGroup = new THREE.Group();
    const cryptGroup = new THREE.Group();

    let exited = false;
    buildAncientCrypt(cryptGroup, physics, registry, {
      onExitCrypt: () => {
        exited = true;
      },
    });

    const spawner = new WorldSpawner(state, inventory, registry);
    spawner.spawnConfiguredProps(overworldGroup, cryptGroup);

    // Player settles on dungeon floor y = -500.0
    let pos = physics.getPlayerFeetPosition();
    for (let i = 0; i < 40; i++) {
      pos = physics.movePlayer({ x: 0, y: 0, z: 0 }, false, 1 / 60).position;
    }
    expect(pos.y).toBeCloseTo(-500.0, 0.3);

    // Exit portal triggers cleanly
    registry.get('portal:crypt_exit')?.onInteract();
    expect(exited).toBe(true);

    // Relic chest refuses to open before Crypt Guardian is defeated
    const relicChest = registry.get('chest:crypt_relic_chest');
    expect(relicChest).toBeDefined();
    relicChest?.onInteract();
    expect(state.isChestOpened('crypt_relic_chest')).toBe(false);
    expect(inventory.hasItem('watchers_relic', 1)).toBe(false);

    // Defeat Crypt Guardian -> chest unlocks and awards Watcher's Relic
    state.markEnemyDefeated('enemy_crypt_guardian');
    relicChest?.onInteract();
    expect(state.isChestOpened('crypt_relic_chest')).toBe(true);
    expect(inventory.hasItem('watchers_relic', 1)).toBe(true);

    physics.dispose();
  });

  it('saves and restores full GameState via IndexedDB and syncs world state', async () => {
    const stateA = new GameState();
    const invA = new InventorySystem(stateA);
    const questsA = new QuestSystem(stateA, invA);

    stateA.player.position = { x: 2.5, y: -500, z: -30 };
    stateA.player.yaw = 1.25;
    stateA.player.currentZone = 'ancient_crypt';
    stateA.player.currentRegion = 'ancient_crypt';
    stateA.player.stats.gold = 345;
    stateA.player.stats.level = 3;
    stateA.world.timeOfDay = 18.75;
    stateA.setFlag('ending_guardian', false);
    stateA.setFlag('entered_crypt', true);
    stateA.markChestOpened('chest_elder_house');
    stateA.markPickupCollected('pickup_watchers_journal');
    stateA.markEnemyDefeated('enemy_skeleton_1');
    stateA.markLocationDiscovered('ruined_watchtower', '废弃哨塔');

    invA.addItem('hunters_saber', 1);
    invA.equipItem('hunters_saber');
    questsA.startQuest('main_lost_watchers');
    invA.addItem('watchers_journal', 1);

    const saveSystem = new SaveSystem();
    const saved = await saveSystem.saveSlot('slot_1', stateA, '古代墓穴');
    expect(saved.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);

    const slots = await saveSystem.listSlots();
    expect(slots.some((s) => s.slotId === 'slot_1')).toBe(true);

    const loaded = await saveSystem.loadSlot('slot_1');
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    const stateB = new GameState();
    applySavePayloadToState(loaded, stateB);

    expect(stateB.player.currentZone).toBe('ancient_crypt');
    expect(stateB.player.position.z).toBeCloseTo(-30);
    expect(stateB.player.yaw).toBeCloseTo(1.25);
    expect(stateB.player.stats.gold).toBe(345);
    expect(stateB.player.stats.level).toBe(3);
    expect(stateB.equipped.weapon).toBe('hunters_saber');
    expect(stateB.quests.main_lost_watchers?.currentStageId).toBe('explore_crypt');
    expect(stateB.hasFlag('entered_crypt')).toBe(true);
    expect(stateB.isChestOpened('chest_elder_house')).toBe(true);
    expect(stateB.isPickupCollected('pickup_watchers_journal')).toBe(true);
    expect(stateB.isEnemyDefeated('enemy_skeleton_1')).toBe(true);
    expect(stateB.world.discoveredLocations).toContain('ruined_watchtower');
    expect(stateB.world.timeOfDay).toBeCloseTo(18.75);

    // Verify spawner sync disables already-opened chest & collected pickup
    const registry = new InteractableRegistry();
    const spawner = new WorldSpawner(stateB, new InventorySystem(stateB), registry);
    spawner.spawnConfiguredProps(new THREE.Group(), new THREE.Group());
    spawner.syncFromState();
    expect(registry.get('chest:chest_elder_house')?.enabled).toBe(false);
    expect(registry.get('pickup:pickup_watchers_journal')?.enabled).toBe(false);
  });

  it('migrates legacy v1 save payloads to v2 schema cleanly', async () => {
    const saveSystem = new SaveSystem();
    await saveSystem.putRawSlotForMigrationTest({
      schemaVersion: 1,
      slotId: 'legacy_v1',
      timestamp: 1700000000000,
      player: {
        position: { x: 10, y: 4, z: 35 },
        stats: { hp: 90, maxHp: 120, level: 2, gold: 111 },
      },
      inventory: [{ itemId: 'iron_sword', quantity: 1 }],
      worldState: {
        storyFlags: { legacy_flag: true },
        openedChestIds: ['chest_elder_house'],
      },
    });

    const migrated = await saveSystem.loadSlot('legacy_v1');
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.player.stats.gold).toBe(111);
    expect(migrated?.player.stats.bonusDefense).toBe(0);
    expect(migrated?.world.storyFlags.legacy_flag).toBe(true);
    expect(migrated?.world.timeOfDay).toBe(9.5);

    expect(() => migrateSavePayload({ schemaVersion: 99 })).toThrow();
  });
});
