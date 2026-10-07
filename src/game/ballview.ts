// 落球の見た目（決定0009「画面と将来のアニメーション」）。表示だけで、simの判定には使わない。
import type { Vec3 } from '../sim/types';

const GROUND_EPSILON = 1e-6; // m

/** 接地したまま水平に動いた分だけ転がす回転（軸は 上 × 移動方向、角度は d / r）。空中・静止なら null。 */
export function rollRotation(from: Vec3, to: Vec3, radius: number): { axis: Vec3; angle: number } | null {
  if (from.y > radius + GROUND_EPSILON || to.y > radius + GROUND_EPSILON) return null;
  const dx = to.x - from.x, dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return null;
  return { axis: { x: dz / distance, y: 0, z: -dx / distance }, angle: distance / radius };
}
