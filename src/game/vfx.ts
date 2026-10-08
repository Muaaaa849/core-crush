// 表示だけの演出（0012「VFXと文字の寿命・上限」「球の輪郭を最優先する」）。simの事実から線分・輪・閃光の計画を作る。
import type { DefenseGrade, PlayerId, Side, SimEvent, Vec3 } from '../sim/types';

export type EffectKind = 'sparks' | 'ring' | 'flash' | 'debris' | 'ripple';
export interface Effect {
  kind: EffectKind;
  position: Vec3;
  startedAt: number; // 表示の時刻（ms）
  lifeMs: number;
  color: number;
  count?: number; // 火花・破片の本数
  contract?: boolean; // 輪：キャッチは収束、それ以外は拡張
  grade?: DefenseGrade;
  angular?: boolean; // 被弾は短い角片
}

const LIFE: Record<EffectKind, number> = { sparks: 120, ring: 160, flash: 80, debris: 220, ripple: 180 };
export const EFFECT_LIMITS: Record<EffectKind, number> = { sparks: 4, ring: 4, flash: 1, debris: 1, ripple: 2 };
// 各種類の最大形状：JUSTの芯＋縁、キャッチの弧＋矢印、外殻片、弧＋六角セル。
export const SEGMENTS_PER_KIND: Record<EffectKind, number> = { sparks: 8 * 3, ring: 6 * 4 + 6 * 2, flash: 0, debris: 12 * 4, ripple: 4 * 6 + 6 * 6 };
const SPARKS = { 'so-so': 3, good: 5, just: 8 };
const PARRY_COLOR = { 'so-so': 0x7fc8ff, good: 0x19e6ff, just: 0xffffff };
const CYAN = 0x19e6ff;
const CLEARANCE = 0.1; // 球の外縁から離す距離（m）
const RIPPLE_MAX = 1.2;

const effect = (kind: EffectKind, position: Vec3, startedAt: number, color: number, extra: Partial<Effect> = {}): Effect =>
  ({ kind, position: { ...position }, startedAt, lifeMs: LIFE[kind], color, ...extra });

/** 1つの確定イベントの演出。閃光を切っても輪・破片は残す。 */
export function effectsFor(event: SimEvent, now: number, flash: boolean): Effect[] {
  switch (event.kind) {
    case 'parry': return [
      effect('sparks', event.position, now, PARRY_COLOR[event.grade], { count: SPARKS[event.grade], grade: event.grade }),
      effect('ring', event.position, now, event.grade === 'just' ? CYAN : PARRY_COLOR[event.grade], { contract: false, grade: event.grade }),
    ];
    case 'catch': return [effect('ring', event.position, now, 0xffd84a, { contract: true })];
    case 'hit': return [effect('sparks', event.position, now, 0xff5533, { count: 4, angular: true })];
    case 'explosion': return [
      ...(flash ? [effect('flash', event.position, now, 0xffa040)] : []),
      effect('debris', event.position, now, 0xff7a2a, { count: 12 }),
      effect('ring', event.position, now, 0xff7a2a, { contract: false }),
    ];
    case 'crossing': return [effect('ripple', event.position, now, 0x19e6ff)];
    default: return [];
  }
}

/** 種類ごとの上限を超えたら最古を置き換える。 */
export function addEffects(list: readonly Effect[], added: readonly Effect[]): Effect[] {
  const next = [...list];
  for (const e of added) {
    const same = next.filter(x => x.kind === e.kind);
    if (same.length >= EFFECT_LIMITS[e.kind]) next.splice(next.indexOf(same[0]), 1);
    next.push(e);
  }
  return next;
}

export function liveEffects(list: readonly Effect[], now: number): Effect[] {
  return list.filter(e => now - e.startedAt < e.lifeMs);
}

/** 経過 age ms の線分・色と明るさ（1→0）。輪の辺も球半径＋0.1mの外へ置く。閃光は線分なし。 */
export function effectSegments(e: Effect, age: number, basis: { right: Vec3; up: Vec3 }, ballRadius: number):
  { segments: [Vec3, Vec3][]; colors: number[]; intensity: number } {
  const u = Math.min(1, Math.max(0, age / e.lifeMs));
  const inner = ballRadius + CLEARANCE;
  const segments: [Vec3, Vec3][] = [];
  const colors: number[] = [];
  // 成功・破砕は視点に正対。フェンスだけはカメラの向きに関係なく中央面へ固定。
  const right = e.kind === 'ripple' ? { x: 1, y: 0, z: 0 } : basis.right;
  const up = e.kind === 'ripple' ? { x: 0, y: 1, z: 0 } : basis.up;
  const point = (x: number, y: number): Vec3 => ({
    x: e.position.x + right.x * x + up.x * y,
    y: e.position.y + right.y * x + up.y * y,
    z: e.position.z + right.z * x + up.z * y,
  });
  const radial = (a: number, r: number, tangent = 0): Vec3 =>
    point(Math.cos(a) * r - Math.sin(a) * tangent, Math.sin(a) * r + Math.cos(a) * tangent);
  const line = (a: Vec3, b: Vec3, color = e.color): void => { segments.push([a, b]); colors.push(color); };
  const outline = (points: Vec3[], color = e.color): void => {
    for (let i = 0; i < points.length; i++) line(points[i], points[(i + 1) % points.length], color);
  };
  const arcs = (groups: number, edges: number, coverage: number, requestedRadius: number): void => {
    const step = 2 * Math.PI / groups * coverage / edges;
    // 弦の中点も保護距離を保つ。収束輪はこの内径で止める。
    const r = Math.max(requestedRadius, inner / Math.cos(step / 2));
    for (let i = 0; i < groups; i++) {
      const start = i * 2 * Math.PI / groups;
      for (let j = 0; j < edges; j++) {
        const a = start + j * step, b = start + (j + 1) * step;
        line(radial(a, r), radial(b % (2 * Math.PI), r));
      }
    }
  };

  if (e.kind === 'sparks') {
    const from = inner + u * (e.angular ? 0.6 : 0.8);
    const length = (e.grade === 'so-so' ? 0.12 : 0.25) * (1 - u) + 0.04;
    for (let i = 0; i < e.count!; i++) {
      const a = Math.PI / 2 + i * 2 * Math.PI / e.count!;
      if (e.angular) {
        const tip = radial(a, from + length);
        line(radial(a, from, -0.08 * (1 - u)), tip);
        line(tip, radial(a, from, 0.08 * (1 - u)));
      } else {
        line(radial(a, from), radial(a, from + length));
        if (e.grade === 'just') {
          for (const side of [-1, 1]) line(radial(a, from, side * 0.018), radial(a, from + length * 0.85, side * 0.009), CYAN);
        }
      }
    }
  } else if (e.kind === 'debris') {
    const from = inner + u * 1.8;
    const size = 0.12 * (1 - u) + 0.04;
    for (let i = 0; i < e.count!; i++) {
      const a = i * 2 * Math.PI / e.count!;
      // 歪んだ四角い外殻片。全辺の放射方向成分がfrom以上なので中心を空ける。
      outline([radial(a, from, -size * 0.6), radial(a, from + size * 0.3, size * 0.7),
        radial(a, from + size * 1.8, size * 0.4), radial(a, from + size * 1.5, -size * 0.8)]);
    }
  } else if (e.kind === 'ring') {
    const r = inner + (e.contract ? 1 - u : u) * 0.8;
    if (e.contract) {
      arcs(6, 4, 0.72, r);
      for (let i = 0; i < 6; i++) {
        const a = (i + 0.86) * 2 * Math.PI / 6, tip = radial(a, r);
        line(radial(a, r + 0.1, -0.045), tip);
        line(tip, radial(a, r + 0.1, 0.045));
      }
    } else if (e.grade === 'so-so') arcs(3, 6, 0.72, r);
    else if (e.grade === 'just') arcs(8, 3, 0.65, r);
    else arcs(1, 32, 1, r);
  } else if (e.kind === 'ripple') {
    arcs(4, 6, 0.72, inner + u * (RIPPLE_MAX - inner));
    const cellRadius = 0.09, orbit = inner + 0.18 + u * (1.02 - inner - 0.18);
    for (let i = 0; i < 6; i++) {
      const a = i * 2 * Math.PI / 6, x = Math.cos(a) * orbit, y = Math.sin(a) * orbit;
      outline(Array.from({ length: 6 }, (_, j) => {
        const angle = j * Math.PI / 3;
        return point(x + Math.cos(angle) * cellRadius, y + Math.sin(angle) * cellRadius);
      }), 0x07515a);
    }
  }
  return { segments, colors, intensity: (1 - u) * (e.kind === 'ring' && e.grade === 'so-so' ? 0.4 : 1) };
}

const GRADE = { just: 'JUST', good: 'GOOD', 'so-so': 'SO-SO' };
/** 判定文字。本人の結果は名前なし、ほかは味方／敵とIDを添える。 */
export function judgement(event: SimEvent, local: PlayerId, players: readonly { id: PlayerId; side: Side }[]):
  { text: string; self: boolean } | undefined {
  if (event.kind !== 'catch' && event.kind !== 'parry') return;
  const text = `${GRADE[event.grade]} ${event.kind === 'catch' ? 'キャッチ' : '跳ね返し'}`;
  if (event.player === local) return { text, self: true };
  const side = (id: PlayerId) => players.find(p => p.id === id)!.side;
  return { text: `${text}（${side(event.player) === side(local) ? '味方' : '敵'} ${event.player.toUpperCase()}）`, self: false };
}
