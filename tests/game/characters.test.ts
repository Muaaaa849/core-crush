// M3-2（0013 C12）：キャラ定義・ローカルのロスター・能力の解決・名前。スキルは未実装表示だけ。
import { describe, expect, it } from 'vitest';
import { CHARACTERS, SKILLS, playerLabel, skillLines, type CharacterId } from '../../src/game/characters';
import { localRoster, rosterMatch } from '../../src/game/match';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { MatchMode } from '../../src/sim/types';

const ids = Object.keys(CHARACTERS) as CharacterId[];
const modes: MatchMode[] = ['1v1', '1v2', '2v2'];

describe('C12-1 definitions and derived values', () => {
  it('C12-1a: four characters match characters.md, with valid stats and two skill slots, and no HP field', () => {
    expect(ids).toEqual(['volt', 'echo', 'anchor', 'switch']);
    expect(Object.values(CHARACTERS).map(d => [d.name, d.stats.attack, d.stats.defense, d.stats.agility, ...d.skills])).toEqual([
      ['VOLT', 7, 4, 4, 'overcharge', 'blink'],
      ['ECHO', 4, 6, 5, 'phantom', 'boost-ring'],
      ['ANCHOR', 4, 7, 4, 'chain', 'charge'],
      ['SWITCH', 5, 4, 6, 'trap', 'energy-bolt'],
    ]);
    for (const d of Object.values(CHARACTERS)) {
      expect('hp' in d || 'maxHp' in d).toBe(false);
      for (const s of d.skills) expect(SKILLS[s]).toBeDefined();
    }
    expect(() => rosterMatch([{ id: 'p1', side: 'a', characterId: 'nope' as CharacterId }, { id: 'p3', side: 'b', characterId: 'echo' }], 'a')).toThrow();
    expect(() => rosterMatch([{ id: 'p1', side: 'a', characterId: 'volt' }, { id: 'p1', side: 'b', characterId: 'echo' }], 'a')).toThrow();
  });

  it('C12-1b: maxHp comes from defense (94/106/112/94) and the 1v2 solo side gets ×1.6', () => {
    const expected = { volt: 94, echo: 106, anchor: 112, switch: 94 };
    for (const id of ids) {
      const duel = createInitialState(rosterMatch(localRoster('1v1', id), 'a'), c);
      expect(duel.players[0].maxHp).toBeCloseTo(expected[id]); expect(duel.players[0].hp).toBe(duel.players[0].maxHp);
      const solo = createInitialState(rosterMatch(localRoster('1v2', id), 'a'), c);
      expect(solo.players[0].maxHp).toBeCloseTo(expected[id] * 1.6);
      expect(solo.players[0].stats).toEqual(CHARACTERS[id].stats);
    }
    const flipped = createInitialState(rosterMatch([{ id: 'p1', side: 'a', characterId: 'echo' }, { id: 'p2', side: 'a', characterId: 'anchor' },
      { id: 'p3', side: 'b', characterId: 'volt' }], 'a'), c);
    expect(flipped.players.find(p => p.id === 'p3')!.maxHp).toBeCloseTo(94 * 1.6);
  });

  it('C12-1d: time-out compares remaining/starting team HP, solo VOLT 75.2/150.4 draws with ECHO+ANCHOR 109/218', () => {
    const state = createInitialState(rosterMatch([{ id: 'p1', side: 'a', characterId: 'volt' },
      { id: 'p3', side: 'b', characterId: 'echo' }, { id: 'p4', side: 'b', characterId: 'anchor' }], 'a'), c);
    state.now = state.match.roundEndsAt - c.frame;
    state.ball = { mode: 'held', owner: 'p1' }; state.danger = { side: 'a', expiresAt: state.now + c.dangerDuration };
    state.players[0].hp = state.players[0].maxHp / 2; state.players[1].hp = 0; state.players[2].hp = 109; // 94×1.6は浮動小数で75.2×2と一致しないため実値の半分を使う
    const { events } = step(state, [], c);
    expect(events.find(e => e.kind === 'round-end')).toMatchObject({ winner: null, reason: 'time' });
  });
});

describe('C12-2 local roster', () => {
  it.each(modes)('C12-2a: %s gives p1 the chosen character and fixed bots (p2 ECHO, p3 ANCHOR, p4 SWITCH)', mode => {
    for (const id of ids) {
      const roster = localRoster(mode, id);
      expect(roster.map(e => e.id)).toEqual({ '1v1': ['p1', 'p3'], '1v2': ['p1', 'p3', 'p4'], '2v2': ['p1', 'p2', 'p3', 'p4'] }[mode]);
      expect(roster[0]).toEqual({ id: 'p1', side: 'a', characterId: id });
      for (const e of roster.slice(1)) expect(e.characterId).toBe({ p2: 'echo', p3: 'anchor', p4: 'switch' }[e.id as 'p2']);
      const state = createInitialState(rosterMatch(roster, 'a'), c);
      expect(state.players.map(p => p.stats)).toEqual(roster.map(e => CHARACTERS[e.characterId].stats));
    }
  });

  it('C12-2b: labels give relation, player ID and character, so the same character stays distinguishable', () => {
    const roster = localRoster('2v2', 'anchor');
    expect(roster.map(e => playerLabel(roster, 'p1', e.id))).toEqual(['あなた P1 ANCHOR', '味方 P2 ECHO', '敵 P3 ANCHOR', '敵 P4 SWITCH']);
  });
});

describe('C12-5 skills are shown as unimplemented', () => {
  it('C12-5a: active slots show their key, passives say always-on, and all are unimplemented', () => {
    expect(skillLines('volt')).toEqual(['[E] オーバーチャージ — 未実装', '[R] ブリンク — 未実装']);
    expect(skillLines('anchor')).toEqual(['[E] チェーンハンド — 未実装', '常時：蓄勢 — 未実装（goodキャッチの獲得量増加）']);
  });

  it('C12-5b: an extra definition with other stats works through the same conversion without sim changes', () => {
    const test = { ...CHARACTERS, probe: { name: 'PROBE', stats: { attack: 10, defense: 1, agility: 10 }, skills: ['charge', 'blink'] as const,
      colors: { base: '#ffffff', emissive: '#ffffff' } } };
    const state = createInitialState(rosterMatch([{ id: 'p1', side: 'a', characterId: 'probe' as CharacterId },
      { id: 'p3', side: 'b', characterId: 'volt' }], 'a', test as typeof CHARACTERS), c);
    expect(state.players[0].maxHp).toBeCloseTo(76);
  });
});
