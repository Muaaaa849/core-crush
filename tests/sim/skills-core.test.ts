import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import type { Command, PlayerState, SimState, SkillSlot } from '../../src/sim/types';
import { defense, flight, incoming, run, S } from './cover-helpers';
import { one, ready, skill } from './skills-helpers';

const rejection = (s: SimState, slot: SkillSlot, reason: string) => ({ kind: 'skill-rejected', at: s.now, player: 'p1', slot, reason });

it('K14-3: throw outranks reservation; slots outrank feint/summon, independent of input/seq order', () => {
  for (const reverse of [false, true]) {
    const s = ready();
    const commands: Command[] = [skill(s, 2, 0), skill(s, 1, 9), { kind: 'feint', player: 'p1', at: s.now, seq: 3 }];
    if (reverse) commands.reverse();
    const reserved = one(s, commands);
    expect(reserved.state.players[0].overcharge).toEqual({ slot: 1, expiresAt: s.now + 8 * S });
    expect(reserved.state.players[0].position).toEqual(s.players[0].position);
    expect(reserved.state.players[0].cost).toBe(20);
    expect(reserved.events).toEqual([rejection(s, 2, 'priority')]);
    const thrown = one(s, [...commands, { kind: 'primary', player: 'p1', at: s.now, seq: 5 }]);
    expect(thrown.state.players[0].action?.kind).toBe('windup');
    expect(thrown.state.players[0].overcharge).toBeNull();
    expect(thrown.events).toEqual([rejection(s, 1, 'priority'), rejection(s, 2, 'priority')]);
  }
});

it.each(['cooldown', 'passive', 'unimplemented'] as const)('K14-3: %s slot 1 falls through to slot 2 and duplicates are one trial', mode => {
  const s = ready(), p = s.players[0];
  if (mode === 'cooldown') p.skillReadyAt[0] = s.now + 10;
  else p.skills = [mode === 'passive' ? 'charge' : 'chain', 'blink'];
  const result = one(s, [skill(s, 2, 0), skill(s, 1, 5), skill(s, 1, 1)]);
  expect(result.state.players[0].position.z).toBe(4);
  expect(result.state.players[0].cost).toBe(14);
  expect(result.events).toEqual(mode === 'passive' ? [] : [rejection(s, 1, mode)]);
});

const actions: PlayerState['action'][] = [
  { kind: 'windup', endsAt: S + 100 }, { kind: 'recovery', endsAt: S + 100 },
  { kind: 'catch-recovery', endsAt: S + 100 },
  { kind: 'catch', pressedAt: S, startsAt: S + 10, endsAt: S + 100 },
  { kind: 'parry', pressedAt: S, startsAt: S + 10, endsAt: S + 100 },
  { kind: 'catch-whiff', endsAt: S + 100 }, { kind: 'parry-whiff', endsAt: S + 100 },
  { kind: 'step', moveEndsAt: S + 10, endsAt: S + 100, velocity: { x: 0, z: 0 } },
  { kind: 'hitstun', startedAt: S, moveEndsAt: S + 10, endsAt: S + 100, velocity: { x: 0, z: 0 } },
  { kind: 'feint', startedAt: S - 1, endsAt: S + 100 },
];
for (const holding of [false, true]) for (const slot of [1, 2] as const) {
  it.each(actions)('K14-4 K14-5: holding=' + holding + ' slot=' + slot + ' action=$kind gate', action => {
    const s = ready(); if (!holding) s.ball = { mode: 'held', owner: 'p3' };
    s.players[0].action = structuredClone(action);
    const allowed = action?.kind === 'feint' || slot === 2 && action?.kind === 'catch-whiff';
    const result = one(s, [skill(s, slot)]);
    expect(result.events).toEqual(allowed ? [] : [rejection(s, slot, 'busy')]);
    expect(result.state.players[0].action).toEqual(allowed ? null : action);
    expect(result.state.players[0].cost).toBe(allowed && slot === 2 ? 14 : 20);
  });
}
it.each(['recovery', 'catch-recovery', 'catch-whiff', 'parry-whiff', 'step', 'hitstun'] as const)(
  'K14-4: %s accepts a fresh skill at end, rejects end-1 without queuing', kind => {
    const s = ready(), action = actions.find(a => a?.kind === kind)!;
    s.players[0].action = structuredClone(action); s.now = action.endsAt - 1;
    expect(one(s, [skill(s)]).events).toEqual([rejection(s, 1, 'busy')]);
    const end = { ...s, now: action.endsAt };
    expect(one(end, [skill(end)]).state.players[0].overcharge).not.toBeNull();
    expect(one(end).state.players[0].overcharge).toBeNull();
  });
it('K14-4: windup release timestamp rejects skills before release', () => {
  const s = ready(); s.players[0].action = { kind: 'windup', endsAt: s.now };
  const result = one(s, [skill(s)]);
  expect(result.events).toEqual([rejection(s, 1, 'busy'), { kind: 'release', at: s.now, player: 'p1' }]);
  expect(result.state.players[0].cost).toBe(20);
});
it.each(['phase', 'ko', 'initial', 'result', 'over'] as const)('K14-4: rejects %s, never queues blocked presses', mode => {
  const s = ready();
  if (mode === 'phase') s.danger = null;
  if (mode === 'ko') s.players[0].hp = 0;
  if (mode === 'initial') { s.danger = null; s.match.roundStartsAt = s.now + 5000; }
  if (mode === 'result') { s.match.phase = 'result'; s.match.nextRoundAt = s.now + 5000; }
  if (mode === 'over') s.match.phase = 'over';
  const result = one(s, [skill(s)]);
  expect(result.events).toEqual(mode === 'over' ? [] : [rejection(s, 1, mode === 'ko' ? 'ko' : 'phase')]);
  expect(result.state.players[0].overcharge).toBeNull();
});
it('K14-3 K14-4: result-phase duplicate slot is still a single rejected trial', () => {
  const s = ready(); s.match.phase = 'result'; s.match.nextRoundAt = s.now + 5000; s.danger = null;
  expect(one(s, [skill(s, 1, 8), skill(s, 1, 2)]).events).toEqual([rejection(s, 1, 'phase')]);
});
it.each(['cost', 'cooldown', 'destination'] as const)('K14-5: failed blink (%s) preserves feint/catch-whiff and tracking', reason => {
  for (const kind of ['feint', 'catch-whiff'] as const) {
    const s = incoming(5000); s.players[0].cost = reason === 'cost' ? 5 : 20;
    s.players[0].action = kind === 'feint' ? { kind, startedAt: s.now - 1, endsAt: s.now + 100 } : { kind, endsAt: s.now + 100 };
    flight(s).attack!.homing = true;
    flight(s).attack!.guidanceIndex = 10000;
    if (reason === 'cooldown') s.players[0].skillReadyAt[1] = s.now + 50;
    if (reason === 'destination') s.players[0].yaw = 0; s.players[0].position.z = 1;
    const result = one(s, [skill(s, 2)]);
    expect(result.state.players[0].action).toEqual(s.players[0].action);
    expect(result.state.players[0].cost).toBe(s.players[0].cost);
    expect(flight(result.state).attack!.homing).toBe(true);
    expect(result.events).toEqual([rejection(s, 2, reason)]);
  }
});

it.each([false, true])('K14-6: reservation is unpaid and unique, holding=%s', holding => {
  const s = ready(); s.players[0].cost = 6;
  if (!holding) s.ball = { mode: 'held', owner: 'p3' };
  const reserved = one(s, [skill(s)]);
  expect(reserved.state.players[0]).toMatchObject({ cost: 6, skillReadyAt: [0, 0], overcharge: { slot: 1, expiresAt: s.now + 8 * S } });
  const again = reserved.state; again.players[0].skills = ['overcharge', 'overcharge'];
  const result = one(again, [skill(again), skill(again, 2)]);
  expect(result.state.players[0].overcharge).toEqual(reserved.state.players[0].overcharge);
  expect(result.events).toEqual([rejection(again, 1, 'reserved'), rejection(again, 2, 'reserved')]);
  s.players[0].cost = 5;
  expect(one(s, [skill(s)]).events).toEqual([rejection(s, 1, 'cost')]);
});
it('K14-7: payment and source slot CT begin only on release; exact CT end can reserve', () => {
  const s = ready(); s.players[0].skills = ['blink', 'overcharge'];
  const reserved = one(s, [skill(s, 2)]).state;
  const started = one(reserved, [{ kind: 'primary', player: 'p1', at: reserved.now, seq: 1 }]).state;
  expect(started.players[0].cost).toBe(20); expect(started.players[0].skillReadyAt).toEqual([0, 0]);
  const releaseAt = reserved.now + c.throwWindup;
  const result = run(started, releaseAt + 1).state;
  expect(result.players[0]).toMatchObject({ cost: 14, overcharge: null, skillReadyAt: [0, releaseAt + 8 * S] });
  result.ball = { mode: 'held', owner: 'p1' }; result.players[0].action = null;
  result.danger!.expiresAt = releaseAt + 20 * S;
  result.now = releaseAt + 8 * S - 1;
  expect(one(result, [skill(result, 2)]).events).toEqual([rejection(result, 2, 'cooldown')]);
  result.now++;
  expect(one(result, [skill(result, 2)]).state.players[0].overcharge).not.toBeNull();
});
it.each([-1, 0, 1])('K14-8: release at expiry%+d respects half-open validity', offset => {
  const s = ready(); s.players[0].overcharge = { slot: 1, expiresAt: s.now + 10 };
  s.players[0].action = { kind: 'windup', endsAt: s.now + 10 + offset };
  const result = run(s, s.now + 12).state;
  expect(result.players[0].overcharge).toBeNull();
  expect(result.players[0].cost).toBe(offset < 0 ? 14 : 20);
  expect(flight(result).attack!.damage).toBeCloseTo(offset < 0 ? 25 : 20, 5);
});
it('K14-8 K14-25: expiry at tick end, stale JSON restore and fresh same-time reservation cannot loop', () => {
  const s = ready(); s.players[0].overcharge = { slot: 1, expiresAt: s.now + c.tick };
  const ended = step(s, []).state;
  expect(ended.players[0].overcharge).toBeNull();
  const restored = JSON.parse(JSON.stringify(ended)) as SimState;
  restored.players[0].overcharge = { slot: 1, expiresAt: restored.now - 1 };
  expect(one(restored, [skill(restored)]).state.players[0].overcharge?.expiresAt).toBe(restored.now + 8 * S);
  expect(step(ended, [])).toEqual(step(JSON.parse(JSON.stringify(ended)), []));
});
it('K14-9: spending after reservation permits normal release with one cost rejection', () => {
  const s = ready(); s.players[0].cost = 6;
  const reserved = one(s, [skill(s)]).state;
  const feinted = one(reserved, [{ kind: 'feint', player: 'p1', seq: 1, at: reserved.now }]).state;
  const started = one(feinted, [{ kind: 'primary', player: 'p1', seq: 2, at: feinted.now }]).state;
  const releaseAt = feinted.now + c.throwWindup;
  const result = run(started, releaseAt + 1);
  expect(result.state.players[0]).toMatchObject({ cost: 5, overcharge: null, skillReadyAt: [0, 0] });
  expect(result.events.filter(e => e.kind === 'skill-rejected')).toEqual([{ kind: 'skill-rejected', player: 'p1', at: releaseAt, slot: 1, reason: 'cost' }]);
  expect(flight(result.state).attack!.damage).toBeCloseTo(20 * (1 + c.dangerPowerCoefficient * ((releaseAt - s.now) / c.dangerDuration) ** 2));
});
it('K14-9: outside-arc throw and interrupted windup keep unpaid reservation', () => {
  const s = ready(); s.players[0].overcharge = { slot: 1, expiresAt: s.now + S };
  s.players[0].yaw = Math.PI; s.players[0].action = { kind: 'windup', endsAt: s.now };
  const cancelled = one(s);
  expect(cancelled.state.players[0].overcharge).toEqual(s.players[0].overcharge);
  expect(cancelled.events).toEqual([]);
  const hit = incoming(0); hit.players[0].overcharge = s.players[0].overcharge;
  hit.players[0].action = { kind: 'windup', endsAt: hit.now + 100 };
  const interrupted = one(hit).state;
  expect(interrupted.players[0].action?.kind).toBe('hitstun');
  expect(interrupted.players[0].overcharge).toEqual(s.players[0].overcharge);
  expect(interrupted.players[0].skillReadyAt).toEqual([0, 0]);
});
it.each([['straight', 1, 0], ['left', 0, -1], ['right', 0, 1], ['upper', -1, 0], ['ADS', 0, 0]] as const)(
  'K14-10: %s receives speed and power boost before all caps', (shot, forward, right) => {
    const s = ready(), p = s.players[0]; p.keys = { forward, right };
    p.overcharge = { slot: 1, expiresAt: s.now + S }; p.action = { kind: 'windup', endsAt: s.now, ...(shot === 'ADS' ? { aim: true } : {}) };
    const result = one(s).state, boosted = flight(result).attack!;
    expect(boosted.speed).toBeCloseTo(c.shotSpeed[shot === 'ADS' ? 'straight' : shot] * 1.1);
    expect(boosted.damage).toBe(25);
    p.stats.attack = 10; s.danger!.expiresAt = s.now + 2;
    const max = flight(step(s, [], { ...c, tick: 1, dangerSpeedCoefficient: 0.6, dangerPowerCoefficient: 2 }).state).attack!;
    expect(max.speed).toBeLessThanOrEqual(c.shotSpeed[shot === 'ADS' ? 'straight' : shot] * 1.6);
    expect(max.damage).toBeLessThanOrEqual(50);
    expect(max.speed).toBeCloseTo(c.shotSpeed[shot === 'ADS' ? 'straight' : shot] * 1.6);
  });
it('K14-10: close-range boosted throw preserves existing flight minimum and speed floor', () => {
  const s = ready(); s.players[0].position.z = 0.5; s.players[2].position.z = -0.5;
  s.players[0].overcharge = { slot: 1, expiresAt: s.now + S }; s.players[0].action = { kind: 'windup', endsAt: s.now };
  const boosted = flight(one(s).state).attack!;
  expect(boosted.speed).toBe(c.minimumBallSpeed);
});
it.each([0, 2000, 5000])('K14-11: parry grade offset %d discards incoming boost and unpaid receiver reservation', offset => {
  const s = incoming(0), p = s.players[0];
  defense(s, 'p1', 'parry', s.now - offset); p.overcharge = { slot: 1, expiresAt: s.now + S };
  flight(s).attack!.damage = 25; flight(s).attack!.speed = 66;
  const result = one(s).state;
  expect(result.players[0].overcharge).toBeNull(); expect(result.players[0].skillReadyAt).toEqual([0, 0]);
  expect(result.players[0].cost).toBe(1);
  expect(flight(result).attack!.damage).toBeCloseTo(c.hitDamage * (1 + result.rally.power));
  expect(flight(result).attack!.speed).toBeCloseTo(c.shotSpeed.straight * (1 + result.rally.speed));
});
it('K14-12: catch/KO/result and next round reset reservation and CT without changing skills', () => {
  const s = incoming(0); defense(s, 'p1', 'catch'); s.players[0].overcharge = { slot: 1, expiresAt: s.now + S };
  expect(one(s).state.players[0].overcharge).toEqual(s.players[0].overcharge);
  s.players[0].action = null; s.players[0].hp = 1;
  expect(one(s).state.players[0].overcharge).toBeNull();
  const round = ready(); round.players[0].overcharge = { slot: 1, expiresAt: round.now + S };
  round.players[0].skillReadyAt[1] = round.now + 9 * S;
  round.match.roundEndsAt = round.now;
  const result = one(round).state;
  expect(result.match.phase).toBe('result'); expect(result.players.every(p => p.overcharge === null)).toBe(true);
  result.now = result.match.nextRoundAt!;
  const next = one(result).state;
  expect(next.players.map(p => p.skills)).toEqual(round.players.map(p => p.skills));
  expect(next.players.every(p => p.overcharge === null && p.skillReadyAt.every(at => at === 0))).toBe(true);
});
it('K14-12 K14-18: explosion outranks release and skill; survivors retain reservation until expiry', () => {
  const s = ready(); s.danger!.expiresAt = s.now;
  s.players[0].overcharge = { slot: 1, expiresAt: s.now + 100 };
  s.players[0].action = { kind: 'windup', endsAt: s.now };
  const result = one(s, [skill(s, 2)]);
  expect(result.events.map(e => e.kind)).toEqual(['explosion', 'skill-rejected']);
  expect(result.events[1]).toEqual(rejection(s, 2, 'phase'));
  expect(result.state.players[0]).toMatchObject({ hp: 70, cost: 20, skillReadyAt: [0, 0], overcharge: s.players[0].overcharge });
  expect(run(result.state, s.now + 101).state.players[0].overcharge).toBeNull();
  s.players[0].hp = 1;
  expect(one(s).state.players[0].overcharge).toBeNull();
});
it('K14-12: pickup and summon retain reservation without extending it', () => {
  for (const summon of [false, true]) {
    const s = ready(); s.ball = { mode: 'loose', position: { x: 0, y: c.ballDiameter / 2, z: 8 }, velocity: { x: 0, y: 0, z: 0 },
      startsAt: s.now, motionAt: s.now - c.frame, nextPhysicsAt: s.now };
    s.players[0].overcharge = { slot: 1, expiresAt: s.now + S };
    const commands: Command[] = summon ? [{ kind: 'summon', player: 'p1', at: s.now, seq: 0 }] : [];
    const result = one(s, commands).state;
    expect(result.ball).toEqual({ mode: 'held', owner: 'p1' });
    expect(result.players[0].overcharge).toEqual(s.players[0].overcharge);
    expect(result.players[0].cost).toBe(summon ? 16 : 20);
  }
});
it('K14-11: boosted flight crosses center unchanged, then ends on catch/hit/loss/explosion', () => {
  for (const end of ['catch', 'hit', 'loss', 'explosion'] as const) {
    const s = ready(); s.players[0].position.z = 0.6;
    s.players[0].overcharge = { slot: 1, expiresAt: s.now + S }; s.players[0].action = { kind: 'windup', endsAt: s.now };
    const launched = one(s).state, before = structuredClone(flight(launched).attack);
    const crossed = run(launched, s.now + 2000);
    expect(crossed.events.some(e => e.kind === 'crossing')).toBe(true);
    expect(flight(crossed.state).attack!.damage).toBe(before!.damage); expect(flight(crossed.state).attack!.speed).toBe(before!.speed);
    const state = crossed.state, p = state.players[2], ball = flight(state);
    if (end === 'explosion') state.danger!.expiresAt = state.now;
    else if (end === 'loss') { ball.attack!.homing = false; ball.position.x = ball.segmentOrigin.x = c.ballHalfWidth; ball.segmentAt = state.now; }
    else {
      p.position = { x: ball.position.x, y: 0, z: ball.position.z - c.ballDiameter / 2 - c.capsuleRadius };
      if (end === 'catch') defense(state, 'p3', 'catch');
    }
    const result = one(state);
    expect(result.state.ball.mode).toBe(end === 'catch' ? 'held' : end === 'explosion' ? 'absent' : 'loose');
    if (end === 'hit') expect(result.events).toContainEqual(expect.objectContaining({ kind: 'hit', damage: 25 }));
  }
});
it('K14-18: explosion blocks both skills and contact, permits ordinary movement/step, decides timeout once', () => {
  const s = incoming(0); s.players[0].cost = 20; s.players[0].overcharge = { slot: 1, expiresAt: s.now + S };
  s.danger!.expiresAt = s.now; s.match.roundEndsAt = s.now;
  const result = one(s, [skill(s), skill(s, 2)]);
  expect(result.events.filter(e => e.kind === 'hit' || e.kind === 'release')).toEqual([]);
  expect(result.events.filter(e => e.kind === 'round-end')).toHaveLength(1);
  expect(result.events.filter(e => e.kind === 'skill-rejected').map(e => e.reason)).toEqual(['phase', 'phase']);
  s.match.roundEndsAt += S;
  const walking = one(s, [{ kind: 'move', player: 'p1', at: s.now, seq: 1, x: 1, z: 0 }]);
  expect(walking.state.players[0].position.x).toBeGreaterThan(0);
  const stepped = one(s, [{ kind: 'move', player: 'p1', at: s.now, seq: 1, x: 1, z: 0 }, { kind: 'step', player: 'p1', at: s.now, seq: 2 }, skill(s, 2)]);
  expect(stepped.state.players[0].action?.kind).toBe('step'); expect(stepped.state.players[0].skillReadyAt).toEqual([0, 0]);
});
