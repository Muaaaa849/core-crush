// M3-1後半（0012「VFXと文字の寿命・上限」「球の輪郭を最優先する」）：表示だけの演出の計画・寿命・上限・球の保護。
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { addEffects, effectSegments, effectsFor, judgement, liveEffects, type Effect } from '../../src/game/vfx';
import { VfxView } from '../../src/game/vfxview';
import type { DefenseGrade, SimEvent } from '../../src/sim/types';

const position = { x: 0, y: 1.2, z: 8 };
const radius = 0.325;
const basis = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
const parry = (grade: DefenseGrade, player = 'p1' as const): SimEvent => ({ kind: 'parry', at: 0, player, grade, position, rallySpeed: 0 });
const kinds = (effects: Effect[]) => effects.map(e => `${e.kind}${e.count ? ':' + e.count : ''}`);
const players = [{ id: 'p1', side: 'a' }, { id: 'p2', side: 'b' }, { id: 'p3', side: 'a' }] as const;
const hit: SimEvent = { kind: 'hit', at: 0, player: 'p1', damage: 20, position, direction: { x: 0, y: 0, z: 1 }, ko: false };
const explosion: SimEvent = { kind: 'explosion', at: 0, side: 'a', position };
const crossing: SimEvent = { kind: 'crossing', at: 0, side: 'a', position: { ...position, z: 0 } };
const catchEvent: SimEvent = { kind: 'catch', at: 0, player: 'p1', grade: 'just', position };
const plan = (e: Effect, age = 0) => effectSegments(e, age, basis, radius);
const distanceToSegment = ([a, b]: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }], center = position) => {
  const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const offset = new THREE.Vector3(a.x - center.x, a.y - center.y, a.z - center.z);
  const t = Math.max(0, Math.min(1, -offset.dot(d) / d.lengthSq()));
  return offset.addScaledVector(d, t).length();
};

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
    const events: SimEvent[] = [parry('so-so'), parry('good'), parry('just'), { kind: 'catch', at: 0, player: 'p1', grade: 'just', position },
      { kind: 'hit', at: 0, player: 'p1', damage: 20, position, direction: { x: 0, y: 0, z: 1 }, ko: false },
      { kind: 'explosion', at: 0, side: 'a', position }];
    for (const effect of events.flatMap(e => effectsFor(e, 0, true)).filter(e => e.kind !== 'flash')) {
      for (let t = 0; t <= effect.lifeMs; t += 10) {
        for (const [a, b] of effectSegments(effect, t, basis, radius).segments) {
          for (const p of [a, b]) expect(Math.hypot(p.x - position.x, p.y - position.y, p.z - position.z)).toBeGreaterThanOrEqual(radius + 0.1 - 1e-9);
          expect(distanceToSegment([a, b])).toBeGreaterThanOrEqual(radius + 0.1 - 1e-9);
        }
      }
    }
  });

  it('F12-10: segments fade out and the ripple stays within 1.2m on the fence plane', () => {
    const [ripple] = effectsFor({ kind: 'crossing', at: 0, side: 'a', position: { x: 1, y: 1, z: 0 } }, 0, true);
    for (const t of [0, 90, 179]) {
      const { segments, intensity } = effectSegments(ripple, t, basis, radius);
      expect(segments).toHaveLength(60); // 4つの弧×6線分＋6セル×6辺
      for (const p of segments.flat()) { expect(p.z).toBe(0); expect(Math.hypot(p.x - 1, p.y - 1)).toBeLessThanOrEqual(1.2 + 1e-9); }
      expect(intensity).toBeCloseTo(1 - t / 180);
    }
  });

  it('SO-SO has three short sparks and three weak incomplete arcs; GOOD has five rays and a closed fine ring', () => {
    const [weakSparks, weakRing] = effectsFor(parry('so-so'), 0, true);
    const [goodSparks, goodRing] = effectsFor(parry('good'), 0, true);
    expect(plan(weakSparks).segments).toHaveLength(3);
    for (const [a, b] of plan(weakSparks).segments) expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThanOrEqual(0.2);
    const weak = plan(weakRing), good = plan(goodRing);
    expect(weak.segments).toHaveLength(18);
    for (let i = 0; i < 3; i++) expect(weak.segments[i * 6 + 5][1]).not.toEqual(weak.segments[((i + 1) % 3) * 6][0]);
    expect(weak.intensity).toBeLessThan(good.intensity);
    expect(plan(goodSparks).segments).toHaveLength(5);
    expect(good.segments).toHaveLength(32);
    for (let i = 0; i < 32; i++) expect(good.segments[i][1]).toEqual(good.segments[(i + 1) % 32][0]);
  });

  it('JUST uses eight white spark cores with cyan edges and eight separated cyan arcs', () => {
    const [sparks, ring] = effectsFor(parry('just'), 0, true);
    const sparkPlan = plan(sparks), ringPlan = plan(ring);
    expect(sparkPlan.segments).toHaveLength(24);
    expect(sparkPlan.colors.filter(c => c === 0xffffff)).toHaveLength(8);
    expect(sparkPlan.colors.filter(c => c === 0x19e6ff)).toHaveLength(16);
    expect(ringPlan.segments).toHaveLength(24);
    expect(ringPlan.colors.every(c => c === 0x19e6ff)).toBe(true);
    for (let i = 0; i < 8; i++) expect(ringPlan.segments[i * 3 + 2][1]).not.toEqual(ringPlan.segments[((i + 1) % 8) * 3][0]);
  });

  it('catch contracts six golden arcs and six inward chevrons, stopping at the protected edge', () => {
    const [ring] = effectsFor(catchEvent, 0, true);
    const start = plan(ring), end = plan(ring, ring.lifeMs);
    expect(start.segments).toHaveLength(36); // 6弧×4線分＋6矢印×2線分
    expect(start.colors.every(c => c === 0xffd84a)).toBe(true);
    expect(distanceToSegment(start.segments[0])).toBeGreaterThan(distanceToSegment(end.segments[0]));
    expect(distanceToSegment(end.segments[0])).toBeCloseTo(radius + 0.1);
    for (const segment of end.segments) expect(distanceToSegment(segment)).toBeGreaterThanOrEqual(radius + 0.1 - 1e-9);
  });

  it('hit has four outward angular pieces and explosion has twelve closed shell outlines with an empty center', () => {
    const [impact] = effectsFor(hit, 0, true);
    const impactPlan = plan(impact);
    expect(impactPlan.segments).toHaveLength(8);
    for (let i = 0; i < 4; i++) expect(impactPlan.segments[i * 2][1]).toEqual(impactPlan.segments[i * 2 + 1][0]);
    const debris = effectsFor(explosion, 0, true).find(e => e.kind === 'debris')!;
    const shards = plan(debris).segments;
    expect(shards).toHaveLength(48);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) {
      expect(shards[i * 4 + j][1]).toEqual(shards[i * 4 + (j + 1) % 4][0]);
      expect(distanceToSegment(shards[i * 4 + j])).toBeGreaterThanOrEqual(radius + 0.1 - 1e-9);
    }
  });

  it('fence has six closed hexagonal cells on z=0 even with a rotated camera basis', () => {
    const [ripple] = effectsFor(crossing, 0, true);
    const rotated = { right: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } };
    for (const age of [0, 90, 180]) {
      const { segments, colors } = effectSegments(ripple, age, rotated, radius);
      const cells = segments.slice(24);
      expect(cells).toHaveLength(36);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) expect(cells[i * 6 + j][1]).toEqual(cells[i * 6 + (j + 1) % 6][0]);
      for (const p of segments.flat()) {
        expect(p.z).toBe(0);
        expect(Math.hypot(p.x - ripple.position.x, p.y - ripple.position.y)).toBeLessThanOrEqual(1.2 + 1e-9);
      }
      expect(colors.slice(24).every(c => c !== ripple.color)).toBe(true);
    }
  });

  it('F12-10: all five lifetimes and caps stay fixed, including flash and debris replacement', () => {
    const all = [...effectsFor(parry('just'), 1000, true), ...effectsFor(explosion, 1000, true), ...effectsFor(crossing, 1000, true)];
    const lifetimes = { sparks: 120, ring: 160, flash: 80, debris: 220, ripple: 180 };
    for (const e of all) {
      expect(e.lifeMs).toBe(lifetimes[e.kind]);
      expect(liveEffects([e], 1000 + e.lifeMs - 1)).toEqual([e]);
      expect(liveEffects([e], 1000 + e.lifeMs)).toEqual([]);
      expect(plan(e).intensity).toBeGreaterThan(0);
      expect(plan(e, e.lifeMs).intensity).toBe(0);
    }
    let list: Effect[] = [];
    for (let i = 0; i < 6; i++) list = addEffects(list, [
      ...effectsFor(parry('just'), i, true), ...effectsFor(explosion, i, true), ...effectsFor(crossing, i, true),
    ]);
    for (const [kind, count] of Object.entries({ sparks: 4, ring: 4, flash: 1, debris: 1, ripple: 2 })) expect(list.filter(e => e.kind === kind)).toHaveLength(count);
    expect(list.filter(e => e.kind === 'flash' || e.kind === 'debris').map(e => e.startedAt)).toEqual([5, 5]);
  });

  it('F12-11: view flashScale=0 hides only flash and preserves every line and its color', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const view = new VfxView(scene, radius), effects = effectsFor(explosion, 0, true);
    const lines = scene.children.find(o => o instanceof THREE.LineSegments) as THREE.LineSegments;
    const flash = scene.children.find(o => o instanceof THREE.Mesh)!;
    view.update(effects, 0, camera, 1);
    const before = [...lines.geometry.attributes.color.array];
    const count = lines.geometry.drawRange.count;
    expect(flash.visible).toBe(true);
    expect(count).toBe(160); // 12四角片×4辺＋32線分の輪
    view.update(effects, 0, camera, 0);
    expect(flash.visible).toBe(false);
    expect(lines.visible).toBe(true);
    expect(lines.geometry.drawRange.count).toBe(count);
    expect([...lines.geometry.attributes.color.array]).toEqual(before);
  });

  it('F12-10: one reused line geometry fits all capped shapes without truncating', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const view = new VfxView(scene, radius);
    const [sparks] = effectsFor(parry('just'), 0, true), [ring] = effectsFor(catchEvent, 0, true);
    const [, debris] = effectsFor(explosion, 0, true), [ripple] = effectsFor(crossing, 0, true);
    const effects = [...Array.from({ length: 4 }, () => sparks), ...Array.from({ length: 4 }, () => ring), debris, ripple, ripple];
    view.update(effects, 0, camera, 0);
    const lines = scene.children.find(o => o instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(scene.children).toHaveLength(2);
    expect(lines.geometry.drawRange.count).toBe(816); // (4×24＋4×36＋48＋2×60)×2頂点
    const geometry = lines.geometry;
    view.update(effects, 60, camera, 0);
    expect(lines.geometry).toBe(geometry);
    view.update(effects, 220, camera, 0);
    expect(lines.visible).toBe(false);
    expect(lines.geometry.drawRange.count).toBe(0);
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
