// 画面と同じ組み合わせ（実行器＋ボット＋P1の入力）で、往復と球の範囲を確かめる。
import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import { SimRunner } from '../../src/game/runner';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import type { SimEvent } from '../../src/sim/types';

describe('practice match', () => {
  it('P1 throws on pickup, both sides get hit, and a stopped ball stays inside the white lines', () => {
    const runner = new SimRunner(createInitialState('p1'), config, [new Bot('p2')]);
    const events: SimEvent[] = [];
    let requested = false;
    for (let frame = 0; frame < 60 * 30; frame++) {
      const { ball } = runner.state;
      const holding = ball.mode === 'held' && ball.owner === 'p1';
      if (holding && !requested) runner.input({ kind: 'primary', player: 'p1' });
      requested = holding;
      runner.advance(1000 / 60);
      events.push(...runner.drainEvents());
      const after = runner.state.ball;
      if (after.mode === 'loose') {
        expect(Math.abs(after.position.x)).toBeLessThanOrEqual(config.ballHalfWidth);
        expect(Math.abs(after.position.z)).toBeLessThanOrEqual(config.ballHalfDepth);
      }
    }
    const hits = events.filter((e) => e.kind === 'hit');
    expect(hits.length).toBeGreaterThan(1);
    expect(runner.state.players.every((p) => p.hp < p.maxHp)).toBe(true);
  });
});
