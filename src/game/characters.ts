// キャラ定義（0013 M3-2、characters.md「初期ロスター案」）。HPは持たず、能力からsimの式で決める。
// sim・通信・表示が同じ表を使う。three.js・DOMはimportしない。
import type { PlayerId, Side, Stats } from '../sim/types';

export type SkillId = 'overcharge' | 'blink' | 'phantom' | 'boost-ring' | 'chain' | 'charge' | 'trap' | 'energy-bolt';
export interface SkillDefinition { name: string; kind: 'active' | 'passive'; status: 'unimplemented'; plan?: string }
export interface CharacterDefinition {
  name: string;
  stats: Readonly<Stats>;
  skills: readonly [SkillId, SkillId];
  colors: { base: string; emissive: string };
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  overcharge: { name: 'オーバーチャージ', kind: 'active', status: 'unimplemented' },
  blink: { name: 'ブリンク', kind: 'active', status: 'unimplemented' },
  phantom: { name: 'ファントム・スロー', kind: 'active', status: 'unimplemented' },
  'boost-ring': { name: 'ブーストリング', kind: 'active', status: 'unimplemented' },
  chain: { name: 'チェーンハンド', kind: 'active', status: 'unimplemented' },
  charge: { name: '蓄勢', kind: 'passive', status: 'unimplemented', plan: 'goodキャッチの獲得量増加' },
  trap: { name: 'スクラップ・トラップ', kind: 'active', status: 'unimplemented' },
  'energy-bolt': { name: 'エナジーボルト', kind: 'active', status: 'unimplemented' },
};

export const CHARACTERS = {
  volt: { name: 'VOLT', stats: { attack: 7, defense: 4, agility: 4 }, skills: ['overcharge', 'blink'], colors: { base: '#D8A52A', emissive: '#FFE27A' } },
  echo: { name: 'ECHO', stats: { attack: 4, defense: 6, agility: 5 }, skills: ['phantom', 'boost-ring'], colors: { base: '#8067B5', emissive: '#CBB4FF' } },
  anchor: { name: 'ANCHOR', stats: { attack: 4, defense: 7, agility: 4 }, skills: ['chain', 'charge'], colors: { base: '#68856F', emissive: '#B4D6A0' } },
  switch: { name: 'SWITCH', stats: { attack: 5, defense: 4, agility: 6 }, skills: ['trap', 'energy-bolt'], colors: { base: '#BB7657', emissive: '#FFD0A0' } },
} as const satisfies Record<string, CharacterDefinition>;

export type CharacterId = keyof typeof CHARACTERS;
export type RosterEntry = Readonly<{ id: PlayerId; side: Side; characterId: CharacterId }>;
export type Roster = readonly RosterEntry[];

/** チーム色はキャラ色と別に持つ（0013）。 */
export const TEAM_COLORS: Record<Side, string> = { a: '#57C7FF', b: '#FF718A' };

export const isCharacterId = (value: unknown): value is CharacterId => typeof value === 'string' && Object.hasOwn(CHARACTERS, value);

/** 名札・HUDの共通の名前：「関係 人物ID キャラ名」。 */
export function playerLabel(roster: Roster, local: PlayerId, id: PlayerId): string {
  const entry = roster.find(e => e.id === id)!;
  const relation = id === local ? 'あなた' : entry.side === roster.find(e => e.id === local)!.side ? '味方' : '敵';
  return `${relation} ${id.toUpperCase()} ${CHARACTERS[entry.characterId].name}`;
}

/** 2枠の表示。アクティブは既定キー、パッシブは常時。効果はまだないので未実装と明示する。 */
export function skillLines(id: CharacterId): string[] {
  return CHARACTERS[id].skills.map((skill, slot) => {
    const s = SKILLS[skill];
    return s.kind === 'active' ? `[${slot === 0 ? 'E' : 'R'}] ${s.name} — 未実装` : `常時：${s.name} — 未実装（${s.plan}）`;
  });
}
