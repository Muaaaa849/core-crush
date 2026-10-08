import { expect, it } from 'vitest';
import { CHARACTERS } from '../../src/game/characters';
import { localRoster, rosterMatch } from '../../src/game/match';
import { createInitialState } from '../../src/sim/sim';
import type { MatchMode, MatchOptions } from '../../src/sim/types';

it.each(['1v1', '1v2', '2v2'] as MatchMode[])('K14-1: %s clones stats and skills, with stable ID order and no presentation fields', mode => {
  const roster = localRoster(mode, 'volt'), options = rosterMatch(roster, 'a');
  const initial = createInitialState(options);
  expect(createInitialState({ ...options, participants: [...options.participants].reverse() })).toEqual(initial);
  for (const [i, p] of options.participants.entries()) {
    const definition = CHARACTERS[roster[i].characterId];
    expect(p.stats).toEqual(definition.stats); expect(p.stats).not.toBe(definition.stats);
    expect(p.skills).toEqual(definition.skills); expect(p.skills).not.toBe(definition.skills);
    expect(initial.players[i].skills).toEqual(p.skills); expect(initial.players[i].skills).not.toBe(p.skills);
    expect(initial.players[i].skillReadyAt).toEqual([0, 0]); expect(initial.players[i].overcharge).toBeNull();
    expect(Object.keys(p).sort()).toEqual(['id', 'side', 'skills', 'stats']);
  }
});

it.each([undefined, [], ['blink'], ['blink', 'charge', 'economy'], ['blink', 'unknown'], [1, 'blink'], new Array(2)])(
  'K14-1: rejects missing or invalid skills %j without completion', skills => {
    const options = rosterMatch(localRoster('1v1', 'volt'), 'a');
    const broken = { ...options, participants: options.participants.map((p, i) => i ? p : { ...p, skills }) };
    expect(() => createInitialState(broken as MatchOptions)).toThrow(/スキル/);
  });
