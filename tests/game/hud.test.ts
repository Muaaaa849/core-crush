import { duelParticipants } from '../fixtures';
// HUDのラウンド表示（progress.md U1・U2、0008）。
import { describe, expect, it } from 'vitest';
import { Hud } from '../../src/game/hud';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';

function render(events: Parameters<Hud['update']>[1], edit?: (s: ReturnType<typeof createInitialState>) => void) {
  const el = { textContent: '' } as HTMLElement;
  const state = createInitialState({ participants: duelParticipants, firstBall: 'a' });
  edit?.(state);
  new Hud(el, config, 'p1').update(state, events, 0);
  return el.textContent!;
}

describe('Hud rounds', () => {
  it('T10-11: shows at most one decimal, rounding up so a living player never shows 0', () => {
    const text = render([], (s) => { s.players[0].hp = 49.48953125; s.players[1].hp = 0.2; });
    expect(text).toContain('あなた HP 49.5/100');
    expect(text).toContain('敵 P2 HP 0.2/100');
  });

  it('names sides from the local player: own side is 味方陣, the other 敵陣', () => {
    const own = render([], (s) => { s.danger = { side: 'a', expiresAt: s.now + config.dangerDuration }; });
    expect(own).toContain('危険時計：味方陣 残り8秒');
    const other = render([{ kind: 'explosion', at: 0, side: 'b' }]);
    expect(other).toContain('爆発！ 敵陣に30ダメージ');
  });

  it('U1: shows round number, wins and remaining round time', () => {
    const text = render([], (s) => {
      s.match.round = 2;
      s.match.wins = { a: 1, b: 0 };
      s.now = s.match.roundEndsAt - 75 * config.timeUnitsPerSecond;
    });
    expect(text).toContain('ラウンド2　味方 1 − 0 敵　残り 1:15');
  });

  it('U2: round results with the reason', () => {
    expect(render([{ kind: 'round-end', at: 0, winner: 'a', reason: 'ko' }])).toContain('ラウンド勝利（KO）');
    expect(render([{ kind: 'round-end', at: 0, winner: 'b', reason: 'time' }])).toContain('ラウンド敗北（時間切れ）');
    expect(render([{ kind: 'round-end', at: 0, winner: null, reason: 'ko' }])).toContain('引き分け（KO）　同じラウンドをやり直し');
  });

  it('U2: match result and rematch notice', () => {
    expect(render([{ kind: 'match-end', at: 0, winner: 'a' }])).toContain('試合終了：あなたの勝ち！　5秒後に再戦');
    expect(render([{ kind: 'match-end', at: 0, winner: 'b' }])).toContain('試合終了：あなたの負け　5秒後に再戦');
  });
});
