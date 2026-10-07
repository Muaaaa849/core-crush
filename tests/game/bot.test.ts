// G2：P2のボットはsimと同じコマンドだけで動く。
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/sim/config';
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
  it('resets per-hold state across a draw replay even if intermediate ticks were not observed', () => {
    const bot = new Bot('p2');
    const state = createInitialState('p2');
    state.ball = { mode: 'held', owner: 'p2' };
    state.danger = { side: 'p2', expiresAt: defaultConfig.dangerDuration };
    expect(bot.think(state)).toEqual([]);
    state.now = 1.5 * defaultConfig.timeUnitsPerSecond;
    expect(bot.think(state).some(c => c.kind === 'primary')).toBe(true);
    // Same round number after a draw, but a new round's first clock/hold.
    state.now += defaultConfig.roundResultDuration + defaultConfig.ballStartDelay;
    state.match.roundStartsAt = state.now;
    expect(bot.think(state)).toEqual([]);
    state.now += 1.5 * defaultConfig.timeUnitsPerSecond;
    expect(bot.think(state).some(c => c.kind === 'primary')).toBe(true);
  });

  it('does not count frozen result time as holding time', () => {
    const bot = new Bot('p2');
    const state = createInitialState('p2');
    state.ball = { mode: 'held', owner: 'p2' };
    state.danger = { side: 'p2', expiresAt: defaultConfig.dangerDuration };
    expect(bot.think(state)).toEqual([]);
    state.now += defaultConfig.roundResultDuration;
    state.match.phase = 'result';
    state.danger = null;
    expect(bot.think(state)).toEqual([]);
    state.match.phase = 'play';
    state.danger = { side: 'p2', expiresAt: state.now + defaultConfig.dangerDuration };
    expect(bot.think(state)).toEqual([]);
  });

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

// S5-14: feed bot Commands into the real sim, observing shots at release.
describe('S5-14 bot shot cycle and feint', () => {
  it('cycles straight/left/right/upper twice and feints before every fourth throw', () => {
    const bot = new Bot('p2');
    let state = createInitialState('p2');
    const shots: string[] = [];
    for (let turn = 1; turn <= 8; turn++) {
      state.ball = { mode: 'held', owner: 'p2' };
      state.danger = { side: 'p2', expiresAt: state.now + defaultConfig.dangerDuration };
      state.players.forEach(p => { p.action = null; p.hp = p.maxHp; p.cost = defaultConfig.maxCost; });
      const feints: Command[] = [], primaries: Command[] = [];
      let feintEnd: number | undefined;
      let released = false;
      for (let tick = 0; tick < 3 * defaultConfig.timeUnitsPerSecond / defaultConfig.tick && !released; tick++) {
        const commands = bot.think(state);
        feints.push(...commands.filter(c => c.kind === 'feint'));
        primaries.push(...commands.filter(c => c.kind === 'primary'));
        const result = step(state, commands); state = result.state;
        if (state.players[1].action?.kind === 'feint') feintEnd = state.players[1].action.endsAt;
        if (result.events.some(e => e.kind === 'release')) {
          expect(state.ball.mode).toBe('flight');
          if (state.ball.mode === 'flight') shots.push(state.ball.attack!.shot);
          released = true;
        }
      }
      expect(released).toBe(true);
      expect(feints).toHaveLength(turn % 4 === 0 ? 1 : 0);
      expect(primaries).toHaveLength(1);
      if (turn % 4 === 0) expect(primaries[0].at).toBe(feintEnd);
      expect(bot.think(state)).toEqual([]); // Observe release before next held episode.
    }
    expect(shots).toEqual(['straight', 'left', 'right', 'upper', 'straight', 'left', 'right', 'upper']);
  });
});
