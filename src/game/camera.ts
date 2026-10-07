// FPS／TPSの切替（R07、feel.md「FPSとTPSを、視線を失わずつなぐ」）。表示だけでsimの判定には使わない。
import type { PlayerId, SimState } from '../sim/types';

export type CameraMode = 'fps' | 'tps';

const BLEND_MS = 100;

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
