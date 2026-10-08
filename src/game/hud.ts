// 最小のHUD（feel.md「入力設定とHUD」）。危険時計は残り秒、表情は経過秒で決める。キャッチ・跳ね返しの評価は判定文字（vfx.ts）で出す。
import type { SimConfig } from '../sim/config';
import { targetAngle } from '../sim/target';
import type { PlayerId, Side, SimEvent, SimState } from '../sim/types';
import { playerLabel, type Roster } from './characters';
import { skillHudLines, updateSkillNotices, type SkillNotices } from './skillview';

const REASON_LABEL = { ko: 'KO', time: '時間切れ' };
export const REMATCH_SECONDS = 5;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
/** DOMや表示時刻に依存せず、確定stateを表示値にする。 */
export function hudModel(state: SimState, config: SimConfig, localId: PlayerId, roster: Roster) {
  const local = state.players.find(p => p.id === localId)!;
  const name = (id: PlayerId) => playerLabel(roster, localId, id);
  const hp = (value: number) => String(Math.ceil(value * 10) / 10);
  const player = (p: SimState['players'][number]) => `${name(p.id)} HP ${hp(p.hp)}/${hp(p.maxHp)}${p.hp <= 0 ? ' KO' : ''}`;
  const second = config.timeUnitsPerSecond;
  const left = Math.ceil(Math.max(0, state.match.roundEndsAt - Math.max(state.now, state.match.roundStartsAt)) / second);
  const remaining = state.danger ? Math.max(0, (state.danger.expiresAt - state.now) / second) : null;
  const elapsed = remaining === null ? 0 : config.dangerDuration / second - remaining;
  const face = elapsed < 3 ? 'calm' : elapsed < 5 ? 'panic' : 'rage';
  const faceLabel = { calm: 'スマイル', panic: '焦り', rage: '激怒' }[face];
  const dangerSeconds = remaining === null ? '—' : remaining < 1 ? (Math.floor(remaining * 10) / 10).toFixed(1) : String(Math.ceil(remaining));
  const target = state.players.find(p => p.id === local.lockTarget);
  const flight = state.ball.mode === 'flight' ? state.ball.attack?.target : null;
  return {
    round: `ラウンド${state.match.round}　A ${state.match.wins.a} − ${state.match.wins.b} B　残り ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    wins: state.match.wins,
    clock: state.danger ? `危険時計：${state.danger.side === local.side ? '味方陣' : '敵陣'} 残り${dangerSeconds}秒（${face}／${faceLabel}）` : '危険時計：待機中',
    dangerSeconds, face, hp: player(local), hpRatio: clamp(local.hp / local.maxHp),
    others: state.players.filter(p => p.id !== localId).map(player),
    cost: `コスト ${(local.cost / 4).toFixed(2)} / 5`,
    costCells: Array.from({ length: 5 }, (_, i) => clamp(local.cost / 4 - i)),
    step: `ステップ ${local.stepPoints} / 2`, stepCells: [0, 1].map(i => Number(local.stepPoints > i)),
    recovery: clamp(local.stepRecoveryProgress / ((config.stepRecoveryBaseSeconds - local.stats.agility) * second)),
    spectating: local.hp <= 0 ? `KO：${state.players.some(p => p.side === local.side && p.hp > 0) ? '味方を観戦中' : '結果待ち'}` : '',
    lock: `ロック：${target ? name(target.id) : 'なし'}${target && targetAngle(local, target) > config.throwArcDegrees / 2 * Math.PI / 180 + 1e-12 ? '（対象が正面外）' : ''}`,
    flight: state.ball.mode === 'flight' ? `飛行対象：${flight ? name(flight) : 'なし'}` : '',
  };
}

export class Hud {
  /** 固有枠の割当キーの表示名（設定から）。 */
  skillKeys: readonly [string, string] = ['E', 'R'];
  /** 表示フレームの最新論理yaw。不可理由も次の押下と同じ向きで検査する。 */
  skillYaw: number | undefined;
  private skillNotices: SkillNotices = [null, null];
  private message = '';
  private messageUntil = 0;
  private result = '';
  private resultUntil = 0;
  private resultKind: 'round' | 'match' = 'round';
  private roundDraw = false;
  private readonly parts: Record<string, HTMLElement>;

  constructor(el: HTMLElement, private readonly config: SimConfig, private readonly local: PlayerId,
    private readonly roster: Roster, private readonly online = false) {
    el.innerHTML = `<section class="hud-score panel"><span data-hud="round"></span><div class="score-teams"><span class="team-badge team-a">A</span><b data-hud="wins-a"></b><span>−</span><b data-hud="wins-b"></b><span class="team-badge team-b">B</span></div></section>
      <section class="hud-danger panel" data-hud="danger"><strong data-hud="danger-seconds"></strong><span data-hud="clock"></span></section>
      <aside class="hud-others panel" data-hud="others"></aside>
      <div class="hud-lock"><span data-hud="lock"></span><small data-hud="flight"></small></div>
      <div class="hud-bottom"><section class="panel hud-hp"><b data-hud="hp"></b><div class="meter"><i data-hud="hp-bar"></i></div><small data-hud="spectating"></small></section>
      <section class="panel"><b data-hud="cost"></b><div class="resource-cells">${Array.from({ length: 5 }, (_, i) => `<span><i data-hud="cost-${i}"></i></span>`).join('')}</div></section>
      <section class="panel"><b data-hud="step"></b><div class="resource-cells">${[0, 1].map(i => `<span><i data-hud="step-${i}"></i></span>`).join('')}</div><div class="meter recovery"><i data-hud="recovery"></i></div></section>
      <section class="panel hud-skill" data-hud="skill-0"></section><section class="panel hud-skill" data-hud="skill-1"></section></div>
      <p class="hud-notice" data-hud="message"></p><section class="hud-result panel" data-hud="result" role="status" hidden><small data-hud="result-kind"></small><h2 data-hud="result-text"></h2><p data-hud="result-countdown"></p></section>`;
    this.parts = Object.fromEntries(Array.from(el.querySelectorAll<HTMLElement>('[data-hud]')).map(node => [node.dataset.hud!, node]));
  }

  update(state: SimState, events: readonly SimEvent[], now: number): void {
    this.skillNotices = updateSkillNotices(this.skillNotices, events, this.local, now);
    const local = state.players.find(p => p.id === this.local)!;
    const sideName = (side: Side) => side === local.side ? '味方陣' : '敵陣';
    const name = (id: PlayerId) => playerLabel(this.roster, this.local, id);
    for (const e of events) {
      if (e.kind === 'round-end') {
        this.roundDraw = e.winner === null;
        const result = e.winner === null ? '引き分け' : e.winner === local.side ? 'ラウンド勝利' : 'ラウンド敗北';
        this.showResult(`${result}（${REASON_LABEL[e.reason]}）${e.winner === null ? '　同じラウンドをやり直し' : ''}`, now, 3000, 'round');
      }
      if (e.kind === 'match-end') {
        this.showResult(`試合終了：${e.winner === local.side ? 'あなたの勝ち！' : 'あなたの負け'}${this.online ? '　結果を確認して部屋へ戻ってください' : ''}`, now, this.online ? Infinity : REMATCH_SECONDS * 1000, 'match');
      }
      if (e.kind === 'explosion') this.flash(`爆発！ ${sideName(e.side)}に${this.config.explosionDamage}ダメージ`, now);
      if (e.kind === 'whiff' && e.player === this.local) this.flash('空振り', now);
      if (e.kind === 'hit') this.flash(`${e.player === this.local ? '被弾' : name(e.player) + 'に命中'}！ ${Math.round(e.damage)}ダメージ`, now);
    }
    const model = hudModel(state, this.config, this.local, this.roster);
    const text = (key: string, value: string) => { this.parts[key].textContent = value; };
    const fill = (key: string, value: number) => { this.parts[key].style.width = `${value * 100}%`; };
    for (const key of ['round', 'clock', 'hp', 'cost', 'step', 'spectating', 'lock', 'flight'] as const) text(key, model[key]);
    text('wins-a', String(model.wins.a)); text('wins-b', String(model.wins.b));
    text('danger-seconds', model.dangerSeconds === '—' ? '—' : `${model.dangerSeconds} 秒`);
    this.parts.danger.dataset.face = model.face;
    text('others', model.others.join('\n'));
    fill('hp-bar', model.hpRatio); fill('recovery', model.recovery);
    model.costCells.forEach((value, i) => fill(`cost-${i}`, value));
    model.stepCells.forEach((value, i) => fill(`step-${i}`, value));
    skillHudLines(state, { ...local, yaw: this.skillYaw ?? local.yaw }, this.config, this.skillKeys, this.skillNotices, now)
      .forEach((value, i) => text(`skill-${i}`, value));
    text('message', now < this.messageUntil ? this.message : '');
    this.parts.result.hidden = now >= this.resultUntil;
    text('result-kind', this.resultKind === 'match' ? 'MATCH COMPLETE' : 'ROUND COMPLETE');
    text('result-text', this.result);
    text('result-countdown', this.online && this.resultKind === 'match' ? ''
      : `${Math.ceil(Math.max(0, this.resultUntil - now) / 1000)}秒${this.resultKind === 'match' ? '後に再戦' : this.roundDraw ? '後に再試合' : '後に次のラウンド'}`);
  }

  private showResult(text: string, now: number, duration: number, kind: 'round' | 'match'): void {
    this.result = text; this.resultUntil = now + duration; this.resultKind = kind;
  }

  private flash(text: string, now: number, durationMs = 1500): void {
    this.message = text;
    this.messageUntil = now + durationMs;
  }

  clearSkillNotices(): void { this.skillNotices = [null, null]; }
}
