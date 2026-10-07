// 最小のHUD（feel.md「入力設定とHUD」）。危険時計は残り秒、表情は経過秒で決める。
import type { SimConfig } from '../sim/config';
import type { PlayerId, SimEvent, SimState } from '../sim/types';

const FACE = [
  { until: 3, label: 'スマイル' },
  { until: 5, label: '焦り' },
  { until: 8, label: '激怒' },
];
const SIDE_LABEL = { p1: 'P1側', p2: 'P2側' };
const GRADE_LABEL = { just: 'JUST', good: 'GOOD', 'so-so': 'SO-SO' };
const REASON_LABEL = { ko: 'KO', time: '時間切れ' };
export const REMATCH_SECONDS = 5;

export class Hud {
  private message = '';
  private messageUntil = 0;

  constructor(private readonly el: HTMLElement, private readonly config: SimConfig, private readonly local: PlayerId) {}

  update(state: SimState, events: readonly SimEvent[], now: number): void {
    for (const e of events) {
      if (e.kind === 'round-end') {
        const result = e.winner === null ? '引き分け' : e.winner === this.local ? 'ラウンド勝利' : 'ラウンド敗北';
        this.flash(`${result}（${REASON_LABEL[e.reason]}）${e.winner === null ? '　同じラウンドをやり直し' : ''}`, now, 3000);
      }
      if (e.kind === 'match-end') {
        this.flash(`試合終了：${e.winner === this.local ? 'あなたの勝ち！' : 'あなたの負け'}　${REMATCH_SECONDS}秒後に再戦`, now, REMATCH_SECONDS * 1000);
      }
      if (e.kind === 'explosion') this.flash(`爆発！ ${SIDE_LABEL[e.side]}に${this.config.explosionDamage}ダメージ`, now);
      if (e.kind === 'catch' || e.kind === 'parry') {
        const who = e.player === this.local ? 'あなた' : '相手';
        this.flash(`${who}：${e.kind === 'catch' ? 'キャッチ' : '跳ね返し'} ${GRADE_LABEL[e.grade]}`, now);
      }
      if (e.kind === 'whiff' && e.player === this.local) this.flash('空振り', now);
      if (e.kind === 'hit') this.flash(`${e.player === this.local ? '被弾' : '命中'}！ ${Math.round(e.damage)}ダメージ`, now);
    }
    const second = this.config.timeUnitsPerSecond;
    let clock = '危険時計：待機中';
    if (state.danger) {
      const remaining = (state.danger.expiresAt - state.now) / second;
      const elapsed = this.config.dangerDuration / second - remaining;
      const face = FACE.find((f) => elapsed < f.until)?.label ?? '激怒';
      // 最終1秒だけ小数1桁。切り捨てて「0.0なのに生存」を長く見せない。
      const shown = remaining < 1 ? (Math.floor(remaining * 10) / 10).toFixed(1) : String(Math.ceil(remaining));
      clock = `危険時計：${SIDE_LABEL[state.danger.side]} 残り${shown}秒（${face}）`;
    }
    const { match } = state;
    const opponent = this.local === 'p1' ? 'p2' : 'p1';
    const left = Math.ceil(Math.max(0, match.roundEndsAt - Math.max(state.now, match.roundStartsAt)) / second);
    const round = `ラウンド${match.round}　あなた ${match.wins[this.local]} − ${match.wins[opponent]} 相手　残り ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const players = state.players
      .map((p) => {
        const name = p.id === this.local ? 'あなた' : '相手';
        return `${name} HP ${p.hp}/${p.maxHp}　コスト ${(p.cost / 4).toFixed(2)}　ステップ ${p.stepPoints}`;
      })
      .join('\n');
    const message = now < this.messageUntil ? `\n${this.message}` : '';
    this.el.textContent = `${round}\n${clock}\n${players}${message}`;
  }

  private flash(text: string, now: number, durationMs = 1500): void {
    this.message = text;
    this.messageUntil = now + durationMs;
  }
}
