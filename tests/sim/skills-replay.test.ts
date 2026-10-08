import { expect, it } from 'vitest';
import { SimRunner } from '../../src/game/runner';
import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';
import { incoming, run } from './cover-helpers';
import { ready, skill } from './skills-helpers';

it.each(['reservation', 'windup', 'boosted flight', 'CT boundary', 'expiry boundary', 'blink contact'] as const)(
  'K14-25: JSON restore during %s replays the same full state/events', phase => {
    let s = ready();
    if (phase === 'blink contact') { s = incoming(500); s.players[0].cost = 20; s.players[0].yaw = -Math.PI / 2; }
    else {
      s.players[0].overcharge = { slot: 1, expiresAt: s.now + 1000 };
      if (phase === 'windup' || phase === 'boosted flight') s.players[0].action = { kind: 'windup', endsAt: s.now + 100 };
      if (phase === 'boosted flight') s = run(s, s.now + 101).state;
      if (phase === 'CT boundary') { s.players[0].overcharge = null; s.players[0].skillReadyAt[0] = s.now + 100; }
      if (phase === 'expiry boundary') s.players[0].overcharge!.expiresAt = s.now;
    }
    const commands = [skill(s, phase === 'blink contact' ? 2 : 1)];
    const restored = JSON.parse(JSON.stringify(s)) as SimState;
    expect(run(restored, s.now + 5000, commands)).toEqual(run(s, s.now + 5000, commands));
  });
it('K14-25: 30/60/144fps drivers produce identical skill state and events at the same 60Hz boundary', () => {
  const s = ready(), at = s.now;
  const commands: Command[] = [skill(s), { kind: 'primary', player: 'p1', seq: 1, at: at + 1000 },
    { kind: 'skill', slot: 2, player: 'p1', seq: 2, at: at + 17000 }, { kind: 'skill', slot: 1, player: 'p1', seq: 3, at: at + 18000 }];
  const results = [30, 60, 144].map(fps => {
    const runner = new SimRunner(structuredClone(s)), events: SimEvent[] = []; runner.pending.push(...commands);
    let elapsed = 0;
    while (elapsed < 2000) { const delta = Math.min(1000 / fps, 2000 - elapsed); elapsed += delta; runner.advance(delta); events.push(...runner.drainEvents()); }
    // 小数の描画時間の積算誤差を1時刻単位以内で吸収し、比較先は同じ固定境界にする。
    runner.advance(1 / 60); events.push(...runner.drainEvents());
    expect(runner.state.now).toBe(at + 120000);
    return { state: runner.state, events };
  });
  expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
  let state = s; const events: SimEvent[] = [];
  while (state.now < at + 120000) { const r = step(state, commands, c); state = r.state; events.push(...r.events); }
  expect(results[0]).toEqual({ state, events });
});
