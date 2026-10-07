import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import { HitStop } from '../../src/game/hitstop';
import { SimRunner } from '../../src/game/runner';
import type { Command, SimEvent, SimState, Vec3 } from '../../src/sim/types';
import { active, ballOf, F, incoming, loose, press, R, run, S } from './k9-helpers';

function moving(position: Vec3 = { x: 0, y: 2, z: 4 }, velocity: Vec3 = { x: 3, y: 3, z: 4 }, now = 123) {
  const state = active(position.z > 0 ? 'p1' : 'p2', now);
  state.players.forEach(p => { p.position.x = -8; });
  state.ball = loose(position, velocity, now);
  return state;
}
function update(state: SimState) { return run(state, ballOf(state).nextPhysicsAt + 1); }

describe('0009 loose motion', () => {
  it.each([{ x: 6, y: -80, z: 8 }, { x: 30, y: 100, z: 40 }, { x: 0, y: -60, z: 0 }])('K9-6: drops at the hit center with reversed capped horizontal speed (%j)', velocity => {
    const initial = incoming('p1', velocity); initial.rally = { speed: 0.4, power: 0.8 };
    const result = run(initial, initial.now + 1);
    const ball = ballOf(result.state), speed = Math.hypot(velocity.x, velocity.z);
    expect(ball.position).toEqual({ x: 0, y: c.defenseHeight, z: 8 });
    expect(ball.velocity.x).toBeCloseTo(speed ? -velocity.x / speed * Math.min(speed * 0.2, 5) : 0, 12);
    expect(ball.velocity.z).toBeCloseTo(speed ? -velocity.z / speed * Math.min(speed * 0.2, 5) : 0, 12);
    expect(ball.velocity.y).toBe(3); expect(ball.motionAt).toBe(initial.now); expect(ball.nextPhysicsAt).toBe(F);
    expect(ball).not.toHaveProperty('attack'); expect(ball).not.toHaveProperty('side');
    expect(result.state.rally).toEqual({ speed: 0, power: 0 }); expect(result.state.danger).toEqual(initial.danger);
    const later = run(result.state, initial.now + 2 * S, [press('secondary', initial.now + F)]);
    expect(later.state.players[0].hp).toBe(80);
    expect(later.events.some(e => ['hit', 'catch', 'parry', 'crossing'].includes(e.kind))).toBe(false);
  });

  it('K9-7: integrates position before velocity using gravity at absolute boundaries', () => {
    const initial = moving(); const dt = (F - initial.now) / S;
    const first = ballOf(update(initial).state);
    expect(first.position).toEqual({ x: 3 * dt, y: 2 + 3 * dt - 0.5 * 9.8 * dt ** 2, z: 4 + 4 * dt });
    expect(first.velocity).toEqual({ x: 3, y: 3 - 9.8 * dt, z: 4 });
    expect(first.motionAt).toBe(F); expect(first.nextPhysicsAt).toBe(2 * F);
    const second = ballOf(update(update(initial).state).state), frameDt = F / S;
    expect(second.position.y).toBe(first.position.y + first.velocity.y * frameDt - 0.5 * 9.8 * frameDt ** 2);
    expect(second.velocity.y).toBe(first.velocity.y - 9.8 * frameDt);
  });

  it.each([-2, -0.8])('K9-7: reflects floor velocity %s, settling small bounces without rolling drag on landing', vy => {
    const initial = moving({ x: 0, y: R + 0.001, z: 4 }, { x: 3, y: vy, z: 4 });
    const dt = (F - initial.now) / S, bounce = -(vy - 9.8 * dt) * 0.5;
    const ball = ballOf(update(initial).state);
    expect(ball.position.y).toBe(R); expect(ball.velocity.y).toBe(bounce <= 0.5 ? 0 : bounce);
    expect(ball.velocity.x).toBe(3); expect(ball.velocity.z).toBe(4);
    if (bounce <= 0.5) {
      const next = ballOf(update(update(initial).state).state), speed = 5 - 3 * F / S;
      expect(next.position.y).toBe(R); expect(next.velocity.y).toBe(0);
      expect(next.velocity.x).toBe(3 * (speed / 5)); expect(next.velocity.z).toBe(4 * (speed / 5));
    }
  });

  it('K9-7: rolls by current velocity, decelerates by 3m/s² and stays finite and exactly still', () => {
    const initial = moving({ x: 0, y: R, z: 4 }, { x: 3, y: 0, z: 4 });
    const first = ballOf(update(initial).state), dt = (F - initial.now) / S;
    expect(first.position.x).toBe(3 * dt); expect(first.position.z).toBe(4 + 4 * dt);
    expect(Math.hypot(first.velocity.x, first.velocity.z)).toBeCloseTo(5 - 3 * dt, 12);
    const stopped = run(initial, 3 * S).state, ball = ballOf(stopped);
    expect(ball.velocity).toEqual({ x: 0, y: 0, z: 0 }); expect(ball.position.y).toBe(R);
    expect(Object.values(ball.position).every(Number.isFinite)).toBe(true);
    const later = ballOf(run(stopped, 4 * S).state);
    expect(later.position).toEqual(ball.position); expect(later.velocity).toEqual(ball.velocity);
  });

  it('K9-7: snaps horizontal speed to zero at the 0.1m/s threshold', () => {
    const initial = moving({ x: 0, y: R, z: 4 }, { x: 0.11, y: 0, z: 0 });
    expect(ballOf(update(initial).state).velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  for (const side of ['p1', 'p2'] as const) it.each(['outer', 'center', 'corner', 'inward'] as const)(`K9-8: ${side} reflects only outward components at %s and preserves clock`, boundary => {
    const sign = side === 'p1' ? 1 : -1;
    const position = { x: boundary === 'corner' || boundary === 'inward' ? c.ballHalfWidth : 0,
      y: 4, z: sign * (boundary === 'center' ? R : c.ballHalfDepth) };
    const velocity = { x: boundary === 'inward' ? -3 : boundary === 'corner' ? 3 : 0, y: 0,
      z: sign * (boundary === 'center' || boundary === 'inward' ? -4 : 4) };
    const initial = moving(position, velocity), result = update(initial), ball = ballOf(result.state);
    expect(ball.velocity.x).toBe(boundary === 'corner' ? -1.5 : velocity.x);
    expect(ball.velocity.z).toBe(boundary === 'inward' ? velocity.z : -velocity.z * 0.5);
    expect(Math.abs(ball.position.x)).toBeLessThanOrEqual(c.ballHalfWidth);
    expect(Math.abs(ball.position.z)).toBeGreaterThanOrEqual(R); expect(Math.sign(ball.position.z)).toBe(sign);
    expect(result.state.danger).toEqual(initial.danger); expect(result.state.rally).toEqual(initial.rally);
    expect(result.events).toEqual([]);
  });

  it.each(['p1', 'p2'] as const)('K9-8: clamps a white-line-exterior hit into %s without switching sides', side => {
    const initial = incoming(side); const sign = side === 'p1' ? 1 : -1;
    initial.players.find(p => p.id === side)!.position = { x: c.playerHalfWidth, y: 0, z: sign * c.playerMaxDepth };
    if (initial.ball.mode !== 'flight') throw Error('flight');
    initial.ball.position = initial.ball.origin = initial.ball.segmentOrigin = { x: c.playerHalfWidth, y: 1.2, z: sign * c.playerMaxDepth };
    const ball = ballOf(run(initial, initial.now + 1).state);
    expect(ball.position).toEqual({ x: c.ballHalfWidth, y: 1.2, z: sign * c.ballHalfDepth });
  });

  it.each(['floor', 'x', 'z'] as const)('K9-9: loses attack at the analytic %s time and reflects only the contacted component', boundary => {
    const initial = incoming('p1', { x: 30, y: -60, z: 40 }); initial.players.forEach(p => { p.position.x = -8; });
    if (initial.ball.mode !== 'flight') throw Error('flight');
    const velocity = boundary === 'floor' ? { x: 6, y: -60, z: 8 } : boundary === 'x' ? { x: 60, y: 20, z: 0 } : { x: 0, y: 20, z: 60 };
    const offset = 0.25, dt = (500 - offset) / S;
    const position = boundary === 'floor' ? { x: 0, y: R + 60 * dt, z: 4 }
      : boundary === 'x' ? { x: c.ballHalfWidth - 60 * dt, y: 4, z: 4 } : { x: 0, y: 4, z: c.ballHalfDepth - 60 * dt };
    initial.ball.position = initial.ball.origin = initial.ball.segmentOrigin = { ...position };
    initial.ball.velocity = velocity;
    const result = run(initial, initial.now + 501), ball = ballOf(result.state);
    expect(ball.motionAt).toBe(initial.now + 500); expect(ball.nextPhysicsAt).toBe(F);
    expect(ball.velocity).toEqual(boundary === 'floor' ? { x: 1.2, y: 1.5, z: 1.6 }
      : boundary === 'x' ? { x: -2.5, y: 3, z: 0 } : { x: 0, y: 3, z: -2.5 });
    expect(ball.position.y).toBe(boundary === 'floor' ? R : 4 + 20 * 500 / S);
    expect(result.state.danger).toEqual(initial.danger); expect(result.events).toEqual([]);
  });

  it('K9-9: zero vertical attack loss rolls without an artificial upward kick', () => {
    const initial = incoming('p1', { x: 10, y: 0, z: 0 });
    if (initial.ball.mode !== 'flight') throw Error('flight');
    initial.ball.position.y = R; initial.ball.origin.y = R; initial.ball.segmentOrigin.y = R;
    initial.players.forEach(p => { p.position.x = -8; });
    expect(ballOf(run(initial, initial.now + 1).state).velocity).toEqual({ x: 2, y: 0, z: 0 });
  });
});

describe('0009 recovery and event ordering', () => {
  it.each([[0.8, 1.2, true], [0.800001, 1.2, false], [0.8, 1.200001, false]] as const)('K9-10: accepts inclusive height %s and distance %s => %s only at a physics boundary', (height, distance, picks) => {
    const initial = moving({ x: 0, y: height, z: 4 }, { x: 0, y: 0, z: 0 });
    initial.players[0].position = { x: distance, y: 0, z: 4 };
    const cfg = { ...c, looseGravity: 0 };
    const before = run(initial, F, [], cfg);
    expect(before.events).toEqual([]); expect(before.state.ball.mode).toBe('loose');
    const after = run(before.state, F + 1, [], cfg);
    expect(after.events).toEqual(picks ? [{ kind: 'pickup', at: F, player: 'p1' }] : []);
    expect(after.state.danger).toEqual(initial.danger);
  });

  it.each(['rising', 'rolling', 'other-action'] as const)('K9-10: picks low %s balls without success rewards or cancelling existing actions', kind => {
    const initial = moving({ x: 0, y: kind === 'rising' ? 0.6 : R, z: 4 }, { x: 3, y: kind === 'rising' ? 3 : 0, z: 0 });
    initial.players[0].position = { x: 0, y: 0, z: 4 };
    if (kind === 'other-action') initial.players[0].action = { kind: 'catch-whiff', endsAt: 30 * F };
    const result = update(initial);
    expect(result.events).toEqual([{ kind: 'pickup', at: F, player: 'p1' }]);
    expect(result.state.players[0].cost).toBe(initial.players[0].cost);
    expect(result.state.players[0].action).toEqual(initial.players[0].action);
  });

  it.each(['ko', 'hitstun', 'enemy', 'no-danger'] as const)('K9-10: rejects %s pickup', reason => {
    const initial = moving({ x: 0, y: R, z: R }, { x: 0, y: 0, z: 0 });
    initial.players[0].position = { x: 0, y: 0, z: c.playerMinDepth };
    if (reason === 'ko') { initial.players[0].hp = 0; initial.players[1].side = 'p1'; }
    if (reason === 'hitstun') initial.players[0].action = { kind: 'hitstun', startedAt: 0, moveEndsAt: 12 * F, endsAt: 24 * F, velocity: { x: 0, z: 0 } };
    if (reason === 'enemy') { initial.players[0].position.x = -8; initial.players[1].position = { x: 0, y: 0, z: -c.playerMinDepth }; }
    if (reason === 'no-danger') { initial.danger = null; ballOf(initial).startsAt = S; }
    expect(update(initial).events.some(e => e.kind === 'pickup')).toBe(false);
  });

  it.each([false, true])('K9-10: chooses nearest then fixed player ID regardless of array order (tie=%s)', tie => {
    const initial = moving({ x: 0, y: R, z: 4 }, { x: 0, y: 0, z: 0 });
    initial.players[0].position = { x: 1, y: 0, z: 4 };
    initial.players[1].side = 'p1'; initial.players[1].position = { x: tie ? -1 : 0.5, y: 0, z: 4 };
    initial.players.reverse();
    // 同陣2人の回収候補を、勝敗確定前の未処理境界で比較する。
    initial.now = F;
    expect(update(initial).events.filter(e => e.kind === 'pickup')).toEqual([{ kind: 'pickup', at: F, player: tie ? 'p1' : 'p2' }]);
  });

  it('K9-10: does not recover a ball passed only between physics boundaries', () => {
    const initial = moving({ x: 0, y: R, z: 4 }, { x: 0, y: 0, z: 0 }, 0);
    initial.players[0].position = { x: -1.21, y: 0, z: 4 };
    const commands: Command[] = [{ kind: 'move', player: 'p1', at: 0, seq: 0, x: 1, z: 0 },
      { kind: 'move', player: 'p1', at: F / 2, seq: 1, x: -1, z: 0 }];
    expect(run(initial, F + 1, commands).events).toEqual([]);
  });

  it('K9-10: supply is recovered on the first boundary after clock start, including the same boundary', () => {
    for (const delay of [F, F + 123]) {
      const initial = createInitialState('p1', { ...c, ballStartDelay: delay });
      const result = run(initial, 2 * F + 1);
      expect(result.events.find(e => e.kind === 'pickup')).toEqual({ kind: 'pickup', at: delay === F ? F : 2 * F, player: 'p1' });
    }
  });

  it.each(['air', 'roll'] as const)('K9-11: summons a moving %s ball immediately with cost one and no leftover physics', mode => {
    const initial = moving({ x: 4, y: mode === 'air' ? 4 : R, z: 4 }, { x: 3, y: mode === 'air' ? 3 : 0, z: 4 });
    const result = run(initial, 3 * F, [press('summon', initial.now)]);
    expect(result.state.ball).toEqual({ mode: 'held', owner: 'p1' });
    expect(result.events).toEqual([{ kind: 'summon', at: initial.now, player: 'p1' }]);
    expect(result.state.players[0].cost).toBe(initial.players[0].cost - c.summonCost);
    expect(result.state.danger).toEqual(initial.danger);
  });

  it.each(['cost', 'busy', 'enemy', 'no-danger', 'hitstun'] as const)('K9-11: rejects %s summon without consuming cost', reason => {
    const initial = moving();
    if (reason === 'cost') initial.players[0].cost = c.summonCost - 1;
    if (reason === 'busy') initial.players[0].action = { kind: 'recovery', endsAt: 8 * F };
    if (reason === 'enemy') ballOf(initial).position.z = -4;
    if (reason === 'no-danger') { initial.danger = null; ballOf(initial).startsAt = S; }
    if (reason === 'hitstun') initial.players[0].action = { kind: 'hitstun', startedAt: 0, moveEndsAt: 12 * F, endsAt: 24 * F, velocity: { x: 0, z: 0 } };
    const result = run(initial, initial.now + 1, [press('summon', initial.now)]);
    expect(result.events).toEqual([]); expect(result.state.players[0].cost).toBe(initial.players[0].cost);
    expect(result.state.ball.mode).toBe('loose');
  });

  it.each(['floor', 'pickup', 'summon', 'hit'] as const)('K9-12: explosion wins same-time %s and damages only loose z side', kind => {
    let initial = moving({ x: 0, y: kind === 'floor' ? R + 0.001 : R, z: -4 }, { x: 0, y: kind === 'floor' ? -2 : 0, z: 0 });
    initial.players[1].position = { x: 0, y: 0, z: -4 };
    if (kind === 'hit') initial = incoming('p2', { x: 0, y: 0, z: -36.4 }, F);
    initial.danger = { side: 'p1', expiresAt: F };
    const result = run(initial, F + 1, kind === 'summon' ? [press('summon', F, 'p2')] : []);
    expect(result.events).toEqual([{ kind: 'explosion', at: F, side: 'p2' }]);
    expect(result.state.players.map(p => p.hp)).toEqual([100, 70]); expect(result.state.ball.mode).toBe('absent');
  });

  it.each(['hit', 'loss', 'expiry'] as const)('K9-12: same-time center crossing and %s uses crossing order', kind => {
    const initial = incoming('p2', { x: 0, y: 0, z: -10 }, F);
    initial.players[1].position.z = -c.playerMinDepth;
    if (initial.ball.mode !== 'flight') throw Error('flight');
    initial.ball.side = 'p1'; initial.ball.position = initial.ball.origin = initial.ball.segmentOrigin = { x: 0, y: kind === 'loss' ? R : 1.2, z: 0 };
    if (kind === 'loss') initial.players[1].position.x = -8;
    initial.danger = { side: 'p1', expiresAt: kind === 'expiry' ? F : S };
    const result = run(initial, F + 1);
    if (kind === 'expiry') {
      expect(result.events).toEqual([{ kind: 'explosion', at: F, side: 'p1' }]);
      expect(result.state.ball.mode).toBe('absent');
    } else {
      expect(result.events[0]).toEqual({ kind: 'crossing', at: F, side: 'p2' });
      expect(ballOf(result.state).position.z).toBe(-R);
      expect(result.state.danger).toEqual({ side: 'p2', expiresAt: F + c.dangerDuration });
    }
  });

  it('K9-12: contact before center crossing leaves loose in the old court and does not reset danger', () => {
    const initial = incoming('p2', { x: 0, y: 0, z: -10 });
    initial.players[1].position.z = -c.playerMinDepth;
    if (initial.ball.mode !== 'flight') throw Error('flight');
    initial.ball.side = 'p1'; initial.ball.position = initial.ball.origin = initial.ball.segmentOrigin = { x: 0, y: 1.2, z: 0.1 };
    initial.danger = { side: 'p1', expiresAt: S };
    const result = run(initial, initial.now + 1);
    expect(ballOf(result.state).position.z).toBe(R); expect(result.state.danger).toEqual(initial.danger);
    expect(result.events.some(e => e.kind === 'crossing')).toBe(false);
  });
});

describe('0009 fixed-boundary replay', () => {
  it('K9-13: waits for next absolute frame after a fractional-frame hit and ignores unrelated yaw splits', () => {
    const initial = incoming(), at = initial.now;
    const hit = run(initial, at + 1).state, dropped = ballOf(hit);
    expect(ballOf(run(hit, F).state)).toEqual(dropped);
    const first = ballOf(run(hit, F + 1).state), dt = (F - at) / S;
    expect(first.position.y).toBe(dropped.position.y + 3 * dt - 0.5 * 9.8 * dt ** 2);
    const yaw: Command[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'yaw', player: 'p2', at: at + 1 + i * 731, seq: i, yaw: i / 30 }));
    expect(ballOf(run(hit, 30 * F, yaw).state)).toEqual(ballOf(run(hit, 30 * F).state));
  });

  it('K9-13: defers tick-end physics and pickup, accepts summon first, and processes each boundary once', () => {
    const initial = moving({ x: 0, y: R, z: 4 }, { x: 3, y: 0, z: 0 });
    initial.players[0].position = { x: 0, y: 0, z: 4 };
    const boundary = run(initial, F);
    expect(boundary.events).toEqual([]); expect(ballOf(boundary.state)).toEqual(ballOf(initial));
    const summoned = run(boundary.state, F + 1, [press('summon', F)]);
    expect(summoned.events).toEqual([{ kind: 'summon', at: F, player: 'p1' }]);
    const picked = run(boundary.state, F + 1);
    expect(picked.events).toEqual([{ kind: 'pickup', at: F, player: 'p1' }]);
    expect(run(picked.state, 3 * F).events).toEqual([]);
  });

  it('K9-13 K9-14: a timeout at a pending physics boundary waits for same-time input and resolves once', () => {
    const initial = moving({ x: 0, y: R, z: 4 }, { x: 3, y: 0, z: 0 });
    initial.match.roundEndsAt = F;
    const boundary = run(initial, F);
    expect(boundary.state.match.phase).toBe('play'); expect(boundary.events).toEqual([]);
    const result = run(boundary.state, F + 1, [press('summon', F)]);
    expect(result.events.map(e => e.kind)).toEqual(['summon', 'round-end']);
    expect(result.state.ball).toEqual({ mode: 'held', owner: 'p1' });
    expect(run(result.state, 2 * F).events).toEqual([]);
  });

  it.each(['bounce', 'roll', 'hitstun', 'pending', 'round'] as const)('K9-14: restores %s snapshots with identical state and events', phase => {
    let initial = phase === 'hitstun' || phase === 'round' ? incoming() : moving();
    if (phase === 'bounce') initial = moving({ x: 0, y: R + 0.001, z: 4 }, { x: 3, y: -2, z: 4 });
    if (phase === 'roll') initial = moving({ x: 0, y: R, z: 4 }, { x: 3, y: 0, z: 4 });
    if (phase === 'round') initial.players[0].hp = c.hitDamage;
    const commands: Command[] = [press('summon', 35 * F), press('primary', 40 * F),
      { kind: 'yaw', player: 'p1', at: 21 * F + 31, seq: 1, yaw: 0.4 }];
    const saved = run(initial, phase === 'round' ? 2 * F : phase === 'pending' ? F : phase === 'bounce' ? 5 * F : 15 * F, commands);
    const resumed = run(structuredClone(saved.state), 4 * S, commands);
    const full = run(initial, 4 * S, commands);
    expect(resumed.state).toEqual(full.state); expect([...saved.events, ...resumed.events]).toEqual(full.events);
    if (phase === 'pending') expect(ballOf(saved.state).nextPhysicsAt).toBe(saved.state.now);
    if (phase === 'bounce') {
      expect(ballOf(saved.state).position.y).toBeGreaterThan(R);
      expect(ballOf(saved.state).velocity.y).toBeGreaterThan(0);
    }
    if (phase === 'hitstun') expect(saved.state.players[0].action?.kind).toBe('hitstun');
    if (phase === 'round') expect(full.events.some(e => e.kind === 'spawn')).toBe(true);
  });

  it('K9-14 K9-15: 30/60/144fps and display interpolation/rotation/hitstop do not affect fixed sim', () => {
    const replay = (fps: number, display: boolean) => {
      const runner = new SimRunner(incoming()); const stop = new HitStop(), events: SimEvent[] = [];
      let angle = 0;
      // 同じ整数sim時刻へ達する描画スケジュールを使う。
      for (let frame = 1; runner.state.now < 2 * S; frame++) {
        runner.advance(Math.min(1000 / fps, (2 * S - runner.state.now) / 60));
        const next = runner.drainEvents(); events.push(...next);
        if (display) {
          stop.trigger(next, frame * 1000 / fps); stop.shake(frame * 1000 / fps);
          angle += runner.alpha * stop.timeScale(frame * 1000 / fps);
        }
      }
      expect(Number.isFinite(angle)).toBe(true);
      return { state: runner.state, events };
    };
    const reference = replay(60, false);
    expect(replay(30, true)).toEqual(reference); expect(replay(144, true)).toEqual(reference);
    expect(reference.events.filter(e => e.kind === 'hit')).toHaveLength(1);
  });
});
