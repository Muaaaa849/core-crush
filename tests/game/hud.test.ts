// HUDのラウンド表示（progress.md U1・U2、0008）。
import { describe, expect, it } from 'vitest';
import { Hud } from '../../src/game/hud';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';

function render(events: Parameters<Hud['update']>[1], edit?: (s: ReturnType<typeof createInitialState>) => void) {
  const el = { textContent: '' } as HTMLElement;
  const state = createInitialState('p1');
  edit?.(state);
  new Hud(el, config, 'p1').update(state, events, 0);
  return el.textContent!;
}

describe('Hud rounds', () => {
  it('shows HP as a whole number, rounding up so a living player never shows 0', () => {
    const text = render([], (s) => { s.players[0].hp = 49.48953125; s.players[1].hp = 0.2; });
    expect(text).toContain('あなた HP 50/100');
    expect(text).toContain('相手 HP 1/100');
  });

  it('U1: shows round number, wins and remaining round time', () => {
    const text = render([], (s) => {
      s.match.round = 2;
      s.match.wins = { p1: 1, p2: 0 };
      s.now = s.match.roundEndsAt - 75 * config.timeUnitsPerSecond;
    });
    expect(text).toContain('ラウンド2　あなた 1 − 0 相手　残り 1:15');
  });

  it('U2: round results with the reason', () => {
    expect(render([{ kind: 'round-end', at: 0, winner: 'p1', reason: 'ko' }])).toContain('ラウンド勝利（KO）');
    expect(render([{ kind: 'round-end', at: 0, winner: 'p2', reason: 'time' }])).toContain('ラウンド敗北（時間切れ）');
    expect(render([{ kind: 'round-end', at: 0, winner: null, reason: 'ko' }])).toContain('引き分け（KO）　同じラウンドをやり直し');
  });

  it('U2: match result and rematch notice', () => {
    expect(render([{ kind: 'match-end', at: 0, winner: 'p1' }])).toContain('試合終了：あなたの勝ち！　5秒後に再戦');
    expect(render([{ kind: 'match-end', at: 0, winner: 'p2' }])).toContain('試合終了：あなたの負け　5秒後に再戦');
  });
});
