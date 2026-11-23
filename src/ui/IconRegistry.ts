import type { ItemCategory, ItemDefinition } from '../core/types';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export function getItemRarity(def: ItemDefinition): { tier: ItemRarity; label: string; color: string } {
  if (def.id === 'watchers_relic' || def.id === 'watchers_runeblade' || def.id === 'warden_plate') {
    return { tier: 'epic', label: '传说遗物', color: '#d49a45' };
  }
  if (def.id === 'ashen_amulet' || def.id === 'chainmail_vest' || def.id === 'hunters_saber' || def.id === 'greater_health_potion') {
    return { tier: 'rare', label: '精良', color: '#5c9cd4' };
  }
  if (def.category === 'quest') {
    return { tier: 'uncommon', label: '关键线索', color: '#70b379' };
  }
  return { tier: 'common', label: '普通', color: '#9aa0a8' };
}

export function getCategoryLabel(cat: ItemCategory): string {
  switch (cat) {
    case 'weapon':
      return '武器';
    case 'armor':
      return '防具';
    case 'accessory':
      return '饰品';
    case 'consumable':
      return '药水';
    case 'quest':
      return '任务';
    case 'material':
      return '材料';
  }
}

export function getItemIconSvg(itemId: string, category: ItemCategory, accent = '#c9a66b'): string {
  if (itemId === 'watchers_relic') {
    return `<svg viewBox="0 0 32 32" fill="none"><polygon points="16,3 25,13 16,29 7,13" stroke="#f0c869" stroke-width="2" fill="rgba(240,200,105,0.2)"/><circle cx="16" cy="14" r="4" fill="#6ce5ff"/></svg>`;
  }
  if (itemId === 'watchers_journal') {
    return `<svg viewBox="0 0 32 32" fill="none"><rect x="7" y="5" width="18" height="22" rx="2" fill="#5e3422" stroke="#c9a66b" stroke-width="1.6"/><path d="M11 5v22M14 11h7M14 15h7M14 19h5" stroke="#e8d8b5" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  if (itemId === 'ashen_herb') {
    return `<svg viewBox="0 0 32 32" fill="none"><path d="M16 27V11M16 21C11 19 8 14 9 9c4 1 7 5 7 10m0 0c0-5 3-9 7-10 1 5-2 10-7 12" stroke="#6cc478" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="8" r="2.5" fill="#e89a48"/></svg>`;
  }
  if (itemId === 'goblin_totem') {
    return `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="14" r="7" fill="#a8987d" stroke="#594d3b" stroke-width="1.6"/><circle cx="13.5" cy="13" r="1.5" fill="#231f1b"/><circle cx="18.5" cy="13" r="1.5" fill="#231f1b"/><path d="M13 18h6M16 21v7" stroke="#85755c" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (category === 'weapon') {
    return `<svg viewBox="0 0 32 32" fill="none"><path d="M25 5l2 2-12 12-2-2L25 5z" fill="${accent}" stroke="#dce3eb" stroke-width="1.4"/><path d="M9 15l8 8M7 25l4-4" stroke="#c9a66b" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  if (category === 'armor') {
    return `<svg viewBox="0 0 32 32" fill="none"><path d="M10 6l6 3 6-3 4 5-3 4v11H9V15L6 11l4-5z" fill="rgba(140,154,170,0.22)" stroke="${accent}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  }
  if (category === 'accessory') {
    return `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="18" r="7" stroke="#c9a66b" stroke-width="2"/><polygon points="16,5 20,11 16,15 12,11" fill="${accent}" stroke="#f2d699" stroke-width="1.2"/></svg>`;
  }
  if (category === 'consumable') {
    const isMana = itemId.includes('mana');
    const fill = isMana ? '#3c80d6' : '#c93c3c';
    return `<svg viewBox="0 0 32 32" fill="none"><path d="M13 5h6v4l5 7a6 6 0 01-5 9h-6a6 6 0 01-5-9l5-7V5z" fill="${fill}" fill-opacity="0.72" stroke="#d8cfc0" stroke-width="1.6"/><path d="M12 5h8" stroke="#c9a66b" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 32 32" fill="none"><rect x="7" y="7" width="18" height="18" rx="3" stroke="${accent}" stroke-width="1.8"/></svg>`;
}

export const SPELL_ICON_SVG = `<svg viewBox="0 0 32 32" fill="none"><path d="M16 4c4 5 8 9 8 14a8 8 0 11-16 0c0-4 3-8 6-11 0 3 2 5 2 5s2-4 0-8z" fill="#ff7828" stroke="#ffd27d" stroke-width="1.5"/></svg>`;
export const COIN_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#c99b3b" stroke="#f0d284" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" stroke="#855f19" stroke-width="1.2"/></svg>`;
