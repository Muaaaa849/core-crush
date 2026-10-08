// 開始ロスターをsimの参加枠へ変換する。ローカルとオンラインが同じ変換を使う（0010、0013）。
import type { MatchMode, MatchOptions, Participant, Side } from '../sim/types';
import { CHARACTERS, isCharacterId, type CharacterId, type Roster } from './characters';

/** ローカル試遊：本人はp1・A陣で選んだキャラ、Botは参加枠固定（p2 ECHO、p3 ANCHOR、p4 SWITCH）。 */
export function localRoster(mode: MatchMode, self: CharacterId): Roster {
  const roster = [{ id: 'p1', side: 'a', characterId: self }] as const satisfies Roster;
  return [
    ...roster,
    ...(mode === '2v2' ? [{ id: 'p2', side: 'a', characterId: 'echo' } as const] : []),
    { id: 'p3', side: 'b', characterId: 'anchor' },
    ...(mode !== '1v1' ? [{ id: 'p4', side: 'b', characterId: 'switch' } as const] : []),
  ];
}

/** ID昇順に並べ、キャラIDから能力を複製する。未知のキャラ・重複IDはエラー（補完しない）。 */
export function rosterMatch(roster: Roster, firstBall: Side, characters: typeof CHARACTERS = CHARACTERS): MatchOptions {
  const ids = new Set(roster.map(e => e.id));
  if (ids.size !== roster.length) throw new Error('参加枠のIDが重複している');
  const participants = [...roster].sort((a, b) => a.id.localeCompare(b.id)).map((e): Participant => {
    if (characters === CHARACTERS ? !isCharacterId(e.characterId) : !Object.hasOwn(characters, e.characterId)) {
      throw new Error(`不明なキャラ：${e.characterId}`);
    }
    const { stats, skills } = characters[e.characterId];
    return { id: e.id, side: e.side, stats: { ...stats }, skills: [...skills] };
  });
  return { participants, firstBall };
}
