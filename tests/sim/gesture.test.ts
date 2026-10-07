// 防御のマウス方向（0007 S5-1〜S5-8）：分類、時間範囲、実際の入射方向、不一致は被弾、defense-start。
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/sim/config';
import { launchBall } from '../../src/sim/ball';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState, Side } from '../../src/sim/types';

const c = defaultConfig;
const F = c.frame, S = c.timeUnitsPerSecond, P = c.gestureLookback + F;
const threshold = c.gestureThresholdDegrees;
const press = (at = P, player: Side = 'p1', kind: 'primary' | 'secondary' = 'primary'): Command => ({ kind, at, player, seq: 0 });
const mouse = (rightDegrees: number, pullDegrees = 0, at = P, seq = 1, player: Side = 'p1'): Command =>
  ({ kind: 'mouse', rightDegrees, pullDegrees, at, seq, player });

// Offset entry by a quarter time unit so floating point roundoff still rounds to the requested integer.
// Put a straight segment on the capsule's entry surface at the requested time.
function incoming(contact: number, h = 30, v = 0, side: Side = 'p1', yaw = side === 'p1' ? 0 : Math.PI): SimState {
  const state = createInitialState(side, c);
  const player = state.players.find(p => p.id === side)!;
  player.yaw = yaw;
  state.danger = { side, expiresAt: c.dangerDuration };
  const horizontal = h * Math.PI / 180, vertical = v * Math.PI / 180;
  const direction = { x: Math.cos(vertical) * (-Math.sin(yaw) * Math.cos(horizontal) + Math.cos(yaw) * Math.sin(horizontal)),
    y: Math.sin(vertical), z: Math.cos(vertical) * (-Math.cos(yaw) * Math.cos(horizontal) - Math.sin(yaw) * Math.sin(horizontal)) };
  const speed = c.minimumBallSpeed;
  const distance = c.capsuleRadius + c.ballDiameter / 2 + speed * (contact - 0.25) / S;
  const origin = { x: player.position.x + direction.x * distance,
    y: (v > 0 ? c.capsuleTop : c.defenseHeight) + direction.y * distance, z: player.position.z + direction.z * distance };
  const velocity = { x: -direction.x * speed, y: -direction.y * speed, z: -direction.z * speed };
  state.ball = { mode: 'flight', position: { ...origin }, origin, segmentOrigin: { ...origin }, segmentAt: 0,
    releasedAt: 0, side, velocity, attack: { target: side, shot: 'straight', damage: c.hitDamage, speed,
      homing: false, pure: true, launchDistance: distance, throwerSide: side === 'p1' ? 'p2' : 'p1', guidanceIndex: 1 } };
  return state;
}
function run(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    const result = step(state, commands, { ...c, tick: Math.min(F, until - state.now) });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
function actual(commands: Command[]) {
  const result = run(incoming(P + c.defenseStartup + F), P + c.defenseStartup + F + 2, [press(), ...commands]);
  const hit = result.events.find(e => e.kind === 'hit');
  expect(result.events.find(e => e.kind === 'hit' || e.kind === 'parry')?.at).toBe(P + c.defenseStartup + F);
  if (hit?.kind === 'hit') return hit.actual;
  expect(result.events.some(e => e.kind === 'parry')).toBe(true);
  return 'right';
}

describe('S5-1 gesture classification', () => {
  it.each([
    [threshold - 0.01, 0, 'neutral'], [threshold, 0, 'right'], [threshold + 0.01, 0, 'right'],
    [-threshold, 0, 'left'], [0, threshold, 'upper'], [0, -threshold, 'invalid'],
    [threshold, threshold, 'right'], [-threshold, threshold, 'left'],
  ] as const)('mouse %s/%s is %s', (x, y, expected) => expect(actual([mouse(x, y)])).toBe(expected));
  it('cancels round trips', () => expect(actual([mouse(threshold), mouse(-threshold, 0, P + 1, 2)])).toBe('neutral'));
  it('breaks total ties with the newest decisive sample, then horizontal', () => {
    expect(actual([mouse(threshold, 0), mouse(0, threshold, P, 2)])).toBe('upper');
    expect(actual([mouse(0, threshold), mouse(threshold, 0, P, 2)])).toBe('right');
    expect(actual([mouse(threshold, 0), mouse(0, threshold, P, 2), mouse(threshold, threshold, P, 3)])).toBe('upper');
  });
});

describe('S5-2..4 gesture timing and saved state', () => {
  it.each([[P - c.gestureLookback, 'right'], [P - c.gestureLookback - 1, 'neutral'],
    [P + c.gestureFollowthrough, 'right'], [P + c.gestureFollowthrough + 1, 'neutral']] as const)
  ('includes only the closed lookback/followthrough interval: %s', (at, expected) => {
    const contact = P + c.gestureFollowthrough + F;
    const result = run(incoming(contact), contact + 2, [press(), mouse(threshold, 0, at)]);
    const hit = result.events.find(e => e.kind === 'hit');
    if (expected === 'right') expect(result.events.some(e => e.kind === 'parry')).toBe(true);
    else expect(hit).toMatchObject({ actual: expected });
  });
  it('ignores direction reversal after the followthrough deadline even before contact', () => {
    const contact = P + c.gestureFollowthrough + F;
    const result = run(incoming(contact), contact + 2, [press(), mouse(threshold), mouse(-2 * threshold, 0, P + c.gestureFollowthrough + 1, 2)]);
    expect(result.events.some(e => e.kind === 'parry')).toBe(true);
  });
  it('includes a contact-time sample and excludes one unit after contact', () => {
    const contact = P + c.defenseStartup + F;
    expect(actual([mouse(threshold, 0, contact)])).toBe('right');
    expect(actual([mouse(threshold, 0, contact + 1)])).toBe('neutral');
  });
  it('allows correcting direction before contact; later inputs cannot rewrite the event', () => {
    const contact = P + c.defenseStartup + F;
    expect(actual([mouse(-threshold), mouse(2 * threshold, 0, contact - 1, 2)])).toBe('right');
    const result = run(incoming(contact), contact + 2, [press(), mouse(-threshold), mouse(2 * threshold, 0, contact + 1, 2)]);
    expect(result.events.find(e => e.kind === 'hit')).toMatchObject({ required: 'right', actual: 'left' });
  });
  it('retains active parry lookback across pruning and structuredClone replay', () => {
    const contact = P + c.gestureFollowthrough + F;
    const commands = [press(), mouse(threshold, 0, P - c.gestureLookback)];
    const initial = incoming(contact);
    const saved = run(initial, contact, commands).state;
    expect(saved.players[0].mouseSamples).toContainEqual({ at: P - c.gestureLookback, seq: 1, rightDegrees: threshold, pullDegrees: 0 });
    const resumed = run(structuredClone(saved), contact + 2, commands);
    expect(resumed).toEqual(run(saved, contact + 2, commands));
    const uninterrupted = run(initial, contact + 2, commands);
    expect(resumed.state).toEqual(uninterrupted.state);
    expect(resumed.events).toEqual(uninterrupted.events.filter(e => e.at >= saved.now));
    expect(resumed.events.some(e => e.kind === 'parry')).toBe(true);
    expect(run(resumed.state, contact + c.gestureLookback + F).state.players[0].mouseSamples).toEqual([]);
    expect(initial.players[0].action).toBeNull();
  });
  it('records mouse while the danger clock is stopped and keeps only 80ms', () => {
    const initial = createInitialState('p1', c);
    const result = run(initial, c.gestureLookback + 1, [mouse(threshold, 0, 0), mouse(threshold, 0, 1, 2)]);
    expect(result.state.danger).toBeNull();
    expect(result.state.players[0].mouseSamples).toEqual([{ at: 1, seq: 2, rightDegrees: threshold, pullDegrees: 0 }]);
  });
});

describe('S5-5..7 actual incoming direction and failure', () => {
  it.each(['p1', 'p2'] as const)('uses receiver yaw and segment velocity in %s', side => {
    for (const yaw of [0, Math.PI / 4, Math.PI]) for (const [h, v, required] of [[-30, 0, 'left'], [30, 0, 'right'], [0, 40, 'upper']] as const) {
      const contact = P + c.defenseStartup;
      const state = incoming(contact, h, v, side, yaw);
      if (state.ball.mode === 'flight') state.ball.attack!.shot = 'left'; // Name must not decide direction.
      const result = run(state, contact + 2, [press(P, side)]);
      expect(result.events.find(e => e.kind === 'hit')).toMatchObject({ required, actual: 'neutral' });
    }
  });
  it('uses horizontal direction when incoming horizontal and elevation angles tie', () => {
    for (const yaw of [0, Math.PI / 4, Math.PI]) for (const h of [-30, 30]) {
      const contact = P + c.defenseStartup;
      const result = run(incoming(contact, h, Math.abs(h), 'p1', yaw), contact + 2, [press()]);
      expect(result.events.find(e => e.kind === 'hit')).toMatchObject({ required: h < 0 ? 'left' : 'right' });
    }
  });
  it.each(['p1', 'p2'] as const)('uses an upper homing trajectory and its detached segment in %s', side => {
    const initial = createInitialState(side, c);
    const receiver = initial.players.find(p => p.id === side)!;
    const thrower = initial.players.find(p => p.id !== side)!;
    thrower.keys = { forward: -1, right: 0 };
    initial.danger = { side: thrower.side, expiresAt: c.dangerDuration };
    initial.ball = launchBall(thrower, receiver, 0, 0, false, c);
    const baseline = run(initial, c.timeUnitsPerSecond * 2);
    const hit = baseline.events.find(e => e.kind === 'hit');
    expect(hit).toBeDefined();
    const at = hit!.at;
    const saved = run(initial, at).state; // Contact at tick end is deferred, before the next guidance update.
    expect(saved.ball.mode).toBe('flight');
    if (saved.ball.mode !== 'flight') throw Error('expected contact segment');
    expect(saved.ball.velocity.y).toBeLessThan(0);
    // Resume with an already-active defense, then verify the real contact velocity determines the result.
    const defended = structuredClone(saved);
    const defender = defended.players.find(p => p.id === side)!;
    defender.action = { kind: 'parry', pressedAt: at - c.defenseStartup, startsAt: at,
      endsAt: at + c.defenseWindowFrames[defender.stats.defense - 1] * F };
    const mismatch = run(defended, at + 2);
    expect(mismatch.events.find(e => e.kind === 'hit')).toMatchObject({ required: 'upper', actual: 'neutral' });
    for (const detached of [false, true]) {
      const ready = structuredClone(defended);
      if (ready.ball.mode === 'flight') { ready.ball.attack!.homing = !detached; ready.ball.attack!.shot = 'straight'; }
      const result = run(ready, at + 2, [mouse(0, threshold, at, 1, side)]);
      expect(result.events.some(e => e.kind === 'parry')).toBe(true);
      expect(result.events.some(e => e.kind === 'hit')).toBe(false);
    }
  });
  it.each([[9.99, 'neutral'], [10, 'right'], [-10, 'left']] as const)('incoming %s degrees requires %s', (h, required) => {
    const contact = P + c.defenseStartup;
    const result = run(incoming(contact, h), contact + 2, [press()]);
    if (required === 'neutral') expect(result.events.some(e => e.kind === 'parry')).toBe(true);
    else expect(result.events.find(e => e.kind === 'hit')).toMatchObject({ required });
  });
  it.each(['primary', 'secondary'] as const)('%s accepts 80 degrees, rejects beyond despite matching gesture', kind => {
    for (const h of [c.defenseArcDegrees / 2, c.defenseArcDegrees / 2 + 0.01]) {
      const contact = P + c.defenseStartup;
      const result = run(incoming(contact, h), contact + 2, [press(P, 'p1', kind), mouse(threshold)]);
      expect(result.events.some(e => e.kind === 'hit')).toBe(h > c.defenseArcDegrees / 2);
    }
  });
  it('mismatch follows normal damage/loss/rally path and press-based whiff without reward or whiff event', () => {
    const contact = P + c.defenseStartup + F;
    const initial = incoming(contact); initial.rally = { speed: c.rallySpeedCap, power: c.rallyPowerCap };
    const result = run(initial, contact + 2, [press(), mouse(-threshold)]);
    expect(result.state.players[0].hp).toBe(initial.players[0].hp - c.hitDamage);
    expect(result.state.players[0].cost).toBe(initial.players[0].cost);
    expect(result.state.players[0].action).toEqual({ kind: 'parry-whiff', endsAt: P + c.parryWhiffDuration });
    expect(result.state.rally).toEqual({ speed: 0, power: 0 });
    expect(result.state.ball.mode === 'flight').toBe(false);
    expect(result.events.filter(e => e.kind === 'whiff' || e.kind === 'parry')).toEqual([]);
    expect(run(result.state, P + c.parryWhiffDuration + 1).state.players[0].action).toBeNull();
  });
  it('catch ignores invalid gesture, keeps grading, reward and press-based recovery', () => {
    const contact = P + c.defenseStartup;
    const initial = incoming(contact, 0, 40);
    const result = run(initial, contact + 2, [press(P, 'p1', 'secondary'), mouse(0, -threshold)]);
    expect(result.events).toContainEqual({ kind: 'catch', at: contact, player: 'p1', grade: 'just' });
    expect(result.state.players[0].cost).toBe(initial.players[0].cost + c.catchReward.just);
    expect(result.state.players[0].action).toEqual({ kind: 'catch-recovery', endsAt: P + c.catchDuration });
  });
});

describe('S5-8 defense-start', () => {
  it.each(['primary', 'secondary'] as const)('%s emits window end only on an accepted press', kind => {
    const initial = createInitialState('p1', c); initial.danger = { side: 'p1', expiresAt: c.dangerDuration };
    initial.ball = { mode: 'held', owner: 'p2' };
    const result = run(initial, 2 * F, [press(0, 'p1', kind), press(F, 'p1', kind)]);
    expect(result.events.filter(e => e.kind === 'defense-start')).toEqual([{ kind: 'defense-start', at: 0, player: 'p1',
      defense: kind === 'primary' ? 'parry' : 'catch', endsAt: c.defenseStartup + c.defenseWindowFrames[c.defaultStat - 1] * F }]);
    expect(step(createInitialState('p1', c), [press(0, 'p1', kind)], c).events.some(e => e.kind === 'defense-start')).toBe(false);
    initial.ball = { mode: 'held', owner: 'p1' };
    expect(step(initial, [press(0, 'p1', kind)], c).events.some(e => e.kind === 'defense-start')).toBe(false);
    initial.players[0].hp = 0; initial.ball = { mode: 'held', owner: 'p2' };
    expect(step(initial, [press(0, 'p1', kind)], c).events.some(e => e.kind === 'defense-start')).toBe(false);
  });
});
