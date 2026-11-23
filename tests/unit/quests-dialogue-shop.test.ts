import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/GameState';
import { DialogueSystem } from '../../src/dialogue/DialogueSystem';
import { InventorySystem } from '../../src/inventory/InventorySystem';
import { NPCSystem } from '../../src/npc/NPCSystem';
import { QuestSystem } from '../../src/quests/QuestSystem';
import { InteractableRegistry } from '../../src/world/InteractableRegistry';

describe('Stage 3 NPCs, Dialogue, Quests & Merchant Shop', () => {
  it('spawns all 3 NPCs and completes main quest with Return Relic ending', () => {
    const state = new GameState();
    const inventory = new InventorySystem(state);
    const quests = new QuestSystem(state, inventory);
    const dialogue = new DialogueSystem(state, quests, inventory);
    const npcs = new NPCSystem();
    const registry = new InteractableRegistry();

    npcs.spawnAll(new THREE.Group(), null, registry, () => {});
    expect(npcs.instances.length).toBe(3);
    expect(registry.get('npc:elder_aldrin')).toBeDefined();
    expect(registry.get('npc:merchant_garrick')).toBeDefined();
    expect(registry.get('npc:hunter_lyra')).toBeDefined();

    // 1. Talk to Elder Aldrin and accept main quest
    const view1 = dialogue.startDialogue('elder_aldrin_dialogue', 'elder_aldrin');
    expect(view1?.speaker).toBe('村长奥尔德林');
    const res1 = dialogue.selectChoice(0);
    expect(res1.nextView?.nodeId).toBe('elder_accepted');
    expect(quests.isStage('main_lost_watchers', 'investigate_watchtower')).toBe(true);
    dialogue.selectChoice(0);

    // 2. Collect Watcher's Journal -> advances to explore_crypt
    inventory.addItem('watchers_journal', 1);
    expect(quests.isStage('main_lost_watchers', 'explore_crypt')).toBe(true);

    // 3. Collect Watcher's Relic -> advances to return_to_elder
    inventory.addItem('watchers_relic', 1);
    expect(quests.isStage('main_lost_watchers', 'return_to_elder')).toBe(true);

    // 4. Return to Elder Aldrin and choose Choice A: Return Relic
    const finaleView = dialogue.startDialogue('elder_aldrin_dialogue', 'elder_aldrin');
    expect(finaleView?.nodeId).toBe('elder_finale');
    expect(finaleView?.choices.length).toBe(2);

    const goldBefore = state.player.stats.gold;
    const endRes = dialogue.selectChoice(0);
    expect(endRes.nextView?.nodeId).toBe('elder_ending_guardian');
    expect(quests.isQuestCompleted('main_lost_watchers')).toBe(true);
    expect(state.hasFlag('ending_guardian')).toBe(true);
    expect(inventory.hasItem('watchers_relic', 1)).toBe(false);
    expect(state.player.stats.gold).toBe(goldBefore + 250);
    expect(state.player.stats.bonusDefense).toBe(5);
  });

  it('supports Keep Relic alternate ending and keeps equippable relic', () => {
    const state = new GameState();
    const inventory = new InventorySystem(state);
    const quests = new QuestSystem(state, inventory);
    const dialogue = new DialogueSystem(state, quests, inventory);

    quests.startQuest('main_lost_watchers');
    inventory.addItem('watchers_journal', 1);
    inventory.addItem('watchers_relic', 1);

    const finaleView = dialogue.startDialogue('elder_aldrin_dialogue', 'elder_aldrin');
    expect(finaleView?.nodeId).toBe('elder_finale');

    // Choice 1: Keep Relic
    const endRes = dialogue.selectChoice(1);
    expect(endRes.nextView?.nodeId).toBe('elder_ending_renegade');
    expect(state.hasFlag('ending_renegade')).toBe(true);
    expect(inventory.hasItem('watchers_relic', 1)).toBe(true);
    expect(inventory.equipItem('watchers_relic')).toBe(true);
    expect(inventory.getComputedStats().magic).toBeGreaterThanOrEqual(25);
  });

  it('completes both side quests and handles merchant shop buy/sell transactions', () => {
    const state = new GameState();
    const inventory = new InventorySystem(state);
    const quests = new QuestSystem(state, inventory);
    const dialogue = new DialogueSystem(state, quests, inventory);

    // Side Quest 1: Hunter Lyra - Kill 3 Goblins
    const lyraView = dialogue.startDialogue('hunter_lyra_dialogue', 'hunter_lyra');
    expect(lyraView?.speaker).toBe('猎人莱拉');
    dialogue.selectChoice(0);
    expect(quests.isStage('side_goblin_menace', 'hunt_goblins')).toBe(true);

    for (let i = 0; i < 3; i++) {
      state.events.emit('enemy:killed', {
        enemyId: `goblin_${i}`,
        archetypeId: 'goblin_raider',
        xp: 35,
        gold: 15,
      });
    }
    expect(quests.isStage('side_goblin_menace', 'report_lyra')).toBe(true);

    const lyraDone = dialogue.startDialogue('hunter_lyra_dialogue', 'hunter_lyra');
    expect(lyraDone?.nodeId).toBe('lyra_complete');
    dialogue.selectChoice(0);
    expect(quests.isQuestCompleted('side_goblin_menace')).toBe(true);
    expect(inventory.hasItem('hunters_saber', 1)).toBe(true);

    // Side Quest 2 & Merchant Shop
    const garrickView = dialogue.startDialogue('merchant_garrick_dialogue', 'merchant_garrick');
    expect(garrickView?.speaker).toBe('铁匠商人葛伦');
    const shopOpenRes = dialogue.selectChoice(0);
    expect(shopOpenRes.openShopNpcId).toBe('merchant_garrick');

    // Buy & Sell
    state.player.stats.gold = 200;
    expect(inventory.buyItem('minor_health_potion')).toBe(true); // costs 20
    expect(state.player.stats.gold).toBe(180);
    inventory.addItem('goblin_totem', 1); // value 22 -> sells for 11
    expect(inventory.sellItem('goblin_totem')).toBe(true);
    expect(state.player.stats.gold).toBe(191);

    // Herb quest acceptance & completion
    dialogue.startDialogue('merchant_garrick_dialogue', 'merchant_garrick');
    dialogue.selectChoice(1); // offer quest
    dialogue.selectChoice(0); // accept quest
    expect(quests.isStage('side_frontier_herbs', 'gather_herbs')).toBe(true);

    inventory.addItem('ashen_herb', 3);
    expect(quests.isStage('side_frontier_herbs', 'deliver_garrick')).toBe(true);

    const deliverView = dialogue.startDialogue('merchant_garrick_dialogue', 'merchant_garrick');
    expect(deliverView?.nodeId).toBe('garrick_deliver');
    dialogue.selectChoice(0);
    expect(quests.isQuestCompleted('side_frontier_herbs')).toBe(true);
    expect(inventory.getCount('ashen_herb')).toBe(0);
    expect(inventory.getCount('greater_health_potion')).toBe(2);
  });
});
