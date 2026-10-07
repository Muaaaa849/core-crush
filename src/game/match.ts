// 人数選択はsim外で参加枠へ変換する。操作者はp1固定、残りは同じ練習Botを使う（0010）。
import type { MatchMode, MatchOptions, Participant, Side } from '../sim/types';

export function localMatch(mode: MatchMode, firstBall: Side): MatchOptions {
  const participants: Participant[] = [{ id: 'p1', side: 'a', stats: { attack: 5, defense: 5, agility: 5 } }];
  if (mode === '2v2') participants.push({ id: 'p2', side: 'a', stats: { attack: 5, defense: 5, agility: 5 } });
  participants.push({ id: 'p3', side: 'b', stats: { attack: 5, defense: 5, agility: 5 } });
  if (mode !== '1v1') participants.push({ id: 'p4', side: 'b', stats: { attack: 5, defense: 5, agility: 5 } });
  return { participants, firstBall };
}
