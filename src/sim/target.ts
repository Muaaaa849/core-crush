// ロックは論理yawだけから選ぶ。カメラの肩位置やpitchは判定へ入れない（0010）。
import type { PlayerId, PlayerState } from './types';
import type { SimConfig } from './config';

export function inThrowArc(player: PlayerState, target: PlayerState, config: SimConfig): boolean {
  return targetAngle(player, target) <= config.throwArcDegrees / 2 * Math.PI / 180 + 1e-12;
}

export function cycleTarget(player: PlayerState, players: readonly PlayerState[]): PlayerId | null {
  const enemies = players.filter(p => p.side !== player.side && p.hp > 0).sort((a, b) => a.id.localeCompare(b.id));
  const index = enemies.findIndex(p => p.id === player.lockTarget);
  return index < 0 ? initialTarget(player, players) : enemies[(index + 1) % enemies.length].id;
}

export function targetAngle(player: PlayerState, target: PlayerState): number {
  const dx = target.position.x - player.position.x, dz = target.position.z - player.position.z;
  if (dx === 0 && dz === 0) return 0;
  const forward = -Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz;
  const right = Math.cos(player.yaw) * dx - Math.sin(player.yaw) * dz;
  return Math.abs(Math.atan2(right, forward));
}

export function initialTarget(player: PlayerState, players: readonly PlayerState[]): PlayerId | null {
  const distance = (p: PlayerState) => (p.position.x - player.position.x) ** 2 + (p.position.z - player.position.z) ** 2;
  return players.filter(p => p.side !== player.side && p.hp > 0)
    .sort((a, b) => targetAngle(player, a) - targetAngle(player, b) || distance(a) - distance(b) || a.id.localeCompare(b.id))[0]?.id ?? null;
}
