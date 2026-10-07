// G1：描画フレームと固定60Hzのsimをつなぐ実行器。
import { describe, expect, it } from 'vitest';
import { SimRunner } from '../../src/game/runner';
import { createInitialState } from '../../src/sim/sim';

const runFor = (runner: SimRunner, fps: number, seconds: number) => {
  for (let i = 0; i < Math.round(fps * seconds); i++) runner.advance(1000 / fps);
};

describe('SimRunner', () => {
  it.each([30, 60, 144])('advances exactly 60 ticks per second at %i fps', (fps) => {
    const runner = new SimRunner(createInitialState('p1'));
    runFor(runner, fps, 1);
    expect(runner.state.now).toBe(60 * 1000);
  });

  it('stamps an input with the current sim time inside the next tick', () => {
    const runner = new SimRunner(createInitialState('p1'));
    runner.advance(10); // tickの途中（約0.6tick分を保持）
    runner.input({ kind: 'yaw', player: 'p1', yaw: 1 });
    const [command] = runner.pending;
    expect(command.at).toBe(600);
    runner.advance(10);
    expect(runner.pending).toEqual([]);
    expect(runner.state.players[0].yaw).toBe(1); // 向きなどの入力状態は操作開始前でも記録される
  });

  it('delivers inputs in order with increasing seq', () => {
    const runner = new SimRunner(createInitialState('p1'));
    runner.input({ kind: 'yaw', player: 'p1', yaw: 1 });
    runner.input({ kind: 'yaw', player: 'p1', yaw: 2 });
    expect(runner.pending.map((c) => c.seq)).toEqual([0, 1]);
  });

  it('treats a long frame gap as a pause and only advances 250 ms', () => {
    const runner = new SimRunner(createInitialState('p1'));
    runner.advance(5000);
    expect(runner.state.now).toBe(15 * 1000);
  });

  it('collects events and exposes interpolation alpha', () => {
    const runner = new SimRunner(createInitialState('p1'));
    runFor(runner, 60, 1.05); // 1秒後に危険時計が始まる
    expect(runner.drainEvents().map((e) => e.kind)).toContain('clock-start');
    expect(runner.drainEvents()).toEqual([]);
    runner.advance(8);
    expect(runner.alpha).toBeGreaterThan(0);
    expect(runner.alpha).toBeLessThan(1);
  });
});

describe('SimRunner with a controller', () => {
  it('asks controllers once per tick', () => {
    let calls = 0;
    const runner = new SimRunner(createInitialState('p1'), undefined, [{ think: () => (calls++, []) }]);
    for (let i = 0; i < 30; i++) runner.advance(1000 / 30);
    expect(calls).toBe(60);
  });
});
