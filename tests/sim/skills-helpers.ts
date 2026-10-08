import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import type { Command, SimState, SkillSlot } from '../../src/sim/types';
import { active } from './cover-helpers';

export const skill = (state: SimState, slot: SkillSlot = 1, seq = 0): Command => ({ kind: 'skill', slot, player: 'p1', at: state.now, seq });
export function ready() { const s = active(); s.players[0].cost = 20; s.players[0].lockTarget = 'p3'; return s; }
export const one = (s: SimState, commands: Command[] = []) => step(s, commands, { ...c, tick: 1 });
