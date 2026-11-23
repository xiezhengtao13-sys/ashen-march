import { GameState } from '../core/GameState';
import type {
  EquippedItems,
  InventorySlot,
  PlayerStats,
  QuestRuntimeState,
  RegionId,
  Vec3,
  ZoneId,
} from '../core/types';

export const SAVE_DB_NAME = 'ashen_march_saves_db';
export const SAVE_STORE_NAME = 'save_slots';
export const CURRENT_SAVE_SCHEMA_VERSION = 2;

export interface SavePayloadV2 {
  schemaVersion: 2;
  slotId: string;
  timestamp: number;
  summary: string;
  player: {
    position: Vec3;
    yaw: number;
    pitch: number;
    currentZone: ZoneId;
    currentRegion: RegionId;
    stats: PlayerStats;
  };
  inventory: InventorySlot[];
  equipped: EquippedItems;
  quests: Record<string, QuestRuntimeState>;
  world: {
    storyFlags: Record<string, boolean>;
    openedChestIds: string[];
    defeatedEnemyIds: string[];
    collectedPickupIds: string[];
    discoveredLocations: RegionId[];
    timeOfDay: number;
  };
}

export interface SaveSlotMeta {
  slotId: string;
  timestamp: number;
  summary: string;
  schemaVersion: number;
}

/**
 * Migrates older save versions (e.g., v1) to the current v2 schema cleanly.
 */
export function migrateSavePayload(raw: unknown): SavePayloadV2 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid save payload: expected object');
  }
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1;

  if (version > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported save schema version: ${version}`);
  }

  const rawPlayer = (obj.player ?? {}) as Record<string, unknown>;
  const rawStats = (rawPlayer.stats ?? {}) as Partial<PlayerStats>;
  const defaults = GameState.createDefaultPlayer();

  const stats: PlayerStats = {
    hp: rawStats.hp ?? defaults.stats.hp,
    maxHp: rawStats.maxHp ?? defaults.stats.maxHp,
    mp: rawStats.mp ?? defaults.stats.mp,
    maxMp: rawStats.maxMp ?? defaults.stats.maxMp,
    stamina: rawStats.stamina ?? defaults.stats.stamina,
    maxStamina: rawStats.maxStamina ?? defaults.stats.maxStamina,
    xp: rawStats.xp ?? 0,
    xpToNextLevel: rawStats.xpToNextLevel ?? 100,
    level: rawStats.level ?? 1,
    gold: rawStats.gold ?? 50,
    baseAttack: rawStats.baseAttack ?? defaults.stats.baseAttack,
    baseMagic: rawStats.baseMagic ?? defaults.stats.baseMagic,
    baseDefense: rawStats.baseDefense ?? defaults.stats.baseDefense,
    bonusAttack: rawStats.bonusAttack ?? 0,
    bonusMagic: rawStats.bonusMagic ?? 0,
    bonusDefense: rawStats.bonusDefense ?? 0,
  };

  const rawWorld = (obj.world ?? obj.worldState ?? {}) as Record<string, unknown>;
  const rawEquipped = (obj.equipped ?? {}) as Partial<EquippedItems>;

  return {
    schemaVersion: 2,
    slotId: typeof obj.slotId === 'string' ? obj.slotId : 'autosave',
    timestamp: typeof obj.timestamp === 'number' ? obj.timestamp : Date.now(),
    summary: typeof obj.summary === 'string' ? obj.summary : `Lv.${stats.level}`,
    player: {
      position: (rawPlayer.position as Vec3) ?? { ...defaults.position },
      yaw: typeof rawPlayer.yaw === 'number' ? rawPlayer.yaw : 0,
      pitch: typeof rawPlayer.pitch === 'number' ? rawPlayer.pitch : 0,
      currentZone: (rawPlayer.currentZone as ZoneId) ?? 'overworld',
      currentRegion: (rawPlayer.currentRegion as RegionId) ?? 'ravendale_village',
      stats,
    },
    inventory: Array.isArray(obj.inventory)
      ? (obj.inventory as InventorySlot[]).map((s) => ({ itemId: s.itemId, quantity: s.quantity }))
      : GameState.createDefaultInventory(),
    equipped: {
      weapon: rawEquipped.weapon ?? null,
      armor: rawEquipped.armor ?? null,
      accessory: rawEquipped.accessory ?? null,
    },
    quests: (obj.quests as Record<string, QuestRuntimeState>) ?? {},
    world: {
      storyFlags: (rawWorld.storyFlags as Record<string, boolean>) ?? {},
      openedChestIds: Array.isArray(rawWorld.openedChestIds) ? [...rawWorld.openedChestIds] : [],
      defeatedEnemyIds: Array.isArray(rawWorld.defeatedEnemyIds) ? [...rawWorld.defeatedEnemyIds] : [],
      collectedPickupIds: Array.isArray(rawWorld.collectedPickupIds) ? [...rawWorld.collectedPickupIds] : [],
      discoveredLocations: Array.isArray(rawWorld.discoveredLocations)
        ? [...(rawWorld.discoveredLocations as RegionId[])]
        : ['ravendale_village'],
      timeOfDay: typeof rawWorld.timeOfDay === 'number' ? rawWorld.timeOfDay : 9.5,
    },
  };
}

export function buildSavePayload(slotId: string, state: GameState, regionDisplayName: string): SavePayloadV2 {
  const hour = Math.floor(state.world.timeOfDay);
  const minute = Math.floor((state.world.timeOfDay - hour) * 60);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const zoneTag = state.player.currentZone === 'ancient_crypt' ? '古代墓穴' : regionDisplayName;

  return {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    slotId,
    timestamp: Date.now(),
    summary: `Lv.${state.player.stats.level} | ${zoneTag} | ${state.player.stats.gold} 金币 | ${timeStr}`,
    player: {
      position: { ...state.player.position },
      yaw: state.player.yaw,
      pitch: state.player.pitch,
      currentZone: state.player.currentZone,
      currentRegion: state.player.currentRegion,
      stats: { ...state.player.stats },
    },
    inventory: state.inventory.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
    equipped: { ...state.equipped },
    quests: JSON.parse(JSON.stringify(state.quests)) as Record<string, QuestRuntimeState>,
    world: {
      storyFlags: { ...state.world.storyFlags },
      openedChestIds: [...state.world.openedChestIds],
      defeatedEnemyIds: [...state.world.defeatedEnemyIds],
      collectedPickupIds: [...state.world.collectedPickupIds],
      discoveredLocations: [...state.world.discoveredLocations],
      timeOfDay: state.world.timeOfDay,
    },
  };
}

export function applySavePayloadToState(payload: SavePayloadV2, state: GameState): void {
  state.player = {
    position: { ...payload.player.position },
    yaw: payload.player.yaw,
    pitch: payload.player.pitch,
    currentZone: payload.player.currentZone,
    currentRegion: payload.player.currentRegion,
    stats: { ...payload.player.stats },
  };
  state.inventory = payload.inventory.map((s) => ({ itemId: s.itemId, quantity: s.quantity }));
  state.equipped = { ...payload.equipped };
  state.quests = JSON.parse(JSON.stringify(payload.quests)) as Record<string, QuestRuntimeState>;
  state.world = {
    storyFlags: { ...payload.world.storyFlags },
    openedChestIds: [...payload.world.openedChestIds],
    defeatedEnemyIds: [...payload.world.defeatedEnemyIds],
    collectedPickupIds: [...payload.world.collectedPickupIds],
    discoveredLocations: [...payload.world.discoveredLocations],
    timeOfDay: payload.world.timeOfDay,
  };
  state.isDead = false;
  state.events.emit('state:loaded', { slotId: payload.slotId });
}

export class SaveSystem {
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SAVE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SAVE_STORE_NAME)) {
          db.createObjectStore(SAVE_STORE_NAME, { keyPath: 'slotId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    });
  }

  async saveSlot(slotId: string, state: GameState, regionDisplayName: string): Promise<SavePayloadV2> {
    const db = await this.openDB();
    const payload = buildSavePayload(slotId, state, regionDisplayName);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SAVE_STORE_NAME);
      const req = store.put(payload);
      req.onsuccess = () => resolve(payload);
      req.onerror = () => reject(req.error ?? new Error('Failed to save slot'));
      tx.oncomplete = () => db.close();
    });
  }

  async putRawSlotForMigrationTest(rawPayload: Record<string, unknown>): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_STORE_NAME, 'readwrite');
      const req = tx.objectStore(SAVE_STORE_NAME).put(rawPayload);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to put raw payload'));
      tx.oncomplete = () => db.close();
    });
  }

  async loadSlot(slotId: string): Promise<SavePayloadV2 | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_STORE_NAME, 'readonly');
      const store = tx.objectStore(SAVE_STORE_NAME);
      const req = store.get(slotId);
      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        try {
          resolve(migrateSavePayload(req.result));
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to load slot'));
      tx.oncomplete = () => db.close();
    });
  }

  async listSlots(): Promise<SaveSlotMeta[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_STORE_NAME, 'readonly');
      const store = tx.objectStore(SAVE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as Array<Record<string, unknown>>).map((item) => ({
          slotId: String(item.slotId ?? ''),
          timestamp: Number(item.timestamp ?? 0),
          summary: String(item.summary ?? ''),
          schemaVersion: Number(item.schemaVersion ?? 1),
        }));
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to list slots'));
      tx.oncomplete = () => db.close();
    });
  }

  async deleteSlot(slotId: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_STORE_NAME, 'readwrite');
      const req = tx.objectStore(SAVE_STORE_NAME).delete(slotId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to delete slot'));
      tx.oncomplete = () => db.close();
    });
  }
}
