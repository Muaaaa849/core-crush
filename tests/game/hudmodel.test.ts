import { describe, expect, it } from 'vitest';
import { hudModel } from '../../src/game/hud';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import { localRoster, rosterMatch } from '../../src/game/match';

const roster = localRoster('1v2', 'volt');
const state = () => createInitialState(rosterMatch(roster, 'a'), config);
describe('HUD display model', () => {
  it('keeps actual adjusted HP, player names and quarter-filled five cost cells', () => {
    const s = state(); s.players[0].hp = 0.01; s.players[0].cost = 13;
    const before = structuredClone(s), m = hudModel(s, config, 'p1', roster);
    expect(m.hp).toBe('あなた P1 VOLT HP 0.1/150.4');
    expect(m.hpRatio).toBeCloseTo(0.01 / 150.4);
    expect(m.cost).toBe('コスト 3.25 / 5');
    expect(m.costCells).toEqual([1, 1, 1, 0.25, 0]);
    expect(m.stepCells).toEqual([1, 1]); expect(s).toEqual(before);
  });
  it.each([[0, '8', 'calm'], [3, '5', 'panic'], [5, '3', 'rage'], [7.11, '0.8', 'rage']])('danger at %s seconds', (elapsed, seconds, face) => {
    const s = state(); s.danger = { side: 'a', expiresAt: s.now + config.dangerDuration - Number(elapsed) * config.timeUnitsPerSecond };
    const m = hudModel(s, config, 'p1', roster);
    expect(m.dangerSeconds).toBe(seconds); expect(m.face).toBe(face);
    expect(m.clock).toContain('味方陣');
  });
  it('scores A/B consistently when local player is B, and preserves lock and flight targets', () => {
    const s = state(); s.match.wins = { a: 1, b: 2 };
    s.players[1].lockTarget = 'p1'; s.ball = { mode: 'held', owner: 'p3' };
    const m = hudModel(s, config, 'p3', roster);
    expect(m.round).toBe('ラウンド1　残り 3:00'); expect(m.wins).toEqual({ a: 1, b: 2 });
    expect(m.lock).toContain('敵 P1 VOLT');
    expect(m.others.join(' ')).toContain('味方 P4');
  });
});
