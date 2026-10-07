import { duelParticipants } from '../fixtures';
// フリ（R06、0007 S5-9〜S5-13）：開始時だけ消費、8Fで保持に戻る、解除条件、本投げは押下から8F。
import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';
const F = c.frame;
const command = (kind: 'feint' | 'primary' | 'secondary' | 'step' | 'summon', at = 0, seq = 0): Command => ({ kind, at, seq, player: 'p1' });
function held() {
  const state = createInitialState({ participants: duelParticipants, firstBall: 'a' }); state.danger = { side: 'a', expiresAt: c.dangerDuration };
  state.ball = { mode: 'held', owner: 'p1' }; return state;
}
function run(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    const result = step(state, commands, { ...c, tick: Math.min(F, until - state.now) });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
describe('S5-9..10 feint start, cost and completion', () => {
  it('consumes one quarter once and ends holding without release/recovery/refund', () => {
    const initial = held(); initial.players[0].cost = 1;
    const active = run(initial, c.throwWindup - 1, [command('feint')]);
    expect(active.state.players[0].action).toEqual({ kind: 'feint', startedAt: 0, endsAt: c.throwWindup });
    expect(active.state.ball).toEqual(initial.ball); expect(active.state.players[0].cost).toBe(0);
    const atEnd = run(active.state, c.throwWindup);
    expect(atEnd.state.players[0].action).toBeNull();
    const done = run(atEnd.state, c.throwWindup + 1);
    expect(done.state.players[0].action).toBeNull(); expect(done.state.ball).toEqual(initial.ball);
    expect(done.state.players[0].cost).toBe(0); expect([...active.events, ...done.events]).toEqual([]);
  });
  it.each(['cost', 'nonholding', 'busy', 'dead', 'stopped'] as const)('rejects %s', condition => {
    const initial = held();
    if (condition === 'cost') initial.players[0].cost = 0;
    if (condition === 'nonholding') initial.ball = { mode: 'held', owner: 'p2' };
    if (condition === 'busy') initial.players[0].action = { kind: 'recovery', endsAt: c.throwRecovery };
    if (condition === 'dead') initial.players[0].hp = 0;
    if (condition === 'stopped') initial.danger = null;
    const result = step(initial, [command('feint')]);
    expect(result.state.players[0].cost).toBe(initial.players[0].cost);
    expect(result.state.players[0].action?.kind).not.toBe('feint');
  });
  it('walks at windup multiplier throughout feint and restores walking at completion', () => {
    const initial = held(); initial.players[0].move = { x: 1, z: 0 };
    const active = run(initial, c.throwWindup, [command('feint')]);
    expect(active.state.players[0].position.x).toBeCloseTo(c.walkSpeed * c.windupWalkMultiplier * c.throwWindup / c.timeUnitsPerSecond);
    const done = run(active.state, c.throwWindup + F);
    expect(done.state.players[0].position.x - active.state.players[0].position.x).toBeCloseTo(c.walkSpeed * F / c.timeUnitsPerSecond);
  });
});
describe('S5-11 cancellation and priority', () => {
  it.each(['secondary', 'step', 'summon'] as const)('later failed %s still cancels, without refund', kind => {
    const initial = held(); const result = run(initial, F + 1, [command('feint'), command(kind, F)]);
    expect(result.state.players[0].action).toBeNull(); expect(result.state.players[0].cost).toBe(initial.players[0].cost - 1);
    expect(result.state.danger).toEqual(initial.danger);
  });
  it('a later feint cancels and restarts, paying again; fails if remaining cost is insufficient', () => {
    for (const cost of [1, 2]) {
      const initial = held(); initial.players[0].cost = cost;
      const result = run(initial, F + 1, [command('feint'), command('feint', F)]);
      expect(result.state.players[0].cost).toBe(0);
      expect(result.state.players[0].action).toEqual(cost === 1 ? null : { kind: 'feint', startedAt: F, endsAt: F + c.throwWindup });
    }
  });
  it('same-time inputs, same effective keys, move/yaw preserve feint', () => {
    const commands: Command[] = [command('feint'), command('summon', 0, 1),
      { kind: 'keys', at: 0, seq: 2, player: 'p1', forward: 1, right: 0 },
      { kind: 'keys', at: F, seq: 3, player: 'p1', forward: 8, right: 0 },
      { kind: 'move', at: F, seq: 4, player: 'p1', x: 1, z: 0 },
      { kind: 'yaw', at: F, seq: 5, player: 'p1', yaw: 1 }];
    expect(run(held(), F + 1, commands).state.players[0].action?.kind).toBe('feint');
    const saved = run(held(), 1, [command('feint')]).state;
    saved.now = 0; // Exercise a saved active feint with more commands at its start timestamp.
    expect(step(saved, [{ kind: 'keys', at: 0, seq: 5, player: 'p1', forward: -1, right: 0 }, command('primary'), command('secondary'), command('step'), command('feint'), command('summon')]).state.players[0].action?.kind).toBe('feint');
  });
  it('changed effective keys cancel on a later timestamp', () => {
    const commands: Command[] = [command('feint'), { kind: 'keys', at: F, seq: 1, player: 'p1', forward: -1, right: 0 }];
    const result = run(held(), F + 1, commands);
    expect(result.state.players[0].action).toBeNull(); expect(result.state.players[0].cost).toBe(c.initialCost - 1);
  });
  it('same-time step beats throw, throw beats feint, feint beats summon independently of seq', () => {
    const initial = held(); initial.players[0].move = { x: 1, z: 0 };
    expect(step(initial, [command('feint'), command('primary', 0, 1), command('step', 0, 2)]).state.players[0].action?.kind).toBe('step');
    expect(step(held(), [command('feint'), command('primary', 0, 1)]).state.players[0].action?.kind).toBe('windup');
    expect(step(held(), [command('summon'), command('feint', 0, 1)]).state.players[0].action?.kind).toBe('feint');
  });
});
describe('S5-12..13 fresh windup and danger clock', () => {
  it.each([1, F, c.throwWindup - 1])('primary at %s releases only a full windup later', at => {
    const initial = held(); const commands = [command('feint'), command('primary', at)];
    const before = run(initial, at + c.throwWindup, commands);
    expect(before.events.some(e => e.kind === 'release')).toBe(false); expect(before.state.ball.mode).toBe('held');
    const after = run(before.state, at + c.throwWindup + 1, commands);
    expect(after.events.filter(e => e.kind === 'release')).toEqual([{ kind: 'release', at: at + c.throwWindup, player: 'p1' }]);
  });
  it('start, cancel and completion never change expiry; explosion still interrupts feint', () => {
    const initial = held(); initial.danger!.expiresAt = F;
    const result = run(initial, F + 1, [command('feint')]);
    expect(result.events).toEqual([{ kind: 'explosion', at: F, side: 'a' }]);
    expect(result.state.players[0].hp).toBe(initial.players[0].hp - c.explosionDamage);
    expect(result.state.players[0].action).toBeNull();
    const completed = run(held(), c.throwWindup + 1, [command('feint')]);
    expect(completed.state.danger).toEqual(held().danger);
  });
});
