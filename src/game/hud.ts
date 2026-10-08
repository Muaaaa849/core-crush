// 最小のHUD（feel.md「入力設定とHUD」）。危険時計は残り秒、表情は経過秒で決める。キャッチ・跳ね返しの評価は判定文字（vfx.ts）で出す。
import type { SimConfig } from '../sim/config';
import { targetAngle } from '../sim/target';
import type { PlayerId, Side, SimEvent, SimState } from '../sim/types';
import { playerLabel, skillLines, type Roster } from './characters';

const FACE = [
  { until: 3, label: 'スマイル' },
  { until: 5, label: '焦り' },
  { until: 8, label: '激怒' },
];
const REASON_LABEL = { ko: 'KO', time: '時間切れ' };
export const REMATCH_SECONDS = 5;

export class Hud {
  /** 固有枠の割当キーの表示名（設定から）。 */
  skillKeys: readonly [string, string] = ['E', 'R'];
  private message = '';
  private messageUntil = 0;

  constructor(private readonly el: HTMLElement, private readonly config: SimConfig, private readonly local: PlayerId,
    private readonly roster: Roster, private readonly online = false) {}

  update(state: SimState, events: readonly SimEvent[], now: number): void {
    const local = state.players.find(p => p.id === this.local)!;
    const sideName = (side: Side) => side === local.side ? '味方陣' : '敵陣';
    const name = (id: PlayerId) => playerLabel(this.roster, this.local, id);
    for (const e of events) {
      if (e.kind === 'round-end') {
        const result = e.winner === null ? '引き分け' : e.winner === local.side ? 'ラウンド勝利' : 'ラウンド敗北';
        this.flash(`${result}（${REASON_LABEL[e.reason]}）${e.winner === null ? '　同じラウンドをやり直し' : ''}`, now, 3000);
      }
      if (e.kind === 'match-end') {
        this.flash(`試合終了：${e.winner === local.side ? 'あなたの勝ち！' : 'あなたの負け'}　${this.online ? '結果を確認して部屋へ戻ってください' : `${REMATCH_SECONDS}秒後に再戦`}`, now, this.online ? Infinity : REMATCH_SECONDS * 1000);
      }
      if (e.kind === 'explosion') this.flash(`爆発！ ${sideName(e.side)}に${this.config.explosionDamage}ダメージ`, now);
      if (e.kind === 'whiff' && e.player === this.local) this.flash('空振り', now);
      if (e.kind === 'hit') this.flash(`${e.player === this.local ? '被弾' : name(e.player) + 'に命中'}！ ${Math.round(e.damage)}ダメージ`, now);
    }
    const second = this.config.timeUnitsPerSecond;
    let clock = '危険時計：待機中';
    if (state.danger) {
      const remaining = (state.danger.expiresAt - state.now) / second;
      const elapsed = this.config.dangerDuration / second - remaining;
      const face = FACE.find((f) => elapsed < f.until)?.label ?? '激怒';
      // 最終1秒だけ小数1桁。切り捨てて「0.0なのに生存」を長く見せない。
      const shown = remaining < 1 ? (Math.floor(remaining * 10) / 10).toFixed(1) : String(Math.ceil(remaining));
      clock = `危険時計：${sideName(state.danger.side)} 残り${shown}秒（${face}）`;
    }
    const { match } = state;
    const opponent = local.side === 'a' ? 'b' : 'a';
    const left = Math.ceil(Math.max(0, match.roundEndsAt - Math.max(state.now, match.roundStartsAt)) / second);
    const round = `ラウンド${match.round}　味方 ${match.wins[local.side]} − ${match.wins[opponent]} 敵　残り ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const players = state.players
      .map((p) => {
        const hp = (value: number) => String(Math.ceil(value * 10) / 10);
        return `${name(p.id)} HP ${hp(p.hp)}/${hp(p.maxHp)}${p.hp <= 0 ? ' KO' : ''}${p.id === this.local ? `　コスト ${(p.cost / 4).toFixed(2)}　ステップ ${p.stepPoints}` : ''}`;
      })
      .join('\n');
    const spectating = local.hp <= 0 ? `\nKO：${state.players.some(p => p.side === local.side && p.hp > 0) ? '味方を観戦中' : '結果待ち'}` : '';
    const target = state.players.find(p => p.id === local.lockTarget);
    const lock = `\nロック：${target ? name(target.id) : 'なし'}${target && targetAngle(local, target) > this.config.throwArcDegrees / 2 * Math.PI / 180 + 1e-12 ? '（対象が正面外）' : ''}`;
    const flightTarget = state.ball.mode === 'flight' ? state.ball.attack?.target : null;
    const flight = state.ball.mode === 'flight' ? `\n飛行対象：${flightTarget ? name(flightTarget) : 'なし'}` : '';
    const skills = `\n${skillLines(this.roster.find(e => e.id === this.local)!.characterId, this.skillKeys).join('　')}`;
    const message = now < this.messageUntil ? `\n${this.message}` : '';
    this.el.textContent = `${round}\n${clock}\n${players}${spectating}${lock}${flight}${skills}${message}`;
  }

  private flash(text: string, now: number, durationMs = 1500): void {
    this.message = text;
    this.messageUntil = now + durationMs;
  }
}
