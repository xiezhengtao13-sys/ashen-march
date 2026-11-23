import { EventBus } from './EventBus';
import type {
  EquippedItems,
  GameEvents,
  InventorySlot,
  PlayerStats,
  QuestRuntimeState,
  RegionId,
  Vec3,
  ZoneId,
} from './types';

export interface WorldRuntimeFlags {
  storyFlags: Record<string, boolean>;
  openedChestIds: string[];
  defeatedEnemyIds: string[];
  collectedPickupIds: string[];
  discoveredLocations: RegionId[];
  timeOfDay: number; // 0..24 hours, 9.5 = crisp morning light
}

export interface PlayerRuntimeState {
  position: Vec3;
  yaw: number;
  pitch: number;
  currentZone: ZoneId;
  currentRegion: RegionId;
  stats: PlayerStats;
}

export class GameState {
  readonly events = new EventBus<GameEvents>();

  player: PlayerRuntimeState;
  inventory: InventorySlot[];
  equipped: EquippedItems;
  quests: Record<string, QuestRuntimeState>;
  world: WorldRuntimeFlags;
  isPaused = false;
  isDead = false;

  constructor() {
    this.player = GameState.createDefaultPlayer();
    this.inventory = GameState.createDefaultInventory();
    this.equipped = {
      weapon: 'iron_sword',
      armor: 'traveler_tunic',
      accessory: null,
    };
    this.quests = {};
    this.world = GameState.createDefaultWorldFlags();
  }

  static createDefaultPlayer(): PlayerRuntimeState {
    return {
      position: { x: 0, y: 5.5, z: 58 },
      yaw: 0,
      pitch: 0,
      currentZone: 'overworld',
      currentRegion: 'ravendale_village',
      stats: {
        hp: 120,
        maxHp: 120,
        mp: 60,
        maxMp: 60,
        stamina: 100,
        maxStamina: 100,
        xp: 0,
        xpToNextLevel: 100,
        level: 1,
        gold: 50,
        baseAttack: 10,
        baseMagic: 10,
        baseDefense: 2,
        bonusAttack: 0,
        bonusMagic: 0,
        bonusDefense: 0,
      },
    };
  }

  static createDefaultInventory(): InventorySlot[] {
    return [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'traveler_tunic', quantity: 1 },
      { itemId: 'minor_health_potion', quantity: 2 },
      { itemId: 'mana_potion', quantity: 1 },
    ];
  }

  static createDefaultWorldFlags(): WorldRuntimeFlags {
    return {
      storyFlags: {},
      openedChestIds: [],
      defeatedEnemyIds: [],
      collectedPickupIds: [],
      discoveredLocations: ['ravendale_village'],
      timeOfDay: 9.5,
    };
  }

  setFlag(flag: string, value = true): void {
    this.world.storyFlags[flag] = value;
  }

  hasFlag(flag: string): boolean {
    return Boolean(this.world.storyFlags[flag]);
  }

  markLocationDiscovered(regionId: RegionId, displayName: string): boolean {
    if (!this.world.discoveredLocations.includes(regionId)) {
      this.world.discoveredLocations.push(regionId);
      this.events.emit('location:discovered', { regionId, name: displayName });
      this.events.emit('hud:notify', { text: `发现新地点：${displayName}`, kind: 'quest' });
      return true;
    }
    return false;
  }

  markChestOpened(chestId: string): void {
    if (!this.world.openedChestIds.includes(chestId)) {
      this.world.openedChestIds.push(chestId);
    }
  }

  isChestOpened(chestId: string): boolean {
    return this.world.openedChestIds.includes(chestId);
  }

  markPickupCollected(pickupId: string): void {
    if (!this.world.collectedPickupIds.includes(pickupId)) {
      this.world.collectedPickupIds.push(pickupId);
    }
  }

  isPickupCollected(pickupId: string): boolean {
    return this.world.collectedPickupIds.includes(pickupId);
  }

  markEnemyDefeated(enemyId: string): void {
    if (!this.world.defeatedEnemyIds.includes(enemyId)) {
      this.world.defeatedEnemyIds.push(enemyId);
    }
  }

  isEnemyDefeated(enemyId: string): boolean {
    return this.world.defeatedEnemyIds.includes(enemyId);
  }

  reset(): void {
    this.player = GameState.createDefaultPlayer();
    this.inventory = GameState.createDefaultInventory();
    this.equipped = {
      weapon: 'iron_sword',
      armor: 'traveler_tunic',
      accessory: null,
    };
    this.quests = {};
    this.world = GameState.createDefaultWorldFlags();
    this.isPaused = false;
    this.isDead = false;
  }
}
