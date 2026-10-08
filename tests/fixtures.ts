import type { Roster } from '../src/game/characters';
import type { MatchMode, MatchOptions, Participant, PlayerId, Side } from '../src/sim/types';

// 既存の1対1境界試験用。能力・陣・IDは全員分を明示する。
export const duelParticipants: readonly Participant[] = [
  { id: 'p1', side: 'a', stats: { attack: 5, defense: 5, agility: 5 }, skills: ['overcharge', 'blink'] },
  { id: 'p2', side: 'b', stats: { attack: 5, defense: 5, agility: 5 }, skills: ['overcharge', 'blink'] },
];

/** HUD等の表示用：simの参加者を全員VOLTとしたロスター。 */
export const rosterOf = (state: { players: readonly { id: PlayerId; side: Side }[] }): Roster =>
  state.players.map(p => ({ id: p.id, side: p.side, characterId: 'volt' }));

/** sim試験用：全員の能力5/5/5で人数形式の参加枠を作る（キャラ表に依存しない）。 */
export function evenMatch(mode: MatchMode, firstBall: Side): MatchOptions {
  const even = { attack: 5, defense: 5, agility: 5 };
  const ids: [PlayerId, Side][] = mode === '1v1' ? [['p1', 'a'], ['p3', 'b']] : mode === '1v2' ? [['p1', 'a'], ['p3', 'b'], ['p4', 'b']]
    : [['p1', 'a'], ['p2', 'a'], ['p3', 'b'], ['p4', 'b']];
  return { participants: ids.map(([id, side]) => ({ id, side, stats: { ...even }, skills: ['overcharge', 'blink'] })), firstBall };
}
