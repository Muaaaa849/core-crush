// M3-1後半（0012「VFXと文字の寿命・上限」「球の輪郭を最優先する」）：表示だけの演出の計画・寿命・上限・球の保護。
import { describe, expect, it } from 'vitest';
import { addEffects, effectSegments, effectsFor, judgement, liveEffects, type Effect } from '../../src/game/vfx';
import type { DefenseGrade, SimEvent } from '../../src/sim/types';

const position = { x: 0, y: 1.2, z: 8 };
const radius = 0.325;
const basis = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
const parry = (grade: DefenseGrade, player = 'p1' as const): SimEvent => ({ kind: 'parry', at: 0, player, grade, position, rallySpeed: 0 });
const kinds = (effects: Effect[]) => effects.map(e => `${e.kind}${e.count ? ':' + e.count : ''}`);
const players = [{ id: 'p1', side: 'a' }, { id: 'p2', side: 'b' }, { id: 'p3', side: 'a' }] as const;

describe('M3-1 VFX plan', () => {
  it('F12-3: each result maps to its own effects; pickup and whiff have none', () => {
    expect(kinds(effectsFor(parry('so-so'), 0, true))).toEqual(['sparks:3', 'ring']);
    expect(kinds(effectsFor(parry('good'), 0, true))).toEqual(['sparks:5', 'ring']);
    expect(kinds(effectsFor(parry('just'), 0, true))).toEqual(['sparks:8', 'ring']);
    const ring = (e: SimEvent) => effectsFor(e, 0, true).find(x => x.kind === 'ring')!;
    expect(ring(parry('just')).contract).toBe(false);
    expect(ring({ kind: 'catch', at: 0, player: 'p1', grade: 'good', position }).contract).toBe(true);
    expect(kinds(effectsFor({ kind: 'hit', at: 0, player: 'p1', damage: 20, position, direction: { x: 0, y: 0, z: 1 }, ko: false }, 0, true))).toEqual(['sparks:4']);
    expect(kinds(effectsFor({ kind: 'explosion', at: 0, side: 'a', position }, 0, true))).toEqual(['flash', 'debris:12', 'ring']);
    expect(kinds(effectsFor({ kind: 'crossing', at: 0, side: 'b', position: { ...position, z: 0 } }, 0, true))).toEqual(['ripple']);
    for (const kind of ['pickup', 'whiff'] as const) expect(effectsFor({ kind, at: 0, player: 'p1' }, 0, true)).toEqual([]);
  });

  it('F12-11: flash off removes only the explosion flash, keeping rings and debris', () => {
    expect(kinds(effectsFor({ kind: 'explosion', at: 0, side: 'a', position }, 0, false))).toEqual(['debris:12', 'ring']);
  });

  it('F12-10: effects expire exactly at their lifetime', () => {
    const list = addEffects([], effectsFor(parry('just'), 1000, true));
    expect(kinds(liveEffects(list, 1119))).toEqual(['sparks:8', 'ring']);
    expect(kinds(liveEffects(list, 1120))).toEqual(['ring']);
    expect(liveEffects(list, 1160)).toEqual([]);
  });

  it('F12-10: per-kind caps replace the oldest instead of growing', () => {
    let list: Effect[] = [];
    for (let i = 0; i < 6; i++) list = addEffects(list, effectsFor(parry('just'), i, true));
    expect(list.filter(e => e.kind === 'sparks').map(e => e.startedAt)).toEqual([2, 3, 4, 5]);
    expect(list.filter(e => e.kind === 'ring')).toHaveLength(4);
    for (let i = 0; i < 3; i++) list = addEffects(list, effectsFor({ kind: 'crossing', at: 0, side: 'a', position }, i, true));
    expect(list.filter(e => e.kind === 'ripple').map(e => e.startedAt)).toEqual([1, 2]);
  });

  it('F12-11: sparks, debris and rings stay at least ball radius + 0.1m from the ball center', () => {
    const events: SimEvent[] = [parry('just'), { kind: 'catch', at: 0, player: 'p1', grade: 'just', position },
      { kind: 'hit', at: 0, player: 'p1', damage: 20, position, direction: { x: 0, y: 0, z: 1 }, ko: false },
      { kind: 'explosion', at: 0, side: 'a', position }];
    for (const effect of events.flatMap(e => effectsFor(e, 0, true)).filter(e => e.kind !== 'flash')) {
      for (let t = 0; t <= effect.lifeMs; t += 10) {
        for (const [a, b] of effectSegments(effect, t, basis, radius).segments) {
          for (const p of [a, b]) expect(Math.hypot(p.x - position.x, p.y - position.y, p.z - position.z)).toBeGreaterThanOrEqual(radius + 0.1 - 1e-9);
        }
      }
    }
  });

  it('F12-10: segments fade out and the ripple stays within 1.2m on the fence plane', () => {
    const [ripple] = effectsFor({ kind: 'crossing', at: 0, side: 'a', position: { x: 1, y: 1, z: 0 } }, 0, true);
    for (const t of [0, 90, 179]) {
      const { segments, intensity } = effectSegments(ripple, t, basis, radius);
      expect(segments).toHaveLength(16);
      for (const p of segments.flat()) { expect(p.z).toBe(0); expect(Math.hypot(p.x - 1, p.y - 1)).toBeLessThanOrEqual(1.2 + 1e-9); }
      expect(intensity).toBeCloseTo(1 - t / 180);
    }
  });
});

describe('M3-1 judgement text', () => {
  it('F12-3: shows grade and action, naming self, ally and enemy', () => {
    expect(judgement(parry('just'), 'p1', players)).toEqual({ text: 'JUST 跳ね返し', self: true });
    expect(judgement({ kind: 'catch', at: 0, player: 'p3', grade: 'so-so', position }, 'p1', players)).toEqual({ text: 'SO-SO キャッチ（味方 P3）', self: false });
    expect(judgement(parry('good', 'p2' as never), 'p1', players)).toEqual({ text: 'GOOD 跳ね返し（敵 P2）', self: false });
    expect(judgement({ kind: 'whiff', at: 0, player: 'p1' }, 'p1', players)).toBeUndefined();
  });
});
