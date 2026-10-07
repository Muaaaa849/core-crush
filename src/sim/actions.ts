import type { SimConfig } from './config';
import type { GestureDirection, PlayerState, Vec3 } from './types';

/** 防御のマウス方向（0007）。閉区間［押下−80ms, min(押下+50ms, 接触)］を合計する。接触後・締切後の入力は使わない。 */
export function gestureDirection(samples: PlayerState['mouseSamples'], pressedAt: number, contactAt: number, config: SimConfig): GestureDirection {
  const start = pressedAt - config.gestureLookback;
  const end = Math.min(pressedAt + config.gestureFollowthrough, contactAt);
  const relevant = samples.filter(s => s.at >= start && s.at <= end);
  const x = relevant.reduce((sum, s) => sum + s.rightDegrees, 0);
  const y = relevant.reduce((sum, s) => sum + s.pullDegrees, 0);
  if (Math.max(Math.abs(x), Math.abs(y)) < config.gestureThresholdDegrees) return 'neutral';
  let horizontal = Math.abs(x) >= Math.abs(y);
  if (Math.abs(x) === Math.abs(y)) {
    // 主成分が同値なら、新しいサンプル（時刻、同時刻はseq）から順に主成分が決まるものを採用。
    for (const sample of relevant.sort((a, b) => b.at - a.at || b.seq - a.seq)) {
      if (Math.abs(sample.rightDegrees) === Math.abs(sample.pullDegrees)) continue;
      horizontal = Math.abs(sample.rightDegrees) > Math.abs(sample.pullDegrees);
      break;
    }
  }
  return horizontal ? x < 0 ? 'left' : 'right' : y > 0 ? 'upper' : 'invalid';
}

/** 接触した線分の速度の逆向き（球が来る向き）を受け手のyawで評価する。球種名は使わない。 */
export function incomingDirection(velocity: Vec3, yaw: number, config: SimConfig): { inFront: boolean; required: GestureDirection } {
  const forward = Math.sin(yaw) * velocity.x + Math.cos(yaw) * velocity.z;
  const right = -Math.cos(yaw) * velocity.x + Math.sin(yaw) * velocity.z;
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  const h = Math.atan2(right, forward) * 180 / Math.PI;
  const v = Math.atan2(-velocity.y, horizontalSpeed) * 180 / Math.PI;
  // 境界ちょうど（80度・10度・水平と仰角の同値）で三角関数の丸め誤差に左右されないようにする。
  const inFront = horizontalSpeed > 0 && Math.abs(h) <= config.defenseArcDegrees / 2 + 1e-12;
  const required = Math.max(Math.abs(h), Math.max(v, 0)) + 1e-12 < config.incomingNeutralDegrees
    ? 'neutral' : v > Math.abs(h) + 1e-12 ? 'upper' : h < 0 ? 'left' : 'right';
  return { inFront, required };
}

/** 履歴は80ms分。進行中の跳ね返しに必要な分は受付終了まで残す。 */
export function pruneMouseSamples(player: PlayerState, at: number, config: SimConfig): void {
  const start = player.action?.kind === 'parry' && at < player.action.endsAt
    ? player.action.pressedAt - config.gestureLookback : at - config.gestureLookback;
  player.mouseSamples = player.mouseSamples.filter(sample => sample.at >= start);
}
