import { expect, it } from 'vitest';
import { createLooseBall } from '../../src/sim/ball';
import { defaultConfig as c } from '../../src/sim/config';
import type { Command, SimState } from '../../src/sim/types';
import { ready, one } from './skills-helpers';

const ranks = ['step', 'catch', 'throw', 'skill1', 'skill2', 'feint', 'summon'] as const;
type Rank = typeof ranks[number];
function command(s: SimState, rank: Rank, seq: number): Command {
  const base = { player: 'p1' as const, at: s.now, seq };
  if (rank === 'skill1' || rank === 'skill2') return { ...base, kind: 'skill', slot: rank === 'skill1' ? 1 : 2 };
  return { ...base, kind: rank === 'catch' ? 'secondary' : rank === 'throw' ? 'primary' : rank };
}
for (const holding of [false, true]) for (const [i, high] of ranks.entries()) for (const low of ranks.slice(i + 1)) {
  it(`K14-3: ${high} + ${low}, holding=${holding}, honors first legal action regardless of seq/array order`, () => {
    const s = ready(); s.players[0].move = { x: 1, z: 0 };
    if (!holding) s.ball = createLooseBall({ x: 5, y: 1, z: 8 }, s.now, s.now, c);
    const accepted = holding ? ['step', 'throw', 'skill1', 'skill2', 'feint'] : ['step', 'catch', 'throw', 'skill1', 'skill2', 'summon'];
    const winner = accepted.includes(high) ? high : accepted.includes(low) ? low : null;
    const a = one(s, [command(s, high, 10), command(s, low, 1)]);
    const b = one(s, [command(s, low, 20), command(s, high, 0)]);
    expect(a).toEqual(b);
    expect(a.state.players[0].action?.kind ?? null).toBe(winner === 'step' ? 'step' : winner === 'catch' ? 'catch'
      : winner === 'throw' ? holding ? 'windup' : 'parry' : winner === 'feint' ? 'feint' : null);
    expect(a.state.players[0].overcharge !== null).toBe(winner === 'skill1');
    expect(a.state.players[0].cost).toBe(winner === 'skill2' ? 14 : winner === 'feint' ? 19 : winner === 'summon' ? 16 : 20);
    if (winner === 'summon') expect(a.state.ball).toEqual({ mode: 'held', owner: 'p1' });
    expect(a.events.filter(e => e.kind === 'skill-rejected')).toHaveLength([high, low].filter(r => r.startsWith('skill') && r !== winner).length);
  });
}
