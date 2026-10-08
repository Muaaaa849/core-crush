import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createLooseBall } from '../../src/sim/ball';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, Participant, PlayerId, Side, SimState } from '../../src/sim/types';

const stats = { attack: 5, defense: 5, agility: 5 };
const participant = (id: PlayerId, side: Side, defense = 5): Participant => ({ id, side, stats: { ...stats, defense } });
const teams = {
  '1v1': [participant('p1', 'a'), participant('p3', 'b')],
  '1v2': [participant('p1', 'a'), participant('p3', 'b'), participant('p4', 'b')],
  '2v2': [participant('p1', 'a'), participant('p2', 'a'), participant('p3', 'b'), participant('p4', 'b')],
};
const initial = (mode: keyof typeof teams = '2v2', firstBall: Side = 'a') => createInitialState({ participants: teams[mode], firstBall }, c);
function active(mode: keyof typeof teams = '2v2', firstBall: Side = 'a') {
  const state = initial(mode, firstBall);
  state.now = c.ballStartDelay;
  state.danger = { side: firstBall, expiresAt: state.now + c.dangerDuration };
  state.ball = createLooseBall(c.supply[firstBall], state.now, state.now, c);
  return state;
}
function run(state: SimState, until: number, commands: Command[] = []) {
  const events = [];
  while (state.now < until && state.match.phase !== 'over') {
    const result = step(state, commands, { ...c, tick: Math.min(c.tick, until - state.now) });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
const summon = (player: PlayerId, at: number, seq = 0): Command => ({ kind: 'summon', player, at, seq });

describe('slice one team simulation', () => {
  it.each(['1v1', '1v2', '2v2'] as const)('T10-1: %s has a sorted immutable roster regardless of participant order', mode => {
    const state = initial(mode);
    expect(state.players.map(p => ({ id: p.id, side: p.side }))).toEqual(teams[mode].map(p => ({ id: p.id, side: p.side })));
    expect(createInitialState({ participants: [...teams[mode]].reverse(), firstBall: 'a' }, c)).toEqual(state);
    expect(state.match.wins).toEqual({ a: 0, b: 0 });
  });
  it.each([
    [], [participant('p1', 'a')], [participant('p1', 'a'), participant('p1', 'b')],
    [participant('p1', 'a'), participant('p2', 'a')],
    [participant('p1', 'a'), participant('p2', 'a'), participant('p3', 'a'), participant('p4', 'b')],
  ])('T10-1: rejects invalid roster %#', (...participants) => {
    expect(() => createInitialState({ participants, firstBall: 'a' }, c)).toThrow();
  });
  it.each(['1v1', '1v2', '2v2'] as const)('T10-2: %s uses side-relative slots and a central supply with one second startup', mode => {
    const state = initial(mode, 'b');
    for (const side of ['a', 'b'] as const) {
      const team = state.players.filter(p => p.side === side), sign = side === 'a' ? 1 : -1;
      expect(team.map(p => p.position)).toEqual(team.map((_, i) => ({ x: team.length === 1 ? 0 : (i === 0 ? -sign : sign) * 2.6, y: 0, z: sign * 7.8 })));
      expect(team.every(p => p.yaw === (side === 'a' ? 0 : Math.PI))).toBe(true);
    }
    expect(state.ball).toMatchObject({ mode: 'loose', position: { x: 0, y: 0.325, z: -7.8 }, startsAt: 60_000 });
    expect(run(state, 59_999).state.danger).toBeNull();
    expect(run(state, 60_001).events).toContainEqual({ kind: 'clock-start', at: 60_000, side: 'b' });
  });
  it.each(['a', 'b'] as const)('T10-3: only the original singleton on side %s receives fractional HP scaling', side => {
    const participants = [participant('p1', side, 1), participant('p3', side === 'a' ? 'b' : 'a'), participant('p4', side === 'a' ? 'b' : 'a')];
    const state = createInitialState({ participants, firstBall: side }, c);
    expect(state.players[0].maxHp).toBeCloseTo(121.6, 12);
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
    expect(state.players.slice(1).map(p => p.maxHp)).toEqual([100, 100]);
    expect(state.players.map(p => [p.cost, p.stepPoints])).toEqual([[4, 2], [4, 2], [4, 2]]);
  });
  it('T10-3: just catch heals 4.8 on a 160 HP singleton', () => {
    const state = active('1v2', 'a'), self = state.players[0]; self.hp = 100;
    self.action = { kind: 'catch', pressedAt: state.now - c.defenseStartup, startsAt: state.now, endsAt: state.now + 9000 };
    const position = { ...self.position, y: c.defenseHeight };
    state.ball = { mode: 'flight', position, origin: position, segmentOrigin: position, segmentAt: state.now, releasedAt: state.now - 1,
      velocity: { x: 0, y: 0, z: 36.4 }, side: 'a', attack: { target: 'p1', throwerSide: 'b', shot: 'straight', damage: 20,
        speed: 36.4, homing: false, pure: true, launchDistance: 15.6, guidanceIndex: 1 } };
    expect(step(state, []).state.players[0].hp).toBeCloseTo(104.8, 12);
  });
  it('T10-3 T10-6: partial KO preserves HP limits and advances time without ending the round', () => {
    const state = active(); state.players[1].hp = 0;
    const result = run(state, state.now + 2 * c.timeUnitsPerSecond);
    expect(result.state.now).toBe(state.now + 2 * c.timeUnitsPerSecond);
    expect(result.state.match.phase).toBe('play');
    expect(result.state.players.map(p => p.maxHp)).toEqual([100, 100, 100, 100]);
    expect(result.events.some(e => e.kind === 'round-end')).toBe(false);
  });
  it('T10-4: both opponents recover independently while a KO player cannot recover', () => {
    const state = active(); state.ball = { mode: 'held', owner: 'p1' };
    state.players.forEach(p => { p.stepPoints = 0; p.stepRecoveryProgress = 14 * c.timeUnitsPerSecond; });
    state.players[3].hp = 0;
    const after = run(state, state.now + c.timeUnitsPerSecond).state;
    expect(after.players.map(p => p.stepPoints)).toEqual([0, 0, 1, 0]);
    expect(after.players[3].stepRecoveryProgress).toBe(14 * c.timeUnitsPerSecond);
    after.players[2].stepPoints = 2; after.players[2].stepRecoveryProgress = 999;
    expect(step(after, []).state.players[2].stepRecoveryProgress).toBe(0);
  });
  it('T10-4: two living teammates get a whole recovery point each and explosion waiting freezes both', () => {
    const state = active(); state.ball = { mode: 'held', owner: 'p1' };
    state.players.slice(2).forEach(p => { p.stepPoints = 1; p.stepRecoveryProgress = 14 * c.timeUnitsPerSecond; });
    const after = run(state, state.now + c.timeUnitsPerSecond).state;
    expect(after.players.slice(2).map(p => [p.stepPoints, p.stepRecoveryProgress])).toEqual([[2, 0], [2, 0]]);
    after.players.slice(2).forEach(p => { p.stepPoints = 1; p.stepRecoveryProgress = 123; });
    after.danger!.expiresAt = after.now;
    const waiting = run(after, after.now + c.timeUnitsPerSecond / 2).state;
    expect(waiting.players.slice(2).map(p => [p.stepPoints, p.stepRecoveryProgress])).toEqual([[1, 123], [1, 123]]);
  });
  it.each(['1v1', '1v2', '2v2'] as const)('T10-5: %s explosion damages every living teammate once and schedules one opposite supply', mode => {
    const state = active(mode); state.danger!.expiresAt = state.now;
    state.players.forEach(p => { p.action = { kind: 'recovery', endsAt: state.now + 1000 }; });
    const result = step(state, []);
    expect(result.state.players.map(p => p.hp)).toEqual(state.players.map(p => p.hp - (p.side === 'a' ? 30 : 0)));
    expect(result.state.players.every(p => p.action === null)).toBe(true);
    expect(result.events).toEqual([expect.objectContaining({ kind: 'explosion', at: state.now, side: 'a' })]);
    expect(result.state.ball).toEqual({ mode: 'absent', side: 'b', appearsAt: state.now + c.newBallAppearDelay });
    expect(run(result.state, state.now + c.newBallAppearDelay + 1).events.filter(e => e.kind === 'spawn')).toHaveLength(1);
  });
  it('T10-5 T10-6: last survivor KO scores once and dead teammates receive no extra damage', () => {
    const state = active(); state.players[0].hp = 30; state.players[1].hp = 0; state.danger!.expiresAt = state.now;
    const result = run(state, state.now + 1000);
    expect(result.state.players.slice(0, 2).map(p => p.hp)).toEqual([0, 0]);
    expect(result.state.match.wins).toEqual({ a: 0, b: 1 });
    expect(result.events.filter(e => e.kind === 'round-end')).toEqual([{ kind: 'round-end', at: state.now, winner: 'b', reason: 'ko' }]);
  });
  it.each([80, 81])('T10-7: timeout compares cross products with KO max HP in the denominator (%s/160)', hp => {
    const state = active('1v2'); state.players[0].hp = hp; state.players[1].hp = 100; state.players[2].hp = 0;
    state.now = state.match.roundEndsAt; state.ball = { mode: 'held', owner: 'p1' }; state.danger!.expiresAt = state.now + c.dangerDuration;
    expect(step(state, []).events.find(e => e.kind === 'round-end')).toEqual({ kind: 'round-end', at: state.now, winner: hp === 80 ? null : 'a', reason: 'time' });
  });
  it('T10-7: simultaneous annihilation draws and resets all slots, locks and resources while preserving held input', () => {
    const state = active(); state.players.forEach(p => { p.hp = 0; p.move = { x: 1, z: 0 }; p.keys = { forward: -1, right: 1 }; p.yaw = 2; p.lockTarget = null; });
    const ended = step(state, []);
    expect(ended.events).toContainEqual({ kind: 'round-end', at: state.now, winner: null, reason: 'ko' });
    const reset = run(ended.state, state.now + c.roundResultDuration).state;
    expect(reset.match).toMatchObject({ round: 1, wins: { a: 0, b: 0 }, firstBall: 'b', phase: 'play' });
    expect(reset.players.map(p => p.position)).toEqual(initial().players.map(p => p.position));
    expect(reset.players.map(p => p.lockTarget)).toEqual(initial().players.map(p => p.lockTarget));
    expect(reset.players.every(p => p.hp === p.maxHp && p.cost === c.initialCost && p.stepPoints === 2 && p.action === null)).toBe(true);
    expect(reset.players.every(p => p.move.x === 1 && p.keys.forward === -1)).toBe(true);
  });
  it('T10-7: second team win ends the match once', () => {
    const state = active(); state.match.wins.b = 1; state.players.filter(p => p.side === 'a').forEach(p => { p.hp = 0; });
    const result = step(state, []);
    expect(result.state.match).toMatchObject({ wins: { a: 0, b: 2 }, phase: 'over' });
    expect(result.events.filter(e => e.kind === 'match-end')).toEqual([{ kind: 'match-end', at: state.now, winner: 'b' }]);
    expect(step(result.state, []).events).toEqual([]);
  });
  it.each([false, true])('T10-8: pickup chooses distance then ID with one owner (tie=%s)', tie => {
    const state = active(); state.players[0].position.x = -1; state.players[1].position.x = tie ? 1 : 0.5;
    state.ball = createLooseBall(c.supply.a, state.now, state.now, c);
    const result = run(state, state.now + c.frame + 1);
    expect(result.state.ball).toEqual({ mode: 'held', owner: tie ? 'p1' : 'p2' });
    expect(result.events.filter(e => e.kind === 'pickup')).toHaveLength(1);
    expect(result.state.players.map(p => p.cost)).toEqual(state.players.map(p => p.cost));
  });
  it.each(['ko', 'hitstun', 'enemy'] as const)('T10-8: pickup excludes %s without touching the losing action', reason => {
    const state = active(); state.players[0].position.x = 0;
    if (reason === 'ko') state.players[0].hp = 0;
    if (reason === 'hitstun') state.players[0].action = { kind: 'hitstun', startedAt: state.now, moveEndsAt: state.now + 12_000, endsAt: state.now + 24_000, velocity: { x: 0, z: 0 } };
    if (reason === 'enemy') { state.players[0].position.x = 3; state.players[2].position = { ...c.supply.a, y: 0 }; }
    expect(run(state, state.now + c.frame + 1).events.some(e => e.kind === 'pickup')).toBe(false);
  });
  it.each([false, true])('T10-8: simultaneous summons charge only the first eligible ID (first blocked=%s)', blocked => {
    const state = active(); if (blocked) state.players[0].cost = 0;
    state.ball = createLooseBall(c.supply.a, state.now - c.frame, state.now, c); state.ball.nextPhysicsAt = state.now;
    const result = step(state, [summon('p2', state.now, 0), summon('p1', state.now, 99)]);
    expect(result.state.ball).toEqual({ mode: 'held', owner: blocked ? 'p2' : 'p1' });
    expect(result.state.players.slice(0, 2).map(p => p.cost)).toEqual(blocked ? [0, 0] : [0, 4]);
    expect(result.events).toEqual([{ kind: 'summon', at: state.now, player: blocked ? 'p2' : 'p1' }]);
  });
  it('T10-8: explosion wins over simultaneous summons and pickup', () => {
    const state = active(); state.danger!.expiresAt = state.now;
    state.ball = createLooseBall(c.supply.a, state.now - c.frame, state.now, c); state.ball.nextPhysicsAt = state.now;
    const result = step(state, [summon('p1', state.now), summon('p2', state.now)]);
    expect(result.events).toEqual([expect.objectContaining({ kind: 'explosion', at: state.now, side: 'a' })]);
    expect(result.state.players.map(p => p.cost)).toEqual([4, 4, 4, 4]);
  });
  it('T10-9: initial lock uses angle then distance then ID and does not follow yaw changes', () => {
    const state = initial(); expect(state.players[0].lockTarget).toBe('p4'); expect(state.players[1].lockTarget).toBe('p3');
    const turned = step(state, [{ kind: 'yaw', player: 'p1', at: 0, seq: 0, yaw: Math.PI }]).state;
    expect(turned.players[0].lockTarget).toBe('p4');
    turned.players[3].hp = 0;
    const updated = step(turned, []).state;
    expect(updated.players[0].lockTarget).toBe('p3');
    updated.players[2].hp = 0;
    expect(step(updated, []).state.players[0].lockTarget).toBeNull();
  });
  it('T10-9: KO reselection includes rear enemies, zero distance and ID ties', () => {
    const state = active(); state.players[0].lockTarget = 'p4'; state.players[3].hp = 0;
    state.players[0].yaw = Math.PI;
    expect(step(state, []).state.players[0].lockTarget).toBe('p3');
    state.players[3].hp = 100; state.players[0].lockTarget = null;
    state.players[2].position = { ...state.players[0].position }; state.players[3].position = { ...state.players[0].position };
    expect(step(state, []).state.players[0].lockTarget).toBe('p3');
  });
  it.each(['angle', 'distance', 'id'] as const)('T10-9: reselection orders candidates by %s', criterion => {
    const state = active(); const self = state.players[0]; self.lockTarget = null; self.position = { x: 0, y: 0, z: 8 }; self.yaw = 0;
    state.players[2].position = { x: criterion === 'angle' ? 4 : 0, y: 0, z: -4 };
    state.players[3].position = { x: 0, y: 0, z: criterion === 'distance' ? -2 : criterion === 'id' ? -4 : -8 };
    expect(step(state, []).state.players[0].lockTarget).toBe(criterion === 'id' ? 'p3' : 'p4');
  });
});
