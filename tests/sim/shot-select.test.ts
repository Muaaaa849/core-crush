import { duelParticipants } from '../fixtures';
// 球種は移動方向ではなく押しているキー（前後左右の意図）で決める。S ＞ A/D ＞ W、AとD・WとSは相殺（feel.md「入力設定」）。
import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, Shot, Side, SimState } from '../../src/sim/types';

function throwWith(side: Side, keys: { forward: number; right: number }, move: { x: number; z: number }): Shot | undefined {
  let state: SimState = createInitialState({ participants: duelParticipants, firstBall: side });
  state.danger = { side, expiresAt: 8 * config.timeUnitsPerSecond };
  state.ball = { mode: 'held', owner: state.players.find(p => p.side === side)!.id };
  const commands: Command[] = [
    { kind: 'keys', player: state.players.find(p => p.side === side)!.id, at: 0, seq: 0, ...keys },
    { kind: 'move', player: state.players.find(p => p.side === side)!.id, at: 0, seq: 1, ...move },
    { kind: 'primary', player: state.players.find(p => p.side === side)!.id, at: 0, seq: 2 },
  ];
  for (let i = 0; i < 20; i++) {
    state = step(state, i === 0 ? commands : []).state;
    if (state.ball.mode === 'flight') return state.ball.attack?.shot;
  }
  return undefined;
}

describe('shot selection by keys', () => {
  // カメラが少し傾くと、Aだけでも移動方向に後ろ向きの成分が出る（不具合の再現）。
  const leftWithTiltedCamera = { x: -Math.cos(0.2), z: Math.sin(0.2) };

  it.each(['a', 'b'] as const)('%s: A gives a left curve even if the world move points slightly backward', (side) => {
    expect(throwWith(side, { forward: 0, right: -1 }, leftWithTiltedCamera)).toBe('left');
  });

  it.each([
    [{ forward: 0, right: 0 }, 'straight'],
    [{ forward: 1, right: 0 }, 'straight'],
    [{ forward: 0, right: -1 }, 'left'],
    [{ forward: 0, right: 1 }, 'right'],
    [{ forward: -1, right: 0 }, 'upper'],
    [{ forward: -1, right: -1 }, 'upper'], // Sが最優先
    [{ forward: 1, right: 1 }, 'right'], // A/DはWより優先
  ] as const)('keys %o -> %s', (keys, shot) => {
    expect(throwWith('a', keys, { x: 0, z: 0 })).toBe(shot);
  });
});

describe('input state during pauses', () => {
  it('keeps move/keys/yaw sent before the clock starts and applies them once play begins', () => {
    let state = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    const start = config.ballStartDelay;
    const commands: Command[] = [
      { kind: 'move', player: 'p1', at: 0, seq: 0, x: 1, z: 0 },
      { kind: 'keys', player: 'p1', at: 0, seq: 1, forward: 0, right: 1 },
      { kind: 'yaw', player: 'p1', at: 0, seq: 2, yaw: 0.5 },
    ];
    const x0 = state.players[0].position.x;
    while (state.now < start + config.timeUnitsPerSecond) state = step(state, state.now === 0 ? commands : []).state;
    const p1 = state.players[0];
    expect(p1.keys).toEqual({ forward: 0, right: 1 });
    expect(p1.yaw).toBe(0.5);
    expect(p1.position.x).toBeGreaterThan(x0 + 4); // 時計開始後の1秒で約5m歩く
  });
});
