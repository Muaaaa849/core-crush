import type { SimConfig } from './config';
import type { PlayerState, SimState, SkillId, SkillRejectReason, SkillSlot, Vec3 } from './types';

export function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && ['overcharge', 'blink', 'phantom', 'boost-ring', 'chain', 'charge', 'trap', 'energy-bolt', 'economy'].includes(value);
}

/** sim・受信検査・表示で同じ実装状態を使う。未実装アクティブは発動しない。 */
export function skillKind(id: SkillId): 'active' | 'passive' | 'unimplemented' {
  if (id === 'charge' || id === 'economy') return 'passive';
  return id === 'overcharge' || id === 'blink' ? 'active' : 'unimplemented';
}

export function validSkills(value: unknown): value is readonly [SkillId, SkillId] {
  return Array.isArray(value) && value.length === 2 && isSkillId(value[0]) && isSkillId(value[1]);
}

/** 表示と実行が同じ水平4mの予定点を使う。範囲外も丸めない。 */
export function blinkDestination(player: Pick<PlayerState, 'position' | 'yaw'>, config: SimConfig): Vec3 {
  return { x: player.position.x - Math.sin(player.yaw) * config.blinkDistance,
    y: player.position.y, z: player.position.z - Math.cos(player.yaw) * config.blinkDistance };
}

/** nullは発動可能。パッシブは呼出側で無処理にする。検査では状態を変更しない。 */
export function skillRejection(state: SimState, player: PlayerState, slot: SkillSlot, config: SimConfig): SkillRejectReason | null {
  const id = player.skills[slot - 1];
  if (skillKind(id) === 'passive') return null;
  if (skillKind(id) === 'unimplemented') return 'unimplemented';
  if (state.match.phase !== 'play' || !state.danger) return 'phase';
  if (player.hp <= 0) return 'ko';
  const action = player.action;
  if (action && !(action.kind === 'feint' && state.now > action.startedAt)
    && !(id === 'blink' && action.kind === 'catch-whiff')) return 'busy';
  if (state.now < player.skillReadyAt[slot - 1]) return 'cooldown';
  if (id === 'overcharge' && player.overcharge) return 'reserved';
  if (player.cost < (id === 'overcharge' ? config.overchargeCost : config.blinkCost)) return 'cost';
  if (id === 'blink') {
    const to = blinkDestination(player, config), depth = player.side === 'a' ? to.z : -to.z;
    if (Math.abs(to.x) > config.playerHalfWidth || depth < config.playerMinDepth || depth > config.playerMaxDepth) return 'destination';
  }
  return null;
}
