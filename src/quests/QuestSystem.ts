import type { GameState } from '../core/GameState';
import type { QuestDefinition, QuestRuntimeState, QuestStageConfig } from '../core/types';
import questsData from '../data/quests.json';
import type { InventorySystem } from '../inventory/InventorySystem';

export class QuestSystem {
  private readonly definitions = new Map<string, QuestDefinition>();
  private readonly state: GameState;
  private readonly inventory: InventorySystem;

  constructor(state: GameState, inventory: InventorySystem) {
    this.state = state;
    this.inventory = inventory;

    for (const raw of questsData.quests) {
      this.definitions.set(raw.id, raw as unknown as QuestDefinition);
    }

    this.bindEvents();
  }

  private bindEvents(): void {
    this.state.events.on('enemy:killed', ({ archetypeId }) => {
      this.handleProgressEvent('kill', archetypeId, 1);
    });

    this.state.events.on('item:collected', ({ itemId }) => {
      this.syncCollectObjectives(itemId);
    });

    this.state.events.on('item:removed', ({ itemId }) => {
      this.syncCollectObjectives(itemId);
    });
  }

  getDefinition(questId: string): QuestDefinition | undefined {
    return this.definitions.get(questId);
  }

  getAllDefinitions(): QuestDefinition[] {
    return [...this.definitions.values()];
  }

  getQuestState(questId: string): QuestRuntimeState | undefined {
    return this.state.quests[questId];
  }

  getCurrentStage(questId: string): QuestStageConfig | undefined {
    const def = this.definitions.get(questId);
    const rt = this.state.quests[questId];
    if (!def || !rt || !rt.currentStageId) return undefined;
    return def.stages.find((s) => s.id === rt.currentStageId);
  }

  isQuestActive(questId: string): boolean {
    return this.state.quests[questId]?.status === 'active';
  }

  isQuestCompleted(questId: string): boolean {
    return this.state.quests[questId]?.status === 'completed';
  }

  isStage(questId: string, stageId: string): boolean {
    const rt = this.state.quests[questId];
    return rt?.status === 'active' && rt.currentStageId === stageId;
  }

  startQuest(questId: string): boolean {
    const def = this.definitions.get(questId);
    if (!def || this.state.quests[questId]) return false;

    const firstStage = def.stages[0];
    if (!firstStage) return false;

    this.state.quests[questId] = {
      questId,
      status: 'active',
      currentStageId: firstStage.id,
      progress: 0,
    };

    this.state.events.emit('quest:updated', {
      questId,
      status: 'active',
      stageId: firstStage.id,
    });
    this.state.events.emit('hud:notify', {
      text: `接受任务：《${def.title}》`,
      kind: 'quest',
    });

    // If first stage is collecting an item the player already holds, sync immediately
    if (firstStage.objective.type === 'collect') {
      this.syncCollectObjectives(firstStage.objective.targetId);
    }

    return true;
  }

  private handleProgressEvent(type: 'kill' | 'visit' | 'talk', targetId: string, delta: number): void {
    for (const [questId, rt] of Object.entries(this.state.quests)) {
      if (rt.status !== 'active' || !rt.currentStageId) continue;
      const def = this.definitions.get(questId);
      const stage = def?.stages.find((s) => s.id === rt.currentStageId);
      if (!def || !stage) continue;

      if (stage.objective.type === type && stage.objective.targetId === targetId) {
        rt.progress = Math.min(stage.objective.requiredCount, rt.progress + delta);
        if (rt.progress >= stage.objective.requiredCount && stage.nextStageId) {
          this.advanceToStage(questId, stage.nextStageId);
        } else {
          this.state.events.emit('quest:updated', {
            questId,
            status: 'active',
            stageId: rt.currentStageId,
          });
        }
      }
    }
  }

  private syncCollectObjectives(itemId: string): void {
    for (const [questId, rt] of Object.entries(this.state.quests)) {
      if (rt.status !== 'active' || !rt.currentStageId) continue;
      const def = this.definitions.get(questId);
      const stage = def?.stages.find((s) => s.id === rt.currentStageId);
      if (!def || !stage) continue;

      if (stage.objective.type === 'collect' && stage.objective.targetId === itemId) {
        const count = this.inventory.getCount(itemId);
        rt.progress = Math.min(stage.objective.requiredCount, count);
        if (rt.progress >= stage.objective.requiredCount && stage.nextStageId) {
          this.advanceToStage(questId, stage.nextStageId);
        } else {
          this.state.events.emit('quest:updated', {
            questId,
            status: 'active',
            stageId: rt.currentStageId,
          });
        }
      }
    }
  }

  advanceToStage(questId: string, nextStageId: string): boolean {
    const def = this.definitions.get(questId);
    const rt = this.state.quests[questId];
    const nextStage = def?.stages.find((s) => s.id === nextStageId);
    if (!def || !rt || !nextStage) return false;

    rt.currentStageId = nextStage.id;
    rt.progress = 0;

    this.state.events.emit('quest:updated', {
      questId,
      status: 'active',
      stageId: nextStage.id,
    });
    this.state.events.emit('hud:notify', {
      text: `任务更新《${def.title}》：${nextStage.objective.description}`,
      kind: 'quest',
    });

    if (nextStage.objective.type === 'collect') {
      this.syncCollectObjectives(nextStage.objective.targetId);
    }

    return true;
  }

  completeQuest(questId: string, outcome = 'default'): boolean {
    const def = this.definitions.get(questId);
    const rt = this.state.quests[questId];
    if (!def || !rt || rt.status === 'completed') return false;

    rt.status = 'completed';
    rt.currentStageId = null;
    rt.progress = 1;
    rt.outcome = outcome;

    const reward = def.rewards[outcome] ?? def.rewards.default;
    if (reward) {
      if (reward.xp > 0) this.inventory.addXp(reward.xp);
      if (reward.gold > 0) this.state.player.stats.gold += reward.gold;
      if (reward.items) {
        for (const item of reward.items) {
          this.inventory.addItem(item.itemId, item.quantity);
        }
      }
      if (reward.bonusStats) {
        const stats = this.state.player.stats;
        if (reward.bonusStats.defense) stats.bonusDefense += reward.bonusStats.defense;
        if (reward.bonusStats.attack) stats.bonusAttack += reward.bonusStats.attack;
        if (reward.bonusStats.magic) stats.bonusMagic += reward.bonusStats.magic;
        if (reward.bonusStats.maxHp) {
          stats.maxHp += reward.bonusStats.maxHp;
          stats.hp += reward.bonusStats.maxHp;
        }
      }
    }

    this.state.events.emit('quest:updated', {
      questId,
      status: 'completed',
      stageId: null,
    });
    this.state.events.emit('hud:notify', {
      text: `任务完成：《${def.title}》！`,
      kind: 'quest',
    });
    return true;
  }

  getActiveQuests(): Array<{ def: QuestDefinition; state: QuestRuntimeState; stage: QuestStageConfig | undefined }> {
    const list: Array<{ def: QuestDefinition; state: QuestRuntimeState; stage: QuestStageConfig | undefined }> = [];
    for (const rt of Object.values(this.state.quests)) {
      if (rt.status !== 'active') continue;
      const def = this.definitions.get(rt.questId);
      if (!def) continue;
      list.push({ def, state: rt, stage: this.getCurrentStage(rt.questId) });
    }
    return list;
  }

  getCompletedQuests(): Array<{ def: QuestDefinition; state: QuestRuntimeState }> {
    const list: Array<{ def: QuestDefinition; state: QuestRuntimeState }> = [];
    for (const rt of Object.values(this.state.quests)) {
      if (rt.status !== 'completed') continue;
      const def = this.definitions.get(rt.questId);
      if (!def) continue;
      list.push({ def, state: rt });
    }
    return list;
  }
}
