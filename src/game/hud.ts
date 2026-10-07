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
const GESTURE_LABEL = { neutral: '振らない', left: '左へ振る', right: '右へ振る', upper: '手前へ引く', invalid: '奥へ押す' };

export class Hud {
  private message = '';
  private messageUntil = 0;

  constructor(private readonly el: HTMLElement, private readonly config: SimConfig, private readonly local: PlayerId) {}

  update(state: SimState, events: readonly SimEvent[], now: number): void {
    for (const e of events) {
      if (e.kind === 'explosion') this.flash(`爆発！ ${SIDE_LABEL[e.side]}に${this.config.explosionDamage}ダメージ`, now);
      if (e.kind === 'catch' || e.kind === 'parry') {
        const who = e.player === this.local ? 'あなた' : '相手';
        this.flash(`${who}：${e.kind === 'catch' ? 'キャッチ' : '跳ね返し'} ${GRADE_LABEL[e.grade]}`, now);
      }
      if (e.kind === 'whiff' && e.player === this.local) this.flash('空振り', now);
      if (e.kind === 'hit') {
        const miss = e.required && e.actual ? `　方向ミス（必要：${GESTURE_LABEL[e.required]}／入力：${GESTURE_LABEL[e.actual]}）` : '';
        this.flash(`${e.player === this.local ? '被弾' : '命中'}！ ${Math.round(e.damage)}ダメージ${miss}`, now);
      }
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
    const players = state.players
      .map((p) => {
        const name = p.id === this.local ? 'あなた' : '相手';
        return `${name} HP ${p.hp}/${p.maxHp}　コスト ${(p.cost / 4).toFixed(2)}　ステップ ${p.stepPoints}`;
      })
      .join('\n');
    const message = now < this.messageUntil ? `\n${this.message}` : '';
    this.el.textContent = `${clock}\n${players}${message}`;
  }

  private flash(text: string, now: number): void {
    this.message = text;
    this.messageUntil = now + 1500;
  }
}
