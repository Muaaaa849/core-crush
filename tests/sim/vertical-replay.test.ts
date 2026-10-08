import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { attackLossAt, launchBall } from '../../src/sim/ball';
import { step } from '../../src/sim/sim';
import type { Command, SimState } from '../../src/sim/types';
import { active, defense, flight, incoming, radius, run } from './cover-helpers';

it.each(['windup', 'release', 'up', 'down'] as const)('V15-21: %s JSON snapshot and subdivided input restore identical state/events', phase => {
  const s = active(), at = s.now;
  s.players.slice(1).forEach(p => { p.position.x = 5; });
  const commands: Command[] = [{ kind: 'primary', player: 'p1', aim: true, at, seq: 0 },
    { kind: 'pitch', player: 'p1', pitch: phase === 'down' ? -1.2 : 1.2, at: at + 4000, seq: 1 },
    { kind: 'pitch', player: 'p1', pitch: 0.4, at: at + c.throwWindup, seq: 2 }];
  if (phase === 'down') commands[2] = { ...commands[1], at: at + c.throwWindup, seq: 2 };
  const offset = phase === 'windup' ? 4500 : phase === 'release' ? c.throwWindup : c.throwWindup + 2500;
  const saved = run(s, at + offset, commands), full = run(s, at + 50000, commands);
  const resumed = run(JSON.parse(JSON.stringify(saved.state)), at + 50000, commands);
  expect(resumed.state).toEqual(full.state); expect([...saved.events, ...resumed.events]).toEqual(full.events);
  expect(saved.state.players[0].pitch).toBe(phase === 'down' || phase === 'windup' || phase === 'release' ? phase === 'down' ? -1.2 : 1.2 : 0.4);
  expect(Object.keys(saved.state)).not.toContain('target');
  const split: Command[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'pitch', player: 'p4', pitch: 0.1, at: at + 10000 + 733 * i, seq: i }));
  const subdivided = run(s, at + 50000, [...commands, ...split]); subdivided.state.players[3].pitch = full.state.players[3].pitch;
  expect(subdivided).toEqual(full);
});

function tangent(): SimState {
  const s = incoming(500, null); s.players[0].position.z = 12;
  const ball = flight(s); ball.position = ball.origin = ball.segmentOrigin = { x: -0.5001, y: c.defenseHeight, z: 8 + radius };
  ball.velocity = { x: 60, y: 10, z: 0 }; s.players[1].yaw = Math.PI / 2;
  return s;
}
it.each(['hit', 'catch'] as const)('V15-15 V15-21: vertical tangent %s persists pendingContacts through JSON boundary', kind => {
  const s = tangent(); if (kind === 'catch') defense(s, 'p2', 'catch');
  const commands: Command[] = [{ kind: 'pitch', pitch: -1.2, player: 'p2', at: s.now + 501, seq: 0 }];
  const full = step(s, commands, { ...c, tick: 502 }), boundary = step(s, [], { ...c, tick: 501 });
  expect(full.events.find(e => e.kind === kind)).toMatchObject({ player: 'p2', at: s.now + 501 });
  expect(flight(boundary.state).pendingContacts).toBeDefined();
  expect(step(JSON.parse(JSON.stringify(boundary.state)), commands, { ...c, tick: 1 })).toEqual(full);
  expect(full.state.players[1].pitch).toBe(-1.2);
});
it.each([false, true])('V15-15: simultaneous sloped defense/hit chooses 3D distance then ID (tie=%s)', tie => {
  const s = incoming(500, null), ball = flight(s); ball.velocity.y = 10;
  if (!tie) { ball.position.y = ball.origin.y = ball.segmentOrigin.y = 1.7; s.players[1].position.y = 0.5; }
  defense(s, 'p1', 'catch'); defense(s, 'p2', 'parry');
  const result = step(s, []), expected = tie ? 'catch' : 'parry';
  expect(result.events.filter(e => ['catch', 'parry', 'hit'].includes(e.kind))).toEqual([
    expect.objectContaining({ kind: expected, player: tie ? 'p1' : 'p2' })]);
});
it('V15-15: floor-contact ties retain defense/hit priority and explosion wins every tie', () => {
  const s = incoming(500, null), ball = flight(s); ball.velocity.y = -10;
  ball.position.y = ball.origin.y = ball.segmentOrigin.y = c.ballDiameter / 2 + 10 * 500 / c.timeUnitsPerSecond;
  // Capsule lower sphere and floor intersect at the same integer timestamp.
  s.players[1].position.x = 5;
  const hitAt = step(s, []).events.find(e => e.kind === 'hit')!.at;
  const loss = attackLossAt(ball, s.now, c); expect(hitAt).toBe(loss);
  defense(s, 'p1', 'catch');
  expect(step(s, []).events.some(e => e.kind === 'catch')).toBe(true);
  s.danger!.expiresAt = hitAt;
  const exploded = step(s, []);
  expect(exploded.events.filter(e => ['explosion', 'hit', 'catch', 'parry'].includes(e.kind))).toEqual([expect.objectContaining({ kind: 'explosion' })]);
});
it.each(['before', 'tie', 'expiry'] as const)('V15-16: high boundary %s maintains center/loss/explosion ordering', mode => {
  const s = active(), p = s.players[0]; s.players.forEach(p => { p.position.x = 5; });
  const origin = { x: c.ballHalfWidth - (mode === 'before' ? 0.25 : 0.5), y: 50, z: 0.5 };
  s.ball = launchBall(p, null, s.now - 1, 0, c, origin);
  const ball = flight(s); ball.segmentAt = s.now; ball.velocity = { x: 60, y: 10, z: -60 };
  const expiresAt = s.now + 500;
  if (mode === 'expiry') s.danger!.expiresAt = expiresAt;
  const result = step(s, []);
  const crossings = result.events.filter(e => e.kind === 'crossing');
  if (mode === 'tie') {
    expect(crossings).toHaveLength(1); expect(result.state.danger).toEqual({ side: 'b', expiresAt: expiresAt + c.dangerDuration });
    expect(result.state.ball.mode === 'loose' && result.state.ball.position.z).toBe(-c.ballDiameter / 2);
  } else {
    expect(crossings).toHaveLength(0);
    if (mode === 'before') expect(result.state.danger).toEqual(s.danger);
    else expect(result.events.filter(e => e.kind === 'explosion')).toEqual([expect.objectContaining({ at: expiresAt, side: 'a' })]);
  }
});
it('V15-18: ordinary release keys/Q and tracking removal retain velocity despite pitch changes', () => {
  const s = active(), at = s.now, commands: Command[] = [{ kind: 'primary', player: 'p1', at, seq: 0 },
    { kind: 'keys', player: 'p1', forward: -1, right: 0, at: at + c.throwWindup, seq: 1 },
    { kind: 'cycle-target', player: 'p1', at: at + c.throwWindup, seq: 2 },
    { kind: 'pitch', player: 'p1', pitch: 1.2, at: at + c.throwWindup, seq: 3 }];
  s.players[0].lockTarget = 'p3';
  const result = run(s, at + c.throwWindup + 1, commands), ball = flight(result.state);
  expect(ball.attack).toMatchObject({ target: 'p4', shot: 'upper', homing: true });
  result.state.players[3].hp = 0;
  const detached = step(result.state, [{ kind: 'pitch', player: 'p1', pitch: -1.2, at: result.state.now, seq: 4 }], { ...c, tick: 1 });
  expect(flight(detached.state).attack?.homing).toBe(false); expect(flight(detached.state).velocity).toEqual(ball.velocity);
});
