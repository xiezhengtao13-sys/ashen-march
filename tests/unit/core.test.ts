import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { GameState } from '../../src/core/GameState';
import { SeededRandom } from '../../src/core/SeededRandom';
import type { GameEvents } from '../../src/core/types';

describe('Stage 0 Core Primitives', () => {
  it('SeededRandom produces deterministic sequences for identical seeds', () => {
    const a = new SeededRandom(133742);
    const b = new SeededRandom(133742);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);

    const s1 = new SeededRandom('ravendale');
    const s2 = new SeededRandom('ravendale');
    expect(s1.int(1, 100)).toBe(s2.int(1, 100));
  });

  it('EventBus registers, emits, and unsubscribes handlers cleanly', () => {
    const bus = new EventBus<GameEvents>();
    const handler = vi.fn();
    const unsub = bus.on('hud:notify', handler);

    bus.emit('hud:notify', { text: 'Welcome to Ashen March', kind: 'info' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ text: 'Welcome to Ashen March', kind: 'info' });

    unsub();
    bus.emit('hud:notify', { text: 'Second message' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('GameState initializes default player, inventory, and tracks world flags', () => {
    const state = new GameState();
    expect(state.player.currentZone).toBe('overworld');
    expect(state.player.stats.level).toBe(1);
    expect(state.equipped.weapon).toBe('iron_sword');

    state.setFlag('talked_elder', true);
    expect(state.hasFlag('talked_elder')).toBe(true);

    expect(state.markLocationDiscovered('ashwood_forest', '灰木森林')).toBe(true);
    expect(state.markLocationDiscovered('ashwood_forest', '灰木森林')).toBe(false);
    expect(state.world.discoveredLocations).toContain('ashwood_forest');
  });
});
