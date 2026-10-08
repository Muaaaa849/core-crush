import { hudElement } from './hud-element';
import { duelParticipants, rosterOf } from '../fixtures';
// HUDのラウンド表示（progress.md U1・U2、0008）。
import { describe, expect, it } from 'vitest';
import { Hud } from '../../src/game/hud';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';

function render(events: Parameters<Hud['update']>[1], edit?: (s: ReturnType<typeof createInitialState>) => void) {
  const el = hudElement();
  const state = createInitialState({ participants: duelParticipants, firstBall: 'a' });
  edit?.(state);
  new Hud(el, config, 'p1', rosterOf(state)).update(state, events, 0);
  return el.textContent!;
}

describe('Hud rounds', () => {
  it('T10-29 shows online confirmation instead of a five second rematch', () => {
    const el = hudElement();
    const state = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    new Hud(el, config, 'p1', rosterOf(state), true).update(state, [{ kind: 'match-end', at: 0, winner: 'a' }], 0);
    expect(el.textContent).toContain('結果を確認');
    expect(el.textContent).not.toContain('秒後に再戦');
  });
  it('T10-11: shows at most one decimal, rounding up so a living player never shows 0', () => {
    const text = render([], (s) => { s.players[0].hp = 49.48953125; s.players[1].hp = 0.2; });
    expect(text).toContain('あなた P1 VOLT HP 49.5/100');
    expect(text).toContain('敵 P2 VOLT HP 0.2/100');
  });

  it('names sides from the local player: own side is 味方陣, the other 敵陣', () => {
    const own = render([], (s) => { s.danger = { side: 'a', expiresAt: s.now + config.dangerDuration }; });
    expect(own).toContain('危険時計：味方陣 残り8秒');
    const other = render([{ kind: 'explosion', at: 0, side: 'b', position: { x: 0, y: 1, z: -8 } }]);
    expect(other).toContain('爆発！ 敵陣に30ダメージ');
  });

  it('U1: shows round number, wins and remaining round time', () => {
    const text = render([], (s) => {
      s.match.round = 2;
      s.match.wins = { a: 1, b: 0 };
      s.now = s.match.roundEndsAt - 75 * config.timeUnitsPerSecond;
    });
    expect(text).toContain('ラウンド2　A 1 − 0 B　残り 1:15');
  });

  it('U2: round results with the reason', () => {
    expect(render([{ kind: 'round-end', at: 0, winner: 'a', reason: 'ko' }])).toContain('ラウンド勝利（KO）');
    expect(render([{ kind: 'round-end', at: 0, winner: 'b', reason: 'time' }])).toContain('ラウンド敗北（時間切れ）');
    expect(render([{ kind: 'round-end', at: 0, winner: null, reason: 'ko' }])).toContain('引き分け（KO）　同じラウンドをやり直し');
  });

  it('U2: match result and rematch notice', () => {
    expect(render([{ kind: 'match-end', at: 0, winner: 'a' }])).toContain('試合終了：あなたの勝ち！');
    expect(render([{ kind: 'match-end', at: 0, winner: 'a' }])).toContain('5秒後に再戦');
    expect(render([{ kind: 'match-end', at: 0, winner: 'b' }])).toContain('試合終了：あなたの負け');
  });

  it('counts down results without a hit hiding them, then hides the panel at the deadline', () => {
    const el = hudElement(), state = createInitialState({ participants: duelParticipants, firstBall: 'a' });
    const hud = new Hud(el, config, 'p1', rosterOf(state));
    hud.update(state, [{ kind: 'match-end', at: 0, winner: 'a' }], 100);
    hud.update(state, [{ kind: 'hit', at: 0, player: 'p1', damage: 10, ko: false, position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } }], 2100);
    expect(el.querySelector('[data-hud="result-countdown"]')!.textContent).toBe('3秒後に再戦');
    expect(el.querySelector('[data-hud="result-text"]')!.textContent).toBe('試合終了：あなたの勝ち！');
    expect(el.querySelector<HTMLElement>('[data-hud="result"]')!.hidden).toBe(false);
    hud.update(state, [], 5100);
    expect(el.querySelector<HTMLElement>('[data-hud="result"]')!.hidden).toBe(true);
  });
});
