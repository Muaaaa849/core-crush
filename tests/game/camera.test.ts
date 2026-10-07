// カメラ（R07、progress.md C1〜C4）：所持中FPS、キャッチ全体終了後にFPS、投球後硬直のあとTPS、跳ね返しは不変。
import { describe, expect, it } from 'vitest';
import { CameraBlend, cameraModeFor } from '../../src/game/camera';
import { createInitialState } from '../../src/sim/sim';
import type { PlayerState, SimState } from '../../src/sim/types';

function stateWith(ball: SimState['ball'], action: PlayerState['action']): SimState {
  const state = createInitialState('p1');
  state.ball = ball;
  state.players[0].action = action;
  return state;
}

const held = { mode: 'held', owner: 'p1' } as const;
const flight = (state: SimState): SimState['ball'] => ({
  mode: 'flight', position: { x: 0, y: 1.2, z: 5 }, origin: { x: 0, y: 1.2, z: 5 }, releasedAt: 0,
  velocity: { x: 0, y: 0, z: -30 }, side: 'p1', segmentOrigin: { x: 0, y: 1.2, z: 5 }, segmentAt: state.now, attack: null,
});

describe('cameraModeFor', () => {
  it('C1: holding the ball is FPS, but TPS while the catch is still in progress', () => {
    expect(cameraModeFor('tps', stateWith(held, null), 'p1')).toBe('fps');
    expect(cameraModeFor('tps', stateWith(held, { kind: 'catch-recovery', endsAt: 100 }), 'p1')).toBe('tps');
    expect(cameraModeFor('tps', stateWith(held, { kind: 'windup', endsAt: 100 }), 'p1')).toBe('fps');
  });

  it('C1: the opponent holding the ball does not switch my camera', () => {
    expect(cameraModeFor('tps', stateWith({ mode: 'held', owner: 'p2' }, null), 'p1')).toBe('tps');
  });

  it('C2: the 8F after a throw stays FPS, then TPS', () => {
    const base = createInitialState('p1');
    expect(cameraModeFor('fps', stateWith(flight(base), { kind: 'recovery', endsAt: 100 }), 'p1')).toBe('fps');
    expect(cameraModeFor('fps', stateWith(flight(base), null), 'p1')).toBe('tps');
  });

  it('C3: a parry never switches to FPS', () => {
    const base = createInitialState('p1');
    expect(cameraModeFor('tps', stateWith(flight(base), { kind: 'parry', pressedAt: 0, startsAt: 1000, endsAt: 10000 }), 'p1')).toBe('tps');
    expect(cameraModeFor('tps', stateWith(flight(base), { kind: 'recovery', endsAt: 100 }), 'p1')).toBe('tps');
  });

  it('C3: losing the ball (loose / absent) is TPS', () => {
    expect(cameraModeFor('fps', stateWith({ mode: 'loose', position: { x: 0, y: 0.325, z: 5 }, startsAt: 0,
      velocity: { x: 0, y: 0, z: 0 }, motionAt: 0, nextPhysicsAt: 1000 }, null), 'p1')).toBe('tps');
    expect(cameraModeFor('fps', stateWith({ mode: 'absent', side: 'p1', appearsAt: 0 }, null), 'p1')).toBe('tps');
  });
});

describe('CameraBlend', () => {
  it('C4: blends to FPS over 100 ms and back', () => {
    const blend = new CameraBlend();
    const holding = stateWith(held, null);
    expect(blend.fps).toBe(0);
    blend.update(holding, 'p1', 50);
    expect(blend.mode).toBe('fps');
    expect(blend.fps).toBeCloseTo(0.5);
    blend.update(holding, 'p1', 60);
    expect(blend.fps).toBe(1);
    blend.update(stateWith({ mode: 'absent', side: 'p1', appearsAt: 0 }, null), 'p1', 100);
    expect(blend.mode).toBe('tps');
    expect(blend.fps).toBe(0);
  });

  it('C2: after the throw recovery ends, TPS follows from the remembered mode', () => {
    const blend = new CameraBlend();
    blend.update(stateWith(held, { kind: 'windup', endsAt: 100 }), 'p1', 200);
    const thrown = stateWith(flight(createInitialState('p1')), { kind: 'recovery', endsAt: 100 });
    blend.update(thrown, 'p1', 16);
    expect(blend.mode).toBe('fps');
    blend.update(stateWith(flight(createInitialState('p1')), null), 'p1', 16);
    expect(blend.mode).toBe('tps');
  });
});
