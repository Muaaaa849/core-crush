import type { Vec3 } from './types';

function firstRoot(x: number, y: number, z: number, vx: number, vy: number, vz: number, radius: number): number {
  const c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy + vz * vz;
  const b = x * vx + y * vy + z * vz;
  const d = b * b - a * c;
  if (a === 0 || b >= 0 || d < 0) return Infinity;
  // 小さい根の差し引きによる桁落ちを避ける。
  return c / (-b + Math.sqrt(d));
}

/** 一定速度区間の相対運動。返り値は区間開始からの秒数。 */
export function sweptCapsuleContact(position: Vec3, velocity: Vec3, feet: Vec3, receiverVelocity: Vec3,
  radius: number, bottom: number, top: number): number {
  const x = position.x - feet.x, y = position.y - feet.y, z = position.z - feet.z;
  const vx = velocity.x - receiverVelocity.x, vy = velocity.y - receiverVelocity.y, vz = velocity.z - receiverVelocity.z;
  const nearestY = Math.max(bottom, Math.min(top, y));
  if (x * x + (y - nearestY) ** 2 + z * z <= radius * radius) return 0;
  let time = Math.min(firstRoot(x, y - bottom, z, vx, vy, vz, radius), firstRoot(x, y - top, z, vx, vy, vz, radius));
  const cylinder = firstRoot(x, 0, z, vx, 0, vz, radius);
  const height = y + vy * cylinder;
  if (height >= bottom && height <= top) time = Math.min(time, cylinder);
  return time;
}

export function ballContactPoint(position: Vec3, feet: Vec3, ballRadius: number, bottom: number, top: number): Vec3 {
  const y = Math.max(feet.y + bottom, Math.min(feet.y + top, position.y));
  const dx = position.x - feet.x, dy = position.y - y, dz = position.z - feet.z;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return { ...position };
  return { x: position.x - ballRadius * dx / length, y: position.y - ballRadius * dy / length, z: position.z - ballRadius * dz / length };
}
