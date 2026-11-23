import type { GameState } from '../core/GameState';
import type { ComputedPlayerStats, EquipSlot, InventorySlot, ItemDefinition } from '../core/types';
import itemsData from '../data/items.json';

export class InventorySystem {
  private readonly itemMap = new Map<string, ItemDefinition>();
  private readonly state: GameState;
  private onDropSpawn?: (itemDef: ItemDefinition, quantity: number) => void;

  constructor(state: GameState, onDropSpawn?: (itemDef: ItemDefinition, quantity: number) => void) {
    this.state = state;
    this.onDropSpawn = onDropSpawn;
    for (const raw of itemsData.items) {
      this.itemMap.set(raw.id, raw as ItemDefinition);
    }
  }

  setDropSpawner(cb: (itemDef: ItemDefinition, quantity: number) => void): void {
    this.onDropSpawn = cb;
  }

  getItemDef(itemId: string): ItemDefinition | undefined {
    return this.itemMap.get(itemId);
  }

  getAllDefinitions(): ItemDefinition[] {
    return [...this.itemMap.values()];
  }

  getSlots(): InventorySlot[] {
    return this.state.inventory;
  }

  getCount(itemId: string): number {
    let total = 0;
    for (const slot of this.state.inventory) {
      if (slot.itemId === itemId) total += slot.quantity;
    }
    return total;
  }

  hasItem(itemId: string, quantity = 1): boolean {
    return this.getCount(itemId) >= quantity;
  }

  addItem(itemId: string, quantity = 1, sourceId?: string): boolean {
    const def = this.itemMap.get(itemId);
    if (!def || quantity <= 0) return false;

    if (def.stackable) {
      const existing = this.state.inventory.find((s) => s.itemId === itemId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        this.state.inventory.push({ itemId, quantity });
      }
    } else {
      for (let i = 0; i < quantity; i++) {
        this.state.inventory.push({ itemId, quantity: 1 });
      }
    }

    this.state.events.emit('item:collected', { itemId, quantity, sourceId });
    this.state.events.emit('hud:notify', {
      text: `获得物品：${def.name}${quantity > 1 ? ` ×${quantity}` : ''}`,
      kind: 'loot',
    });
    return true;
  }

  removeItem(itemId: string, quantity = 1): boolean {
    if (!this.hasItem(itemId, quantity)) return false;
    let remaining = quantity;

    for (let i = this.state.inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.state.inventory[i];
      if (slot.itemId !== itemId) continue;

      if (slot.quantity <= remaining) {
        remaining -= slot.quantity;
        this.state.inventory.splice(i, 1);
      } else {
        slot.quantity -= remaining;
        remaining = 0;
      }
    }

    // Unequip if no copies remain in inventory
    const def = this.itemMap.get(itemId);
    if (def?.equipSlot && !this.hasItem(itemId, 1)) {
      if (this.state.equipped[def.equipSlot] === itemId) {
        this.state.equipped[def.equipSlot] = null;
        this.clampPoolsToMax();
      }
    }

    this.state.events.emit('item:removed', { itemId, quantity });
    return true;
  }

  equipItem(itemId: string): boolean {
    const def = this.itemMap.get(itemId);
    if (!def || !def.equipSlot || !this.hasItem(itemId, 1)) return false;

    this.state.equipped[def.equipSlot] = itemId;
    this.clampPoolsToMax();
    this.state.events.emit('hud:notify', { text: `已装备：${def.name}`, kind: 'info' });
    return true;
  }

  unequipSlot(slot: EquipSlot): boolean {
    const currentId = this.state.equipped[slot];
    if (!currentId) return false;
    const def = this.itemMap.get(currentId);
    this.state.equipped[slot] = null;
    this.clampPoolsToMax();
    if (def) {
      this.state.events.emit('hud:notify', { text: `已卸下：${def.name}`, kind: 'info' });
    }
    return true;
  }

  useItem(itemId: string): boolean {
    const def = this.itemMap.get(itemId);
    if (!def || def.category !== 'consumable' || !this.hasItem(itemId, 1)) return false;

    const computed = this.getComputedStats();
    const stats = this.state.player.stats;
    let used = false;

    if (def.stats.healHp && stats.hp < computed.maxHp) {
      stats.hp = Math.min(computed.maxHp, stats.hp + def.stats.healHp);
      used = true;
    }
    if (def.stats.restoreMp && stats.mp < computed.maxMp) {
      stats.mp = Math.min(computed.maxMp, stats.mp + def.stats.restoreMp);
      used = true;
    }

    if (!used) {
      // Allow consuming even if already near full only if it actually heals/restores something; otherwise notify
      this.state.events.emit('hud:notify', { text: `${def.name}：当前状态无需恢复`, kind: 'info' });
      return false;
    }

    this.removeItem(itemId, 1);
    this.state.events.emit('hud:notify', { text: `使用了 ${def.name}`, kind: 'info' });
    return true;
  }

  dropItem(itemId: string): boolean {
    const def = this.itemMap.get(itemId);
    if (!def || def.category === 'quest' || !this.hasItem(itemId, 1)) return false;

    const removed = this.removeItem(itemId, 1);
    if (!removed) return false;

    this.onDropSpawn?.(def, 1);
    this.state.events.emit('hud:notify', { text: `丢弃了 ${def.name}`, kind: 'info' });
    return true;
  }

  buyItem(itemId: string): boolean {
    const def = this.itemMap.get(itemId);
    if (!def || def.value <= 0) return false;
    if (this.state.player.stats.gold < def.value) {
      this.state.events.emit('hud:notify', { text: '金币不足！', kind: 'warning' });
      return false;
    }

    this.state.player.stats.gold -= def.value;
    this.addItem(itemId, 1);
    return true;
  }

  sellItem(itemId: string): boolean {
    const def = this.itemMap.get(itemId);
    if (!def || def.category === 'quest' || def.value <= 0 || !this.hasItem(itemId, 1)) return false;

    const sellPrice = Math.max(1, Math.floor(def.value * 0.5));
    if (!this.removeItem(itemId, 1)) return false;

    this.state.player.stats.gold += sellPrice;
    this.state.events.emit('hud:notify', {
      text: `出售 ${def.name} 获得 ${sellPrice} 金币`,
      kind: 'loot',
    });
    return true;
  }

  addXp(amount: number): boolean {
    if (amount <= 0) return false;
    const stats = this.state.player.stats;
    stats.xp += amount;
    let leveledUp = false;

    while (stats.xp >= stats.xpToNextLevel) {
      stats.xp -= stats.xpToNextLevel;
      stats.level += 1;
      stats.xpToNextLevel = Math.round(stats.xpToNextLevel * 1.45);
      stats.maxHp += 18;
      stats.maxMp += 10;
      stats.baseAttack += 3;
      stats.baseMagic += 3;
      stats.baseDefense += 1;

      const computed = this.getComputedStats();
      stats.hp = computed.maxHp;
      stats.mp = computed.maxMp;
      stats.stamina = stats.maxStamina;
      leveledUp = true;

      this.state.events.emit('player:leveled_up', {
        level: stats.level,
        maxHp: computed.maxHp,
        maxMp: computed.maxMp,
      });
      this.state.events.emit('hud:notify', {
        text: `等级提升！当前等级 Lv.${stats.level}`,
        kind: 'quest',
      });
    }

    return leveledUp;
  }

  getComputedStats(): ComputedPlayerStats {
    const stats = this.state.player.stats;
    let attack = stats.baseAttack + stats.bonusAttack;
    let magic = stats.baseMagic + stats.bonusMagic;
    let defense = stats.baseDefense + stats.bonusDefense;
    let maxHp = stats.maxHp;
    let maxMp = stats.maxMp;

    const slotIds = [
      this.state.equipped.weapon,
      this.state.equipped.armor,
      this.state.equipped.accessory,
    ];
    for (const id of slotIds) {
      if (!id) continue;
      const def = this.itemMap.get(id);
      if (!def) continue;
      attack += def.stats.attack ?? 0;
      magic += def.stats.magic ?? 0;
      defense += def.stats.defense ?? 0;
      maxHp += def.stats.maxHp ?? 0;
      maxMp += def.stats.maxMp ?? 0;
    }

    return { attack, magic, defense, maxHp, maxMp };
  }

  private clampPoolsToMax(): void {
    const computed = this.getComputedStats();
    this.state.player.stats.hp = Math.min(this.state.player.stats.hp, computed.maxHp);
    this.state.player.stats.mp = Math.min(this.state.player.stats.mp, computed.maxMp);
  }
}
