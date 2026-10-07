import { duelParticipants } from '../fixtures';
import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';

const F = c.frame;
function run(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    const result = step(state, commands, { ...c, tick: Math.min(F, until - state.now) });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
function exploded() {
  return run(createInitialState({ participants: duelParticipants, firstBall: 'a' }), c.ballStartDelay + c.dangerDuration).state;
}

describe('M8-6 movement during the explosion pause', () => {
  it('both players walk throughout absent and spawned-ball waits; step recovery stays paused', () => {
    const initial = exploded();
    initial.players.forEach(p => {
      p.move = { x: 1, z: 0 };
      p.stepPoints = 1;
      p.stepRecoveryProgress = c.timeUnitsPerSecond;
    });
    const spawned = run(initial, initial.now + c.newBallAppearDelay).state;
    expect(spawned.ball.mode).toBe('loose');
    const beforeClock = run(spawned, spawned.now + c.ballStartDelay - 1).state;
    expect(beforeClock.danger).toBeNull();
    for (let i = 0; i < initial.players.length; i++) {
      expect(spawned.players[i].position.x - initial.players[i].position.x).toBeCloseTo(c.walkSpeed * c.newBallAppearDelay / c.timeUnitsPerSecond);
      expect(beforeClock.players[i].position.x - spawned.players[i].position.x).toBeCloseTo(c.walkSpeed * (c.ballStartDelay - 1) / c.timeUnitsPerSecond);
      expect(beforeClock.players[i].stepRecoveryProgress).toBe(initial.players[i].stepRecoveryProgress);
      expect(beforeClock.players[i].stepPoints).toBe(1);
    }
  });

  it.each([0, c.newBallAppearDelay])('step works at explosion +%s, traverses configured distance and stays in bounds', delay => {
    const initial = run(exploded(), c.ballStartDelay + c.dangerDuration + delay).state;
    initial.players[0].move = { x: 1, z: 0 };
    initial.players[1].move = { x: -1, z: 0 };
    const commands: Command[] = initial.players.map((p, seq) => ({ kind: 'step', player: p.id, at: initial.now, seq }));
    const result = run(initial, initial.now + c.stepMoveDuration, commands);
    expect(result.events.filter(e => e.kind === 'step')).toHaveLength(2);
    expect(result.state.players[0].position.x - initial.players[0].position.x).toBeCloseTo(c.stepDistance);
    expect(initial.players[1].position.x - result.state.players[1].position.x).toBeCloseTo(c.stepDistance);
    expect(result.state.players.every(p => p.stepPoints === c.maxStepPoints - 1)).toBe(true);
    expect(result.state.danger).toBeNull();
  });

  it('walking and steps clamp at the cage boundaries during the pause', () => {
    const initial = exploded();
    initial.players[0].position.x = c.playerHalfWidth - c.stepDistance / 2;
    const stepped = run(initial, initial.now + c.stepActionDuration + F, [
      { kind: 'move', player: 'p1', at: initial.now, seq: 0, x: 1, z: 0 },
      { kind: 'step', player: 'p1', at: initial.now, seq: 1 },
    ]);
    expect(stepped.state.players[0].position.x).toBe(c.playerHalfWidth);
    const blocked = step(stepped.state, [{ kind: 'step', player: 'p1', at: stepped.state.now, seq: 0 }]);
    expect(blocked.events.some(e => e.kind === 'step')).toBe(false);
    expect(blocked.state.players[0].stepPoints).toBe(stepped.state.players[0].stepPoints);
  });

  it.each(['primary', 'secondary', 'feint', 'summon'] as const)('%s still requires a running clock', kind => {
    const initial = exploded();
    if (kind === 'primary' || kind === 'feint') initial.ball = { mode: 'held', owner: 'p1' };
    if (kind === 'summon') initial.ball = { mode: 'loose', position: { ...c.supply.a, x: c.pickupRadius * 2 }, startsAt: initial.now + c.ballStartDelay,
      velocity: { x: 0, y: 0, z: 0 }, motionAt: initial.now, nextPhysicsAt: initial.now + F };
    const result = step(initial, [{ kind, player: 'p1', at: initial.now, seq: 0 }]);
    expect(result.state.players[0].action).toBeNull();
    expect(result.state.players[0].cost).toBe(initial.players[0].cost);
    expect(result.events).toEqual([]);
  });

  it('before a round first starts, held movement and step input do not move or consume', () => {
    const initial = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    const result = run(initial, c.ballStartDelay - 1, [
      { kind: 'move', player: 'p1', at: 0, seq: 0, x: 1, z: 0 },
      { kind: 'step', player: 'p1', at: F, seq: 1 },
    ]);
    expect(result.state.players[0].position).toEqual(initial.players[0].position);
    expect(result.state.players[0].stepPoints).toBe(c.maxStepPoints);
    expect(result.events).toEqual([]);
  });
});
