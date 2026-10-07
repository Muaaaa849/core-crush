import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import { active, command, defense, flight, incoming, run, F, S } from './cover-helpers';

describe('M2 lock and release', () => {
  it('T10-13: Q cycles live enemy IDs in seq order without cancelling feint or consuming resources', () => {
    const s = active(), p = s.players[0]; p.lockTarget = 'p3';
    p.action = { kind: 'feint', startedAt: s.now - 1, endsAt: s.now + F * 8 };
    const r = step(s, [command('cycle-target', s.now, 'p1', 2), command('cycle-target', s.now, 'p1', 1)]);
    expect(r.state.players[0]).toMatchObject({ lockTarget: 'p3', cost: p.cost, stepPoints: p.stepPoints, action: p.action });
    expect(step(s, [command('cycle-target', s.now)]).state.players[0].lockTarget).toBe('p4');
    s.players[2].hp = 0;
    expect(step(s, [command('cycle-target', s.now)]).state.players[0].lockTarget).toBe('p4');
    s.players[3].hp = 0;
    expect(step(s, [command('cycle-target', s.now)]).state.players[0].lockTarget).toBeNull();
  });
  it.each(['hitstun', 'windup', 'catch', 'absent'] as const)('T10-13: Q works during %s and preserves the action', kind => {
    const s = active(), p = s.players[0]; p.lockTarget = 'p3';
    if (kind === 'hitstun') p.action = { kind, startedAt: s.now, moveEndsAt: s.now + 12 * F, endsAt: s.now + 24 * F, velocity: { x: 0, z: 0 } };
    if (kind === 'windup') p.action = { kind, endsAt: s.now + 8 * F };
    if (kind === 'catch') defense(s, 'p1', kind);
    if (kind === 'absent') { s.ball = { mode: 'absent', side: 'a', appearsAt: s.now + S }; s.danger = null; }
    const r = step(s, [command('cycle-target', s.now)]);
    expect(r.state.players[0].lockTarget).toBe('p4'); expect(r.state.players[0].action).toEqual(p.action);
  });
  it('T10-13: an invalid lock performs initial yaw selection before any further Q cycling', () => {
    const s = active(); s.players[0].lockTarget = null; s.players[2].position.x = 6;
    expect(step(s, [command('cycle-target', s.now)]).state.players[0].lockTarget).toBe('p4');
    expect(step(s, [command('cycle-target', s.now, 'p1', 2), command('cycle-target', s.now, 'p1', 1)]).state.players[0].lockTarget).toBe('p3');
  });
  it.each(['ko', 'result', 'over', 'before-start'] as const)('T10-13: Q is ignored during %s', kind => {
    const s = active(); s.players[0].lockTarget = 'p3';
    if (kind === 'ko') s.players[0].hp = 0;
    if (kind === 'result') { s.match.phase = 'result'; s.match.nextRoundAt = s.now + S; }
    if (kind === 'over') s.match.phase = 'over';
    if (kind === 'before-start') { s.match.roundStartsAt = s.now + S; s.danger = null; }
    expect(step(s, [command('cycle-target', s.now)]).state.players[0].lockTarget).toBe('p3');
  });
  it.each([-1, 1])('T10-14: release includes the sign %i 80 degree boundary and rejects 80 degrees plus 0.001 rad', sign => {
    for (const extra of [0, 0.001]) {
      const s = active(); s.players[0].lockTarget = 'p3'; s.players[0].yaw = sign * (80 * Math.PI / 180 + extra);
      s.players[0].action = { kind: 'windup', endsAt: s.now + 500 };
      const r = step(s, []);
      expect(r.events.filter(e => e.kind === 'release')).toHaveLength(extra ? 0 : 1);
      expect(r.state.ball.mode).toBe(extra ? 'held' : 'flight');
      expect(r.state.players[0].action?.kind ?? null).toBe(extra ? null : 'recovery');
      expect(r.state.danger).toEqual(s.danger); expect(r.state.players[0].cost).toBe(s.players[0].cost);
    }
  });
  it('T10-14: release uses same-time Q and yaw after all 8F of windup', () => {
    const s = active(); s.players[0].yaw = Math.PI; s.players[0].lockTarget = 'p3';
    const at = s.now + 8 * F;
    const commands = [command('primary', s.now), command('cycle-target', at), { kind: 'yaw' as const, player: 'p1' as const, at, seq: 1, yaw: 0 }];
    const r = run(s, at + 1, commands);
    expect(r.events.filter(e => e.kind === 'release')).toEqual([{ kind: 'release', at, player: 'p1' }]);
    expect(flight(r.state).attack?.target).toBe('p4');
  });
  it('T10-14 T10-18: aimed release needs neither a lock nor a front-facing enemy and has target null', () => {
    const s = active(); s.players[0].lockTarget = null; s.players[0].yaw = Math.PI;
    s.players[0].action = { kind: 'windup', endsAt: s.now, aim: true };
    const r = step(s, []); expect(flight(r.state).attack).toMatchObject({ target: null, homing: false, shot: 'straight' });
    expect(flight(r.state).velocity.z).toBeGreaterThan(0);
  });
  it('T10-15 R09: same-contact Q changes the return target while later Q and yaw leave that flight unchanged', () => {
    const s = incoming(); defense(s, 'p2', 'parry'); s.players[1].lockTarget = 'p3';
    const at = s.now + 500;
    const returned = run(s, at + 1, [command('cycle-target', at, 'p2')]);
    expect(flight(returned.state).attack?.target).toBe('p4');
    const later = command('cycle-target', returned.state.now, 'p2');
    const yaw = { kind: 'yaw' as const, player: 'p2' as const, at: later.at, seq: 1, yaw: Math.PI };
    const reference = step(returned.state, []), changed = step(returned.state, [later, yaw]);
    expect(changed.state.players[1].lockTarget).toBe('p3');
    expect(changed.state.ball).toEqual(reference.state.ball);
  });
  it('T10-16: KO retains the flight target, releases homing and passes through the surviving teammate until boundary loss', () => {
    const s = incoming(); s.players[0].hp = 0; flight(s).attack!.homing = true;
    const velocity = { ...flight(s).velocity };
    const r = step(s, []); expect(flight(r.state).attack).toMatchObject({ target: 'p1', homing: false });
    expect(flight(r.state).velocity).toEqual(velocity); expect(r.state.players[1].hp).toBe(100);
    expect(r.state.players[2].lockTarget).toBe('p2');
    const lost = run(r.state, s.now + S / 2); expect(lost.state.ball.mode).toBe('loose');
    expect(lost.events.some(e => e.kind === 'hit')).toBe(false);
  });
  it.each([c.ballHalfWidth, c.ballHalfWidth + 0.1])('T10-16: saved KO target at outer x=%s loses its attack at the current timestamp', x => {
    const s = incoming(); s.players[0].hp = 0;
    flight(s).attack!.homing = true; flight(s).position.x = flight(s).segmentOrigin.x = x;
    const r = step(s, []);
    expect(r.state.ball).toMatchObject({ mode: 'loose', motionAt: s.now, position: { x: c.ballHalfWidth } });
    expect(r.events.some(e => e.kind === 'hit' || e.kind === 'catch' || e.kind === 'parry')).toBe(false);
  });
  it('T10-16 T10-18: a step-released normal ball hits only its original target on recontact', () => {
    const s = incoming(8 * F); flight(s).attack!.homing = true;
    const at = s.now; s.players[0].move = { x: 1, z: 0 };
    const stepped = step(s, [{ kind: 'step', player: 'p1', at, seq: 0 }]).state;
    expect(flight(stepped).attack).toMatchObject({ target: 'p1', homing: false });
    expect(stepped.players[1].hp).toBe(100);
    const ball = flight(stepped); ball.position = { ...stepped.players[0].position, y: c.defenseHeight };
    ball.segmentOrigin = { ...ball.position }; ball.segmentAt = stepped.now;
    const r = step(stepped, []); expect(r.events.filter(e => e.kind === 'hit')).toHaveLength(1);
    expect(r.events.find(e => e.kind === 'hit')).toMatchObject({ player: 'p1' });
  });
});
