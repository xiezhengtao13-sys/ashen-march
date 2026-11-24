export type ZoneId = 'overworld' | 'ancient_crypt' | 'ashenhold_city';

export type RegionId =
  | 'ravendale_village'
  | 'ashwood_forest'
  | 'ruined_watchtower'
  | 'ancient_crypt'
  | 'river_valley'
  | 'ashenhold_gate'
  | 'ashenhold_main_street'
  | 'ashenhold_market_plaza'
  | 'ashenhold_artisan_quarter'
  | 'ashenhold_residential_quarter'
  | 'ashenhold_temple_acropolis'
  | 'ashenhold_castle_approach'
  | 'ashenhold_undercroft';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type EquipSlot = 'weapon' | 'armor' | 'accessory';
export type ItemCategory = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest' | 'material';

export interface ItemStats {
  attack?: number;
  magic?: number;
  defense?: number;
  maxHp?: number;
  maxMp?: number;
  healHp?: number;
  restoreMp?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  nameEn: string;
  category: ItemCategory;
  equipSlot?: EquipSlot;
  description: string;
  value: number;
  stackable: boolean;
  stats: ItemStats;
  color: string;
}

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface EquippedItems {
  weapon: string | null;
  armor: string | null;
  accessory: string | null;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  maxStamina: number;
  xp: number;
  xpToNextLevel: number;
  level: number;
  gold: number;
  baseAttack: number;
  baseMagic: number;
  baseDefense: number;
  bonusAttack: number;
  bonusMagic: number;
  bonusDefense: number;
}

export interface ComputedPlayerStats {
  attack: number;
  magic: number;
  defense: number;
  maxHp: number;
  maxMp: number;
}

export type QuestStatus = 'not_started' | 'active' | 'completed';

export interface QuestObjectiveConfig {
  id: string;
  type: 'kill' | 'collect' | 'visit' | 'talk';
  targetId: string;
  requiredCount: number;
  description: string;
}

export interface QuestStageConfig {
  id: string;
  description: string;
  objective: QuestObjectiveConfig;
  nextStageId: string | null;
}

export interface QuestRewardConfig {
  xp: number;
  gold: number;
  items?: Array<{ itemId: string; quantity: number }>;
  bonusStats?: {
    maxHp?: number;
    defense?: number;
    attack?: number;
    magic?: number;
  };
}

export interface QuestDefinition {
  id: string;
  title: string;
  isMain: boolean;
  giverNpcId: string;
  summary: string;
  stages: QuestStageConfig[];
  rewards: Record<string, QuestRewardConfig>;
}

export interface QuestRuntimeState {
  questId: string;
  status: QuestStatus;
  currentStageId: string | null;
  progress: number;
  outcome?: string;
}

export type GameEvents = {
  'enemy:killed': { enemyId: string; archetypeId: string; xp: number; gold: number };
  'item:collected': { itemId: string; quantity: number; sourceId?: string };
  'item:removed': { itemId: string; quantity: number };
  'location:discovered': { regionId: RegionId; name: string };
  'quest:updated': { questId: string; status: QuestStatus; stageId: string | null };
  'player:leveled_up': { level: number; maxHp: number; maxMp: number };
  'player:died': { zone: ZoneId };
  'player:respawned': { position: Vec3 };
  'zone:changed': { from: ZoneId; to: ZoneId };
  'dialogue:talked': { npcId: string };
  'hud:notify': { text: string; kind?: 'info' | 'quest' | 'combat' | 'loot' | 'warning' };
  'state:loaded': { slotId: string };
}
