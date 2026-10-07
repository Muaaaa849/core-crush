import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';

const S = 60_000;
const expiry = 9 * S;

function advance(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until) {
    const result = step(state, commands.filter(c => c.at >= state.now && c.at < state.now + config.tick), config);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function throwAt(release: number, distance: number) {
  let state = advance(createInitialState('p1', config), S + config.tick).state;
  state.players[0].position.z = distance;
  // 回収済みの球を保持したまま、リリース直前まで待つ。
  state = advance(state, release - config.throwWindup).state;
  return advance(state, expiry + config.tick, [
    { kind: 'primary', player: 'p1', at: release - config.throwWindup, seq: 0 },
  ]);
}

describe('R01/R02 danger clock', () => {
  it.each(['p1', 'p2'] as const)('starts the first ball after 1s and explodes once at 9s on %s', side => {
    const initial = createInitialState(side, config);
    expect(initial.danger).toBeNull();
    const started = advance(initial, S);
    expect(started.state.danger).toEqual({ side, expiresAt: expiry });
    const before = advance(started.state, expiry - config.tick);
    expect(before.events.filter(e => e.kind === 'explosion')).toEqual([]);
    const result = advance(before.state, expiry);
    expect(result.events.filter(e => e.kind === 'explosion')).toEqual([{ kind: 'explosion', at: expiry, side }]);
    expect(result.state.players.map(p => p.hp)).toEqual(side === 'p1' ? [70, 100] : [100, 70]);
    expect(advance(result.state, expiry + S / 2).events.filter(e => e.kind === 'explosion')).toEqual([]);
  });

  it('pickup, holding and walking within the side never reset the deadline', () => {
    const state = createInitialState('p1', config);
    state.players[0].position.x = 4;
    const result = advance(state, 4 * S, [
      { kind: 'move', player: 'p1', at: 2 * S, seq: 0, x: -1, z: 0 },
      { kind: 'move', player: 'p1', at: 3 * S, seq: 1, x: 0, z: 0 },
    ]);
    expect(result.events.some(e => e.kind === 'pickup')).toBe(true);
    expect(result.state.ball.mode).toBe('held');
    expect(result.state.danger).toEqual({ side: 'p1', expiresAt: expiry });
    expect(advance(result.state, expiry + config.tick).state.players.map(p => p.hp)).toEqual([70, 100]);
  });

  it('release at 7.8s cannot save a ball crossing at 8.1s', () => {
    const result = throwAt(S + 7.8 * S, 28 * 0.3);
    expect(result.events.filter(e => e.kind === 'release').map(e => e.at)).toEqual([S + 7.8 * S]);
    expect(result.events.filter(e => e.kind === 'explosion')).toEqual([{ kind: 'explosion', at: expiry, side: 'p1' }]);
    expect(result.events.some(e => e.kind === 'crossing')).toBe(false);
    expect(result.state.players.map(p => p.hp)).toEqual([70, 100]);
  });

  it('crossing at 7.999s starts the receiver clock at that exact time', () => {
    const crossing = S + 7.999 * S;
    const result = throwAt(S + 7.8 * S, 28 * (crossing - (S + 7.8 * S)) / S);
    expect(result.events.filter(e => e.kind === 'crossing')).toEqual([{ kind: 'crossing', at: crossing, side: 'p2' }]);
    expect(result.state.danger).toEqual({ side: 'p2', expiresAt: crossing + 8 * S });
    expect(result.state.players.map(p => p.hp)).toEqual([100, 100]);
  });

  it('explosion wins a crossing exactly at expiry', () => {
    const result = throwAt(S + 7.8 * S, 28 * 0.2);
    expect(result.events.filter(e => e.kind === 'explosion')).toEqual([{ kind: 'explosion', at: expiry, side: 'p1' }]);
    expect(result.events.some(e => e.kind === 'crossing')).toBe(false);
  });

  it('interpolates the center crossing inside the tick (integer time unit, not the tick)', () => {
    const release = 2 * S;
    const result = throwAt(release, 1);
    const crossing = Math.ceil(release + S / 28); // 中心が平面に達した最初の整数時刻（0004）
    expect(result.events.filter(e => e.kind === 'crossing')[0]?.at).toBe(crossing);
    expect(result.state.danger).toEqual({ side: 'p2', expiresAt: crossing + 8 * S });
    expect(crossing % config.tick).not.toBe(0);
  });

  it('explodes on the receiver side at the interpolated deadline', () => {
    const crossed = throwAt(2 * S, 1);
    const expiresAt = Math.ceil(2 * S + S / 28) + 8 * S;
    const result = advance(crossed.state, expiresAt + config.tick);
    expect(result.events.filter(e => e.kind === 'explosion')).toEqual([{ kind: 'explosion', at: expiresAt, side: 'p2' }]);
    expect(result.state.players.map(p => p.hp)).toEqual([100, 70]);
  });

  it('spawns the next ball on the opposite supply at +1s and activates at +2s', () => {
    let result = advance(createInitialState('p1', config), expiry + config.tick);
    expect(result.state.ball.mode).toBe('absent');
    result = advance(result.state, expiry + S + config.tick);
    expect(result.events).toContainEqual({ kind: 'spawn', at: expiry + S, side: 'p2' });
    expect(result.state.ball).toMatchObject({ mode: 'loose', position: config.supply.p2 });
    expect(result.state.danger).toBeNull();
    const waiting = advance(result.state, expiry + 2 * S - config.tick, [
      { kind: 'primary', at: expiry + S + config.tick, seq: 0, player: 'p2' },
    ]);
    expect(waiting.events.some(e => e.kind === 'release')).toBe(false);
    expect(waiting.state.ball.mode).toBe('loose');
    const started = advance(waiting.state, expiry + 2 * S + config.tick);
    expect(started.state.danger).toEqual({ side: 'p2', expiresAt: expiry + 10 * S });
  });

  it('processes input timestamps and seq consistently at 30/60/144fps batching', () => {
    const commands: Command[] = [
      { kind: 'move', player: 'p1', at: 61_234, seq: 0, x: 1, z: 0 },
      { kind: 'move', player: 'p1', at: 73_456, seq: 1, x: 0, z: 0 },
      { kind: 'yaw', player: 'p1', at: 120_123, seq: 3, yaw: 0 },
      { kind: 'yaw', player: 'p1', at: 120_123, seq: 2, yaw: Math.PI },
      { kind: 'primary', player: 'p1', at: 120_123, seq: 4 },
    ];
    function replay(fps: number) {
      let state = createInitialState('p1', config);
      const events: SimEvent[] = [];
      for (let frame = 1; state.now < 12 * S; frame++) {
        const target = Math.min(12 * S, Math.floor(frame * S / fps / config.tick) * config.tick);
        const result = advance(state, target, commands);
        state = result.state;
        events.push(...result.events);
      }
      return { state, events };
    }
    const reference = replay(60);
    expect(reference.events.some(e => e.kind === 'crossing' && e.side === 'p2')).toBe(true);
    expect(replay(30)).toEqual(reference);
    expect(replay(144)).toEqual(reference);
  });

  it('does not mutate inputs and replays from a plain cloned snapshot', () => {
    const state = advance(createInitialState('p1', config), S).state;
    const snapshot = structuredClone(state);
    const commands: Command[] = [{ kind: 'primary', player: 'p1', at: S + 123, seq: 0 }];
    const before = structuredClone(commands);
    const result = advance(state, 3 * S, commands);
    expect(state).toEqual(snapshot);
    expect(commands).toEqual(before);
    expect(advance(structuredClone(snapshot), 3 * S, commands)).toEqual(result);
  });

  it('accepts tick-end inputs in the next tick and releases exactly 8F later', () => {
    const state = advance(createInitialState('p1', config), S + config.tick).state;
    const command: Command = { kind: 'primary', player: 'p1', at: state.now + config.tick, seq: 0 };
    const first = step(state, [command], config);
    expect(first.events).toEqual([]);
    const before = advance(first.state, command.at + config.throwWindup - config.tick, [command]);
    expect(before.state.ball.mode).toBe('held');
    const released = advance(before.state, command.at + config.throwWindup + config.tick);
    expect(released.events).toContainEqual({ kind: 'release', at: command.at + 8_000, player: 'p1' });
  });

  it('uses release-time facing, reduces windup walking, and keeps flight speed constant', () => {
    const state = advance(createInitialState('p1', config), S + config.tick).state;
    const release = state.now + 8_000;
    const commands: Command[] = [
      { kind: 'primary', player: 'p1', at: state.now, seq: 0 },
      { kind: 'move', player: 'p1', at: state.now, seq: 1, x: 1, z: 0 },
      { kind: 'yaw', player: 'p1', at: release, seq: 2, yaw: -Math.PI / 2 },
    ];
    const result = advance(state, release + 8_000, commands);
    expect(result.state.players[0].position.x).toBeCloseTo(5 * 0.3 * 8 / 60 + 5 * 8 / 60);
    expect(result.state.ball.mode).toBe('flight');
    if (result.state.ball.mode !== 'flight') throw new Error('expected released ball');
    expect(result.state.ball.position.x).toBeCloseTo(5 * 0.3 * 8 / 60 + 28 * 8 / 60);
    expect(result.state.ball.position.z).toBeCloseTo(6);
    expect(Math.hypot(result.state.ball.velocity.x, result.state.ball.velocity.z)).toBeCloseTo(28);
    expect(result.state.danger).toEqual({ side: 'p1', expiresAt: expiry });
    const recovered = advance(result.state, release + 8_000 + config.tick);
    expect(recovered.state.players[0].action).toBeNull();
  });

  it('keeps both players in their own courts when walking into the edges', () => {
    const state = advance(createInitialState('p1', config), S).state;
    const result = advance(state, 4 * S, [
      { kind: 'move', player: 'p1', at: S, seq: 0, x: 1, z: -1 },
      { kind: 'move', player: 'p2', at: S, seq: 1, x: -1, z: 1 },
    ]);
    expect(result.state.players[0].position.x).toBe(config.playerHalfWidth);
    expect(result.state.players[0].position.z).toBeGreaterThanOrEqual(config.playerMinDepth);
    expect(result.state.players[1].position.x).toBe(-config.playerHalfWidth);
    expect(result.state.players[1].position.z).toBeLessThanOrEqual(-config.playerMinDepth);
    expect(result.state.danger).toEqual({ side: 'p1', expiresAt: expiry });
  });

  it('expires before a primary press at the same timestamp', () => {
    const state = advance(createInitialState('p1', config), expiry - config.tick).state;
    const result = advance(state, expiry + config.tick, [
      { kind: 'primary', player: 'p1', at: expiry, seq: 0 },
    ]);
    expect(result.state.ball.mode).toBe('absent');
    expect(result.events).toEqual([{ kind: 'explosion', at: expiry, side: 'p1' }]);
  });
});
