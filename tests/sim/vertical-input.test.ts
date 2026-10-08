import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, MatchMode } from '../../src/sim/types';
import { evenMatch } from '../fixtures';
import { active, run } from './cover-helpers';

const pitch = (at: number, value: number, seq = 0): Command => ({ kind: 'pitch', player: 'p1', at, seq, pitch: value });

it.each(['1v1', '1v2', '2v2'] as MatchMode[])('V15-1: %s initializes, clones and resets every pitch', mode => {
  const initial = createInitialState(evenMatch(mode, 'a'));
  expect(initial.players.map(p => p.pitch)).toEqual(initial.players.map(() => 0));
  initial.players.forEach(p => { p.pitch = 0.7; });
  expect(structuredClone(initial).players.map(p => p.pitch)).toEqual(initial.players.map(() => 0.7));
  expect(JSON.parse(JSON.stringify(initial)).players.map((p: { pitch: number }) => p.pitch)).toEqual(initial.players.map(() => 0.7));
  initial.match.phase = 'result'; initial.match.nextRoundAt = 500;
  expect(step(initial, []).state.players.every(p => p.pitch === 0)).toBe(true);
  expect(createInitialState(evenMatch(mode, 'b')).players.every(p => p.pitch === 0)).toBe(true);
});

it.each([[-5, -1.2], [5, 1.2], [0.3456789, 0.3456789]])('V15-3: direct finite pitch %s clamps to %s without quantization', (value, expected) => {
  const s = active();
  expect(step(s, [pitch(s.now, value)]).state.players[0].pitch).toBe(expected);
});
it.each([NaN, Infinity, -Infinity])('V15-3: ignores nonfinite pitch %s', value => {
  const s = active(); s.players[0].pitch = 0.3;
  expect(step(s, [pitch(s.now, value)]).state.players[0].pitch).toBe(0.3);
});
it.each(['windup', 'recovery', 'feint', 'hitstun', 'ko', 'waiting', 'result', 'over'] as const)(
  'V15-3: pitch during %s preserves action and resources', mode => {
    const s = active(), p = s.players[0];
    if (mode === 'windup' || mode === 'recovery') p.action = { kind: mode, endsAt: s.now + 8000 };
    if (mode === 'feint') p.action = { kind: 'feint', startedAt: s.now - 1, endsAt: s.now + 8000 };
    if (mode === 'hitstun') p.action = { kind: 'hitstun', startedAt: s.now - 1, moveEndsAt: s.now + 4000, endsAt: s.now + 8000, velocity: { x: 0, z: 0 } };
    if (mode === 'ko') p.hp = 0;
    if (mode === 'waiting') { s.danger = null; s.match.roundStartsAt = s.now + 8000; }
    if (mode === 'result') { s.match.phase = 'result'; s.match.nextRoundAt = s.now + 8000; }
    if (mode === 'over') s.match.phase = 'over';
    const result = step(s, [pitch(s.now, 0.6)], { ...c, tick: 1 });
    expect(result.state.players[0]).toMatchObject({ pitch: mode === 'over' ? 0 : 0.6, action: p.action, cost: p.cost, stepPoints: p.stepPoints });
    if (mode !== 'ko') expect(result.events).toEqual([]);
  });
it('V15-4: state inputs precede actions and last simultaneous seq wins', () => {
  const s = active(), at = s.now;
  const commands: Command[] = [{ kind: 'primary', player: 'p1', aim: true, at, seq: 0 },
    pitch(at, -0.2, 4), { kind: 'yaw', player: 'p1', yaw: 0.2, at, seq: 2 }, pitch(at, 0.4, 3)];
  const a = run(s, at + c.throwWindup + 1, commands), b = run(s, at + c.throwWindup + 1, [...commands].reverse());
  expect(a).toEqual(b);
  expect(a.state.players[0]).toMatchObject({ yaw: 0.2, pitch: -0.2 });
});
