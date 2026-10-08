import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createLooseBall, launchBall } from '../../src/sim/ball';
import { blinkDestination } from '../../src/sim/skills';
import { step } from '../../src/sim/sim';
import type { Command, Shot } from '../../src/sim/types';
import { flight, incoming, radius, run, S } from './cover-helpers';
import { one, ready, skill } from './skills-helpers';

for (const side of ['a', 'b'] as const) it.each([0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4])(
  `K14-13: ${side} yaw=%d blinks exactly 4m horizontally using latest yaw`, yaw => {
    const s = ready(), p = s.players[0]; p.side = side; p.position = { x: 0, y: 0, z: side === 'a' ? 8 : -8 };
    p.yaw = yaw;
    const to = blinkDestination(p, c);
    const result = one(s, [skill(s, 2), { kind: 'yaw', player: 'p1', at: s.now, seq: 99, yaw }]);
    expect(result.state.players[0]).toMatchObject({ position: to, cost: 14, skillReadyAt: [0, s.now + 9 * S], yaw,
      hp: p.hp, stepPoints: p.stepPoints, stepRecoveryProgress: p.stepRecoveryProgress });
    expect(Math.hypot(to.x - p.position.x, to.z - p.position.z)).toBeCloseTo(4);
    expect(result.state.danger).toEqual(s.danger); expect(result.events).toEqual([]);
    const moving = one(s, [{ kind: 'move', player: 'p1', at: s.now, seq: 1, x: 0.6, z: 0.8 }, skill(s, 2)]).state;
    expect(Math.hypot(moving.players[0].position.x - to.x, moving.players[0].position.z - to.z)).toBeLessThan(0.0001);
  });
for (const side of ['a', 'b'] as const) for (const boundary of ['left', 'right', 'center', 'rear'] as const) {
  it.each([0, 0.0001])(`K14-14: ${side} ${boundary} boundary offset %d is full-distance or rejected`, outside => {
    const s = ready(), p = s.players[0], sign = side === 'a' ? 1 : -1; p.side = side;
    p.position.z = sign * 8;
    if (boundary === 'left' || boundary === 'right') {
      const dir = boundary === 'left' ? -1 : 1; p.position.x = dir * (c.playerHalfWidth - 4 + outside); p.yaw = -dir * Math.PI / 2;
    } else {
      p.position.z = sign * (boundary === 'center' ? c.playerMinDepth + 4 - outside : c.playerMaxDepth - 4 + outside);
      p.yaw = boundary === 'center' ? side === 'a' ? 0 : Math.PI : side === 'a' ? Math.PI : 0;
    }
    const result = one(s, [skill(s, 2)]);
    expect(result.state.players[0].position).toEqual(outside ? p.position : blinkDestination(p, c));
    expect(result.state.players[0].cost).toBe(outside ? 20 : 14);
    expect(result.events).toEqual(outside ? [{ kind: 'skill-rejected', player: 'p1', slot: 2, at: s.now, reason: 'destination' }] : []);
  });
}
it('K14-14: diagonal corner cannot slide or shorten; white-line exterior remains legal', () => {
  const s = ready(), p = s.players[0]; p.position.x = c.playerHalfWidth - 1; p.yaw = -Math.PI / 4;
  expect(one(s, [skill(s, 2)]).state.players[0]).toEqual(p);
  p.position.x = c.ballHalfWidth + 1; p.yaw = 0;
  expect(one(s, [skill(s, 2)]).state.players[0].position.z).toBe(4);
});
it.each(['straight', 'left', 'right', 'upper'] as Shot[])('K14-15 K14-11: blink detaches %s in any direction without changing attack/velocity', shot => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const s = ready(); s.players[0].yaw = yaw;
    s.ball = launchBall(s.players[2], s.players[0], s.now - 1, 0, c); flight(s).attack!.shot = shot;
    const before = structuredClone(flight(s));
    const result = one(s, [skill(s, 2)]);
    expect(flight(result.state).attack).toEqual({ ...before.attack, homing: false });
    expect(flight(result.state).velocity).toEqual(before.velocity);
  }
});
it.each(['friend', 'nonhoming', 'held'] as const)('K14-15 K14-16: %s blink preserves existing flight/ownership', mode => {
  const s = ready();
  if (mode !== 'held') {
    s.ball = launchBall(s.players[2], s.players[mode === 'friend' ? 1 : 0], s.now - 1, 0, c);
    if (mode === 'nonhoming') flight(s).attack!.homing = false;
  }
  s.rally = { speed: 0.2, power: 0.3 };
  const result = one(s, [skill(s, 2)]);
  if (mode === 'held') expect(result.state.ball).toEqual({ mode: 'held', owner: 'p1' });
  else expect(flight(result.state).attack).toEqual(flight(s).attack);
  expect(result.state.danger).toEqual(s.danger); expect(result.state.rally).toEqual(s.rally);
});
it('K14-16: simultaneous new release is not detached; loose pickup uses only absolute physics boundary at destination', () => {
  const s = ready(); s.ball = { mode: 'held', owner: 'p3' };
  s.players[2].lockTarget = 'p1'; s.players[2].action = { kind: 'windup', endsAt: s.now };
  expect(flight(one(s, [skill(s, 2)]).state).attack!.homing).toBe(true);
  for (const z of [6, 4]) {
    const loose = ready(); loose.ball = createLooseBall({ x: 0, y: c.ballDiameter / 2, z }, loose.now, loose.now, c);
    const moved = one(loose, [skill(loose, 2)]).state;
    expect(moved.ball.mode).toBe('loose');
    const boundary = run(moved, loose.now + c.frame + 1).state;
    expect(boundary.ball.mode).toBe(z === 4 ? 'held' : 'loose');
    if (boundary.ball.mode === 'held') expect(boundary.ball.owner).toBe('p1');
  }
});
it.each([-1, 0, 1])('K14-17: blink contact%+d discards old contact only before it resolves', offset => {
  const s = incoming(500); s.players[0].cost = 20; s.players[0].yaw = -Math.PI / 2;
  const command: Command = { ...skill(s, 2), at: s.now + 500 + offset };
  const result = run(s, s.now + 502, [command]);
  expect(result.events.some(e => e.kind === 'hit')).toBe(offset > 0);
  expect(result.state.players[0].cost).toBe(offset > 0 ? 20 : 14);
  expect(result.events.filter(e => e.kind === 'skill-rejected')).toHaveLength(offset > 0 ? 1 : 0);
});
it('K14-17: destination overlap hits immediately; teleport path has no swept contact', () => {
  const s = incoming(0); s.players[0].cost = 20; s.players[0].yaw = -Math.PI / 2;
  flight(s).position.x = 4; flight(s).segmentOrigin.x = 4; flight(s).origin.x = 4;
  expect(one(s, [skill(s, 2)]).events).toContainEqual(expect.objectContaining({ kind: 'hit', at: s.now, player: 'p1' }));
  flight(s).position.x = flight(s).segmentOrigin.x = flight(s).origin.x = 2;
  expect(one(s, [skill(s, 2)]).events).toEqual([]);
});
it('K14-17 K14-25: tick-end pending contacts replace only blinker and preserve another player tangent after JSON restore', () => {
  const s = incoming(c.tick, null); s.players[0].cost = 20; s.players[0].yaw = -Math.PI / 2;
  s.players[1].position.x = radius;
  const pending = step(s, []).state;
  expect(flight(pending).pendingContacts?.candidates.map(c => c.player)).toContain('p1');
  expect(one(pending, [skill(pending, 2)]).events.filter(e => e.kind === 'hit')).toEqual([]);
  // 保存された接線は切り上げ後に幾何再探索では拾えなくても残す。
  flight(pending).pendingContacts!.candidates.push({ player: 'p2', defense: false });
  const command = skill(pending, 2);
  const result = one(pending, [command]);
  expect(result.events.filter(e => e.kind === 'hit')).toEqual([expect.objectContaining({ player: 'p2' })]);
  expect(result).toEqual(one(JSON.parse(JSON.stringify(pending)), [command]));
});
it('K14-17: detaching outside attack bounds resolves contact first, then drops the attack immediately', () => {
  const s = ready(); s.players[0].position.x = 8; s.players[0].yaw = 0;
  s.ball = launchBall(s.players[2], s.players[0], s.now - 1, 0, c);
  flight(s).position.x = flight(s).segmentOrigin.x = flight(s).origin.x = 8;
  expect(one(s, [skill(s, 2)]).state.ball.mode).toBe('loose');
});
