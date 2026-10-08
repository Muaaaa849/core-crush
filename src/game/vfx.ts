// 表示だけの演出（0012「VFXと文字の寿命・上限」「球の輪郭を最優先する」）。simの事実から線分・輪・閃光の計画を作る。
import type { PlayerId, Side, SimEvent, Vec3 } from '../sim/types';

export type EffectKind = 'sparks' | 'ring' | 'flash' | 'debris' | 'ripple';
export interface Effect {
  kind: EffectKind;
  position: Vec3;
  startedAt: number; // 表示の時刻（ms）
  lifeMs: number;
  color: number;
  count?: number; // 火花・破片の本数
  contract?: boolean; // 輪：キャッチは収束、それ以外は拡張
}

const LIFE: Record<EffectKind, number> = { sparks: 120, ring: 160, flash: 80, debris: 220, ripple: 180 };
const LIMIT: Record<EffectKind, number> = { sparks: 4, ring: 4, flash: 1, debris: 1, ripple: 2 };
const SPARKS = { 'so-so': 3, good: 5, just: 8 };
const PARRY_COLOR = { 'so-so': 0x7fc8ff, good: 0x19e6ff, just: 0xffffff };
const RING_SEGMENTS = 16;
const CLEARANCE = 0.1; // 球の外縁から離す距離（m）
const RIPPLE_MAX = 1.2;

const effect = (kind: EffectKind, position: Vec3, startedAt: number, color: number, extra: Partial<Effect> = {}): Effect =>
  ({ kind, position: { ...position }, startedAt, lifeMs: LIFE[kind], color, ...extra });

/** 1つの確定イベントの演出。閃光を切っても輪・破片は残す。 */
export function effectsFor(event: SimEvent, now: number, flash: boolean): Effect[] {
  switch (event.kind) {
    case 'parry': return [
      effect('sparks', event.position, now, PARRY_COLOR[event.grade], { count: SPARKS[event.grade] }),
      effect('ring', event.position, now, PARRY_COLOR[event.grade], { contract: false }),
    ];
    case 'catch': return [effect('ring', event.position, now, 0xffd84a, { contract: true })];
    case 'hit': return [effect('sparks', event.position, now, 0xff5533, { count: 4 })];
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
    if (same.length >= LIMIT[e.kind]) next.splice(next.indexOf(same[0]), 1);
    next.push(e);
  }
  return next;
}

export function liveEffects(list: readonly Effect[], now: number): Effect[] {
  return list.filter(e => now - e.startedAt < e.lifeMs);
}

/** 外向きに散らす向き（球面上にほぼ均等）。演出ごとに同じ並び。 */
function direction(i: number, n: number): Vec3 {
  const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
}
const along = (p: Vec3, d: Vec3, s: number): Vec3 => ({ x: p.x + d.x * s, y: p.y + d.y * s, z: p.z + d.z * s });

/** 経過 age ms の線分と明るさ（1→0）。火花・破片・輪は球の中心から球半径＋0.1m以上離す。閃光は線分なし。 */
export function effectSegments(e: Effect, age: number, basis: { right: Vec3; up: Vec3 }, ballRadius: number):
  { segments: [Vec3, Vec3][]; intensity: number } {
  const u = Math.min(1, Math.max(0, age / e.lifeMs));
  const inner = ballRadius + CLEARANCE;
  const segments: [Vec3, Vec3][] = [];
  if (e.kind === 'sparks' || e.kind === 'debris') {
    const reach = e.kind === 'sparks' ? 1.0 : 2.5, length = (e.kind === 'sparks' ? 0.3 : 0.4) * (1 - u) + 0.05;
    for (let i = 0; i < e.count!; i++) {
      const d = direction(i, e.count!), from = inner + u * reach;
      segments.push([along(e.position, d, from), along(e.position, d, from + length)]);
    }
  } else if (e.kind === 'ring' || e.kind === 'ripple') {
    const radius = e.kind === 'ring' ? inner + (e.contract ? 1 - u : u) * 0.8 : inner + u * (RIPPLE_MAX - inner);
    // 輪は画面に正対、波紋は中央フェンスの面（z一定）に描く。
    const right = e.kind === 'ring' ? basis.right : { x: 1, y: 0, z: 0 }, up = e.kind === 'ring' ? basis.up : { x: 0, y: 1, z: 0 };
    const point = (k: number): Vec3 => {
      const a = 2 * Math.PI * k / RING_SEGMENTS, c = Math.cos(a) * radius, s = Math.sin(a) * radius;
      return { x: e.position.x + right.x * c + up.x * s, y: e.position.y + right.y * c + up.y * s, z: e.position.z + right.z * c + up.z * s };
    };
    for (let k = 0; k < RING_SEGMENTS; k++) segments.push([point(k), point(k + 1)]);
  }
  return { segments, intensity: 1 - u };
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
