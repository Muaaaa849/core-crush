import { expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import { CHARACTERS, type CharacterId } from '../../src/game/characters';
import { rosterMatch } from '../../src/game/match';
import { createInitialState, step } from '../../src/sim/sim';
import { defaultConfig as c } from '../../src/sim/config';
import { createLooseBall } from '../../src/sim/ball';
import type { Command, SkillId } from '../../src/sim/types';
import { defense, incoming } from './cover-helpers';
import { one, ready, skill } from './skills-helpers';

for (const skills of [['overcharge', 'blink'], ['chain', 'charge'], ['charge', 'charge']] as const) {
  it.each([[0, 4], [2000, 2], [5000, 1]])(`K14-19 K14-32: ${skills} catch grade offset %d rewards exactly once`, (offset, ordinary) => {
    for (const cost of [0, 19]) {
      const s = incoming(0); defense(s, 'p1', 'catch', s.now - offset); s.players[0].skills = skills;
      s.players[0].cost = cost;
      const result = one(s).state.players[0];
      const reward = offset === 2000 && skills.includes('charge' as never) ? 3 : ordinary;
      expect(result.cost).toBe(Math.min(20, cost + reward));
      expect(result.hp).toBe(offset === 0 ? 83 : 80);
    }
  });
}
it('K14-19: active cover rewards only the successful defender; parry reward is unchanged', () => {
  const s = incoming(0); s.players[0].position.x = 5;
  defense(s, 'p2', 'catch', s.now - 2000); s.players[1].skills = ['charge', 'economy'];
  const result = one(s).state;
  expect(result.players[1].cost).toBe(3); expect(result.players[0].cost).toBe(4);
  const parry = incoming(0); defense(parry, 'p1', 'parry', parry.now - 2000); parry.players[0].skills = ['charge', 'economy'];
  expect(one(parry).state.players[0].cost).toBe(1);
});
for (const economy of [false, true]) it.each([2, 3, 4])(`K14-20: economy=${economy}, balance=%d requires actual summon cost`, balance => {
  const s = ready(); s.players[0].cost = balance; if (economy) s.players[0].skills = ['economy', 'economy'];
  s.ball = createLooseBall({ x: 5, y: 1, z: 8 }, s.now, s.now, c);
  const result = one(s, [{ kind: 'summon', player: 'p1', seq: 1, at: s.now }]);
  const accepted = balance >= (economy ? 3 : 4);
  expect(result.state.ball.mode).toBe(accepted ? 'held' : 'loose');
  expect(result.state.players[0].cost).toBe(accepted ? balance - (economy ? 3 : 4) : balance);
  expect(result.state.danger).toEqual(s.danger);
});
it.each(['enemy', 'held', 'flight', 'busy', 'waiting', 'simultaneous'] as const)('K14-20: %s summon retains existing eligibility and only winner pays', mode => {
  const s = ready(); s.players.forEach(p => { p.skills = ['charge', 'economy']; p.cost = 3; });
  s.ball = createLooseBall({ x: 5, y: 1, z: mode === 'enemy' ? -8 : 8 }, s.now, s.now, c);
  if (mode === 'held') s.ball = { mode: 'held', owner: 'p3' };
  if (mode === 'flight') s.ball = incoming(5000).ball;
  if (mode === 'busy') s.players[0].action = { kind: 'recovery', endsAt: s.now + 100 };
  if (mode === 'waiting') { s.danger = null; if (s.ball.mode === 'loose') s.ball.startsAt += 5000; }
  const commands: Command[] = [{ kind: 'summon', player: 'p1', seq: 1, at: s.now }];
  if (mode === 'simultaneous') commands.unshift({ kind: 'summon', player: 'p2', seq: 0, at: s.now });
  const result = one(s, commands);
  expect(result.state.players.map(p => p.cost)).toEqual(mode === 'simultaneous' ? [0, 3, 3, 3] : [3, 3, 3, 3]);
});
it.each(['a', 'b'] as const)('K14-20: economy summons own-side loose on %s with the same clock', side => {
  const s = ready(), p = s.players.find(p => p.side === side)!; p.skills = ['charge', 'economy']; p.cost = 3;
  s.ball = createLooseBall({ x: 5, y: 1, z: side === 'a' ? 8 : -8 }, s.now, s.now, c);
  const result = one(s, [{ kind: 'summon', player: p.id, seq: 0, at: s.now }]);
  expect(result.state.ball).toEqual({ mode: 'held', owner: p.id });
  expect(result.state.players.find(r => r.id === p.id)!.cost).toBe(0); expect(result.state.danger).toEqual(s.danger);
});
it('K14-21: test-only PP definition is inert on presses, with automatic passives and no official PP', () => {
  const definitions = { ...CHARACTERS, probe: { ...CHARACTERS.volt, stats: { attack: 5, defense: 5, agility: 5 }, skills: ['charge', 'economy'] as const } };
  const options = rosterMatch([{ id: 'p1', side: 'a', characterId: 'probe' as CharacterId }, { id: 'p3', side: 'b', characterId: 'volt' }], 'a', definitions as typeof CHARACTERS);
  const s = createInitialState(options); s.now = c.ballStartDelay; s.danger = { side: 'a', expiresAt: s.now + c.dangerDuration };
  s.ball = { mode: 'held', owner: 'p1' }; s.players[0].action = { kind: 'feint', startedAt: s.now - 1, endsAt: s.now + 100 };
  expect(one(s, [skill(s), skill(s, 2)])).toEqual(one(s));
  expect(Object.keys(CHARACTERS)).toEqual(['volt', 'echo', 'anchor', 'switch']);
});
it.each([['blink', 'charge'], ['charge', 'blink'], ['overcharge', 'blink'], ['blink', 'overcharge']] as [SkillId, SkillId][])(
  'K14-21: arbitrary AA/AP skill order %j works through the same sim', (...skills) => {
    const s = ready(); s.players[0].skills = skills;
    const slot = skills[0] === 'charge' ? 2 : 1;
    const result = one(s, [skill(s, slot)]).state.players[0];
    expect(skills[slot - 1] === 'blink' ? result.position.z === 4 : result.overcharge !== null).toBe(true);
  });
it('K14-32: Bot normal and restored thought never uses skills and cannot mutate sim directly', () => {
  for (const skills of [['overcharge', 'blink'], ['charge', 'economy']] as [SkillId, SkillId][]) {
    let state = ready(); state.players.forEach(p => { p.skills = skills; });
    const bot = new Bot('p1');
    for (let i = 0; i < 180; i++) {
      const before = structuredClone(state), saved = bot.snapshot();
      const commands = bot.think(state), restored = new Bot('p1'); restored.restore(saved);
      expect(restored.think(state)).toEqual(commands);
      expect(commands.every(c => c.kind !== 'skill')).toBe(true); expect(state).toEqual(before);
      state = step(state, commands).state;
    }
  }
});
