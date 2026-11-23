import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EnemySystem } from '../../src/ai/EnemyAI';
import { CombatSystem } from '../../src/combat/CombatSystem';
import { GameState } from '../../src/core/GameState';
import { InventorySystem } from '../../src/inventory/InventorySystem';

describe('Stage 2 Combat, Magic, Enemy AI & Inventory', () => {
  it('handles inventory stacking, equipping, potions, dropping, and XP leveling', () => {
    const state = new GameState();
    const dropSpy = vi.fn();
    const inventory = new InventorySystem(state, dropSpy);

    const initialStats = inventory.getComputedStats();
    // Base ATK 10 + iron_sword(8) = 18; Base DEF 2 + traveler_tunic(4) = 6
    expect(initialStats.attack).toBe(18);
    expect(initialStats.defense).toBe(6);

    // Equip better weapon + accessory
    inventory.addItem('watchers_runeblade', 1);
    inventory.addItem('ashen_amulet', 1);
    expect(inventory.equipItem('watchers_runeblade')).toBe(true);
    expect(inventory.equipItem('ashen_amulet')).toBe(true);

    const boosted = inventory.getComputedStats();
    // Base ATK 10 + runeblade(22) = 32; Base MAG 10 + runeblade(6) + amulet(8) = 24; MaxMP 60 + 20 = 80
    expect(boosted.attack).toBe(32);
    expect(boosted.magic).toBe(24);
    expect(boosted.maxMp).toBe(80);

    // Use healing potion
    state.player.stats.hp = 50;
    expect(inventory.useItem('minor_health_potion')).toBe(true);
    expect(state.player.stats.hp).toBe(95);
    expect(inventory.getCount('minor_health_potion')).toBe(1);

    // Drop item triggers callback and removes 1 unit
    expect(inventory.dropItem('minor_health_potion')).toBe(true);
    expect(dropSpy).toHaveBeenCalledTimes(1);
    expect(inventory.getCount('minor_health_potion')).toBe(0);

    // Level up via XP
    const leveled = inventory.addXp(120);
    expect(leveled).toBe(true);
    expect(state.player.stats.level).toBe(2);
    expect(state.player.stats.maxHp).toBe(138);
  });

  it('transitions EnemyAI states (IDLE -> DETECT -> CHASE -> ATTACK -> HURT -> DEAD) and handles combat', () => {
    const state = new GameState();
    const inventory = new InventorySystem(state);
    const enemySystem = new EnemySystem(state, inventory);

    const overworldGroup = new THREE.Group();
    const cryptGroup = new THREE.Group();
    const scene = new THREE.Scene();
    scene.add(overworldGroup, cryptGroup);

    enemySystem.spawnAll(overworldGroup, cryptGroup);
    const goblin = enemySystem.enemies.find((e) => e.id === 'enemy_goblin_1');
    expect(goblin).toBeDefined();
    if (!goblin) return;

    const combat = new CombatSystem(state, inventory, enemySystem, scene, null);
    const killedSpy = vi.fn();
    state.events.on('enemy:killed', killedSpy);

    // Initially IDLE
    expect(goblin.aiState).toBe('IDLE');

    // Place player within detectRange (10m away) -> DETECT -> CHASE
    const farPlayer = { x: goblin.position.x, y: goblin.position.y, z: goblin.position.z + 10 };
    enemySystem.update(0.1, farPlayer, 'overworld', false, () => {});
    expect(goblin.aiState).toBe('DETECT');

    enemySystem.update(0.4, farPlayer, 'overworld', false, () => {});
    expect(goblin.aiState).toBe('CHASE');

    // Place player within melee range (1.8m away) -> ATTACK
    const nearPlayer = { x: goblin.position.x, y: goblin.position.y, z: goblin.position.z + 1.8 };
    const playerHitSpy = vi.fn((e) => combat.applyDamageToPlayer(e.damage, e.enemyName));
    enemySystem.update(0.1, nearPlayer, 'overworld', false, playerHitSpy);
    expect(goblin.aiState).toBe('ATTACK');

    enemySystem.update(0.1, nearPlayer, 'overworld', false, playerHitSpy);
    expect(playerHitSpy).toHaveBeenCalledTimes(1);
    expect(state.player.stats.hp).toBeLessThan(120);

    // Player swings melee sword facing goblin (toward -Z)
    const eyePos = { x: nearPlayer.x, y: nearPlayer.y + 1.65, z: nearPlayer.z };
    const hits = combat.performMeleeAttack(eyePos, { x: 0, y: -0.2, z: -1 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(goblin.hp).toBeLessThan(goblin.maxHp);
    expect(goblin.aiState).toBe('HURT');

    // Fireball spell costs 15 MP and strikes goblin in flight
    const mpBefore = state.player.stats.mp;
    const castOk = combat.castFireball(eyePos, { x: 0, y: -0.2, z: -1 });
    expect(castOk).toBe(true);
    expect(state.player.stats.mp).toBe(mpBefore - CombatSystem.FIREBALL_COST);

    for (let i = 0; i < 10; i++) {
      combat.update(0.03);
    }

    // Finish off goblin if still alive
    if (goblin.hp > 0) {
      enemySystem.damageEnemy(goblin, goblin.hp + 50);
    }
    expect(goblin.aiState).toBe('DEAD');
    expect(killedSpy).toHaveBeenCalledTimes(1);

    // Test player death & respawn
    combat.applyDamageToPlayer(999, '测试哥布林');
    expect(state.isDead).toBe(true);
    combat.respawnPlayer();
    expect(state.isDead).toBe(false);
    expect(state.player.position.x).toBe(0);
    expect(state.player.position.z).toBe(58);
    expect(state.player.stats.hp).toBeGreaterThan(0);
  });
});
