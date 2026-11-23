import type { GameState } from '../core/GameState';
import dialoguesData from '../data/dialogues.json';
import type { InventorySystem } from '../inventory/InventorySystem';
import type { QuestSystem } from '../quests/QuestSystem';

export interface DialogueCondition {
  questStageEquals?: { questId: string; stageId: string };
  questCompleted?: string;
  questActive?: string;
  questNotStarted?: string;
  hasItem?: { itemId: string; quantity: number };
  flagSet?: string;
  notFlagSet?: string;
}

export interface DialogueAction {
  type: 'startQuest' | 'completeQuest' | 'completeMainChoice' | 'openShop';
  questId?: string;
  outcome?: string;
  consumeItemId?: string;
  consumeQuantity?: number;
  flag?: string;
  npcId?: string;
}

export interface DialogueChoiceConfig {
  text: string;
  condition?: DialogueCondition;
  action?: DialogueAction;
  nextNodeId: string | null;
}

export interface DialogueNodeConfig {
  speaker: string;
  text: string;
  choices: DialogueChoiceConfig[];
}

export interface DialogueTreeConfig {
  entryNodes: Array<{ condition?: DialogueCondition; nodeId: string }>;
  nodes: Record<string, DialogueNodeConfig>;
}

export interface ActiveDialogueView {
  dialogueId: string;
  nodeId: string;
  speaker: string;
  text: string;
  choices: Array<{ index: number; text: string }>;
}

export interface DialogueTurnResult {
  nextView: ActiveDialogueView | null;
  openShopNpcId?: string;
}

export class DialogueSystem {
  private readonly trees = new Map<string, DialogueTreeConfig>();
  private readonly state: GameState;
  private readonly quests: QuestSystem;
  private readonly inventory: InventorySystem;

  private activeDialogueId: string | null = null;
  private activeNodeId: string | null = null;
  private visibleChoices: DialogueChoiceConfig[] = [];

  constructor(state: GameState, quests: QuestSystem, inventory: InventorySystem) {
    this.state = state;
    this.quests = quests;
    this.inventory = inventory;

    for (const [id, raw] of Object.entries(dialoguesData.dialogues)) {
      this.trees.set(id, raw as DialogueTreeConfig);
    }
  }

  evaluateCondition(cond?: DialogueCondition): boolean {
    if (!cond) return true;

    if (cond.questStageEquals) {
      if (!this.quests.isStage(cond.questStageEquals.questId, cond.questStageEquals.stageId)) {
        return false;
      }
    }
    if (cond.questCompleted && !this.quests.isQuestCompleted(cond.questCompleted)) {
      return false;
    }
    if (cond.questActive && !this.quests.isQuestActive(cond.questActive)) {
      return false;
    }
    if (cond.questNotStarted && this.quests.getQuestState(cond.questNotStarted) !== undefined) {
      return false;
    }
    if (cond.hasItem && !this.inventory.hasItem(cond.hasItem.itemId, cond.hasItem.quantity)) {
      return false;
    }
    if (cond.flagSet && !this.state.hasFlag(cond.flagSet)) {
      return false;
    }
    if (cond.notFlagSet && this.state.hasFlag(cond.notFlagSet)) {
      return false;
    }

    return true;
  }

  startDialogue(dialogueId: string, npcId?: string): ActiveDialogueView | null {
    const tree = this.trees.get(dialogueId);
    if (!tree) return null;

    if (npcId) {
      this.state.events.emit('dialogue:talked', { npcId });
    }

    let entryNodeId: string | null = null;
    for (const entry of tree.entryNodes) {
      if (this.evaluateCondition(entry.condition)) {
        entryNodeId = entry.nodeId;
        break;
      }
    }

    if (!entryNodeId) return null;
    return this.enterNode(dialogueId, entryNodeId);
  }

  private enterNode(dialogueId: string, nodeId: string): ActiveDialogueView | null {
    const tree = this.trees.get(dialogueId);
    const node = tree?.nodes[nodeId];
    if (!tree || !node) {
      this.close();
      return null;
    }

    this.activeDialogueId = dialogueId;
    this.activeNodeId = nodeId;
    this.visibleChoices = node.choices.filter((c) => this.evaluateCondition(c.condition));

    return {
      dialogueId,
      nodeId,
      speaker: node.speaker,
      text: node.text,
      choices: this.visibleChoices.map((c, index) => ({ index, text: c.text })),
    };
  }

  selectChoice(visibleIndex: number): DialogueTurnResult {
    if (!this.activeDialogueId || !this.activeNodeId) {
      return { nextView: null };
    }

    const choice = this.visibleChoices[visibleIndex];
    if (!choice) {
      return { nextView: null };
    }

    let openShopNpcId: string | undefined;

    if (choice.action) {
      openShopNpcId = this.executeAction(choice.action);
    }

    if (choice.nextNodeId) {
      const nextView = this.enterNode(this.activeDialogueId, choice.nextNodeId);
      return { nextView, openShopNpcId };
    }

    this.close();
    return { nextView: null, openShopNpcId };
  }

  private executeAction(action: DialogueAction): string | undefined {
    switch (action.type) {
      case 'startQuest': {
        if (action.questId) {
          this.quests.startQuest(action.questId);
        }
        return undefined;
      }
      case 'completeQuest': {
        if (action.consumeItemId) {
          this.inventory.removeItem(action.consumeItemId, action.consumeQuantity ?? 1);
        }
        if (action.questId) {
          this.quests.completeQuest(action.questId, action.outcome ?? 'default');
        }
        return undefined;
      }
      case 'completeMainChoice': {
        if (action.consumeItemId) {
          this.inventory.removeItem(action.consumeItemId, action.consumeQuantity ?? 1);
        }
        if (action.flag) {
          this.state.setFlag(action.flag, true);
        }
        if (action.questId) {
          this.quests.completeQuest(action.questId, action.outcome ?? 'default');
        }
        return undefined;
      }
      case 'openShop': {
        return action.npcId;
      }
    }
  }

  close(): void {
    this.activeDialogueId = null;
    this.activeNodeId = null;
    this.visibleChoices = [];
  }
}
