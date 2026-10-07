import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';

const S = 60_000;
function active(): SimState {
  const state = createInitialState('p1');
  state.danger = { side: 'p1', expiresAt: 8 * S };
  state.ball = { mode: 'held', owner: 'p1' };
  return state;
}
function advance(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    const result = step(state, commands);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
function press(state: SimState, kind: 'step' | 'primary' | 'summon', player: 'p1' | 'p2' = 'p1'): Command {
  return { kind, player, at: state.now, seq: 0 };
}
function loose(state: SimState, side: 'p1' | 'p2' = 'p1') {
  state.ball = { mode: 'loose', position: { x: 4, y: 0.25, z: side === 'p1' ? 10 : -10 }, startsAt: 0 };
}

describe('stats and resources', () => {
  it('starts with default stats, full HP, quarter-unit cost and two steps', () => {
    const state = createInitialState('p1');
    for (const player of state.players) {
      expect(player.stats).toEqual({ attack: 5, defense: 5, agility: 5 });
      expect(player.hp).toBe(100);
      expect(player.maxHp).toBe(100);
      expect(player.cost).toBe(4);
      expect(player.stepPoints).toBe(2);
      expect(player.stepRecoveryProgress).toBe(0);
    }
    expect(config.maxCost).toBe(20);
    expect(config.maxStepPoints).toBe(2);
    expect(advance(active(), 3 * S).state.players[0].cost).toBe(4);
  });

  it.each([1, 5, 10])('derives HP, walking and recovery from stats (%s)', value => {
    const state = createInitialState('p1', config, { p1: { attack: value, defense: value, agility: value } });
    state.danger = { side: 'p2', expiresAt: 8 * S };
    state.ball = { mode: 'held', owner: 'p2' };
    const player = state.players[0];
    expect(player.hp).toBe(100 + 6 * (value - 5));
    expect(player.maxHp).toBe(player.hp);
    player.stepPoints = 0;
    player.stepRecoveryProgress = (20 - value) * S - config.tick;
    const result = step(state, [{ kind: 'move', player: 'p1', at: 0, seq: 0, x: 1, z: 0 }]);
    expect(result.state.players[0].position.x).toBeCloseTo(5 * (1 + 0.03 * (value - 5)) / 60);
    expect(result.state.players[0].stepPoints).toBe(1);
    expect(result.state.players[0].stepRecoveryProgress).toBe(0);
  });
});

describe('basic step', () => {
  it('consumes one point, moves 2.8m in 12F and ignores walking throughout 18F', () => {
    const state = active();
    state.players[0].move = { x: 0, z: -1 };
    const commands: Command[] = [press(state, 'step'), { kind: 'move', player: 'p1', at: 3_000, seq: 1, x: 1, z: 0 }];
    const half = advance(state, 6_000, commands);
    expect(half.state.players[0].position.z).toBeCloseTo(4.6);
    const moved = advance(half.state, 12_000, commands);
    expect(moved.state.players[0].stepPoints).toBe(1);
    expect(moved.state.players[0].position.z).toBeCloseTo(3.2);
    const recovered = advance(moved.state, 18_000, commands);
    expect(recovered.state.players[0].position.x).toBe(0);
    expect(recovered.state.players[0].position.z).toBeCloseTo(3.2);
    expect(half.events).toContainEqual({ kind: 'step', at: 0, player: 'p1', direction: 'forward' });
    expect(step(recovered.state, []).state.players[0].position.x).toBeCloseTo(5 / 60);
  });

  it.each([
    ['p1', 1, -0.5, 'right', 2.8, 0], ['p1', -1, -0.5, 'left', -2.8, 0],
    ['p1', 1, -1, 'forward', 0, -2.8], ['p1', -1, 1, 'back', 0, 2.8],
    ['p2', 1, 1, 'forward', 0, 2.8], ['p2', 1, 0.5, 'left', 2.8, 0],
    ['p2', -1, -0.5, 'right', -2.8, 0], ['p2', 0, -1, 'back', 0, -2.8],
  ] as const)('classifies court axes: %s move (%s,%s) -> %s', (id, x, z, direction, dx, dz) => {
    const state = active();
    const player = state.players.find(p => p.id === id)!;
    player.move = { x, z };
    player.yaw = Math.PI / 2;
    const result = advance(state, 12_000, [press(state, 'step', id)]);
    const moved = result.state.players.find(p => p.id === id)!;
    expect(moved.position.x).toBeCloseTo(player.position.x + dx);
    expect(moved.position.z).toBeCloseTo(player.position.z + dz);
    expect(result.events).toContainEqual({ kind: 'step', at: 0, player: id, direction });
  });

  it.each(['wall', 'empty', 'no-input', 'busy', 'not-started'] as const)('does not step or consume when %s', reason => {
    const state = active();
    const player = state.players[0];
    player.move = { x: 1, z: 0 };
    if (reason === 'wall') player.position.x = config.playerHalfWidth;
    if (reason === 'empty') player.stepPoints = 0;
    if (reason === 'no-input') player.move = { x: 0, z: 0 };
    if (reason === 'busy') player.action = { kind: 'recovery', endsAt: 8_000 };
    if (reason === 'not-started') state.danger = null;
    const result = step(state, [press(state, 'step')]);
    expect(result.events.some(e => e.kind === 'step')).toBe(false);
    expect(result.state.players[0].stepPoints).toBe(player.stepPoints);
  });

  it('allows partial movement clamped at the wall', () => {
    const state = active();
    state.players[0].position.x = config.playerHalfWidth - 1;
    state.players[0].move = { x: 1, z: 0 };
    const result = advance(state, 12_000, [press(state, 'step')]);
    expect(result.state.players[0].position.x).toBe(config.playerHalfWidth);
    expect(result.state.players[0].stepPoints).toBe(1);
  });

  it('does not protect against explosion', () => {
    const state = active();
    state.danger!.expiresAt = 6_000;
    state.players[0].move = { x: 1, z: 0 };
    expect(advance(state, 6_000, [press(state, 'step')]).state.players[0].hp).toBe(70);
  });

  it('accepts the next action exactly at the 18F end', () => {
    const state = active();
    state.players[0].move = { x: 1, z: 0 };
    const recovered = advance(state, 18_000, [press(state, 'step')]).state;
    const result = step(recovered, [press(recovered, 'primary')]);
    expect(result.state.players[0].action).toEqual({ kind: 'windup', endsAt: 26_000 });
  });
});

describe('R08 recovery', () => {
  it.each(['held', 'loose', 'flight'] as const)('accumulates only on the opponent side (%s), pauses and resumes', mode => {
    let state = active();
    state.players[0].stepPoints = 0;
    if (mode === 'held') state.ball = { mode: 'held', owner: 'p2' };
    if (mode === 'loose') loose(state, 'p2');
    if (mode === 'flight') state.ball = { mode: 'flight', side: 'p2', position: { x: 0, y: 1, z: -3 }, origin: { x: 0, y: 1, z: -3 }, releasedAt: 0, velocity: { x: 0, y: 0, z: -1 } };
    state = advance(state, S).state;
    expect(state.players[0].stepRecoveryProgress).toBe(S);
    state.ball = { mode: 'held', owner: 'p1' };
    state = advance(state, 2 * S).state;
    expect(state.players[0].stepRecoveryProgress).toBe(S);
    state.ball = { mode: 'held', owner: 'p2' };
    state = advance(state, 3 * S).state;
    expect(state.players[0].stepRecoveryProgress).toBe(2 * S);
    expect(Number.isInteger(state.players[0].stepRecoveryProgress)).toBe(true);
  });

  it('refills one point at a time and discards surplus when full', () => {
    let state = active();
    state.ball = { mode: 'held', owner: 'p2' };
    state.players[0].stepPoints = 0;
    state.players[0].stepRecoveryProgress = 15 * S - 500;
    state = step(state, []).state;
    expect(state.players[0].stepPoints).toBe(1);
    expect(state.players[0].stepRecoveryProgress).toBe(500);
    state.players[0].stepRecoveryProgress = 15 * S - 500;
    state = step(state, []).state;
    expect(state.players[0].stepPoints).toBe(2);
    expect(state.players[0].stepRecoveryProgress).toBe(0);
    state = advance(state, S).state;
    state.players[0].move = { x: 1, z: 0 };
    state = step(state, [press(state, 'step')]).state;
    expect(state.players[0].stepPoints).toBe(1);
    expect(state.players[0].stepRecoveryProgress).toBe(config.tick);
  });

  it('stops while absent, during spawn delay and before the first clock starts', () => {
    const state = active();
    state.players[1].stepPoints = 0;
    state.players[1].stepRecoveryProgress = S;
    state.danger!.expiresAt = 500;
    const result = advance(state, 120_000);
    expect(result.state.players[1].stepRecoveryProgress).toBe(S + 500);
    const first = createInitialState('p2');
    first.players[0].stepPoints = 0;
    expect(advance(first, S).state.players[0].stepRecoveryProgress).toBe(0);
  });

  it('switches both players at the exact integer center crossing inside a tick', () => {
    const state = active();
    state.players.forEach(p => { p.stepPoints = 0; });
    state.ball = { mode: 'flight', side: 'p1', position: { x: 0, y: 1, z: 0.1 }, origin: { x: 0, y: 1, z: 0.1 }, releasedAt: 0, velocity: { x: 0, y: 0, z: -28 } };
    const result = step(state, []);
    const crossing = Math.ceil(0.1 / 28 * S);
    expect(result.events).toContainEqual({ kind: 'crossing', at: crossing, side: 'p2' });
    expect(result.state.players[0].stepRecoveryProgress).toBe(config.tick - crossing);
    expect(result.state.players[1].stepRecoveryProgress).toBe(crossing);
  });
});

describe('common summon and simultaneous action priority', () => {
  it('summons a loose own-side ball for four quarters and preserves R01 deadline', () => {
    const state = active();
    loose(state);
    const result = step(state, [press(state, 'summon')]);
    expect(result.state.ball).toEqual({ mode: 'held', owner: 'p1' });
    expect(result.state.players[0].cost).toBe(0);
    expect(result.state.danger).toEqual(state.danger);
    expect(result.events).toContainEqual({ kind: 'summon', at: 0, player: 'p1' });
    expect(advance(result.state, 8 * S).state.players[0].hp).toBe(70);
  });

  it.each(['flight', 'held', 'other-side', 'cost', 'windup', 'recovery', 'step', 'not-started'] as const)('fails without consuming when %s', reason => {
    let state = active();
    loose(state);
    if (reason === 'held') state.ball = { mode: 'held', owner: 'p2' };
    if (reason === 'flight') state.ball = { mode: 'flight', side: 'p1', position: { x: 4, y: 1, z: 10 }, origin: { x: 4, y: 1, z: 10 }, releasedAt: 0, velocity: { x: 0, y: 0, z: -1 } };
    if (reason === 'other-side') loose(state, 'p2');
    if (reason === 'cost') state.players[0].cost = 3;
    if (reason === 'windup' || reason === 'recovery') state.players[0].action = { kind: reason, endsAt: 8_000 };
    if (reason === 'step') state = stateStepAction(state);
    if (reason === 'not-started') {
      state.danger = null;
      if (state.ball.mode === 'loose') state.ball.startsAt = S;
    }
    const result = step(state, [press(state, 'summon')]);
    expect(result.state.players[0].cost).toBe(state.players[0].cost);
    expect(result.events.some(e => e.kind === 'summon')).toBe(false);
  });

  it.each([false, true])('step wins regardless of seq and command order (reverse=%s)', reverse => {
    const state = active();
    state.players[0].move = { x: 1, z: 0 };
    const commands = [press(state, 'primary'), { ...press(state, 'step'), seq: 99 }, press(state, 'summon')];
    if (reverse) commands.reverse();
    const result = step(state, commands);
    expect(result.state.players[0].action?.kind).toBe('step');
    expect(result.state.players[0].stepPoints).toBe(1);
    expect(result.state.players[0].cost).toBe(4);
  });

  it('step suppresses summon when both would otherwise succeed', () => {
    const state = active();
    loose(state);
    state.players[0].move = { x: 1, z: 0 };
    const result = step(state, [press(state, 'summon'), { ...press(state, 'step'), seq: 99 }]);
    expect(result.state.ball.mode).toBe('loose');
    expect(result.state.players[0].cost).toBe(4);
    expect(result.events.map(e => e.kind)).toEqual(['step']);
  });

  it('tries lower priority actions when higher ones fail and allows only one success', () => {
    const state = active();
    const primary = step(state, [press(state, 'summon'), press(state, 'primary'), press(state, 'step')]);
    expect(primary.state.players[0].action?.kind).toBe('windup');
    loose(state);
    const summoned = step(state, [press(state, 'summon'), press(state, 'primary'), press(state, 'step'), press(state, 'summon')]);
    expect(summoned.state.players[0].cost).toBe(0);
    expect(summoned.state.players[0].action).toBeNull();
    expect(summoned.events.filter(e => e.kind === 'summon')).toHaveLength(1);
  });

  it('uses same-time move input for step even when its seq is later', () => {
    const state = active();
    const result = step(state, [press(state, 'step'), { kind: 'move', player: 'p1', at: 0, seq: 99, x: 0, z: -1 }]);
    expect(result.events).toContainEqual({ kind: 'step', at: 0, player: 'p1', direction: 'forward' });
  });
});

function stateStepAction(state: SimState) {
  state.players[0].move = { x: 1, z: 0 };
  return step(state, [press(state, 'step')]).state;
}
