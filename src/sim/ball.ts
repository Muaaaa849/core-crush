import type { SimConfig } from './config';
import type { BallState, Side, Vec3 } from './types';

export function opposite(side: Side): Side {
  return side === 'p1' ? 'p2' : 'p1';
}

export function flightPosition(ball: Extract<BallState, { mode: 'flight' }>, at: number, config: SimConfig): Vec3 {
  const seconds = (at - ball.releasedAt) / config.timeUnitsPerSecond;
  return {
    x: ball.origin.x + ball.velocity.x * seconds,
    y: ball.origin.y + ball.velocity.y * seconds,
    z: ball.origin.z + ball.velocity.z * seconds,
  };
}

export function centerCrossingAt(ball: BallState, config: SimConfig): number {
  if (ball.mode !== 'flight') return Infinity;
  const towardCenter = ball.side === 'p1' ? ball.velocity.z < 0 : ball.velocity.z > 0;
  if (!towardCenter) return Infinity;
  // 一定速度の線分を補間する。発射位置を基準にして累積誤差を避ける。
  // 同時刻の判定を浮動小数点の等号に頼らないため、中心が平面に達した最初の整数時刻へ一度だけ丸める（0004）。
  return Math.ceil(ball.releasedAt - ball.origin.z / ball.velocity.z * config.timeUnitsPerSecond);
}
