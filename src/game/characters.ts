// キャラ定義（0013 M3-2、characters.md「初期ロスター案」）。HPは持たず、能力からsimの式で決める。
// sim・通信・表示が同じ表を使う。three.js・DOMはimportしない。
import type { PlayerId, Side, SkillId, Stats } from '../sim/types';
import { skillKind } from '../sim/skills';

export interface SkillDefinition { name: string; kind: 'active' | 'passive'; status: 'implemented' | 'unimplemented' }
export interface CharacterDefinition {
  name: string;
  stats: Readonly<Stats>;
  skills: readonly [SkillId, SkillId];
  colors: { base: string; emissive: string };
}

function skillDefinition(id: SkillId, name: string): SkillDefinition {
  return { name, kind: skillKind(id) === 'passive' ? 'passive' : 'active',
    status: skillKind(id) === 'unimplemented' ? 'unimplemented' : 'implemented' };
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  overcharge: skillDefinition('overcharge', 'オーバーチャージ'),
  blink: skillDefinition('blink', 'ブリンク'),
  phantom: skillDefinition('phantom', 'ファントム・スロー'),
  'boost-ring': skillDefinition('boost-ring', 'ブーストリング'),
  chain: skillDefinition('chain', 'チェーンハンド'),
  charge: skillDefinition('charge', '蓄勢'),
  trap: skillDefinition('trap', 'スクラップ・トラップ'),
  'energy-bolt': skillDefinition('energy-bolt', 'エナジーボルト'),
  economy: skillDefinition('economy', '省エネ'),
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

/** キャラ選択とHUDで共有する枠の説明。使用可否・CTは試合中のstateから加える。 */
export function skillDescription(id: SkillId, key: string): string {
  if (id === 'charge') return '常時：蓄勢 good +0.75';
  if (id === 'economy') return '常時：省エネ 召喚0.75';
  return `[${key}] ${SKILLS[id].name}${skillKind(id) === 'unimplemented' ? ' — 未実装' : ''}`;
}

export function skillLines(id: CharacterId, keys: readonly [string, string] = ['E', 'R']): string[] {
  return CHARACTERS[id].skills.map((skill, slot) => skillDescription(skill, keys[slot]));
}
