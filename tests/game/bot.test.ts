// G2：P2のボットはsimと同じコマンドだけで動く。
import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';

function play(state: SimState, ticks: number) {
  const bot = new Bot('p2');
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const commands: Command[] = bot.think(state);
    const result = step(state, commands);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe('Bot', () => {
  it('throws toward the opponent 1.5 s after picking the ball up', () => {
    const { events } = play(createInitialState('p2'), 60 * 4);
    const pickup = events.find((e) => e.kind === 'pickup' && e.player === 'p2');
    const release = events.find((e) => e.kind === 'release' && e.player === 'p2');
    expect(pickup).toBeDefined();
    expect(release).toBeDefined();
    const holdTime = release!.at - pickup!.at;
    expect(holdTime).toBeGreaterThanOrEqual(1.5 * 60_000);
    expect(holdTime).toBeLessThan(1.5 * 60_000 + 10 * 1000); // 1.5秒＋投げ始め8F程度
    expect(events.some((e) => e.kind === 'crossing' && e.side === 'p1')).toBe(true);
  });

  it('is deterministic', () => {
    const a = play(createInitialState('p2'), 60 * 4);
    const b = play(createInitialState('p2'), 60 * 4);
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
  });
});
