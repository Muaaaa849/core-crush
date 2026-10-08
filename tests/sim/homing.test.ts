import { duelParticipants } from '../fixtures';
import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import { curveOffset, dropBall, launchDamage, rawLaunchSpeed } from '../../src/sim/ball';
import type { Command, Shot, Side, SimEvent, SimState } from '../../src/sim/types';

const S = 60_000;
const shots: Shot[] = ['straight', 'left', 'right', 'upper'];
const base = config.shotSpeed;
// Decision 0006 reference distances; 18.2m is the standard encounter.
const standardDistance = 18.2;
const longDistance = 26;
const minimum = { straight: 240, left: 270, right: 270, upper: 320 };
/** 球種を選ぶキー（S＝上、A＝左、D＝右）。 */
const keysFor = (shot: Shot) => ({ forward: shot === 'upper' ? -1 : 0, right: shot === 'left' ? -1 : shot === 'right' ? 1 : 0 });
function setup(shot: Shot, distance = standardDistance, side: Side = 'a', elapsed = 0, attack = 5) {
  const state = createInitialState({ participants: duelParticipants, firstBall: side });
  const sign = side === 'a' ? 1 : -1;
  state.players.forEach(p => { p.position = { x: 0, y: 0, z: (p.side === side ? sign : -sign) * distance / 2 }; });
  const player = state.players.find(p => p.side === side)!;
  state.now = elapsed * S;
  player.stats.attack = attack;
  player.keys = keysFor(shot);
  // 発生直前を保存して、静止ケースでは投げ始めの移動を含めない。
  player.action = { kind: 'windup', endsAt: state.now };
  state.ball = { mode: 'held', owner: state.players.find(p => p.side === side)!.id };
  state.danger = { side, expiresAt: 8 * S };
  const released = step(state, []).state;
  released.players.forEach(p => { p.move = { x: 0, z: 0 }; });
  return released;
}
function run(state: SimState, commands: Command[] = [], until = 8 * S, inspect?: (s: SimState) => void) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    inspect?.(state);
    const result = step(state, commands);
    state = result.state;
    events.push(...result.events);
    if (result.events.some(e => e.kind === 'hit' || e.kind === 'explosion')) break;
  }
  return { state, events, hit: events.find(e => e.kind === 'hit') };
}
describe('homing flight', () => {
  it.each([config.supply.a.z, standardDistance, longDistance])('hits stationary targets at %sm with ordered, capped constant speed', distance => {
    const times: number[] = [];
    for (const shot of shots) {
      const initial = setup(shot, distance);
      expect(initial.ball.mode).toBe('flight');
      if (initial.ball.mode !== 'flight') throw Error('flight');
      const speed = Math.hypot(...Object.values(initial.ball.velocity));
      expect(speed).toBeLessThanOrEqual(base[shot] * 1.6);
      const result = run(initial, [], 8 * S, s => {
        if (s.ball.mode === 'flight') expect(Math.hypot(...Object.values(s.ball.velocity))).toBeCloseTo(speed, 10);
      });
      expect(result.hit).toBeDefined();
      const time = result.hit!.at / S * 1000;
      expect(time).toBeGreaterThanOrEqual(minimum[shot] - 0.02);
      expect(result.state.players[1].hp).toBe(80);
      expect(result.events.filter(e => e.kind === 'hit')).toHaveLength(1);
      times.push(time);
    }
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeCloseTo(times[2], 8);
    expect(times[2]).toBeLessThan(times[3]);
    console.log(`stationary ${distance}m: ${times.map(t => t.toFixed(3)).join(' / ')} ms`);
  });
  it('mirrors horizontal curves, holds height, and upper rises then descends', () => {
    let left = setup('left', longDistance), right = setup('right', longDistance), upper = setup('upper', longDistance);
    let maxY = config.defenseHeight, descending = false, lastVy = 0;
    while (left.ball.mode === 'flight' && right.ball.mode === 'flight') {
      expect(left.ball.position.x).toBeCloseTo(-right.ball.position.x, 10);
      expect(left.ball.position.y).toBeCloseTo(config.defenseHeight, 10);
      left = step(left, []).state; right = step(right, []).state;
    }
    run(upper, [], 8 * S, s => {
      if (s.ball.mode === 'flight') {
        maxY = Math.max(maxY, s.ball.position.y);
        lastVy = s.ball.velocity.y;
        if (s.ball.position.y > config.defenseHeight + 0.1 && s.ball.velocity.y < 0) descending = true;
      }
    });
    expect(maxY).toBeGreaterThan(5);
    expect(descending).toBe(true);
    expect(lastVy).toBeLessThan(0);
    for (const shot of shots) for (const distance of [config.curveEndFraction * longDistance, longDistance, 100]) expect(curveOffset(shot, longDistance, distance, 'a')).toEqual({ x: 0, y: 0, z: 0 });
  });
  it.each(['a', 'b'] as const)('selects shot at release from the held keys (%s)', side => {
    for (const [forward, right, shot] of [[0, 0, 'straight'], [1, 0, 'straight'], [1, -1, 'left'], [1, 1, 'right'], [-1, 1, 'upper']] as const) {
      const state = setup('straight', standardDistance, side);
      state.now = 0;
      state.ball = { mode: 'held', owner: state.players.find(p => p.side === side)!.id };
      state.players.find(p => p.side === side)!.action = { kind: 'windup', endsAt: 200 };
      const result = step(state, [{ kind: 'keys', player: state.players.find(p => p.side === side)!.id, at: 200, seq: 0, forward, right }]);
      expect(result.state.ball.mode === 'flight' && result.state.ball.attack?.shot).toBe(shot);
    }
  });
  for (const side of ['a', 'b'] as const) for (const shot of shots) for (const direction of ['forward', 'back', 'left', 'right'] as const) {
    it(`${side} ${shot}: ${direction} step releases only when valid`, () => {
      const state = setup(shot, longDistance, side);
      const receiver = state.players.find(p => p.side !== side)!;
      const sign = receiver.side === 'a' ? 1 : -1;
      receiver.move = direction === 'forward' ? { x: 0, z: -sign } : direction === 'back' ? { x: 0, z: sign }
        : { x: (direction === 'right' ? 1 : -1) * sign, z: 0 };
      const result = step(state, [{ kind: 'step', player: receiver.id, at: state.now + 123, seq: 0 }]);
      const beforeStep = step(state, [], { ...config, tick: 123 }).state;
      const valid = shot === 'straight' || (shot === 'upper' ? ['left', 'right'] : ['forward', 'back']).includes(direction);
      expect(result.events.some(e => e.kind === 'step')).toBe(true);
      expect(result.state.ball.mode === 'flight' && result.state.ball.attack?.homing).toBe(!valid);
      if (valid && result.state.ball.mode === 'flight' && beforeStep.ball.mode === 'flight') {
        expect(result.state.ball.velocity).toEqual(beforeStep.ball.velocity);
      }
    });
  }
  it('does not release a shot thrown during an existing step', () => {
    const state = setup('straight');
    state.now = 0; state.ball = { mode: 'held', owner: 'p1' };
    state.players[0].action = { kind: 'windup', endsAt: 500 };
    state.players[1].move = { x: 1, z: 0 };
    const result = step(state, [{ kind: 'step', player: 'p2', at: 0, seq: 0 }]);
    expect(result.state.ball.mode === 'flight' && result.state.ball.attack?.homing).toBe(true);
  });
  it.each(['side-reversal', 'tick-reversal', 'diagonal', 'wall', 'corner'])('R03 max agility walking: %s', pattern => {
    for (const shot of shots) {
      const state = setup(shot, longDistance);
      state.players[1].stats.agility = 10;
      if (pattern === 'wall' || pattern === 'corner') {
        state.players[1].position.x = config.playerHalfWidth;
        if (pattern === 'corner') state.players[1].position.z = -config.playerMaxDepth;
        state.now = 0; state.ball = { mode: 'held', owner: 'p1' };
        state.players[0].action = { kind: 'windup', endsAt: 0 };
        state.players[0].keys = keysFor(shot);
      }
      const commands: Command[] = [];
      for (let i = 0; i < 480; i++) {
        const flip = Math.floor(i / (pattern === 'tick-reversal' ? 1 : 20)) % 2 ? -1 : 1;
        commands.push({ kind: 'move', player: 'p2', at: state.now + i * 1000, seq: i,
          x: pattern === 'wall' ? 1 : flip, z: pattern === 'diagonal' || pattern === 'corner' || pattern === 'wall' ? flip : 0 });
      }
      const result = run(state, commands, 8 * S, s => {
        if (s.ball.mode === 'flight') expect(s.ball.attack?.homing).toBe(true);
      });
      expect(result.hit).toBeDefined();
    }
  });
  it('R03 deterministic random walking seeds 1..64 never escapes', () => {
    for (let seed = 1; seed <= 64; seed++) for (const shot of shots) {
      let random = seed;
      const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 2 ** 32; };
      const state = setup(shot, longDistance); state.players[1].stats.agility = 10;
      const commands: Command[] = []; let at = state.now;
      for (let i = 0; i < 100; i++) {
        commands.push({ kind: 'move', player: 'p2', at, seq: i, x: next() * 2 - 1, z: next() * 2 - 1 });
        at += (1 + Math.floor(next() * 30)) * 1000;
      }
      expect(run(state, commands).hit, `seed=${seed} shot=${shot}`).toBeDefined();
    }
  });
  it('uses the 6.5m/s floor at point blank', () => {
    for (const shot of shots) {
      const state = setup(shot, 1);
      expect(state.ball.mode === 'flight' && Math.hypot(...Object.values(state.ball.velocity))).toBeCloseTo(6.5, 10);
      expect(run(state).hit!.at / S * 1000).toBeLessThan(minimum[shot]);
    }
  });
  it('keeps minimum flight time under attack and danger boosts', () => {
    for (const distance of [3, config.supply.a.z, standardDistance, longDistance]) for (const shot of shots) for (const elapsed of [0, 4, 7.5]) {
      const state = setup(shot, distance, 'a', elapsed, 10);
      if (state.ball.mode !== 'flight') throw Error('flight');
      const release = state.ball.releasedAt;
      const speed = Math.hypot(...Object.values(state.ball.velocity));
      expect(speed).toBeLessThanOrEqual(base[shot] * 1.6 + 1e-10);
      const result = run(state, [], state.now + 8 * S);
      if (result.hit && speed > 6.5) expect((result.hit.at - release) / S * 1000).toBeGreaterThanOrEqual(minimum[shot] - 0.02);
      // 発射後も自陣の期限が先なら爆発が正しい。
      expect(result.hit || result.events.some(e => e.kind === 'explosion')).toBeTruthy();
    }
  });
  it('walking at max agility cannot escape the point-blank speed floor', () => {
    for (const shot of shots) {
      const state = setup(shot, 1); state.players[1].stats.agility = 10;
      const result = run(state, [{ kind: 'move', player: 'p2', at: state.now, seq: 0, x: 0, z: -1 }]);
      expect(result.hit).toBeDefined();
    }
  });
  it('freezes danger speed and damage on release, with total caps', () => {
    expect(rawLaunchSpeed('straight', 5, 4, config)).toBe(base.straight * 1.0625);
    expect(rawLaunchSpeed('upper', 10, 8, config)).toBeCloseTo(base.upper * 1.15 * 1.25);
    expect(rawLaunchSpeed('straight', 100, 100, config)).toBeCloseTo(base.straight * config.speedCapMultiplier, 10);
    expect(launchDamage(0, config)).toBe(20);
    expect(launchDamage(4, config)).toBe(23);
    expect(launchDamage(8, config)).toBe(32);
    expect(launchDamage(100, config)).toBe(50);
    const state = setup('straight', longDistance);
    state.now = 4 * S; state.ball = { mode: 'held', owner: 'p1' };
    state.players[0].action = { kind: 'windup', endsAt: state.now };
    const released = step(state, []).state;
    expect(run(released).state.players[1].hp).toBe(77);
  });
  it('V15-18: aim flag keeps release-time facing with straight-shot 3D power and no homing', () => {
    const state = setup('upper');
    state.now = 0; state.ball = { mode: 'held', owner: 'p1' }; state.players[0].action = null;
    state.players[0].move = { x: 0, z: 1 };
    const commands: Command[] = [{ kind: 'primary', player: 'p1', aim: true, at: 0, seq: 0 },
      { kind: 'yaw', player: 'p1', yaw: -Math.PI / 2, at: 8000, seq: 1 }];
    let current = state;
    while (current.now <= 8000) current = step(current, commands).state;
    expect(current.ball.mode).toBe('flight');
    if (current.ball.mode !== 'flight') throw Error('flight');
    expect(current.ball.attack).toMatchObject({ shot: 'straight', homing: false });
    expect(Math.hypot(current.ball.velocity.x, current.ball.velocity.y, current.ball.velocity.z)).toBeGreaterThan(base.straight);
    expect(current.ball.velocity.y).toBeGreaterThan(0);
    expect(current.ball.velocity.z).toBeCloseTo(0, 10);
    expect(current.ball.origin.y).toBe(config.defenseHeight);
  });
  it('released straight flight can hit a receiver walking back into its path', () => {
    const state = setup('straight', standardDistance);
    state.players[1].move = { x: 1, z: 0 };
    const start = state.now;
    const commands: Command[] = [{ kind: 'step', player: 'p2', at: start, seq: 0 },
      { kind: 'move', player: 'p2', at: start + 18000, seq: 1, x: -1, z: 0 },
      { kind: 'move', player: 'p2', at: start + 51600, seq: 2, x: 0, z: 0 }];
    // 帰り道に触れるよう、直線飛行の残り距離を伸ばす。
    if (state.ball.mode !== 'flight') throw Error('flight');
    state.ball.velocity.z = -config.minimumBallSpeed; state.ball.attack!.speed = config.minimumBallSpeed;
    state.ball.segmentOrigin = { ...state.ball.position }; state.ball.segmentAt = state.now;
    const result = run(state, commands);
    expect(result.hit).toBeDefined();
    expect(result.state.players[1].hp).toBe(80);
  });
  it.each(['floor', 'x-wall', 'z-wall'] as const)('loses attack on first %s contact and preserves the clock', boundary => {
    const state = setup('upper', longDistance);
    if (state.ball.mode !== 'flight') throw Error('flight');
    state.ball.attack!.homing = false;
    state.ball.side = 'b';
    // Half a floor-speed tick inside the configured boundary.
    const margin = config.minimumBallSpeed * config.tick / S / 2;
    const position = boundary === 'floor' ? { x: 3, y: config.ballDiameter / 2 + margin, z: -5 }
      : boundary === 'x-wall' ? { x: config.ballHalfWidth - margin, y: config.defenseHeight, z: -5 } : { x: 3, y: config.defenseHeight, z: -config.ballHalfDepth + margin };
    state.ball.position = { ...position }; state.ball.segmentOrigin = { ...position }; state.ball.segmentAt = state.now;
    state.ball.velocity = boundary === 'floor' ? { x: 0, y: -config.minimumBallSpeed, z: 0 }
      : boundary === 'x-wall' ? { x: config.minimumBallSpeed, y: 0, z: 0 } : { x: 0, y: 0, z: -config.minimumBallSpeed };
    const deadline = state.danger!.expiresAt;
    const result = step(state, []);
    expect(result.state.ball.mode).toBe('loose');
    if (result.state.ball.mode !== 'loose') throw Error('loose');
    expect(result.state.ball.position.y).toBe(boundary === 'floor' ? config.ballDiameter / 2 : config.defenseHeight);
    expect(result.state.ball.velocity.y).toBe(boundary === 'floor' ? config.minimumBallSpeed * 0.2 * 0.5 : 0);
    expect(result.state.ball.position.x).toBeLessThanOrEqual(config.ballHalfWidth);
    expect(result.state.ball.position.z).toBeGreaterThanOrEqual(-config.ballHalfDepth);
    expect(result.state.danger!.expiresAt).toBe(deadline);
    result.state.players[1].position = { ...result.state.ball.position, y: 0 };
    expect(run(result.state, [], state.now + S).events.some(e => e.kind === 'hit')).toBe(false);
    expect(result.state.players[1].hp).toBe(100);
  });
  it('drops on the current side without resetting danger and cannot hit twice', () => {
    const state = setup('straight');
    if (state.ball.mode !== 'flight') throw Error('flight');
    const dropped = dropBall(state.ball, state.now, config, 'hit');
    expect(dropped.position.y).toBe(state.ball.position.y);
    expect(dropped.velocity.y).toBe(config.looseHitUpSpeed);
    const result = run(state);
    expect(result.hit).toMatchObject({ player: 'p2', damage: 20 });
    const crossed = result.events.find(e => e.kind === 'crossing')!;
    expect(result.state.danger!.expiresAt).toBe(crossed.at + 8 * S);
    expect(run(result.state, [], 2 * S).events.some(e => e.kind === 'hit')).toBe(false);
    expect(result.state.players[0].hp).toBe(100);
  });
  it('curved center crossings are interpolated within guidance intervals', () => {
    for (const shot of ['left', 'right', 'upper'] as const) {
      let state = setup(shot, standardDistance); let expected = Infinity;
      for (;;) {
        if (state.ball.mode !== 'flight') throw Error('flight');
        const ball = state.ball;
        // 次のtick内の最後の線分を、短いtickで観測する。
        const cfg = { ...config, tick: 1 };
        const crossing = Math.ceil(ball.segmentAt - ball.segmentOrigin.z / ball.velocity.z * S);
        const result = step(state, [], cfg);
        if (result.events.some(e => e.kind === 'crossing')) {
          expected = crossing;
          expect(result.events).toContainEqual(expect.objectContaining({ kind: 'crossing', at: expected, side: 'b' }));
          break;
        }
        state = result.state;
      }
      expect(expected % 1000).not.toBe(0);
    }
  });
  it('replays inputs at 30/60/144 fps and from saved states', () => {
    const commands: Command[] = Array.from({ length: 80 }, (_, i) => ({ kind: 'move', player: 'p2', at: 1234 + i * 1700, seq: i, x: i % 2 ? 1 : -1, z: i % 3 ? 0.5 : -1 }));
    const replay = (fps: number) => {
      let state = setup('upper', longDistance); const events: SimEvent[] = [];
      for (let frame = 1; state.now < 3 * S; frame++) {
        const until = Math.min(3 * S, Math.floor(frame * S / fps / config.tick) * config.tick);
        while (state.now < until) { const result = step(state, commands); state = result.state; events.push(...result.events); }
      }
      return { state, events };
    };
    expect(replay(30)).toEqual(replay(60)); expect(replay(144)).toEqual(replay(60));
    const saved = setup('upper');
    expect(run(structuredClone(saved), commands)).toEqual(run(saved, commands));
  });
});

describe('ball range vs player range (rules.md M1細則「球の範囲」)', () => {
  it.each(shots)('%s still reaches a receiver standing outside the white lines', shot => {
    const state = setup(shot, standardDistance);
    const receiver = state.players.find(p => p.id === 'p2')!;
    receiver.position = { x: config.playerHalfWidth, y: 0, z: -config.playerMaxDepth };
    const result = run(state);
    expect(result.hit).toBeDefined();
  });

  it('drops the ball inside the white lines after hitting a receiver outside them', () => {
    const state = setup('straight', standardDistance);
    const receiver = state.players.find(p => p.id === 'p2')!;
    receiver.position = { x: -config.playerHalfWidth, y: 0, z: -config.playerMaxDepth };
    const result = run(state);
    expect(result.hit).toBeDefined();
    const ball = result.state.ball;
    if (ball.mode !== 'loose') throw Error(`expected loose, got ${ball.mode}`);
    expect(Math.abs(ball.position.x)).toBeLessThanOrEqual(config.ballHalfWidth);
    expect(Math.abs(ball.position.z)).toBeLessThanOrEqual(config.ballHalfDepth);
  });
});
