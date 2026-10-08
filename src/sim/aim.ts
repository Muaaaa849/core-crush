import { defaultConfig, type SimConfig } from './config';
import { sweptCapsuleContact } from './contact';
import type { PlayerState, Vec3 } from './types';

type AimPose = Pick<PlayerState, 'id' | 'side' | 'position' | 'yaw' | 'pitch'>;
type AimCandidate = Pick<PlayerState, 'id' | 'side' | 'position' | 'hp'>;

/** 論理的な目の半直線でTを選び、発射位置Mからの射線を返す（0015）。 */
export function aimLine(player: AimPose, candidates: readonly AimCandidate[], config: SimConfig = defaultConfig): {
  origin: Vec3; target: Vec3; direction: Vec3;
} {
  const eye = { ...player.position, y: player.position.y + config.aimEyeHeight };
  const ray = { x: -Math.sin(player.yaw) * Math.cos(player.pitch), y: Math.sin(player.pitch),
    z: -Math.cos(player.yaw) * Math.cos(player.pitch) };
  let distance = config.aimMaxDistance;
  const consider = (d: number) => { if (Number.isFinite(d) && d > 0 && d < distance) distance = d; };
  for (const candidate of candidates) {
    if (candidate.id === player.id || candidate.side === player.side || candidate.hp <= 0) continue;
    consider(sweptCapsuleContact(eye, ray, candidate.position, { x: 0, y: 0, z: 0 },
      config.capsuleRadius, config.capsuleBottom, config.capsuleTop));
  }
  const width = config.ballHalfWidth + config.ballDiameter / 2;
  const depth = config.ballHalfDepth + config.ballDiameter / 2;
  // 照準用の白線位置。球中心の攻撃消失境界とは半径分だけ異なる。
  for (const [axis, plane] of [['y', 0], ['x', -width], ['x', width], ['z', -depth], ['z', depth]] as const) {
    const d = (plane - eye[axis]) / ray[axis];
    if (!Number.isFinite(d) || d <= 0 || d >= distance) continue;
    const point = { x: eye.x + ray.x * d, y: eye.y + ray.y * d, z: eye.z + ray.z * d };
    if ((axis === 'x' || Math.abs(point.x) <= width + 1e-12)
      && (axis === 'z' || Math.abs(point.z) <= depth + 1e-12)
      && (axis === 'y' || point.y >= -1e-12)) consider(d);
  }
  const target = { x: eye.x + ray.x * distance, y: eye.y + ray.y * distance, z: eye.z + ray.z * distance };
  const origin = { ...player.position, y: player.position.y + config.defenseHeight };
  const length = Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z);
  return { origin, target, direction: { x: (target.x - origin.x) / length, y: (target.y - origin.y) / length, z: (target.z - origin.z) / length } };
}
