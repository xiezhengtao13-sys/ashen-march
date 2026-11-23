import type { GameState } from '../core/GameState';
import type { EquipSlot, ItemCategory } from '../core/types';
import cityLayout from '../data/cityLayout.json';
import worldConfig from '../data/worldConfig.json';
import type { ActiveDialogueView, DialogueSystem } from '../dialogue/DialogueSystem';
import type { PerformanceTelemetry, QualityPreset } from '../engine/QualityManager';
import type { InventorySystem } from '../inventory/InventorySystem';
import type { NPCSystem } from '../npc/NPCSystem';
import type { QuestSystem } from '../quests/QuestSystem';
import type { SaveSlotMeta } from '../save/SaveSystem';
import { CITY_PLAZA_PADS, CITY_ROAD_SEGMENTS } from '../world/city/CityRoadNetwork';
import { DayNightCycle } from '../world/DayNightCycle';
import { getRegionDisplayName, getRiverCenterX } from '../world/TerrainGenerator';
import {
  COIN_ICON_SVG,
  getCategoryLabel,
  getItemIconSvg,
  getItemRarity,
  SPELL_ICON_SVG,
} from './IconRegistry';

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
  onEquipmentChanged?: () => void;
  onQuickPotion?: (kind: 'health' | 'mana') => void;
  onSetQuality?: (preset: QualityPreset) => void;
  getQualityPreset?: () => QualityPreset;
  getTelemetry?: () => PerformanceTelemetry;
  onToggleCityZone?: () => void;
}

const COMPASS_LABELS = [
  { label: '北 N', minor: false },
  { label: '东北', minor: true },
  { label: '东 E', minor: false },
  { label: '东南', minor: true },
  { label: '南 S', minor: false },
  { label: '西南', minor: true },
  { label: '西 W', minor: false },
  { label: '西北', minor: true },
];

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

  private invFilter: 'all' | ItemCategory = 'all';
  private selectedInvItemId: string | null = null;
  private selectedQuestId: string | null = null;

  // Persistent HUD DOM references
  private compassTrackEl!: HTMLElement;
  private compassTextEl!: HTMLElement;
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
  private xpFillEl!: HTMLElement;
  private quickWeaponIconEl!: HTMLElement;
  private quickHpCountEl!: HTMLElement;
  private quickMpCountEl!: HTMLElement;
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
    const repeatedTicks = [...COMPASS_LABELS, ...COMPASS_LABELS, ...COMPASS_LABELS]
      .map((t) => `<span class="compass-tick${t.minor ? ' minor' : ''}">${t.label}</span>`)
      .join('');

    this.root.innerHTML = `
      <div class="hud-damage-flash" id="hud-damage-flash"></div>

      <div class="hud-compass-wrap">
        <div class="hud-compass-strip">
          <div class="hud-compass-pointer"></div>
          <div class="hud-compass-track" id="hud-compass-track">${repeatedTicks}</div>
        </div>
        <div class="hud-region-sub" id="hud-compass" data-testid="hud-compass"></div>
      </div>

      <div class="hud-notifications" id="hud-notifications"></div>
      <div class="hud-quest-tracker" id="hud-quest-tracker" data-testid="hud-quest-tracker"></div>
      <div class="hud-crosshair"></div>
      <div class="hud-interact-prompt" id="hud-interact-prompt" data-testid="hud-interact-prompt"></div>

      <div class="hud-status-cluster" data-testid="hud-bars">
        <div class="hud-meta-line">
          <span id="hud-level">Lv.1</span>
          <span class="hud-coin-badge">${COIN_ICON_SVG}<span id="hud-gold">50</span></span>
        </div>
        <div class="status-bar-row">
          <div class="status-bar-meta"><span>生命</span><span id="hud-hp-text">120 / 120</span></div>
          <div class="status-track"><div class="status-fill hp" id="hud-hp-fill" style="width:100%"></div></div>
        </div>
        <div class="status-bar-row">
          <div class="status-bar-meta"><span>法力</span><span id="hud-mp-text">60 / 60</span></div>
          <div class="status-track"><div class="status-fill mp" id="hud-mp-fill" style="width:100%"></div></div>
        </div>
        <div class="status-bar-row">
          <div class="status-bar-meta"><span>耐力</span><span id="hud-stamina-text">100 / 100</span></div>
          <div class="status-track"><div class="status-fill stamina" id="hud-stamina-fill" style="width:100%"></div></div>
        </div>
        <div class="status-track" style="margin-top:2px;"><div class="status-fill xp" id="hud-xp-fill" style="width:0%"></div></div>
      </div>

      <div class="hud-quickbar">
        <div class="quickslot-row">
          <div class="quickslot" title="单手近战 (左键)"><span class="quickslot-key">LMB</span><span id="quick-weapon-icon"></span></div>
          <div class="quickslot" title="火球术 15 MP (右键)"><span class="quickslot-key">RMB</span><span>${SPELL_ICON_SVG}</span></div>
          <div class="quickslot" id="quick-hp-btn" title="治疗药水 [3]"><span class="quickslot-key">3</span><span>${getItemIconSvg('minor_health_potion', 'consumable')}</span><span class="quickslot-count" id="quick-hp-count">0</span></div>
          <div class="quickslot" id="quick-mp-btn" title="法力药水 [4]"><span class="quickslot-key">4</span><span>${getItemIconSvg('mana_potion', 'consumable')}</span><span class="quickslot-count" id="quick-mp-count">0</span></div>
        </div>
        <div class="hud-hint-line">[I] 背包 · [J] 任务 · [M] 地图 · [E] 交互 · [Esc] 系统</div>
      </div>

      <div class="modal-overlay" id="modal-overlay" data-testid="modal-overlay">
        <div class="modal-panel" id="modal-panel"></div>
      </div>
    `;

    this.compassTrackEl = this.root.querySelector('#hud-compass-track')!;
    this.compassTextEl = this.root.querySelector('#hud-compass')!;
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
    this.xpFillEl = this.root.querySelector('#hud-xp-fill')!;
    this.quickWeaponIconEl = this.root.querySelector('#quick-weapon-icon')!;
    this.quickHpCountEl = this.root.querySelector('#quick-hp-count')!;
    this.quickMpCountEl = this.root.querySelector('#quick-mp-count')!;
    this.modalOverlayEl = this.root.querySelector('#modal-overlay')!;
    this.modalPanelEl = this.root.querySelector('#modal-panel')!;

    this.root.querySelector('#quick-hp-btn')?.addEventListener('click', () => {
      this.actions.onQuickPotion?.('health');
    });
    this.root.querySelector('#quick-mp-btn')?.addEventListener('click', () => {
      this.actions.onQuickPotion?.('mana');
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
    while (this.notificationsEl.children.length > 4) {
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
    this.xpFillEl.style.width = `${xpPct}%`;

    // Quickbar icons & potion counters
    const weaponDef = this.state.equipped.weapon
      ? this.inventory.getItemDef(this.state.equipped.weapon)
      : undefined;
    this.quickWeaponIconEl.innerHTML = getItemIconSvg(
      weaponDef?.id ?? 'iron_sword',
      'weapon',
      weaponDef?.color ?? '#a8b2bd',
    );
    const hpCount =
      this.inventory.getCount('minor_health_potion') + this.inventory.getCount('greater_health_potion');
    const mpCount = this.inventory.getCount('mana_potion');
    this.quickHpCountEl.textContent = String(hpCount);
    this.quickMpCountEl.textContent = String(mpCount);

    // Compass ribbon scroll: 8 ticks * 48px = 384px per 360deg
    const deg = (((-this.state.player.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const cycleWidth = 8 * 48;
    const offset = 170 - 24 - (deg / 360) * cycleWidth - cycleWidth;
    this.compassTrackEl.style.transform = `translateX(${offset.toFixed(1)}px)`;

    const dirs = ['北 N', '东北 NE', '东 E', '东南 SE', '南 S', '西南 SW', '西 W', '西北 NW'];
    const dirLabel = dirs[Math.round(deg / 45) % 8];
    const zoneLabel =
      this.state.player.currentZone === 'ancient_crypt'
        ? '古代墓穴 · 地下城'
        : getRegionDisplayName(this.state.player.currentRegion);
    this.compassTextEl.textContent = `${dirLabel} · ${zoneLabel} · ${DayNightCycle.formatTime(this.state.world.timeOfDay)}`;

    this.refreshQuestTracker();
  }

  private refreshQuestTracker(): void {
    const active = this.quests.getActiveQuests();
    if (active.length === 0) {
      this.questTrackerEl.innerHTML = `
        <div class="hud-quest-header">当前线索</div>
        <div class="hud-quest-obj">在溪谷村与村长奥尔德林交谈</div>
      `;
      return;
    }

    const itemsHtml = active
      .slice(0, 2)
      .map(({ def, state, stage }) => {
        const objText = stage
          ? `${stage.objective.description} (${state.progress}/${stage.objective.requiredCount})`
          : '待完成';
        return `<div style="margin-bottom:5px;">
          <div class="hud-quest-header">${def.isMain ? '★ ' : '◆ '}${def.title}</div>
          <div class="hud-quest-obj">${objText}</div>
        </div>`;
      })
      .join('');

    this.questTrackerEl.innerHTML = itemsHtml;
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
    this.modalOverlayEl.classList.toggle('dialogue-mode', panel === 'dialogue');
    this.modalPanelEl.classList.toggle('dialogue-sheet', panel === 'dialogue');

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
    this.modalOverlayEl.classList.remove('open', 'dialogue-mode');
    this.modalPanelEl.classList.remove('dialogue-sheet');
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
    this.modalOverlayEl.classList.remove('dialogue-mode');
    this.modalPanelEl.classList.remove('dialogue-sheet');
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
    const npc = this.npcs.getAllDefinitions().find((n) => n.name === d.speaker);

    this.modalPanelEl.innerHTML = `
      <div class="dialogue-speaker-row" data-testid="modal-dialogue">
        <div>
          <span class="dialogue-speaker-name">${d.speaker}</span>
          ${npc ? `<span class="dialogue-speaker-title">${npc.title}</span>` : ''}
        </div>
        <button class="btn" id="btn-close-modal">离开 [Esc]</button>
      </div>
      <div class="dialogue-text">${d.text}</div>
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
        const rarity = getItemRarity(def);
        const canAfford = this.state.player.stats.gold >= def.value;
        return `
          <div class="item-row">
            <div class="icon-frame">${getItemIconSvg(def.id, def.category, def.color)}</div>
            <div class="item-info" style="flex:1">
              <span class="item-name" style="color:${rarity.color}">${def.name}</span>
              <span class="item-desc">${def.description}</span>
            </div>
            <button class="btn btn-primary" data-buy-id="${def.id}" ${canAfford ? '' : 'disabled'}>购买 ${def.value} 金</button>
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
            <div class="icon-frame">${getItemIconSvg(def.id, def.category, def.color)}</div>
            <div class="item-info" style="flex:1">
              <span class="item-name">${def.name} ×${slot.quantity}</span>
              <span class="item-desc">回收价: ${sellVal} 金币</span>
            </div>
            <button class="btn" data-sell-id="${def.id}">出售 +${sellVal}</button>
          </div>
        `;
      })
      .join('');

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-shop">
        <h2>${npc?.name ?? '铁匠商铺'} · 交易货物</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="hud-coin-badge" style="color:var(--accent-gold); font-size:14px;">${COIN_ICON_SVG}${this.state.player.stats.gold} 金币</span>
          <button class="btn" id="btn-close-modal">离开</button>
        </div>
      </div>
      <div class="split-2">
        <div class="panel-card">
          <div class="panel-title">商铺货物</div>
          ${buyRows || '<div class="item-desc">暂无商品</div>'}
        </div>
        <div class="panel-card">
          <div class="panel-title">背包可出售物品</div>
          ${sellRows || '<div class="item-desc">无可出售物品</div>'}
        </div>
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelectorAll('[data-buy-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.inventory.buyItem(btn.getAttribute('data-buy-id')!);
        this.refreshHUD();
        this.renderShop();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-sell-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.inventory.sellItem(btn.getAttribute('data-sell-id')!);
        this.actions.onEquipmentChanged?.();
        this.refreshHUD();
        this.renderShop();
      });
    });
  }

  private renderInventory(): void {
    const computed = this.inventory.getComputedStats();
    const eq = this.state.equipped;
    const allSlots = this.inventory.getSlots();

    const filtered = allSlots.filter((slot) => {
      if (this.invFilter === 'all') return true;
      const def = this.inventory.getItemDef(slot.itemId);
      if (!def) return false;
      if (this.invFilter === 'armor') return def.category === 'armor' || def.category === 'accessory';
      if (this.invFilter === 'material') return def.category === 'material' || def.category === 'quest';
      return def.category === this.invFilter;
    });

    if (!this.selectedInvItemId || !filtered.some((s) => s.itemId === this.selectedInvItemId)) {
      this.selectedInvItemId = filtered[0]?.itemId ?? null;
    }

    const slotHtml = (slot: EquipSlot, label: string): string => {
      const id = eq[slot];
      const def = id ? this.inventory.getItemDef(id) : undefined;
      return `
        <div class="equip-slot-card">
          <div class="icon-frame">${def ? getItemIconSvg(def.id, def.category, def.color) : ''}</div>
          <div class="inv-row-meta">
            <div class="inv-row-sub">${label}</div>
            <div class="inv-row-name">${def ? def.name : '空置'}</div>
          </div>
          ${def ? `<button class="btn" data-unequip="${slot}">卸下</button>` : ''}
        </div>
      `;
    };

    const filterTabs: Array<{ id: 'all' | ItemCategory; label: string }> = [
      { id: 'all', label: '全部' },
      { id: 'weapon', label: '武器' },
      { id: 'armor', label: '防具/饰品' },
      { id: 'consumable', label: '药水' },
      { id: 'material', label: '任务/材料' },
    ];

    const listHtml = filtered
      .map((slot) => {
        const def = this.inventory.getItemDef(slot.itemId);
        if (!def) return '';
        const rarity = getItemRarity(def);
        const isEquipped = eq.weapon === def.id || eq.armor === def.id || eq.accessory === def.id;
        const isSelected = this.selectedInvItemId === def.id;
        return `
          <div class="inv-row ${isSelected ? 'selected' : ''}" data-select-item="${def.id}">
            <div class="icon-frame">${getItemIconSvg(def.id, def.category, def.color)}</div>
            <div class="inv-row-meta">
              <div class="inv-row-name" style="color:${rarity.color}">
                ${def.name}${slot.quantity > 1 ? ` ×${slot.quantity}` : ''}${isEquipped ? ' [已穿戴]' : ''}
              </div>
              <div class="inv-row-sub">${getCategoryLabel(def.category)} · ${rarity.label}</div>
            </div>
          </div>
        `;
      })
      .join('');

    const selDef = this.selectedInvItemId ? this.inventory.getItemDef(this.selectedInvItemId) : undefined;
    const selSlot = this.selectedInvItemId
      ? allSlots.find((s) => s.itemId === this.selectedInvItemId)
      : undefined;
    let inspectorHtml = '<div class="item-desc">点击左侧列表中的物品查看详情与操作。</div>';
    if (selDef && selSlot) {
      const rarity = getItemRarity(selDef);
      const isEquipped =
        eq.weapon === selDef.id || eq.armor === selDef.id || eq.accessory === selDef.id;
      const statLines: string[] = [];
      if (selDef.stats.attack) statLines.push(`物理攻击 +${selDef.stats.attack}`);
      if (selDef.stats.magic) statLines.push(`魔法强度 +${selDef.stats.magic}`);
      if (selDef.stats.defense) statLines.push(`物理防御 +${selDef.stats.defense}`);
      if (selDef.stats.maxHp) statLines.push(`生命上限 +${selDef.stats.maxHp}`);
      if (selDef.stats.maxMp) statLines.push(`法力上限 +${selDef.stats.maxMp}`);
      if (selDef.stats.healHp) statLines.push(`立即恢复生命 +${selDef.stats.healHp}`);
      if (selDef.stats.restoreMp) statLines.push(`立即恢复法力 +${selDef.stats.restoreMp}`);

      inspectorHtml = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="icon-frame large">${getItemIconSvg(selDef.id, selDef.category, selDef.color)}</div>
          <div>
            <div class="item-name" style="color:${rarity.color}; font-size:15px; font-weight:600;">${selDef.name}</div>
            <div class="item-desc">${rarity.label} · ${getCategoryLabel(selDef.category)}</div>
          </div>
        </div>
        ${
          statLines.length > 0
            ? `<div style="font-size:12px; color:#8ec998; background:rgba(30,52,35,0.35); padding:7px 9px; border-radius:3px;">${statLines.join('<br/>')}</div>`
            : ''
        }
        <div class="item-desc" style="color:var(--text-main);">${selDef.description}</div>
        <div class="item-desc">数量: ${selSlot.quantity} · 估价: ${selDef.value} 金币</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:auto; padding-top:8px;">
          ${
            selDef.equipSlot
              ? `<button class="btn btn-primary" data-equip="${selDef.id}">${isEquipped ? '已穿戴' : '装备'}</button>`
              : ''
          }
          ${selDef.category === 'consumable' ? `<button class="btn btn-primary" data-use="${selDef.id}">饮用</button>` : ''}
          ${selDef.category !== 'quest' ? `<button class="btn btn-danger" data-drop="${selDef.id}">丢弃</button>` : ''}
        </div>
      `;
    }

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-inventory">
        <h2>行囊与装备</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="hud-coin-badge" style="color:var(--accent-gold); font-size:14px;">${COIN_ICON_SVG}${this.state.player.stats.gold} 金币</span>
          <button class="btn" id="btn-close-modal">关闭 [I]</button>
        </div>
      </div>
      <div class="inv-layout">
        <div class="panel-card">
          <div class="panel-title">当前穿戴</div>
          ${slotHtml('weapon', '武器')}
          ${slotHtml('armor', '护甲')}
          ${slotHtml('accessory', '饰品')}
          <div class="panel-title" style="margin-top:4px;">属性总览 (Lv.${this.state.player.stats.level})</div>
          <div class="stat-grid">
            <div class="stat-pill"><span>攻击</span><b>${computed.attack}</b></div>
            <div class="stat-pill"><span>法术</span><b>${computed.magic}</b></div>
            <div class="stat-pill"><span>防御</span><b>${computed.defense}</b></div>
            <div class="stat-pill"><span>生命</span><b>${computed.maxHp}</b></div>
            <div class="stat-pill"><span>法力</span><b>${computed.maxMp}</b></div>
            <div class="stat-pill"><span>经验</span><b>${this.state.player.stats.xp}/${this.state.player.stats.xpToNextLevel}</b></div>
          </div>
        </div>
        <div class="panel-card">
          <div class="tab-strip">
            ${filterTabs
              .map(
                (t) => `<button class="tab-btn ${this.invFilter === t.id ? 'active' : ''}" data-inv-tab="${t.id}">${t.label}</button>`,
              )
              .join('')}
          </div>
          <div class="inv-list">
            ${listHtml || '<div class="item-desc" style="padding:12px;">该分类下暂无物品</div>'}
          </div>
        </div>
        <div class="panel-card">
          <div class="panel-title">物品详情</div>
          ${inspectorHtml}
        </div>
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelectorAll('[data-inv-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        this.invFilter = b.getAttribute('data-inv-tab') as 'all' | ItemCategory;
        this.renderInventory();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-select-item]').forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedInvItemId = row.getAttribute('data-select-item');
        this.renderInventory();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-unequip]').forEach((b) => {
      b.addEventListener('click', () => {
        this.inventory.unequipSlot(b.getAttribute('data-unequip') as EquipSlot);
        this.actions.onEquipmentChanged?.();
        this.refreshHUD();
        this.renderInventory();
      });
    });
    this.modalPanelEl.querySelectorAll('[data-equip]').forEach((b) => {
      b.addEventListener('click', () => {
        this.inventory.equipItem(b.getAttribute('data-equip')!);
        this.actions.onEquipmentChanged?.();
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
        this.actions.onEquipmentChanged?.();
        this.refreshHUD();
        this.renderInventory();
      });
    });
  }

  private renderQuests(): void {
    const active = this.quests.getActiveQuests();
    const completed = this.quests.getCompletedQuests();
    const allEntries = [
      ...active.map((a) => ({ def: a.def, state: a.state, stage: a.stage, done: false })),
      ...completed.map((c) => ({ def: c.def, state: c.state, stage: undefined, done: true })),
    ];

    if (!this.selectedQuestId || !allEntries.some((e) => e.def.id === this.selectedQuestId)) {
      this.selectedQuestId = allEntries[0]?.def.id ?? null;
    }

    const listHtml = allEntries
      .map((entry) => {
        const selected = entry.def.id === this.selectedQuestId;
        const badge = entry.done ? '✓' : entry.def.isMain ? '★' : '◆';
        return `
          <div class="inv-row ${selected ? 'selected' : ''}" data-select-quest="${entry.def.id}">
            <div class="inv-row-meta">
              <div class="inv-row-name" style="color:${entry.done ? '#70b379' : 'var(--accent-gold)'}">${badge} ${entry.def.title}</div>
              <div class="inv-row-sub">${entry.def.isMain ? '主线剧情' : '边境委托'} · ${entry.done ? '已完成' : '进行中'}</div>
            </div>
          </div>
        `;
      })
      .join('');

    const sel = allEntries.find((e) => e.def.id === this.selectedQuestId);
    let detailHtml = '<div class="item-desc">尚未接取任务。请先前往溪谷村广场与村长奥尔德林、猎人莱拉或铁匠葛伦交谈。</div>';
    if (sel) {
      const stagesHtml = sel.def.stages
        .map((st, idx) => {
          const isCurrent = !sel.done && sel.state.currentStageId === st.id;
          const currentIdx = sel.def.stages.findIndex((x) => x.id === sel.state.currentStageId);
          const isPast = sel.done || (currentIdx >= 0 && idx < currentIdx);
          return `
            <div class="item-row" style="border-color:${isCurrent ? 'var(--border-bronze)' : 'var(--border-iron)'}">
              <div class="item-info">
                <span class="item-name" style="color:${isPast ? '#70b379' : isCurrent ? 'var(--accent-gold)' : 'var(--text-muted)'}">
                  ${isPast ? '✓ ' : isCurrent ? '▶ ' : '○ '}${st.objective.description}
                  ${isCurrent ? ` (${sel.state.progress}/${st.objective.requiredCount})` : ''}
                </span>
                <span class="item-desc">${st.description}</span>
              </div>
            </div>
          `;
        })
        .join('');

      const outcomeNote =
        sel.state.outcome === 'return_relic'
          ? '最终抉择：将《守望者圣物》归还溪谷村重塑边境结界。'
          : sel.state.outcome === 'keep_relic'
            ? '最终抉择：自己保留《守望者圣物》执掌余烬之力。'
            : '';

      detailHtml = `
        <div class="panel-title" style="font-size:16px;">${sel.def.isMain ? '★ 主线' : '◆ 支线'}：${sel.def.title}</div>
        <div class="item-desc" style="color:var(--text-main); font-size:13px;">${sel.def.summary}</div>
        ${outcomeNote ? `<div class="item-desc" style="color:var(--accent-gold);">${outcomeNote}</div>` : ''}
        <div class="panel-title" style="margin-top:4px;">任务阶段</div>
        <div style="display:flex; flex-direction:column; gap:6px;">${stagesHtml}</div>
      `;
    }

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-quests">
        <h2>冒险日志</h2>
        <button class="btn" id="btn-close-modal">关闭 [J]</button>
      </div>
      <div class="quest-split">
        <div class="panel-card">
          <div class="panel-title">任务目录 (${allEntries.length})</div>
          <div class="inv-list">
            ${listHtml || '<div class="item-desc">暂无任务记录</div>'}
          </div>
        </div>
        <div class="panel-card">
          ${detailHtml}
        </div>
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelectorAll('[data-select-quest]').forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedQuestId = row.getAttribute('data-select-quest');
        this.renderQuests();
      });
    });
  }

  private renderMap(): void {
    if (this.state.player.currentZone === 'ashenhold_city') {
      this.renderAshenholdCityMap();
      return;
    }

    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-map">
        <h2>灰烬边境舆图 · 512 × 512 米</h2>
        <button class="btn" id="btn-close-modal">关闭 [M]</button>
      </div>
      <canvas id="world-map-canvas" width="500" height="500"></canvas>
      <div class="item-desc" style="text-align:center;">
        ▲ 旅者坐标与朝向 · ⚑ 已发现地标 (${this.state.world.discoveredLocations.length}/${worldConfig.regions.length}) · 虚线为边境驿道
      </div>
    `;
    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());

    const canvas = this.modalPanelEl.querySelector('#world-map-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 500;
    const toMap = (wx: number, wz: number): [number, number] => [
      ((wx + 256) / 512) * size,
      ((wz + 256) / 512) * size,
    ];

    // Aged Parchment Base
    const grad = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.72);
    grad.addColorStop(0, '#d8c9a9');
    grad.addColorStop(1, '#b5a17b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Topographic Elevation Contours & Mountains
    ctx.strokeStyle = 'rgba(104, 82, 52, 0.22)';
    ctx.lineWidth = 1;
    for (const r of [65, 110, 165, 225]) {
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.56, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Northern Mountain Range Sketch
    ctx.fillStyle = 'rgba(84, 72, 58, 0.28)';
    ctx.fillRect(0, 0, size, 88);
    ctx.strokeStyle = '#5c4b37';
    ctx.lineWidth = 1.6;
    for (let mx = 20; mx < size - 20; mx += 44) {
      ctx.beginPath();
      ctx.moveTo(mx - 18, 66);
      ctx.lineTo(mx, 28 + ((mx * 7) % 14));
      ctx.lineTo(mx + 18, 66);
      ctx.stroke();
    }

    // Ashwood Forest Tree Cluster Ink Marks
    ctx.fillStyle = 'rgba(54, 82, 49, 0.45)';
    for (let i = 0; i < 24; i++) {
      const fx = -160 + ((i * 37) % 105);
      const fz = -90 + ((i * 53) % 125);
      const [tx, ty] = toMap(fx, fz);
      ctx.beginPath();
      ctx.moveTo(tx, ty - 7);
      ctx.lineTo(tx + 5, ty + 4);
      ctx.lineTo(tx - 5, ty + 4);
      ctx.closePath();
      ctx.fill();
    }

    // River Channel & Shore Highlight
    ctx.strokeStyle = 'rgba(58, 108, 132, 0.78)';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let z = -15; z <= 250; z += 10) {
      const [mx, my] = toMap(getRiverCenterX(z), z);
      if (z === -15) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.stroke();

    // Dashed Frontier Roads
    ctx.save();
    ctx.strokeStyle = '#6e5233';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([6, 4]);
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
    ctx.restore();

    // Regions & Landmark Crests
    for (const r of worldConfig.regions) {
      const [cx, cy] = toMap(r.center.x, r.center.z);
      const discovered = this.state.world.discoveredLocations.includes(r.id as never);

      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = discovered ? '#4d351d' : '#857862';
      ctx.fill();
      ctx.strokeStyle = '#e8d9b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = discovered ? '#2b1e10' : '#635847';
      ctx.font = 'bold 12px serif';
      ctx.textAlign = 'center';
      ctx.fillText(discovered ? r.name : `${r.name} (未探明)`, cx, cy - 13);
    }

    // Player Directional Arrow
    if (this.state.player.currentZone === 'overworld') {
      const [px, py] = toMap(this.state.player.position.x, this.state.player.position.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-this.state.player.yaw);
      ctx.fillStyle = '#9e2626';
      ctx.strokeStyle = '#f5e4c3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#3b2412';
      ctx.font = 'bold 13px serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ 当前正探索地下城：古代墓穴', size / 2, size - 22);
    }
  }

  private renderAshenholdCityMap(): void {
    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-map">
        <h2>灰烬城山城舆图 · Ashenhold (约 104 × 144 米 · 五重台地)</h2>
        <button class="btn" id="btn-close-modal">关闭 [M]</button>
      </div>
      <canvas id="world-map-canvas" width="520" height="520"></canvas>
      <div class="item-desc" style="text-align:center; line-height:1.5;">
        金色实块：A类完整室内 · 青色方格：B类半开放/商摊 · 红色实框：Phase 2 实机可探索样板区 (0m→+7.5m) · 虚线外框：104×144m 全城规划边界
      </div>
    `;
    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());

    const canvas = this.modalPanelEl.querySelector('#world-map-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 520;
    // Map compact hillside x in [-76, 76] (152m) and z in [-148, +32] (180m)
    const toMap = (wx: number, wz: number): [number, number] => [
      ((wx + 76) / 152) * size,
      ((wz + 148) / 180) * size,
    ];

    const grad = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.72);
    grad.addColorStop(0, '#dfd1b3');
    grad.addColorStop(1, '#b8a47e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Outer mountain ridges shading
    ctx.fillStyle = 'rgba(72, 84, 58, 0.18)';
    ctx.fillRect(0, 0, size, size);

    // Compact 104x144m city wall perimeter fill
    const [exL, exT] = toMap(-52, -124);
    const [exR, exB] = toMap(52, 14);
    const [apL, apT] = toMap(-15, 14);
    const [apR, apB] = toMap(15, 26);
    ctx.fillStyle = '#d9cba9';
    ctx.fillRect(exL, exT, exR - exL, exB - exT);
    ctx.fillRect(apL, apT, apR - apL, apB - apT);

    // 5-Tier Elevation Contour Terrace Bands (0m -> +3.5m -> +7.5m -> +12.2m -> +18.0m -> +21.0m)
    const tierFills: Record<string, string> = {
      tier0_gate_approach: 'rgba(196, 180, 148, 0.55)',
      tier1_market_plaza: 'rgba(182, 162, 128, 0.65)',
      tier1_fountain_dais: 'rgba(165, 145, 112, 0.75)',
      tier2_mid_overlook: 'rgba(162, 138, 102, 0.75)',
      tier2_west_artisan: 'rgba(155, 124, 104, 0.45)',
      tier2_east_residential: 'rgba(128, 148, 118, 0.42)',
      tier3_temple_acropolis: 'rgba(142, 122, 112, 0.58)',
      tier4_castle_forecourt: 'rgba(118, 102, 92, 0.62)',
      tier4_citadel_keep: 'rgba(92, 80, 72, 0.72)',
    };
    for (const pad of CITY_PLAZA_PADS) {
      const [px0, pz0] = toMap(pad.cx - pad.halfX, pad.cz - pad.halfZ);
      const [px1, pz1] = toMap(pad.cx + pad.halfX, pad.cz + pad.halfZ);
      ctx.fillStyle = tierFills[pad.id] ?? '#c7b899';
      ctx.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
      ctx.strokeStyle = 'rgba(78, 58, 38, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px0, pz0, px1 - px0, pz1 - pz0);
    }

    // All Hillside Road & Stair Segments
    for (const seg of CITY_ROAD_SEGMENTS) {
      const [ax, az] = toMap(seg.a.x, seg.a.z);
      const [bx, bz] = toMap(seg.b.x, seg.b.z);
      ctx.lineWidth = Math.max(4, seg.a.halfWidth * 2 * (size / 152));
      ctx.strokeStyle = seg.route === 'main' ? '#b39e7a' : 'rgba(168, 150, 120, 0.65)';
      ctx.beginPath();
      ctx.moveTo(ax, az);
      ctx.lineTo(bx, bz);
      ctx.stroke();

      ctx.lineWidth = seg.route === 'main' ? 2.0 : 1.3;
      ctx.strokeStyle = seg.route === 'main' ? '#7a441e' : '#5c4b36';
      ctx.setLineDash(seg.route === 'main' ? [] : [4, 3]);
      ctx.beginPath();
      ctx.moveTo(ax, az);
      ctx.lineTo(bx, bz);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Structures from cityLayout (differentiate A-class Interiors, B-class Semi-Interiors/Stalls, Landmarks)
    for (const a of cityLayout.architecture as Array<{
      id: string;
      model: string;
      position: { x: number; z: number };
      tier?: string;
      buildingClass?: string;
      isInterior?: boolean;
    }>) {
      if (a.isInterior) continue;
      const [bx, bz] = toMap(a.position.x, a.position.z);
      if (a.model.startsWith('landmark_market_fountain')) {
        ctx.fillStyle = '#2d7a96';
        ctx.beginPath();
        ctx.arc(bx, bz, 6.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (a.model.startsWith('stall_')) {
        ctx.fillStyle = '#c4542d';
        ctx.fillRect(bx - 4, bz - 4, 8, 8);
      } else if (a.tier === 'decorative') {
        ctx.fillStyle = 'rgba(100, 94, 86, 0.42)';
        ctx.fillRect(bx - 6, bz - 5, 12, 10);
      } else if (a.tier === 'landmark_closed') {
        ctx.fillStyle = '#4c4642';
        ctx.strokeStyle = '#241e1c';
        ctx.lineWidth = 1.5;
        const rw = a.model === 'castle_citadel_keep.glb' ? 36 : 18;
        const rh = a.model === 'castle_citadel_keep.glb' ? 22 : 11;
        ctx.fillRect(bx - rw / 2, bz - rh / 2, rw, rh);
        ctx.strokeRect(bx - rw / 2, bz - rh / 2, rw, rh);
      } else if (a.buildingClass === 'A' && !a.model.includes('retaining') && !a.model.includes('bridge')) {
        ctx.fillStyle = '#b87616';
        ctx.strokeStyle = '#fff3d6';
        ctx.lineWidth = 1.4;
        ctx.fillRect(bx - 8, bz - 7, 16, 14);
        ctx.strokeRect(bx - 8, bz - 7, 16, 14);
      } else if (a.buildingClass === 'B') {
        ctx.fillStyle = '#2c7e96';
        ctx.fillRect(bx - 6, bz - 5, 12, 10);
      } else if (!a.model.includes('wall') && !a.model.includes('barricade')) {
        ctx.fillStyle = 'rgba(105, 88, 70, 0.78)';
        ctx.fillRect(bx - 6, bz - 5, 12, 10);
      }
    }

    // Solid Red Box: Phase-2 Currently Explorable Compact Hillside Slice (0m -> +7.5m Overlook)
    const [sL, sT] = toMap(-17, -62);
    const [sR, sB] = toMap(17, 24);
    ctx.save();
    ctx.strokeStyle = '#a8281c';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(sL, sT, sR - sL, sB - sT);

    // Dashed Outer Box: Full 104x144m Hillside City Perimeter
    ctx.strokeStyle = '#6c3824';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(exL, exT);
    ctx.lineTo(exR, exT);
    ctx.lineTo(exR, exB);
    ctx.lineTo(apR, exB);
    ctx.lineTo(apR, apB);
    ctx.lineTo(apL, apB);
    ctx.lineTo(apL, exB);
    ctx.lineTo(exL, exB);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Elevation & District Labels
    ctx.fillStyle = '#24160d';
    ctx.font = 'bold 11px serif';
    ctx.textAlign = 'center';
    const labels: Array<[number, number, string]> = [
      [0, 21, '南城门 (0m)'],
      [0, 2, 'S形贸易街 · A1卫戍/A2双层酒馆'],
      [0, -35, '中央市集 (+3.5m) · A3药铺'],
      [0, -56, '北墙大石阶观景台 (+7.5m)'],
      [-37, -44, '西翼工匠区 (+7m · P3)'],
      [37, -44, '东翼居民高地 (+7.5m · P3)'],
      [0, -84, '圣堂高地 (+12.2m · P4)'],
      [0, -114, '城堡前庭 (+18m · P4)'],
      [0, -134, '领主主堡 (+21→53m)'],
    ];
    for (const [lx, lz, text] of labels) {
      const [tx, ty] = toMap(lx, lz);
      ctx.fillText(text, tx, ty - 6);
    }

    // Player live marker
    const [px, py] = toMap(this.state.player.position.x, this.state.player.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.state.player.yaw);
    ctx.fillStyle = '#a32626';
    ctx.strokeStyle = '#fff3d6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private renderLore(): void {
    const title = this.loreContent?.title ?? '文献';
    const body = this.loreContent?.body ?? '';
    this.modalPanelEl.innerHTML = `
      <div class="modal-header" data-testid="modal-lore">
        <h2>${title}</h2>
        <button class="btn" id="btn-close-modal">收起</button>
      </div>
      <div class="dialogue-text" style="background:rgba(14,16,21,0.65); padding:16px; border-radius:3px;">${body}</div>
    `;
    this.modalPanelEl.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeModal());
  }

  private renderMenu(): void {
    const slotIds = ['slot_1', 'slot_2', 'slot_3', 'autosave'];
    const slotMap = new Map(this.saveSlotsCache.map((s) => [s.slotId, s]));
    const currentQuality = this.actions.getQualityPreset?.() ?? 'high';
    const telemetry = this.actions.getTelemetry?.();

    const slotsHtml = slotIds
      .map((slotId) => {
        const meta = slotMap.get(slotId);
        const dateStr = meta ? new Date(meta.timestamp).toLocaleString() : '空槽位';
        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">${slotId} ${meta ? `· ${meta.summary}` : ''}</span>
              <span class="item-desc">${dateStr}</span>
            </div>
            <div class="item-actions">
              <button class="btn btn-primary" data-save-slot="${slotId}">保存</button>
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
        <button class="btn btn-primary" id="btn-resume-game">继续冒险 [Esc]</button>
      </div>
      <div class="split-2">
        <div class="panel-card">
          <div class="panel-title">本地存档 (IndexedDB)</div>
          ${slotsHtml}
        </div>
        <div class="panel-card">
          <div class="panel-title">画质档位与实时性能</div>
          <div class="quality-btn-row">
            ${(['low', 'medium', 'high'] as QualityPreset[])
              .map(
                (q) =>
                  `<button class="btn ${currentQuality === q ? 'btn-primary' : ''}" data-quality="${q}">${q.toUpperCase()}</button>`,
              )
              .join('')}
          </div>
          ${
            telemetry
              ? `<div class="stat-grid">
                  <div class="stat-pill"><span>帧率 FPS</span><b>${telemetry.fps}</b></div>
                  <div class="stat-pill"><span>Draw Calls</span><b>${telemetry.drawCalls}</b></div>
                  <div class="stat-pill"><span>Triangles</span><b>${telemetry.triangles.toLocaleString()}</b></div>
                  <div class="stat-pill"><span>Textures</span><b>${telemetry.textures}</b></div>
                </div>`
              : ''
          }
          <div class="panel-title" style="margin-top:4px;">区域快速测试入口与音频</div>
          <div class="item-desc">
            WASD 移动 · Shift 奔跑 · Space 跳跃 · E 交互<br/>
            左键 近战 · 右键 火球术 · 3/4 快捷饮用药水<br/>
            I 行囊 · J 任务日志 · M 边境舆图 · Esc 系统菜单
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-travel-city" data-testid="btn-travel-city">${
              this.state.player.currentZone === 'ashenhold_city' ? '返回 溪谷村 (Overworld)' : '前往 灰烬城 (中央市集 · 双环城区)'
            }</button>
            <button class="btn" id="btn-toggle-mute">切换音效静音</button>
          </div>
        </div>
      </div>
    `;

    this.modalPanelEl.querySelector('#btn-resume-game')?.addEventListener('click', () => this.closeModal());
    this.modalPanelEl.querySelector('#btn-travel-city')?.addEventListener('click', () => {
      this.closeModal();
      this.actions.onToggleCityZone?.();
      this.refreshHUD();
    });
    this.modalPanelEl.querySelector('#btn-toggle-mute')?.addEventListener('click', () => {
      const muted = this.actions.onToggleMute();
      this.pushToast(muted ? '音效已静音' : '音效已开启', 'info');
    });

    this.modalPanelEl.querySelectorAll('[data-quality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-quality') as QualityPreset;
        this.actions.onSetQuality?.(q);
        this.renderMenu();
      });
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
        <h2 style="color:#d65454;">重伤倒下</h2>
      </div>
      <div class="dialogue-text">你在灰烬边境的战斗中失去了意识……但命运尚未终结。你将在【溪谷村】醒来，保留所有已取得的物品与任务进度。</div>
      <button class="btn btn-primary" id="btn-respawn" style="align-self:center; padding:11px 26px; font-size:14px;">在溪谷村复活</button>
    `;

    this.modalPanelEl.querySelector('#btn-respawn')?.addEventListener('click', () => {
      this.actions.onRespawn();
      this.closeModal();
      this.refreshHUD();
    });
  }
}
