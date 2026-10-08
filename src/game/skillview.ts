// M3-3の継続表示は予測を含む描画stateから、短命通知は確定提示列から導く（0014）。
import type { SimConfig } from '../sim/config';
import { blinkDestination, skillKind, skillRejection } from '../sim/skills';
import type { PlayerId, PlayerState, SimEvent, SimState, SkillRejectReason, SkillSlot, Vec3 } from '../sim/types';
import { skillDescription } from './characters';

const REASON: Record<SkillRejectReason, string> = {
  unimplemented: '未実装', phase: '待機・結果中', ko: 'KO', busy: '動作中', cooldown: 'CT中',
  reserved: '予約済み', cost: 'コスト不足', destination: '範囲外', priority: '同時入力の優先行動',
};
export const skillReasonLabel = (reason: SkillRejectReason): string => REASON[reason];
type SkillNotice = { reason: SkillRejectReason; until: number } | null;
export type SkillNotices = readonly [SkillNotice, SkillNotice];

/** 確定提示済みの通知だけを受ける。勝敗などの共通メッセージとは別の2枠。 */
export function updateSkillNotices(previous: SkillNotices, events: readonly SimEvent[], local: PlayerId, now: number): SkillNotices {
  const next: [SkillNotice, SkillNotice] = [...previous];
  for (const e of events) {
    if (e.kind === 'round-start') { next[0] = null; next[1] = null; }
    if (e.kind === 'skill-rejected' && e.player === local) next[e.slot - 1] = { reason: e.reason, until: now + 1000 };
  }
  return next;
}

export function overchargeVisible(player: Pick<PlayerState, 'overcharge'>, now: number): boolean {
  return player.overcharge !== null && now < player.overcharge.expiresAt;
}

export function localReservationRing(state: SimState, local: PlayerId): boolean {
  return state.ball.mode === 'held' && state.ball.owner === local
    && overchargeVisible(state.players.find(p => p.id === local)!, state.now);
}

const secondsLeft = (until: number, now: number, config: SimConfig): string =>
  (Math.ceil(Math.max(0, until - now) * 10 / config.timeUnitsPerSecond) / 10).toFixed(1);

export function skillHudLines(state: SimState, player: PlayerState, config: SimConfig, keys: readonly [string, string],
  notices: SkillNotices = [null, null], displayNow = 0): string[] {
  return player.skills.map((id, index) => {
    let line = skillDescription(id, keys[index]);
    if (skillKind(id) === 'active') {
      const cost = id === 'overcharge' ? config.overchargeCost : config.blinkCost;
      const reason = skillRejection(state, player, (index + 1) as SkillSlot, config);
      line += ` コスト${cost / 4}`;
      if (state.match.phase === 'play' && player.skillReadyAt[index] > state.now)
        line += ` CT ${secondsLeft(player.skillReadyAt[index], state.now, config)}秒`;
      line += reason ? ` 不可：${skillReasonLabel(reason)}` : ' 使用可';
      if (overchargeVisible(player, state.now) && player.overcharge!.slot === index + 1) {
        line += ` 予約：残り${secondsLeft(player.overcharge!.expiresAt, state.now, config)}秒／次の手投げで${config.overchargeCost / 4}消費`;
        if (player.cost < config.overchargeCost) line += ' 次の手投げは強化不可';
      }
    }
    const notice = notices[index];
    if (notice && displayNow < notice.until) line += ` 不成立：${skillReasonLabel(notice.reason)}`;
    return line;
  });
}

/** CT・資源・硬直でも床印は表示する。可否の全文は枠内に表示する。 */
export function blinkPreview(state: SimState, local: PlayerId, yaw: number, active: boolean, config: SimConfig):
  { position: Vec3; outside: boolean } | null {
  const player = state.players.find(p => p.id === local)!;
  if (!active || player.hp <= 0 || state.match.phase !== 'play' || !player.skills.includes('blink')) return null;
  const position = blinkDestination({ position: player.position, yaw }, config);
  const depth = player.side === 'a' ? position.z : -position.z;
  const outside = Math.abs(position.x) > config.playerHalfWidth || depth < config.playerMinDepth || depth > config.playerMaxDepth;
  return { position, outside };
}

/** 通常移動は補間する。ブリンク相当の変位（3m超）とラウンド切替は最新位置へ直行する。 */
export function playerDisplayPosition(previous: SimState, state: SimState, id: PlayerId, alpha: number): Vec3 {
  const a = previous.players.find(p => p.id === id)!.position, b = state.players.find(p => p.id === id)!.position;
  if (previous.match.roundStartsAt !== state.match.roundStartsAt || Math.hypot(b.x - a.x, b.z - a.z) > 3) return { ...b };
  return { x: a.x + (b.x - a.x) * alpha, y: 0, z: a.z + (b.z - a.z) * alpha };
}
