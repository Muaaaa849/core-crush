import { expect, it } from 'vitest';
import * as aim from '../../src/sim/aim';
import { defaultConfig as c } from '../../src/sim/config';
import { attackLossAt, launchBall, rawLaunchSpeed } from '../../src/sim/ball';
import { step } from '../../src/sim/sim';
import type { Command, SimState, Vec3 } from '../../src/sim/types';
import { active, defense, flight, incoming, run } from './cover-helpers';

const close = (a: Vec3, b: Vec3) => { for (const key of ['x', 'y', 'z'] as const) expect(a[key]).toBeCloseTo(b[key], 10); };
function release(s: SimState, commands: Command[] = []) {
  return run(s, s.now + c.throwWindup + 1, [{ kind: 'primary', aim: true, player: 'p1', at: s.now, seq: 0 }, ...commands]);
}
function prepared(pitch = 0) {
  const s = active(); s.players[0].pitch = pitch;
  s.players.slice(1).forEach(p => { p.position.x = 5; });
  return s;
}
const poses = [0, Math.PI, Math.PI / 2, -Math.PI / 2].flatMap(yaw => [0, 0.4, -0.4, 1.2, -1.2].map(pitch => ({ yaw, pitch })));
it.each(poses)('V15-6: yaw=$yaw pitch=$pitch uses E ray and normalized T-M from height 1.20', ({ yaw, pitch }) => {
  const s = prepared(pitch), p = s.players[0]; p.yaw = yaw;
  const line = aim.aimLine(p, [], c), eye = { ...p.position, y: p.position.y + c.aimEyeHeight };
  const distance = Math.hypot(line.target.x - eye.x, line.target.y - eye.y, line.target.z - eye.z);
  close({ x: (line.target.x - eye.x) / distance, y: (line.target.y - eye.y) / distance, z: (line.target.z - eye.z) / distance },
    { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
  expect(line.origin).toEqual({ ...p.position, y: 1.2 });
  expect(Math.hypot(line.direction.x, line.direction.y, line.direction.z)).toBeCloseTo(1, 12);
  const length = Math.hypot(line.target.x - line.origin.x, line.target.y - line.origin.y, line.target.z - line.origin.z);
  close({ x: line.origin.x + line.direction.x * length, y: line.origin.y + line.direction.y * length, z: line.origin.z + line.direction.z * length }, line.target);
  const ball = flight(release(s).state), speed = ball.attack!.speed;
  close(ball.velocity, { x: line.direction.x * speed, y: line.direction.y * speed, z: line.direction.z * speed });
});

it('V15-7: closest live enemy surface wins without ball-radius inflation, Q or candidate order', () => {
  const s = active(), p = s.players[0]; p.position.z = 0.5;
  s.players[2].position = { x: 0, y: 0, z: -0.5 }; s.players[3].position = { x: 0, y: 0, z: -3 };
  const before = structuredClone(s), line = aim.aimLine(p, s.players, c);
  const capOffset = Math.sqrt(c.capsuleRadius ** 2 - (c.aimEyeHeight - c.capsuleTop) ** 2);
  close(line.target, { x: 0, y: 1.6, z: -0.5 + capOffset });
  expect(aim.aimLine(p, [...s.players].reverse(), c)).toEqual(line);
  expect(s).toEqual(before);
  p.lockTarget = 'p4'; expect(aim.aimLine(p, s.players, c)).toEqual(line);
  s.players[1].position = { x: 0, y: 0, z: 0 }; s.players[3].position.x = 5;
  expect(aim.aimLine(p, s.players, c)).toEqual(line);
  s.players[2].hp = 0;
  expect(aim.aimLine(p, s.players, c).target.z).toBeCloseTo(-15.6, 12);
});
it.each([0, Math.PI, Math.PI / 2, -Math.PI / 2])('V15-7: selects bounded white-line plane at yaw %s', yaw => {
  const p = prepared().players[0]; p.yaw = yaw;
  const target = aim.aimLine(p, [], c).target;
  expect(target.y).toBe(1.6);
  if (yaw === 0) expect(target.z).toBeCloseTo(-15.6, 12);
  if (yaw === Math.PI) expect(target.z).toBeCloseTo(15.6, 12);
  if (yaw === Math.PI / 2) expect(target.x).toBeCloseTo(-6.5, 12);
  if (yaw === -Math.PI / 2) expect(target.x).toBeCloseTo(6.5, 12);
});
it('V15-7: selects floor, 60m far point, and skips out-of-bounds intersections', () => {
  const p = prepared(-1.2).players[0];
  close(aim.aimLine(p, [], c).target, { x: 0, y: 0, z: 8 - 1.6 / Math.tan(1.2) });
  p.pitch = 1.2;
  close(aim.aimLine(p, [], c).target, { x: 0, y: 1.6 + 60 * Math.sin(1.2), z: 8 - 60 * Math.cos(1.2) });
  p.position.x = 9; p.pitch = -1.2;
  close(aim.aimLine(p, [], c).target, { x: 9, y: 1.6 - 60 * Math.sin(1.2), z: 8 - 60 * Math.cos(1.2) });
  p.position = { x: 9, y: 0, z: 17 }; p.pitch = 0; p.yaw = Math.PI / 2;
  expect(aim.aimLine(p, [], c).target.x).toBeCloseTo(-51);
  p.position = { x: 6.5, y: 0, z: 8 }; p.yaw = -Math.PI / 2;
  expect(aim.aimLine(p, [], c).target.x).toBeCloseTo(66.5); // zero-distance plane is excluded
});
it('V15-25: pure shared geometry uses pose and candidates equally with or without possession', () => {
  const s = active(), p = s.players[0]; p.pitch = 0.3;
  const pose = { id: p.id, side: p.side, position: p.position, yaw: p.yaw, pitch: p.pitch };
  const candidates = s.players.map(({ id, side, hp, position }) => ({ id, side, hp, position }));
  expect(aim.aimLine(pose, candidates, c)).toEqual(aim.aimLine(p, s.players, c));
  s.ball = { mode: 'absent', side: 'b', appearsAt: s.now + 1000 };
  expect(aim.aimLine(pose, candidates, c)).toEqual(aim.aimLine(p, s.players, c));
});
it('V15-4: windup updates aim at exact release, deferring end boundary to next tick', () => {
  const s = prepared(), at = s.now, end = at + c.throwWindup;
  const commands: Command[] = [{ kind: 'primary', aim: true, player: 'p1', at, seq: 0 },
    { kind: 'pitch', pitch: -0.2, player: 'p1', at: at + 3000, seq: 1 },
    { kind: 'pitch', pitch: 0.5, player: 'p1', at: end, seq: 2 }];
  const boundary = run(s, end, commands);
  expect(boundary.state.ball.mode).toBe('held'); expect(boundary.state.players[0].pitch).toBe(-0.2);
  const result = step(boundary.state, commands, { ...c, tick: 1 });
  expect(result.events.filter(e => e.kind === 'release')).toHaveLength(1);
  const line = aim.aimLine({ ...s.players[0], pitch: 0.5 }, s.players, c), ball = flight(result.state);
  close(ball.velocity, { x: line.direction.x * ball.attack!.speed, y: line.direction.y * ball.attack!.speed, z: line.direction.z * ball.attack!.speed });
});
it('V15-5: captured aim survives ADS release/keys changes and later yaw/pitch/Q cannot steer flight', () => {
  const s = prepared(0.4);
  const result = release(s, [{ kind: 'primary', aim: false, player: 'p1', at: s.now + 2000, seq: 1 },
    { kind: 'keys', forward: -1, right: -1, player: 'p1', at: s.now + 3000, seq: 2 }]);
  const ball = flight(result.state); expect(ball.attack).toMatchObject({ target: null, shot: 'straight', homing: false });
  const later = step(result.state, [{ kind: 'pitch', pitch: -1.2, player: 'p1', at: result.state.now, seq: 3 },
    { kind: 'yaw', yaw: 2, player: 'p1', at: result.state.now, seq: 4 }, { kind: 'cycle-target', player: 'p1', at: result.state.now, seq: 5 }]);
  expect(flight(later.state).velocity).toEqual(ball.velocity); expect(flight(later.state).attack).toEqual(ball.attack);
});
it.each([-0.5, 0.1])('V15-9: close capsule aim at pitch %s passes T and moving enemies cannot bend it', pitch => {
  const s = active(), p = s.players[0]; p.position.z = 0.5; p.pitch = pitch;
  s.players[1].position.x = 5; s.players[2].position = { x: 0, y: 0, z: -0.5 }; s.players[3].position.x = 5;
  const line = aim.aimLine(p, s.players, c), ball = flight(release(s).state);
  const distance = Math.hypot(line.target.x - ball.origin.x, line.target.y - ball.origin.y, line.target.z - ball.origin.z);
  close({ x: ball.origin.x + ball.velocity.x * distance / ball.attack!.speed,
    y: ball.origin.y + ball.velocity.y * distance / ball.attack!.speed, z: ball.origin.z + ball.velocity.z * distance / ball.attack!.speed }, line.target);
  const state = release(s).state; state.players[2].position.x = 4;
  const result = run(state, state.now + 4000);
  expect(result.events.some(e => e.kind === 'hit')).toBe(false); expect(flight(result.state).velocity).toEqual(ball.velocity);
});
it.each([6.175, 7, -6.175, -7])('V15-10: inward aimed release at x=%s loses attack immediately and pays once', x => {
  const s = prepared(0.5), p = s.players[0]; p.position.x = x; p.yaw = x > 0 ? Math.PI / 2 : -Math.PI / 2;
  p.cost = 20; p.overcharge = { slot: 1, expiresAt: s.now + 10000 };
  const result = release(s);
  expect(result.state.ball.mode).toBe('loose'); expect(result.events.filter(e => e.kind === 'release')).toHaveLength(1);
  expect(result.events.some(e => e.kind === 'hit')).toBe(false);
  expect(result.state.players[0]).toMatchObject({ cost: 14, action: { kind: 'recovery' }, overcharge: null });
  expect(result.state.ball.mode === 'loose' && Math.abs(result.state.ball.position.x)).toBeLessThanOrEqual(c.ballHalfWidth);
});
it('V15-11: downward aim loses at ball-center y=r, keeps loss vy bounce and cannot attack afterwards', () => {
  const result = release(prepared(-1.2)), ball = flight(result.state), loss = attackLossAt(ball, result.state.now, c);
  const expected = Math.ceil(ball.releasedAt + (c.ballDiameter / 2 - ball.origin.y) / ball.velocity.y * c.timeUnitsPerSecond);
  expect(loss).toBe(expected);
  const atLoss = run(result.state, loss).state;
  expect(atLoss.ball.mode).toBe('loose');
  if (atLoss.ball.mode !== 'loose') throw Error('expected loose');
  expect(atLoss.ball.position.y).toBe(c.ballDiameter / 2); expect(atLoss.ball.velocity.y).toBe(1.5);
  const later = run(atLoss, loss + 12000);
  expect(later.events.some(e => ['hit', 'catch', 'parry'].includes(e.kind))).toBe(false);
});
it('V15-12: upward aim has no ceiling or flight gravity and still loses at white-line x/z', () => {
  const result = release(prepared(1.2)), ball = flight(result.state);
  const high = run(result.state, ball.releasedAt + 100000).state;
  expect(flight(high).position.y).toBeGreaterThan(50); expect(flight(high).velocity).toEqual(ball.velocity);
  const loss = attackLossAt(ball, result.state.now, c), lost = run(result.state, loss).state;
  expect(lost.ball.mode).toBe('loose'); expect(lost.ball.mode === 'loose' && lost.ball.position.y).toBeGreaterThan(50);
  const end = run(lost, lost.danger!.expiresAt + 1);
  expect(end.events.filter(e => e.kind === 'explosion')).toHaveLength(1);
});
it.each([-1.2, -0.4, 0, 0.4, 1.2])('V15-13: aimed speed at pitch %s uses straight 3D norm without distance limit', pitch => {
  const s = prepared(pitch), p = s.players[0]; p.stats.attack = 10;
  const ball = flight(release(s).state);
  expect(Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z)).toBeCloseTo(rawLaunchSpeed('straight', 10, c.throwWindup / c.timeUnitsPerSecond, c), 12);
});
it('V15-13: close aim permits contact before 240ms and preserves minimum/cap speed', () => {
  const s = active(); s.players[0].position.z = 0.5; s.players[2].position.z = -0.5; s.players[1].position.x = s.players[3].position.x = 5;
  const result = run(release(s).state, s.now + c.throwWindup + 12000);
  const hit = result.events.find(e => e.kind === 'hit'); expect(hit).toBeDefined(); expect(hit!.at - s.now - c.throwWindup).toBeLessThan(0.240 * c.timeUnitsPerSecond);
  const p = s.players[0], direction = aim.aimLine(p, s.players, c).direction;
  p.stats.attack = -100;
  const minimum = launchBall(p, null, s.now, 0, c, undefined, undefined, false, direction);
  expect(Math.hypot(...Object.values(minimum.velocity))).toBeCloseTo(6.5, 12);
  p.stats.attack = 10;
  const cap = launchBall(p, null, s.now, 8, c, undefined, { speed: 0.4, power: 0.8 }, true, direction);
  expect(Math.hypot(...Object.values(cap.velocity))).toBeCloseTo(c.shotSpeed.straight * c.speedCapMultiplier, 12);
});
it.each(['catch', 'parry'] as const)('V15-14: %s of sloped flight ignores receiver pitch and preserves horizontal front arc', kind => {
  const s = incoming(500, null); if (s.ball.mode !== 'flight') throw Error('expected flight');
  s.ball.velocity.y = 10; s.players[1].position.x = 5; defense(s, 'p1', kind);
  const results = [-1.2, 0, 1.2].map(pitch => { const state = structuredClone(s); state.players[0].pitch = pitch; return step(state, []); });
  for (const result of results) expect(result.events.some(e => e.kind === kind)).toBe(true);
  expect(results.map(r => r.events)).toEqual(results.map(() => results[0].events));
});
it('V15-16: high center crossing resets clock once without losing attack', () => {
  const result = release(prepared(1.2)), ball = flight(result.state);
  const crossing = Math.ceil(ball.releasedAt - ball.origin.z / ball.velocity.z * c.timeUnitsPerSecond);
  const across = run(result.state, crossing + 2000);
  expect(across.events.filter(e => e.kind === 'crossing')).toHaveLength(1);
  expect(flight(across.state).side).toBe('b'); expect(flight(across.state).attack).not.toBeNull();
  expect(across.state.danger).toEqual({ side: 'b', expiresAt: crossing + c.dangerDuration });
});
it('V15-17: high loose summon keeps danger clock and opposing side cannot summon', () => {
  const s = active(); s.ball = { mode: 'loose', position: { x: 0, y: 50, z: 8 }, velocity: { x: 0, y: 0, z: 0 }, startsAt: s.now, motionAt: s.now, nextPhysicsAt: s.now + 1000 };
  const enemy = step(s, [{ kind: 'summon', player: 'p3', at: s.now, seq: 0 }], { ...c, tick: 1 });
  expect(enemy.state.ball.mode).toBe('loose'); expect(enemy.state.danger).toEqual(s.danger);
  const own = step(s, [{ kind: 'summon', player: 'p1', at: s.now, seq: 0 }], { ...c, tick: 1 });
  expect(own.state.ball).toEqual({ mode: 'held', owner: 'p1' }); expect(own.state.danger).toEqual(s.danger);
});
it('V15-18: normal tracking and receiver-null return stay independent of pitch', () => {
  const s = active(), p = s.players[0]; p.keys = { forward: -1, right: 0 };
  for (const receiver of [null, s.players[2]]) {
    p.pitch = -1.2; const before = launchBall(p, receiver, s.now, 0, c);
    p.pitch = 1.2; expect(launchBall(p, receiver, s.now, 0, c)).toEqual(before);
    if (!receiver) expect(before.velocity.y).toBe(0);
  }
});
it.each(['front', 'outside', 'late'] as const)('V15-14: sloped defense %s retains yaw/time rules at both pitch extremes', condition => {
  for (const pitch of [-1.2, 1.2]) {
    const s = incoming(500, null); flight(s).velocity.y = -10; s.players[1].position.x = 5;
    defense(s, 'p1', 'catch', condition === 'late' ? s.now + 501 : s.now);
    s.players[0].pitch = pitch; if (condition === 'outside') s.players[0].yaw = Math.PI;
    const result = step(s, []);
    expect(result.events.some(e => e.kind === 'catch')).toBe(condition === 'front');
    expect(result.events.some(e => e.kind === 'hit')).toBe(condition !== 'front');
  }
});
it.each([-0.7, -0.3, 0.05, 1.2])('V15-14: aimed capsule low/cylinder/high contacts and head clearance at pitch %s', pitch => {
  const s = active(); s.players[0].position.z = 0.5; s.players[0].pitch = pitch;
  s.players[1].position.x = s.players[3].position.x = 5; s.players[2].position.z = -1.5;
  const result = run(release(s).state, s.now + c.throwWindup + 18000);
  expect(result.events.some(e => e.kind === 'hit')).toBe(pitch !== 1.2);
});
it.each([-1.2, 1.2])('V15-18: actual out-of-front parry stays horizontal despite receiver pitch %s', pitch => {
  const s = incoming(500, null); s.players[1].position.x = 5;
  defense(s, 'p1', 'parry'); s.players[0].yaw = 80 * Math.PI / 180; s.players[0].pitch = pitch; s.players[0].lockTarget = 'p3';
  s.players[2].position.x = 10;
  const result = step(s, []), ball = flight(result.state);
  expect(result.events.some(e => e.kind === 'parry')).toBe(true);
  expect(ball.attack).toMatchObject({ target: null, homing: false, shot: 'straight' });
  expect(ball.velocity.y).toBe(0);
});
