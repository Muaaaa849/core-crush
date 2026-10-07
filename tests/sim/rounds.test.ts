import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';

const F = c.frame, S = c.timeUnitsPerSecond;
function run(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until && state.match.phase !== 'over') {
    const result = step(state, commands, { ...c, tick: Math.min(F, until - state.now) });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
function playing(side: 'p1' | 'p2' = 'p2') {
  return run(createInitialState(side), c.ballStartDelay).state;
}
function koSetup() {
  const state = playing();
  state.players[1].hp = c.explosionDamage;
  state.danger!.expiresAt = state.now + F / 2;
  return state;
}
function deadlineHit() {
  const state = playing('p1');
  state.now = state.match.roundEndsAt - F;
  const target = state.players[1];
  target.hp = c.hitDamage;
  state.danger = { side: 'p2', expiresAt: state.match.roundEndsAt + c.dangerDuration };
  const speed = c.timeUnitsPerSecond / F;
  const origin = { x: target.position.x, y: c.defenseHeight,
    z: target.position.z + c.capsuleRadius + c.ballDiameter / 2 + speed * (F - 0.25) / S };
  state.ball = { mode: 'flight', position: { ...origin }, origin, segmentOrigin: { ...origin }, segmentAt: state.now,
    releasedAt: state.now, side: 'p2', velocity: { x: 0, y: 0, z: -speed },
    attack: { target: 'p2', shot: 'straight', damage: c.hitDamage, speed, homing: false, pure: true,
      launchDistance: c.supply.p1.z - c.supply.p2.z, throwerSide: 'p1', guidanceIndex: 1 } };
  return state;
}

describe('0008 rounds and match result', () => {
  it('M8-1: emits one KO result at the exact damage timestamp, awarding one win', () => {
    const initial = koSetup();
    const at = initial.danger!.expiresAt;
    const result = step(initial, []);
    expect(result.events.filter(e => e.kind === 'round-end')).toEqual([{ kind: 'round-end', at, winner: 'p1', reason: 'ko' }]);
    expect(result.state.match).toMatchObject({ round: 1, phase: 'result', wins: { p1: 1, p2: 0 }, nextRoundAt: at + c.roundResultDuration });
    expect(run(result.state, result.state.now + S).events).toEqual([]);
  });

  it('M8-2: same-time elimination of both teams is a draw and replays the same number', () => {
    const initial = koSetup();
    // P1 has already taken lethal damage at this timestamp; P2 explodes now.
    initial.players[0].hp = 0;
    initial.danger!.expiresAt = initial.now;
    const ended = step(initial, []);
    expect(ended.events.filter(e => e.kind === 'round-end')).toEqual([{ kind: 'round-end', at: initial.now, winner: null, reason: 'ko' }]);
    expect(ended.state.match.wins).toEqual({ p1: 0, p2: 0 });
    const reset = run(ended.state, initial.now + c.roundResultDuration).state;
    expect(reset.match).toMatchObject({ round: 1, phase: 'play', firstBall: 'p1' });
    expect(reset.players.every(p => p.hp === p.maxHp)).toBe(true);
  });

  it.each([[0.5, 0.8, 'p2'], [0.5, 0.5, null], [0.8, 0.5, 'p1']] as const)('M8-3: timeout compares HP fractions %s/%s => %s', (p1, p2, winner) => {
    const initial = createInitialState('p1', c, { p2: { attack: c.defaultStat, defense: 10, agility: c.defaultStat } });
    // Start close to the configured deadline with a safe flight that cannot hit/cross/explode.
    expect(c.roundDuration).toBe(180 * S);
    initial.now = c.ballStartDelay + c.roundDuration - F;
    initial.ball = { mode: 'held', owner: 'p1' };
    initial.danger = { side: 'p1', expiresAt: initial.now + c.dangerDuration };
    initial.players[0].hp = initial.players[0].maxHp * p1;
    initial.players[1].hp = initial.players[1].maxHp * p2;
    const result = step(initial, []);
    expect(result.events).toContainEqual({ kind: 'round-end', at: c.ballStartDelay + c.roundDuration, winner, reason: 'time' });
    expect(result.state.match.phase).toBe('result');
  });

  it('KO at the timeout timestamp wins over HP-ratio adjudication and resolves only once', () => {
    const initial = koSetup();
    initial.now = initial.match.roundEndsAt - F;
    initial.danger!.expiresAt = initial.match.roundEndsAt;
    const result = step(initial, []);
    expect(result.events.filter(e => e.kind === 'round-end')).toEqual([{ kind: 'round-end', at: initial.match.roundEndsAt, winner: 'p1', reason: 'ko' }]);
  });

  it('lethal direct contact at a tick-end timeout is resolved before the round decision', () => {
    const initial = deadlineHit();
    const boundary = step(initial, []);
    expect(boundary.events.some(e => e.kind === 'round-end')).toBe(false);
    const result = step(boundary.state, []);
    const relevant = result.events.filter(e => e.kind === 'hit' || e.kind === 'round-end');
    expect(relevant.map(e => [e.kind, e.at])).toEqual([
      ['hit', initial.match.roundEndsAt], ['round-end', initial.match.roundEndsAt],
    ]);
    expect(relevant[1]).toEqual({ kind: 'round-end', at: initial.match.roundEndsAt, winner: 'p1', reason: 'ko' });
  });

  it('contact-time yaw input can save a lethal hit before timeout is adjudicated', () => {
    const initial = deadlineHit();
    initial.players[1].yaw = 0; // Facing away until the exact contact timestamp.
    const quick = { ...c, defenseStartup: F }; // 1F前の押下で接触時刻に受付が開いている状態を作る
    const boundary = step(initial, [{ kind: 'secondary', player: 'p2', at: initial.now, seq: 0 }], quick);
    const result = step(boundary.state, [{ kind: 'yaw', player: 'p2', at: boundary.state.now, seq: 1, yaw: Math.PI }], quick);
    expect(result.events.some(e => e.kind === 'hit')).toBe(false);
    expect(result.events.filter(e => e.kind === 'catch' || e.kind === 'round-end').map(e => e.kind)).toEqual(['catch', 'round-end']);
    expect(result.events.find(e => e.kind === 'round-end')).toEqual({ kind: 'round-end', at: initial.match.roundEndsAt, winner: 'p1', reason: 'time' });
  });

  it('M8-4: freezes for 3 s, resets resources and yaw, preserves held inputs, alternates first supply', () => {
    const initial = koSetup();
    initial.players[0].position.x = c.playerHalfWidth / 2;
    initial.players[0].yaw = 0.5;
    initial.players[0].cost = c.maxCost;
    initial.players[0].stepPoints = 0;
    initial.players[0].stepRecoveryProgress = S;
    initial.players[0].move = { x: 1, z: 0 };
    initial.players[0].keys = { forward: -1, right: 1 };
    const ended = step(initial, []);
    const resetAt = initial.danger!.expiresAt + c.roundResultDuration;
    const commands: Command[] = [{ kind: 'secondary', player: 'p1', at: ended.state.now, seq: 0 }];
    const frozen = run(ended.state, resetAt - 1, commands);
    expect(frozen.state.players).toEqual(ended.state.players);
    expect(frozen.state.ball).toEqual(ended.state.ball);
    expect(frozen.state.danger).toEqual(ended.state.danger);
    expect(frozen.events).toEqual([]);
    const reset = run(frozen.state, resetAt).state;
    expect(reset.match).toMatchObject({ round: 2, firstBall: 'p1', phase: 'play', roundEndsAt: resetAt + c.ballStartDelay + c.roundDuration });
    for (const p of reset.players) {
      expect(p.position).toEqual({ ...c.supply[p.side], y: 0 });
      expect(p.yaw).toBe(p.side === 'p1' ? 0 : Math.PI);
      expect(p.hp).toBe(p.maxHp);
      expect(p.cost).toBe(c.initialCost);
      expect(p.stepPoints).toBe(c.maxStepPoints);
      expect(p.stepRecoveryProgress).toBe(0);
      expect(p.action).toBeNull();
    }
    expect(reset.players[0].move).toEqual(initial.players[0].move);
    expect(reset.players[0].keys).toEqual(initial.players[0].keys);
    expect(reset.ball).toEqual({ mode: 'loose', position: c.supply.p1, startsAt: resetAt + c.ballStartDelay,
      velocity: { x: 0, y: 0, z: 0 }, motionAt: resetAt, nextPhysicsAt: (Math.floor(resetAt / F) + 1) * F });
    expect(reset.danger).toBeNull();
    const beforeStart = run(reset, resetAt + c.ballStartDelay - 1).state;
    expect(beforeStart.players[0].position).toEqual(reset.players[0].position);
    const started = run(beforeStart, resetAt + c.ballStartDelay + F);
    expect(started.events).toContainEqual({ kind: 'round-start', at: resetAt + c.ballStartDelay, round: 2, side: 'p1' });
    expect(started.state.players[0].position.x).toBeGreaterThan(0);
  });

  it('updates held input state during result without moving, including releases by the KO player', () => {
    const ended = step(koSetup(), []);
    const at = ended.state.now;
    const result = step(ended.state, [
      { kind: 'move', player: 'p2', at, seq: 0, x: 1, z: 0 },
      { kind: 'keys', player: 'p2', at, seq: 1, forward: 0, right: 1 },
    ]);
    expect(result.state.players[1].position).toEqual(ended.state.players[1].position);
    expect(result.state.players[1].move).toEqual({ x: 1, z: 0 });
    expect(result.state.players[1].keys).toEqual({ forward: 0, right: 1 });
    expect(result.events).toEqual([]);
  });

  it('M8-5: two wins end the match, then state and event stream never change', () => {
    const initial = koSetup();
    initial.match.wins.p1 = c.roundsToWin - 1;
    const result = step(initial, []);
    expect(result.events.filter(e => e.kind === 'match-end')).toEqual([{ kind: 'match-end', at: initial.danger!.expiresAt, winner: 'p1' }]);
    expect(result.state.match).toMatchObject({ phase: 'over', wins: { p1: c.roundsToWin, p2: 0 }, nextRoundAt: null });
    const commands: Command[] = [{ kind: 'move', player: 'p1', at: result.state.now, seq: 0, x: 1, z: 0 }];
    expect(step(result.state, commands)).toEqual({ state: result.state, events: [] });
    expect(result.state.now).toBe(initial.danger!.expiresAt);
  });
});
