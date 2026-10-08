// FPS／TPSの切替（R07、feel.md「FPSとTPSを、視線を失わずつなぐ」）。表示だけでsimの判定には使わない。
import type { SimConfig } from '../sim/config';
import type { PlayerId, SimState, Vec3 } from '../sim/types';

export type CameraMode = 'fps' | 'tps';

const BLEND_MS = 100;
const CAMERA_BACK = 2.2, CAMERA_RIGHT = 0.5, CAMERA_UP = 0.35;

/** 肩位置は論理視線Dで決め、補間中も同じ照準点Tを見る（0015 V15-8）。 */
export function aimCameraPose(body: Vec3, yaw: number, pitch: number, fps: number, target: Vec3, config: SimConfig): {
  position: Vec3; target: Vec3;
} {
  const tps = 1 - fps;
  const back = CAMERA_BACK * tps;
  return { position: {
    x: body.x + Math.cos(yaw) * CAMERA_RIGHT * tps + Math.sin(yaw) * Math.cos(pitch) * back,
    y: body.y + config.aimEyeHeight + CAMERA_UP * tps - Math.sin(pitch) * back,
    z: body.z - Math.sin(yaw) * CAMERA_RIGHT * tps + Math.cos(yaw) * Math.cos(pitch) * back,
  }, target };
}

/** FPS保持球だけの表示姿勢。カメラ座標で画面中心78.5%/66.5%へ置き、全周をHUDから離す。 */
export function heldFpsPose(fov: number, aspect: number, radius: number): { position: Vec3; scale: number } {
  const depth = 1.1;
  const halfHeight = depth * Math.tan(fov * Math.PI / 360);
  return { position: { x: (0.785 * 2 - 1) * halfHeight * aspect, y: (1 - 0.665 * 2) * halfHeight, z: -depth },
    scale: halfHeight * 0.075 / radius };
}

/**
 * 所持中はFPS。ただしキャッチ全体動作中はTPS。投球後の硬直はFPSのまま（直前がFPSだったときだけ）。
 * 跳ね返しは所持を経由しないため、硬直もTPSのまま。
 */
export function cameraModeFor(previous: CameraMode, state: SimState, id: PlayerId): CameraMode {
  const player = state.players.find((p) => p.id === id)!;
  if (player.hp <= 0) return 'tps';
  if (state.ball.mode === 'held' && state.ball.owner === id) return player.action?.kind === 'catch-recovery' ? 'tps' : 'fps';
  return previous === 'fps' && player.action?.kind === 'recovery' ? 'fps' : 'tps';
}

/** KO中は生存する味方をTPSで追う。操作するIDは移さない（0010）。 */
export function cameraPlayerFor(state: SimState, local: PlayerId): PlayerId {
  const self = state.players.find(p => p.id === local)!;
  return self.hp > 0 ? local : state.players.find(p => p.side === self.side && p.hp > 0)?.id ?? local;
}

/** 切替を100msで補間する。fps は 0（TPS）〜1（FPS）。 */
export class CameraBlend {
  mode: CameraMode = 'tps';
  fps = 0;

  update(state: SimState, id: PlayerId, dtMs: number): void {
    this.mode = cameraModeFor(this.mode, state, id);
    const target = this.mode === 'fps' ? 1 : 0;
    const stepAmount = dtMs / BLEND_MS;
    this.fps = target > this.fps ? Math.min(target, this.fps + stepAmount) : Math.max(target, this.fps - stepAmount);
  }
}
