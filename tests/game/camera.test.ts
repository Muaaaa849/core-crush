import { duelParticipants } from '../fixtures';
// カメラ（R07、progress.md C1〜C4）：所持中FPS、キャッチ全体終了後にFPS、投球後硬直のあとTPS、跳ね返しは不変。
import { describe, expect, it } from 'vitest';
import { CameraBlend, cameraModeFor, aimCameraPose, heldFpsPose } from '../../src/game/camera';
import { PerspectiveCamera, Vector3 } from 'three';
import { aimLine } from '../../src/sim/aim';
import { defaultConfig as config } from '../../src/sim/config';
import { viewFov } from '../../src/game/settingsview';
import { createInitialState } from '../../src/sim/sim';
import type { PlayerState, SimState } from '../../src/sim/types';

function stateWith(ball: SimState['ball'], action: PlayerState['action']): SimState {
  const state = createInitialState({ participants: duelParticipants, firstBall: 'a' });
  state.ball = ball;
  state.players[0].action = action;
  return state;
}

const held = { mode: 'held', owner: 'p1' } as const;
const vector = (v: { x: number; y: number; z: number }) => new Vector3(v.x, v.y, v.z);

describe('aim camera', () => {
  it.each([0, 0.5, 1].flatMap(fps => [-1.2, -0.4, 0, 0.4, 1.2].map(pitch => [fps, pitch])))
  ('V15-8: keeps T at the center for blend=%s pitch=%s', (fps, pitch) => {
    const s = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    const p = { ...s.players[0], yaw: 0.12, pitch, position: { x: 0.2, y: 0, z: 5 } };
    const candidates = s.players.map(q => ({ ...q, position: { x: 0.2, y: 0, z: -2 } }));
    const line = aimLine(p, candidates, config);
    const pose = aimCameraPose(p.position, p.yaw, p.pitch, fps, line.target, config);
    const camera = new PerspectiveCamera(90, 16 / 9);
    camera.position.copy(vector(pose.position)); camera.lookAt(vector(pose.target)); camera.updateMatrixWorld();
    expect(camera.getWorldDirection(new Vector3()).distanceTo(vector(line.target).sub(camera.position).normalize())).toBeLessThan(1e-12);
    const projected = vector(line.target).project(camera);
    expect(projected.x).toBeCloseTo(0, 12); expect(projected.y).toBeCloseTo(0, 12);
    expect(pose.target).toEqual(line.target);
  });
  it('V15-8: uses config eye height and logical D for a continuous shoulder blend', () => {
    const body = { x: 1, y: 0.3, z: 4 }, yaw = 0.6, pitch = -0.5;
    const cfg = { ...config, aimEyeHeight: 1.8 }, target = { x: 0, y: 0, z: 0 };
    const start = aimCameraPose(body, yaw, pitch, 0, target, cfg);
    const mid = aimCameraPose(body, yaw, pitch, 0.5, target, cfg);
    const end = aimCameraPose(body, yaw, pitch, 1, target, cfg);
    expect(end.position).toEqual({ x: 1, y: 2.1, z: 4 });
    expect(vector(mid.position).distanceTo(vector(start.position).lerp(vector(end.position), 0.5))).toBeLessThan(1e-12);
    const d = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const expected = vector(end.position).add(new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.5))
      .add(new Vector3(0, 0.35, 0)).addScaledVector(d, -2.2);
    expect(vector(start.position).distanceTo(expected)).toBeLessThan(1e-12);
    expect(aimCameraPose(body, yaw, pitch, 0, { x: 20, y: 7, z: -10 }, cfg).position).toEqual(start.position);
  });
});

describe('FPS held ball projection', () => {
  it.each([70, 90, 110].flatMap(fov => [false, true].flatMap(ads => [16 / 9, 16 / 10].map(aspect => [fov, ads, aspect] as const))))
  ('keeps ball center and full rim clear of the HUD/reticle at FOV=%s ADS=%s aspect=%s', (fov, ads, aspect) => {
    const camera = new PerspectiveCamera(viewFov(fov, ads), aspect, 0.05, 500);
    const radius = config.ballDiameter / 2;
    const pose = heldFpsPose(camera.fov, aspect, radius);
    const center = vector(pose.position).project(camera);
    expect((center.x + 1) / 2).toBeCloseTo(0.785);
    expect((1 - center.y) / 2).toBeCloseTo(0.665);
    // Sample the entire sphere, including the nearer rim rather than a flat disk.
    for (let latitude = 0; latitude <= 32; latitude++) for (let longitude = 0; longitude < 64; longitude++) {
      const phi = latitude / 32 * Math.PI, theta = longitude / 64 * Math.PI * 2;
      const point = new Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
        .multiplyScalar(radius * pose.scale).add(vector(pose.position)).project(camera);
      const x = (point.x + 1) / 2, y = (1 - point.y) / 2;
      expect(x).toBeGreaterThan(0.74); expect(x).toBeLessThan(0.83);
      expect(y).toBeGreaterThan(0.61); expect(y).toBeLessThan(0.72);
      expect(y).toBeLessThan(0.86);
    }
  });
});
const flight = (state: SimState): SimState['ball'] => ({
  mode: 'flight', position: { x: 0, y: 1.2, z: 5 }, origin: { x: 0, y: 1.2, z: 5 }, releasedAt: 0,
  velocity: { x: 0, y: 0, z: -30 }, side: 'a', segmentOrigin: { x: 0, y: 1.2, z: 5 }, segmentAt: state.now, attack: null,
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
    const base = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    expect(cameraModeFor('fps', stateWith(flight(base), { kind: 'recovery', endsAt: 100 }), 'p1')).toBe('fps');
    expect(cameraModeFor('fps', stateWith(flight(base), null), 'p1')).toBe('tps');
  });

  it('C3: a parry never switches to FPS', () => {
    const base = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    expect(cameraModeFor('tps', stateWith(flight(base), { kind: 'parry', pressedAt: 0, startsAt: 1000, endsAt: 10000 }), 'p1')).toBe('tps');
    expect(cameraModeFor('tps', stateWith(flight(base), { kind: 'recovery', endsAt: 100 }), 'p1')).toBe('tps');
  });

  it('C3: losing the ball (loose / absent) is TPS', () => {
    expect(cameraModeFor('fps', stateWith({ mode: 'loose', position: { x: 0, y: 0.325, z: 5 }, startsAt: 0,
      velocity: { x: 0, y: 0, z: 0 }, motionAt: 0, nextPhysicsAt: 1000 }, null), 'p1')).toBe('tps');
    expect(cameraModeFor('fps', stateWith({ mode: 'absent', side: 'a', appearsAt: 0 }, null), 'p1')).toBe('tps');
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
    blend.update(stateWith({ mode: 'absent', side: 'a', appearsAt: 0 }, null), 'p1', 100);
    expect(blend.mode).toBe('tps');
    expect(blend.fps).toBe(0);
  });

  it('C2: after the throw recovery ends, TPS follows from the remembered mode', () => {
    const blend = new CameraBlend();
    blend.update(stateWith(held, { kind: 'windup', endsAt: 100 }), 'p1', 200);
    const thrown = stateWith(flight(createInitialState({ participants: duelParticipants, firstBall: 'a' })), { kind: 'recovery', endsAt: 100 });
    blend.update(thrown, 'p1', 16);
    expect(blend.mode).toBe('fps');
    blend.update(stateWith(flight(createInitialState({ participants: duelParticipants, firstBall: 'a' })), null), 'p1', 16);
    expect(blend.mode).toBe('tps');
  });
});
