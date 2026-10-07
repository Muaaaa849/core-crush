import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';

// 受付内の判定・報酬は発生1Fの設定で検証する。既定の発生3F（rules.md M1細則）は下の専用テストで確認する。
const config = { ...defaultConfig, defenseStartup: defaultConfig.frame };
const contactRadius = config.capsuleRadius + config.ballDiameter / 2;
// Invert contact time using a one-metre-per-frame incoming flight.
const incomingSpeed = config.timeUnitsPerSecond / config.frame;
const F = config.frame, S = config.timeUnitsPerSecond;
const kinds = ['secondary', 'primary'] as const;
function press(kind: typeof kinds[number] | 'step' | 'summon', at = 0, seq = 0): Command {
  return { kind, player: 'p1', at, seq };
}
function incoming(contact = F, defense = 5): SimState {
  const state = createInitialState('p1', config, { p1: { attack: 5, defense, agility: 5 } });
  state.danger = { side: 'p1', expiresAt: 8 * S };
  const origin = { x: 0, y: config.defenseHeight, z: state.players[0].position.z - contactRadius - incomingSpeed * contact / S };
  state.ball = { mode: 'flight', position: { ...origin }, origin, segmentOrigin: { ...origin },
    releasedAt: 0, segmentAt: 0, side: 'p1', velocity: { x: 0, y: 0, z: incomingSpeed },
    attack: { target: 'p1', shot: 'straight', speed: incomingSpeed, damage: 20, homing: false, pure: true,
      launchDistance: config.supply.p1.z - config.supply.p2.z, throwerSide: 'p2', guidanceIndex: 1 } };
  return state;
}
function empty(): SimState {
  const state = incoming();
  state.ball = { mode: 'held', owner: 'p2' };
  return state;
}
function run(state: SimState, until: number, commands: Command[] = [], base = config) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    const result = step(state, commands, { ...base, tick: Math.min(F, until - state.now) });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
function flight(state: SimState) {
  if (state.ball.mode !== 'flight') throw Error(`expected flight, got ${state.ball.mode}`);
  return state.ball;
}

describe('defense startup (rules.md M1細則, 2F later by user request)', () => {
  for (const kind of kinds) it(`${kind}: the window opens 3F after the press, with just/good/so-so counted from there`, () => {
    const at = (contact: number) => {
      const result = run(incoming(contact), contact + 1, [press(kind)], defaultConfig);
      return result.events.find(e => e.kind === 'hit' || e.kind === 'catch' || e.kind === 'parry');
    };
    expect(at(2 * F)?.kind).toBe('hit');
    expect(at(3 * F)).toMatchObject({ grade: 'just' });
    expect(at(5 * F)).toMatchObject({ grade: 'good' });
    expect(at(8 * F)).toMatchObject({ grade: 'so-so' });
    const end = 3 * F + 9 * F; // 防御5の受付W＝9F
    expect(at(end - 1)?.kind).not.toBe('hit');
    expect(at(end)?.kind).toBe('hit');
  });
});

describe('R05 shared defense window', () => {
  for (const kind of kinds) for (let defense = 1; defense <= 10; defense++) {
    const window = (7 + Math.floor((defense - 1) / 2)) * F;
    it(`${kind} defense ${defense}: accepts until ${window / F}F, exclusively`, () => {
      const end = F + window;
      const before = run(incoming(end - 1, defense), end, [press(kind)]);
      expect(before.events.some(e => e.kind === (kind === 'secondary' ? 'catch' : 'parry'))).toBe(true);
      const after = run(incoming(end, defense), end + 1, [press(kind)]);
      expect(after.events.filter(e => e.kind === 'hit')).toHaveLength(1);
      expect(after.events.some(e => e.kind === 'catch' || e.kind === 'parry')).toBe(false);
    });
  }
  for (const kind of kinds) it.each([[F, 'just'], [3 * F, 'good'], [6 * F, 'so-so']] as const)(`${kind}: contact %s grades %s`, (at, grade) => {
    const result = run(incoming(at), at + 1, [press(kind)]);
    expect(result.events).toContainEqual({ kind: kind === 'secondary' ? 'catch' : 'parry', at, player: 'p1', grade });
    expect(result.events.some(e => e.kind === 'hit')).toBe(false);
    expect(result.state.players[0].hp).toBe(100);
  });
  it.each(kinds)('%s cannot defend during startup or against a ball from behind', kind => {
    expect(run(incoming(0), F, [press(kind)]).events.some(e => e.kind === 'hit')).toBe(true);
    const state = incoming(); state.players[0].yaw = Math.PI;
    expect(run(state, F + 1, [press(kind)]).events.some(e => e.kind === 'hit')).toBe(true);
  });
  it.each(kinds)('%s uses yaw at contact and a 160 degree front arc', kind => {
    for (const angle of [79, 81]) {
      const command: Command = { kind: 'yaw', yaw: angle * Math.PI / 180, at: F, seq: 1, player: 'p1' };
      const result = run(incoming(), F + 1, [press(kind), command]);
      expect(result.events.some(e => e.kind === 'hit')).toBe(angle > 80);
    }
  });
  it.each(kinds)('%s uses the horizontal front arc for a steep descending ball', kind => {
    const state = incoming();
    const ball = flight(state);
    ball.position.y = ball.origin.y = ball.segmentOrigin.y = config.defenseHeight + 10;
    ball.velocity.y = -600;
    const result = run(state, F + 1, [press(kind)]);
    expect(result.events.some(e => e.kind === (kind === 'secondary' ? 'catch' : 'parry'))).toBe(true);
    expect(result.events.some(e => e.kind === 'hit')).toBe(false);
  });
  it('step beats catch, and catch beats parry regardless of seq', () => {
    const state = empty(); state.players[0].move = { x: 1, z: 0 };
    expect(step(state, [press('secondary'), press('step', 0, 2)], config).state.players[0].action?.kind).toBe('step');
    const result = run(incoming(), F + 1, [press('primary'), press('secondary', 0, 2)]);
    expect(result.events.some(e => e.kind === 'catch')).toBe(true);
    expect(result.events.some(e => e.kind === 'parry')).toBe(false);
  });
  it.each(kinds)('%s measures a sub-tick press in time units', kind => {
    const result = run(incoming(1500), 1501, [press(kind, 500)]);
    expect(result.events).toContainEqual({ kind: kind === 'secondary' ? 'catch' : 'parry', at: 1500, player: 'p1', grade: 'just' });
  });
  it.each(kinds)('explosion wins %s contact at the same time without reward', kind => {
    const state = incoming(); state.danger!.expiresAt = F;
    const result = run(state, F + 1, [press(kind)]);
    expect(result.events).toEqual([
      { kind: 'explosion', at: F, side: 'p1' },
    ]);
    expect(result.state.players[0].cost).toBe(4);
    expect(result.state.players[0].hp).toBe(70);
  });
});

describe('catch reward and recovery', () => {
  it.each([[F, 4], [3 * F, 2], [6 * F, 1]] as const)('contact %s rewards %s quarters once, truncating at cap', (at, reward) => {
    const initial = incoming(at); initial.players[0].cost = 0;
    const result = run(initial, 23 * F, [press('secondary')]);
    expect(result.state.players[0].cost).toBe(reward);
    expect(result.events.filter(e => e.kind === 'catch')).toHaveLength(1);
    initial.players[0].cost = 19;
    expect(run(initial, at + 1, [press('secondary')]).state.players[0].cost).toBe(20);
  });
  it('just heals 3% of max HP with a cap; good does not heal', () => {
    for (const hp of [50, 129]) {
      const state = incoming(F, 10); state.players[0].hp = hp;
      expect(run(state, F + 1, [press('secondary')]).state.players[0].hp).toBe(Math.min(130, hp + 3.9));
    }
    const state = incoming(3 * F); state.players[0].hp = 50;
    expect(run(state, 3 * F + 1, [press('secondary')]).state.players[0].hp).toBe(50);
  });
  it('holds at contact, resets rally, keeps danger and locks all actions until press+24F', () => {
    const state = incoming(3 * F); state.rally = { speed: 0.4, power: 0.8 };
    const caught = run(state, 3 * F + 1, [press('secondary')]);
    expect(caught.state.ball).toEqual({ mode: 'held', owner: 'p1' });
    expect(caught.state.danger).toEqual(state.danger);
    expect(caught.state.rally).toEqual({ speed: 0, power: 0 });
    const commands = [press('primary', 23 * F), press('step', 23 * F, 1), press('summon', 23 * F, 2), press('primary', 24 * F)];
    caught.state.players[0].move = { x: 1, z: 0 };
    const locked = run(caught.state, 24 * F, commands);
    expect(locked.state.ball.mode).toBe('held');
    expect(locked.state.players[0].stepPoints).toBe(2);
    expect(run(locked.state, 24 * F + 1, commands).state.players[0].action).toMatchObject({ kind: 'windup', endsAt: 32 * F });
  });
  it('still explodes during catch recovery', () => {
    const state = incoming(); state.danger!.expiresAt = 2 * F;
    const result = run(state, 2 * F + 1, [press('secondary')]);
    expect(result.events.some(e => e.kind === 'explosion')).toBe(true);
    expect(result.state.players[0].hp).toBe(70);
    expect(result.state.rally).toEqual({ speed: 0, power: 0 });
  });
});

describe('whiffs', () => {
  it.each([['secondary', 54], ['primary', 30]] as const)('%s emits one whiff at window end and ends at press+%sF', (kind, frames) => {
    const result = run(empty(), frames * F, [press(kind), press(kind, 5 * F)]);
    expect(result.events.filter(e => e.kind === 'whiff')).toEqual([{ kind: 'whiff', player: 'p1', at: 10 * F }]);
    expect(run(result.state, frames * F + 1, [press(kind, frames * F)]).state.players[0].action?.kind).toBe(kind === 'secondary' ? 'catch' : 'parry');
  });
  it('catch whiff cancels only to step after window end', () => {
    for (const at of [9 * F, 10 * F]) {
      const state = empty(); state.players[0].move = { x: 1, z: 0 };
      const result = run(state, at + 1, [press('secondary'), press('step', at)]);
      expect(result.events.some(e => e.kind === 'step')).toBe(at === 10 * F);
    }
    for (const kind of ['primary', 'summon', 'secondary'] as const) {
      const whiffed = run(empty(), 11 * F, [press('secondary')]).state;
      whiffed.ball = kind === 'summon' ? { mode: 'loose', position: { x: 4, y: config.ballDiameter / 2, z: 10 }, startsAt: 0,
        velocity: { x: 0, y: 0, z: 0 }, motionAt: whiffed.now, nextPhysicsAt: whiffed.now + F } : { mode: 'held', owner: 'p1' };
      const result = step(whiffed, [press(kind, whiffed.now)], config);
      expect(result.state.players[0].action).toEqual(whiffed.players[0].action);
      expect(result.events).toEqual([]);
    }
  });
  it('a held press never automatically retries once recovery ends', () => {
    const result = run(empty(), 60 * F, [press('secondary')]);
    expect(result.events.filter(e => e.kind === 'whiff')).toHaveLength(1);
    expect(result.state.players[0].action).toBeNull();
  });
});

describe('parry return and rally', () => {
  for (const yaw of [-Math.PI / 6, 0, Math.PI / 6]) {
    it.each([[F, 'just'], [3 * F, 'good'], [6 * F, 'so-so']] as const)(`S5-1: incoming angle at yaw ${yaw} needs only a button; grade %s/%s is unchanged`, (at, grade) => {
      const state = incoming(at);
      state.players[0].yaw = yaw;
      state.players[0].hp = state.players[0].maxHp / 2;
      state.players[0].cost = 0;
      const result = run(state, at + 1, [press('primary')]);
      expect(result.events).toContainEqual({ kind: 'parry', at, player: 'p1', grade });
      expect(result.state.players[0].cost).toBe(config.parryReward);
      expect(result.state.players[0].hp).toBe(state.players[0].hp);
      expect(result.state.rally).toEqual(config.rallyGain[grade]);
      expect(result.events.some(e => e.kind === 'hit')).toBe(false);
    });
  }
  it.each([[F, 0.07, 0.12], [3 * F, 0.05, 0.08], [6 * F, 0.03, 0.05]] as const)('contact %s adds speed %s / power %s and one cost', (at, speed, power) => {
    const state = incoming(at); state.players[0].cost = 0;
    const result = run(state, at + 1, [press('primary')]);
    expect(result.state.rally).toEqual({ speed, power });
    expect(result.state.players[0].cost).toBe(1);
    const ball = flight(result.state);
    expect(ball.releasedAt).toBe(at);
    expect(ball.origin).toEqual({ x: 0, y: config.defenseHeight, z: config.supply.p1.z - config.capsuleRadius });
    expect(ball.attack).toMatchObject({ target: 'p2', homing: true, shot: 'straight' });
    expect(ball.velocity.z).toBeLessThan(0);
    expect(ball.attack!.speed).toBeCloseTo(config.shotSpeed.straight * (1 + 0.25 * (at / (8 * S)) ** 2) * (1 + speed));
    expect(ball.attack!.damage).toBeCloseTo(20 * (1 + 0.60 * (at / (8 * S)) ** 2) * (1 + power));
    expect(result.events.filter(e => e.kind === 'parry')).toHaveLength(1);
    expect(result.events.some(e => e.kind === 'hit')).toBe(false);
  });
  it.each([[0, 0, 'straight'], [1, 0, 'straight'], [0, -1, 'left'], [0, 1, 'right'], [-1, 0, 'upper'], [-1, -1, 'upper']] as const)('S5-2: selects keys (forward %s, right %s) -> %s at contact', (forward, right, shot) => {
    const result = run(incoming(), F + 1, [press('primary'), { kind: 'keys', player: 'p1', at: F, seq: 1, forward, right }]);
    expect(flight(result.state).attack?.shot).toBe(shot);
  });
  it('caps accumulated rally and combines own attack, current danger and total caps', () => {
    let state = incoming();
    for (let i = 0; i < 12; i++) {
      const next = incoming(); next.rally = state.rally;
      state = run(next, F + 1, [press('primary')]).state;
    }
    expect(state.rally).toEqual({ speed: 0.4, power: 0.8 });
    const boosted = incoming(); boosted.rally = state.rally; boosted.players[0].stats.attack = 10;
    boosted.danger!.expiresAt = S / 2;
    const result = run(boosted, F + 1, [press('primary')]);
    expect(flight(result.state).attack!.speed).toBeCloseTo(config.shotSpeed.straight * 1.6);
    expect(flight(result.state).attack!.damage).toBe(50);
  });
  it('parry reward truncates at cap and ignores the incoming attack and power', () => {
    const state = incoming(); state.players[0].cost = 20;
    state.players[0].stats.attack = 1;
    flight(state).attack!.damage = 50;
    const result = run(state, F + 1, [press('primary')]);
    expect(result.state.players[0].cost).toBe(20);
    expect(flight(result.state).attack!.speed).toBeCloseTo(config.shotSpeed.straight * 0.88 * (1 + 0.25 * (F / (8 * S)) ** 2) * 1.07);
    expect(flight(result.state).attack!.damage).toBeCloseTo(20 * (1 + 0.60 * (F / (8 * S)) ** 2) * 1.12);
  });
  it('keeps rally across crossing and resets on hit, attack loss and explosion', () => {
    const parried = run(incoming(), F + 1, [press('primary')]).state;
    const returned = flight(parried);
    const crossing = Math.ceil(returned.segmentAt - returned.segmentOrigin.z / returned.velocity.z * S);
    const crossed = run(parried, Math.ceil(crossing / F) * F);
    expect(crossed.events.some(e => e.kind === 'crossing')).toBe(true);
    expect(crossed.state.rally).toEqual(parried.rally);
    const hit = run(crossed.state, S);
    expect(hit.events.some(e => e.kind === 'hit')).toBe(true);
    expect(hit.state.rally).toEqual({ speed: 0, power: 0 });
    const loss = incoming(); loss.rally = { speed: 0.2, power: 0.3 };
    flight(loss).velocity = { x: incomingSpeed, y: 0, z: 0 };
    expect(run(loss, Math.ceil(config.ballHalfWidth / incomingSpeed * S / F) * F).state.rally).toEqual({ speed: 0, power: 0 });
    const explosion = empty(); explosion.rally = { speed: 0.2, power: 0.3 }; explosion.danger!.expiresAt = F;
    expect(run(explosion, F).state.rally).toEqual({ speed: 0, power: 0 });
  });
  it('locks for 6F from contact, then allows a new press', () => {
    const result = run(incoming(3 * F), 9 * F, [press('primary'), press('secondary', 9 * F - 1)]);
    expect(result.events.some(e => e.kind === 'whiff')).toBe(false);
    expect(result.state.players[0].action).toEqual({ kind: 'recovery', endsAt: 9 * F });
    expect(run(result.state, 9 * F + 1, [press('secondary', 9 * F)]).state.players[0].action?.kind).toBe('catch');
  });
  it.each(['straight', 'left', 'right', 'upper'] as const)('%s return obeys minimum flight time and point-blank speed floor', shot => {
    for (const distance of [1, 3]) {
      const state = incoming(); state.players[0].position.z = distance / 2;
      state.players[1].position.z = -distance / 2;
      const ball = flight(state); ball.position.z = ball.origin.z = ball.segmentOrigin.z = distance / 2 - contactRadius - incomingSpeed * F / S;
      const keys = { forward: shot === 'upper' ? -1 : 0, right: shot === 'left' ? -1 : shot === 'right' ? 1 : 0 };
      const result = run(state, F + 1, [press('primary'), { kind: 'keys', player: 'p1', at: F, seq: 1, ...keys }]);
      const returned = flight(result.state);
      expect(returned.attack!.shot).toBe(shot);
      if (distance === 1) expect(returned.attack!.speed).toBe(6.5);
      const hit = run(result.state, S).events.find(e => e.kind === 'hit');
      expect(hit).toBeDefined();
      if (returned.attack!.speed > 6.5) expect((hit!.at - F) / S).toBeGreaterThanOrEqual(config.minimumFlightSeconds[shot] - 0.00002);
    }
  });
  it('replays identically at 30/60/144fps and from a saved defense attempt', () => {
    const commands = [press('primary', 137), press('secondary', 25 * F)];
    const initial = incoming(3 * F); const saved = run(initial, 2 * F, commands).state;
    expect(run(saved, S, commands)).toEqual(run(structuredClone(saved), S, commands));
    const replay = (fps: number) => {
      let state = initial; const events: SimEvent[] = [];
      for (let frame = 1; state.now < S; frame++) {
        const result = run(state, Math.min(S, Math.floor(frame * S / fps / F) * F), commands);
        state = result.state; events.push(...result.events);
      }
      return { state, events };
    };
    expect(replay(30)).toEqual(replay(60)); expect(replay(144)).toEqual(replay(60));
    expect(initial).toEqual(incoming(3 * F));
  });
});
