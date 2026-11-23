import type { GameState } from '../core/GameState';
import type { EquipSlot } from '../core/types';
import worldConfig from '../data/worldConfig.json';
import type { ActiveDialogueView, DialogueSystem } from '../dialogue/DialogueSystem';
import type { InventorySystem } from '../inventory/InventorySystem';
import type { NPCSystem } from '../npc/NPCSystem';
import type { QuestSystem } from '../quests/QuestSystem';
import type { SaveSlotMeta } from '../save/SaveSystem';
import { DayNightCycle } from '../world/DayNightCycle';
import { getRegionDisplayName, getRiverCenterX } from '../world/TerrainGenerator';

export type ModalType =
  | null
  | 'dialogue'
  | 'shop'
  | 'inventory'
  | 'quests'
  | 'map'
  | 'lore'
  | 'menu'
  | 'death';

export interface UIActions {
  onRespawn: () => void;
  onSaveSlot: (slotId: string) => Promise<void>;
  onLoadSlot: (slotId: string) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
  listSaveSlots: () => Promise<SaveSlotMeta[]>;
  onToggleMute: () => boolean;
  onReleasePointerLock: () => void;
}

export class UIManager {
  private readonly root: HTMLElement;
  private readonly state: GameState;
  private readonly inventory: InventorySystem;
  private readonly quests: QuestSystem;
  private readonly dialogue: DialogueSystem;
  private readonly npcs: NPCSystem;
  private readonly actions: UIActions;

  private activeModal: ModalType = null;
  private currentDialogue: ActiveDialogueView | null = null;
  private currentShopNpcId: string | null = null;
  private loreContent: { title: string; body: string } | null = null;
  private saveSlotsCache: SaveSlotMeta[] = [];

  // Persistent HUD DOM references
  private compassEl!: HTMLElement;
  private questTrackerEl!: HTMLElement;
  private notificationsEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private damageFlashEl!: HTMLElement;
  private metaLevelEl!: HTMLElement;
  private metaGoldEl!: HTMLElement;
  private hpTextEl!: HTMLElement;
  private hpFillEl!: HTMLElement;
  private mpTextEl!: HTMLElement;
  private mpFillEl!: HTMLElement;
  private staminaTextEl!: HTMLElement;
  private staminaFillEl!: HTMLElement;
  private xpTextEl!: HTMLElement;
  private xpFillEl!: HTMLElement;
  private modalOverlayEl!: HTMLElement;
  private modalPanelEl!: HTMLElement;

  constructor(
    root: HTMLElement,
    state: GameState,
    inventory: InventorySystem,
    quests: QuestSystem,
    dialogue: DialogueSystem,
    npcs: NPCSystem,
    actions: UIActions,
  ) {
    this.root = root;
    this.state = state;
    this.inventory = inventory;
    this.quests = quests;
    this.dialogue = dialogue;
    this.npcs = npcs;
    this.actions = actions;

    this.buildDOM();
    this.bindEvents();
    this.refreshHUD();
  }

  private buildDOM(): void {
    this.root.innerHTML = `
      <div class="hud-damage-flash" id="hud-damage-flash"></div>
      <div class="hud-compass" id="hud-compass" data-testid="hud-compass"></div>
      <div class="hud-notifications" id="hud-notifications"></div>
      <div class="hud-quest-tracker" id="hud-quest-tracker" data-testid="hud-quest-tracker"></div>
      <div class="hud-crosshair"></div>
      <div class="hud-interact-prompt" id="hud-interact-prompt" data-testid="hud-interact-prompt"></div>

      <div class="hud-bars" data-testid="hud-bars">
        <div class="hud-meta-row">
          <span id="hud-level">Lv.1</span>
          <span id="hud-gold">50 金币</span>
        </div>
        <div class="bar-row">
          <div class="bar-label"><span>生命 HP</span><span id="hud-hp-text">120 / 120</span></div>
          <div class="bar-track"><div class="bar-fill hp" id="hud-hp-fill" style="width:100%"></div></div>
        </div>
        <div class="bar-row">
          <div class="bar-label"><span>法力 MP</span><span id="hud-mp-text">60 / 60</span></div>
          <div class="bar-track"><div class="bar-fill mp" id="hud-mp-fill" style="width:100%"></div></div>
        </div>
        <div class="bar-row">
          <div class="bar-label"><span>耐力 Stamina</span><span id="hud-stamina-text">100 / 100</span></div>
          <div class="bar-track"><div class="bar-fill stamina" id="hud-stamina-fill" style="width:100%"></div></div>
        </div>
        <div class="bar-row">
          <div class="bar-label"><span>经验 XP</span><span id="hud-xp-text">0 / 100</span></div>
          <div class="bar-track"><div class="bar-fill xp" id="hud-xp-fill" style="width:0%"></div></div>
        </div>
      </div>

      <div class="hud-hotkeys">
        <button class="hud-pill-btn" data-panel="inventory">背包 [I]</button>
        <button class="hud-pill-btn" data-panel="quests">任务 [J]</button>
        <button class="hud-pill-btn" data-panel="map">地图 [M]</button>
        <button class="hud-pill-btn" data-panel="menu">菜单/存档 [Esc]</button>
      </div>

      <div class="modal-overlay" id="modal-overlay" data-testid="modal-overlay">
        <div class="modal-panel" id="modal-panel"></div>
      </div>
    `;

    this.compassEl = this.root.querySelector('#hud-compass')!;
    this.questTrackerEl = this.root.querySelector('#hud-quest-tracker')!;
    this.notificationsEl = this.root.querySelector('#hud-notifications')!;
    this.promptEl = this.root.querySelector('#hud-interact-prompt')!;
    this.damageFlashEl = this.root.querySelector('#hud-damage-flash')!;
    this.metaLevelEl = this.root.querySelector('#hud-level')!;
    this.metaGoldEl = this.root.querySelector('#hud-gold')!;
    this.hpTextEl = this.root.querySelector('#hud-hp-text')!;
    this.hpFillEl = this.root.querySelector('#hud-hp-fill')!;
    this.mpTextEl = this.root.querySelector('#hud-mp-text')!;
    this.mpFillEl = this.root.querySelector('#hud-mp-fill')!;
    this.staminaTextEl = this.root.querySelector('#hud-stamina-text')!;
    this.staminaFillEl = this.root.querySelector('#hud-stamina-fill')!;
    this.xpTextEl = this.root.querySelector('#hud-xp-text')!;
    this.xpFillEl = this.root.querySelector('#hud-xp-fill')!;
    this.modalOverlayEl = this.root.querySelector('#modal-overlay')!;
    this.modalPanelEl = this.root.querySelector('#modal-panel')!;

    this.root.querySelectorAll('.hud-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = btn.getAttribute('data-panel') as 'inventory' | 'quests' | 'map' | 'menu';
        this.togglePanel(panel);
      });
    });
  }

  private bindEvents(): void {
    this.state.events.on('hud:notify', ({ text, kind }) => {
      this.pushToast(text, kind ?? 'info');
    });
    this.state.events.on('quest:updated', () => {
      this.refreshQuestTracker();
    });
    this.state.events.on('player:died', () => {
      this.openDeathOverlay();
    });
  }

  pushToast(text: string, kind: 'info' | 'quest' | 'combat' | 'loot' | 'warning' = 'info'): void {
    const el = document.createElement('div');
    el.className = `hud-toast ${kind}`;
    el.textContent = text;
    this.notificationsEl.prepend(el);
    while (this.notificationsEl.children.length > 5) {
      this.notificationsEl.lastElementChild?.remove();
    }
    setTimeout(() => {
      el.remove();
    }, 4200);
  }

  flashDamage(): void {
    this.damageFlashEl.style.opacity = '1';
    setTimeout(() => {
      this.damageFlashEl.style.opacity = '0';
    }, 200);
  }

  isModalOpen(): boolean {
    return this.activeModal !== null;
  }

  getActiveModal(): ModalType {
    return this.activeModal;
  }

  setInteractPrompt(label: string | null): void {
    if (label && !this.isModalOpen()) {
      this.promptEl.style.display = 'block';
      this.promptEl.textContent = `[E] ${label}`;
    } else {
      this.promptEl.style.display = 'none';
    }
  }

  refreshHUD(): void {
    const stats = this.state.player.stats;
    const computed = this.inventory.getComputedStats();

    this.metaLevelEl.textContent = `Lv.${stats.level}`;
    this.metaGoldEl.textContent = `${stats.gold} 金币`;

    const hpPct = Math.max(0, Math.min(100, (stats.hp / Math.max(1, computed.maxHp)) * 100));
    this.hpTextEl.textContent = `${Math.ceil(stats.hp)} / ${computed.maxHp}`;
    this.hpFillEl.style.width = `${hpPct}%`;

    const mpPct = Math.max(0, Math.min(100, (stats.mp / Math.max(1, computed.maxMp)) * 100));
    this.mpTextEl.textContent = `${Math.floor(stats.mp)} / ${computed.maxMp}`;
    this.mpFillEl.style.width = `${mpPct}%`;

    const stPct = Math.max(0, Math.min(100, (stats.stamina / Math.max(1, stats.maxStamina)) * 100));
    this.staminaTextEl.textContent = `${Math.floor(stats.stamina)} / ${stats.maxStamina}`;
    this.staminaFillEl.style.width = `${stPct}%`;

    const xpPct = Math.max(0, Math.min(100, (stats.xp / Math.max(1, stats.xpToNextLevel)) * 100));
    this.xpTextEl.textContent = `${stats.xp} / ${stats.xpToNextLevel}`;
    this.xpFillEl.style.width = `${xpPct}%`;

    // Compass & Zone
    const deg = (((-this.state.player.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const dirs = ['北 N', '东北 NE', '东 E', '东南 SE', '南 S', '西南 SW', '西 W', '西北 NW'];
    const dirLabel = dirs[Math.round(deg / 45) % 8];
    const zoneLabel =
      this.state.player.currentZone === 'ancient_crypt'
        ? '古代墓穴 (地下城)'
        : getRegionDisplayName(this.state.player.currentRegion);

    this.compassEl.textContent = `${dirLabel}  |  ${zoneLabel}  |  ${DayNightCycle.formatTime(this.state.world.timeOfDay)}`;
    this.refreshQuestTracker();
  }

  private refreshQuestTracker(): void {
    const active = this.quests.getActiveQuests();
    if (active.length === 0) {
      this.questTrackerEl.innerHTML = `
        <h4>当前任务</h4>
        <div style="color: var(--text-dim);">前往溪谷村与【村长奥尔德林】交谈开启冒险。</div>
      `;
      return;
    }

    const itemsHtml = active
      .slice(0, 2)
      .map(({ def, state, stage }) => {
        const objText = stage
          ? `${stage.objective.description} (${state.progress}/${stage.objective.requiredCount})`
          : '待完成';
        return `<div style="margin-bottom:6px;">
          <div style="color:var(--gold-bright);font-weight:bold;">${def.isMain ? '★ ' : '◆ '}${def.title}</div>
          <div style="color:var(--text-main);font-size:12px;">${objText}</div>
        </div>`;
      })
      .join('');

    this.questTrackerEl.innerHTML = `<h4>当前任务</h4>${itemsHtml}`;
  }

  togglePanel(panel: 'inventory' | 'quests' | 'map' | 'menu'): void {
    if (this.state.isDead) return;
    if (this.activeModal === panel) {
      this.closeModal();
      return;
    }
    this.openPanel(panel);
  }

  openPanel(panel: ModalType): void {
    if (!panel) {
      this.closeModal();
      return;
    }
    this.activeModal = panel;
    this.state.isPaused = true;
    this.actions.onReleasePointerLock();
    this.modalOverlayEl.classList.add('open');

    if (panel === 'menu') {
      void this.actions.listSaveSlots().then((slots) => {
        this.saveSlotsCache = slots;
        if (this.activeModal === 'menu') this.renderModal();
      });
    }
    this.renderModal();
  }

  closeModal(): void {
    this.activeModal = null;
    this.currentDialogue = null;
    this.currentShopNpcId = null;
    this.loreContent = null;
    this.dialogue.close();
    this.state.isPaused = false;
    this.modalOverlayEl.classList.remove('open');
    this.modalPanelEl.innerHTML = '';
  }

  openDialogue(npcId: string): void {
    const npc = this.npcs.getDefinition(npcId);
    if (!npc) return;
    const view = this.dialogue.startDialogue(npc.dialogueId, npcId);
    if (!view) return;
    this.currentDialogue = view;
    this.openPanel('dialogue');
  }

  openShop(npcId: string): void {
    this.currentShopNpcId = npcId;
    this.openPanel('shop');
  }

  openLore(title: string, body: string): void {
    this.loreContent = { title, body };
    this.openPanel('lore');
  }

  openDeathOverlay(): void {
    this.activeModal = 'death';
    this.state.isPaused = true;
    this.actions.onReleasePointerLock();
    this.modalOverlayEl.classList.add('open');
    this.renderModal();
  }

  private renderModal(): void {
    switch (this.activeModal) {
      case 'dialogue':
        this.renderDialogue();
        break;
      case 'shop':
        this.renderShop();
        break;
      case 'inventory':
        this.renderInventory();
        break;
      case 'quests':
        this.renderQuests();
        break;
      case 'map':
        this.renderMap();
        break;
      case 'lore':
        this.renderLore();
        break;
      case 'menu':
        this.renderMenu();
        break;
      case 'death':
        this.renderDeath();
        break;
    }
  }

  private renderDialogue(): void {
    if (!this.currentDialogue) {
      this.closeModal();
      return;
    }
    const d = this.currentDialogue;
    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-dialogue">
        <h2>${d.speaker}</h2>
        <button class="btn" id="btn-close-modal">离开 [Esc]</button>
      </div>
      <div class="dialogue-box">${d.text}</div>
      <div class="choice-list">
        ${d.choices
          .map(
            (c) => `<button class="btn choice-btn" data-choice-index="${c.index}">${c.index + 1}. ${c.text}</button>`,
          )
          .join('')}
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-choice-index'));
        const res = this.dialogue.selectChoice(idx);
        if (res.openShopNpcId) {
          this.openShop(res.openShopNpcId);
          return;
        }
        if (res.nextView) {
          this.currentDialogue = res.nextView;
          this.renderDialogue();
        } else {
          this.closeModal();
        }
        this.refreshHUD();
      });
    });
  }

  private renderShop(): void {
    const npc = this.currentShopNpcId ? this.npcs.getDefinition(this.currentShopNpcId) : undefined;
    const stock = npc?.shopInventory ?? [];

    const buyRows = stock
      .map((itemId) => {
        const def = this.inventory.getItemDef(itemId);
        if (!def) return '';
        const canAfford = this.state.player.stats.gold >= def.value;
        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">${def.name}</span>
              <span class="item-desc">${def.description} | 价格: ${def.value} 金币</span>
            </div>
            <button class="btn" data-buy-id="${def.id}" ${canAfford ? '' : 'disabled'}>购买 (${def.value})</button>
          </div>
        `;
      })
      .join('');

    const sellRows = this.inventory
      .getSlots()
      .map((slot) => {
        const def = this.inventory.getItemDef(slot.itemId);
        if (!def || def.category === 'quest' || def.value <= 0) return '';
        const sellVal = Math.max(1, Math.floor(def.value * 0.5));
        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">${def.name} ×${slot.quantity}</span>
              <span class="item-desc">可售出: ${sellVal} 金币</span>
            </div>
            <button class="btn" data-sell-id="${def.id}">出售 (+${sellVal})</button>
          </div>
        `;
      })
      .join('');

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-shop">
        <h2>${npc?.name ?? '商店'} — 货摊交易 (持有金币: ${this.state.player.stats.gold})</h2>
        <button class="btn" id="btn-close-modal">关闭</button>
      </div>
      <div class="grid-2">
        <div class="card-box">
          <h3 style="color:var(--gold)">商人货物</h3>
          ${buyRows || '<div class="item-desc">暂无商品</div>'}
        </div>
        <div class="card-box">
          <h3 style="color:var(--gold)">背包可出售</h3>
          ${sellRows || '<div class="item-desc">无可出售物品</div>'}
        </div>
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelectorAll('[data-buy-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-buy-id')!;
        this.inventory.buyItem(id);
        this.refreshHUD();
        this.renderShop();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-sell-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sell-id')!;
        this.inventory.sellItem(id);
        this.refreshHUD();
        this.renderShop();
      });
    });
  }

  private renderInventory(): void {
    const computed = this.inventory.getComputedStats();
    const eq = this.state.equipped;

    const slotLabel = (slot: EquipSlot, label: string): string => {
      const id = eq[slot];
      const def = id ? this.inventory.getItemDef(id) : undefined;
      return `
        <div class="item-row">
          <div class="item-info">
            <span class="item-name">${label}: ${def ? def.name : '空'}</span>
            <span class="item-desc">${def ? def.description : '未装备'}</span>
          </div>
          ${def ? `<button class="btn" data-unequip="${slot}">卸下</button>` : ''}
        </div>
      `;
    };

    const itemsHtml = this.inventory
      .getSlots()
      .map((slot) => {
        const def = this.inventory.getItemDef(slot.itemId);
        if (!def) return '';
        const isEquipped =
          eq.weapon === def.id || eq.armor === def.id || eq.accessory === def.id;

        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">${def.name}${slot.quantity > 1 ? ` ×${slot.quantity}` : ''}${isEquipped ? ' [已装备]' : ''}</span>
              <span class="item-desc">${def.description} (价值 ${def.value} 金币)</span>
            </div>
            <div class="item-actions">
              ${def.equipSlot ? `<button class="btn" data-equip="${def.id}">${isEquipped ? '已穿戴' : '装备'}</button>` : ''}
              ${def.category === 'consumable' ? `<button class="btn" data-use="${def.id}">使用</button>` : ''}
              ${def.category !== 'quest' ? `<button class="btn btn-danger" data-drop="${def.id}">丢弃</button>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-inventory">
        <h2>背包与属性 (金币: ${this.state.player.stats.gold})</h2>
        <button class="btn" id="btn-close-modal">关闭 [I]</button>
      </div>
      <div class="grid-2">
        <div class="card-box">
          <h3 style="color:var(--gold)">当前装备</h3>
          ${slotLabel('weapon', '武器')}
          ${slotLabel('armor', '护甲')}
          ${slotLabel('accessory', '饰品')}
        </div>
        <div class="card-box">
          <h3 style="color:var(--gold)">角色总属性 (Lv.${this.state.player.stats.level})</h3>
          <div class="item-desc" style="font-size:13px; color:var(--text-main); line-height:1.8;">
            物理攻击: <b>${computed.attack}</b><br/>
            魔法强度: <b>${computed.magic}</b><br/>
            物理防御: <b>${computed.defense}</b><br/>
            生命上限: <b>${computed.maxHp}</b> | 法力上限: <b>${computed.maxMp}</b>
          </div>
        </div>
      </div>
      <div class="card-box">
        <h3 style="color:var(--gold)">物品列表</h3>
        ${itemsHtml || '<div class="item-desc">背包空空如也</div>'}
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelectorAll('[data-unequip]').forEach((b) => {
      b.addEventListener('click', () => {
        this.inventory.unequipSlot(b.getAttribute('data-unequip') as EquipSlot);
        this.refreshHUD();
        this.renderInventory();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-equip]').forEach((b) => {
      b.addEventListener('click', () => {
        this.inventory.equipItem(b.getAttribute('data-equip')!);
        this.refreshHUD();
        this.renderInventory();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-use]').forEach((b) => {
      b.addEventListener('click', () => {
        this.inventory.useItem(b.getAttribute('data-use')!);
        this.refreshHUD();
        this.renderInventory();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-drop]').forEach((b) => {
      b.addEventListener('click', () => {
        this.inventory.dropItem(b.getAttribute('data-drop')!);
        this.refreshHUD();
        this.renderInventory();
      });
    });
  }

  private renderQuests(): void {
    const active = this.quests.getActiveQuests();
    const completed = this.quests.getCompletedQuests();

    const activeHtml = active
      .map(({ def, state, stage }) => {
        return `
          <div class="card-box">
            <div class="item-name">${def.isMain ? '★ [主线] ' : '◆ [支线] '}${def.title}</div>
            <div class="item-desc" style="color:var(--text-main)">${def.summary}</div>
            ${
              stage
                ? `<div class="item-desc" style="color:var(--gold)">当前阶段: ${stage.description}<br/>进度: ${stage.objective.description} (${state.progress}/${stage.objective.requiredCount})</div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    const completedHtml = completed
      .map(({ def, state }) => {
        const outcomeLabel =
          state.outcome === 'return_relic'
            ? '结局：交还圣物，重塑边境结界'
            : state.outcome === 'keep_relic'
              ? '结局：保留圣物，执掌余烬之力'
              : '已完成';
        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">✓ ${def.title}</span>
              <span class="item-desc">${outcomeLabel}</span>
            </div>
          </div>
        `;
      })
      .join('');

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-quests">
        <h2>任务日志</h2>
        <button class="btn" id="btn-close-modal">关闭 [J]</button>
      </div>
      <h3 style="color:var(--gold)">进行中的任务 (${active.length})</h3>
      ${activeHtml || '<div class="item-desc">当前暂无进行中的任务，可前往溪谷村与村民对话接取。</div>'}
      <h3 style="color:var(--gold); margin-top:6px;">已完成的任务 (${completed.length})</h3>
      ${completedHtml || '<div class="item-desc">暂无已完成任务</div>'}
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
  }

  private renderMap(): void {
    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-map">
        <h2>灰烬边境 — 世界地图 (512 × 512 米)</h2>
        <button class="btn" id="btn-close-modal">关闭 [M]</button>
      </div>
      <canvas id="world-map-canvas" width="460" height="460"></canvas>
      <div class="item-desc" style="text-align:center;">
        金色箭头: 玩家当前位置与朝向 | 彩色圆圈: 五大区域 | 当前已探索: ${this.state.world.discoveredLocations.length} / ${worldConfig.regions.length}
      </div>
    `;
    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());

    const canvas = this.modalPanelEl.querySelector('#world-map-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 460;
    const toMap = (wx: number, wz: number): [number, number] => [
      ((wx + 256) / 512) * size,
      ((wz + 256) / 512) * size,
    ];

    // Background terrain tone
    ctx.fillStyle = '#243025';
    ctx.fillRect(0, 0, size, size);

    // Northern mountain band
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(0, 0, size, 75);

    // River meander
    ctx.strokeStyle = '#3b7ea1';
    ctx.lineWidth = 14;
    ctx.beginPath();
    for (let z = -15; z <= 250; z += 10) {
      const rx = getRiverCenterX(z);
      const [mx, my] = toMap(rx, z);
      if (z === -15) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.stroke();

    // Roads
    ctx.strokeStyle = '#8b775b';
    ctx.lineWidth = 4;
    const drawRoad = (ax: number, az: number, bx: number, bz: number): void => {
      const [x1, y1] = toMap(ax, az);
      const [x2, y2] = toMap(bx, bz);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    drawRoad(0, 58, 0, -170);
    drawRoad(0, 38, -105, -25);
    drawRoad(0, 38, 105, 55);
    drawRoad(105, 55, 105, -65);

    // 5 Regions
    for (const r of worldConfig.regions) {
      const [cx, cy] = toMap(r.center.x, r.center.z);
      const discovered = this.state.world.discoveredLocations.includes(r.id as never);
      const radPx = (r.radius / 512) * size;

      ctx.beginPath();
      ctx.arc(cx, cy, radPx, 0, Math.PI * 2);
      ctx.strokeStyle = discovered ? r.color : '#666b73';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = discovered ? r.color : '#8b9099';
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.fillText(discovered ? r.name : `${r.name} (未探索)`, cx, cy - 6);
    }

    // Player Arrow
    if (this.state.player.currentZone === 'overworld') {
      const [px, py] = toMap(this.state.player.position.x, this.state.player.position.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-this.state.player.yaw);
      ctx.fillStyle = '#f2cf88';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#7bd3ff';
      ctx.font = 'bold 13px serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ 当前位于地下城：古代墓穴', size / 2, 34);
    }
  }

  private renderLore(): void {
    const title = this.loreContent?.title ?? '文献';
    const body = this.loreContent?.body ?? '';
    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-lore">
        <h2>${title}</h2>
        <button class="btn" id="btn-close-modal">收起</button>
      </div>
      <div class="dialogue-box">${body}</div>
    `;
    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
  }

  private renderMenu(): void {
    const slotIds = ['slot_1', 'slot_2', 'slot_3', 'autosave'];
    const slotMap = new Map(this.saveSlotsCache.map((s) => [s.slotId, s]));

    const slotsHtml = slotIds
      .map((slotId) => {
        const meta = slotMap.get(slotId);
        const dateStr = meta ? new Date(meta.timestamp).toLocaleString() : '空槽位';
        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">${slotId} ${meta ? `— ${meta.summary}` : ''}</span>
              <span class="item-desc">${dateStr}</span>
            </div>
            <div class="item-actions">
              <button class="btn" data-save-slot="${slotId}">保存</button>
              <button class="btn" data-load-slot="${slotId}" ${meta ? '' : 'disabled'}>读取</button>
              ${meta ? `<button class="btn btn-danger" data-del-slot="${slotId}">删除</button>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-menu">
        <h2>系统菜单 — Ashen March 灰烬边境</h2>
        <button class="btn" id="btn-resume-game">继续游戏 [Esc]</button>
      </div>
      <div class="card-box">
        <h3 style="color:var(--gold)">本地存档 (IndexedDB)</h3>
        ${slotsHtml}
      </div>
      <div class="grid-2">
        <div class="card-box">
          <h3 style="color:var(--gold)">操作说明</h3>
          <div class="item-desc" style="color:var(--text-main); line-height:1.7;">
            WASD: 移动 | Shift: 奔跑 | Space: 跳跃<br/>
            鼠标点击画面旋转视角 | E: 交互/进出区域<br/>
            左键: 单手剑近战 | 右键: 火球术 (15 MP)<br/>
            I: 背包 | J: 任务日志 | M: 世界地图
          </div>
        </div>
        <div class="card-box">
          <h3 style="color:var(--gold)">音频与设置</h3>
          <button class="btn" id="btn-toggle-mute">切换音效静音</button>
          <div class="item-desc">存档使用浏览器 IndexedDB 持久化，支持跨刷新恢复与版本迁移。</div>
        </div>
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-resume-game')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelector('#btn-toggle-mute')?.addEventListener('click', () => {
      const muted = this.actions.onToggleMute();
      this.pushToast(muted ? '音效已静音' : '音效已开启', 'info');
    });

    this.modalPanelEl.querySelectorAll('[data-save-slot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.getAttribute('data-save-slot')!;
        await this.actions.onSaveSlot(slotId);
        this.saveSlotsCache = await this.actions.listSaveSlots();
        this.renderMenu();
      });
    });

    this.modalPanelEl.querySelectorAll('[data-load-slot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.getAttribute('data-load-slot')!;
        await this.actions.onLoadSlot(slotId);
        this.closeModal();
        this.refreshHUD();
      });
    });

    this.modalPanelEl.querySelectorAll('[data-del-slot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.getAttribute('data-del-slot')!;
        await this.actions.onDeleteSlot(slotId);
        this.saveSlotsCache = await this.actions.listSaveSlots();
        this.renderMenu();
      });
    });
  }

  private renderDeath(): void {
    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-death">
        <h2 style="color:#e05a5a;">重伤倒下</h2>
      </div>
      <div class="dialogue-box">你在灰烬边境的战斗中失去了意识……但命运尚未终结。点击下方按钮将在【溪谷村】醒来，保留已取得的物品与任务进度。</div>
      <button class="btn" id="btn-respawn" style="align-self:center; padding:12px 26px; font-size:15px;">在溪谷村复活</button>
    `;

    this.modalPanelEl.querySelector('#btn-respawn')?.addEventListener('click', () => {
      this.actions.onRespawn();
      this.closeModal();
      this.refreshHUD();
    });
  }
}
