import type { Participant } from '../src/sim/types';

// 既存の1対1境界試験用。能力・陣・IDは全員分を明示する。
export const duelParticipants: readonly Participant[] = [
  { id: 'p1', side: 'a', stats: { attack: 5, defense: 5, agility: 5 } },
  { id: 'p2', side: 'b', stats: { attack: 5, defense: 5, agility: 5 } },
];
