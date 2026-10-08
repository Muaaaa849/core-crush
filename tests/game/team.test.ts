import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import { cameraModeFor, cameraPlayerFor } from '../../src/game/camera';
import { Hud } from '../../src/game/hud';
import { localRoster, rosterMatch } from '../../src/game/match';
import { rosterOf } from '../fixtures';
import { SimRunner } from '../../src/game/runner';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';

describe('slice one local teams', () => {
  it.each(['1v1', '1v2', '2v2'] as const)('T10-10 T10-11: %s has one human and every other participant uses the same Bot', mode => {
    const options = rosterMatch(localRoster(mode, 'volt'), 'a');
    const runner = new SimRunner(createInitialState(options, c), c, options.participants.filter(p => p.id !== 'p1').map(p => new Bot(p.id)));
    expect(options.participants.map(p => p.id)).toEqual(mode === '1v1' ? ['p1', 'p3'] : mode === '1v2' ? ['p1', 'p3', 'p4'] : ['p1', 'p2', 'p3', 'p4']);
    runner.advance(1000 / 60); runner.restart(createInitialState(rosterMatch(localRoster(mode, 'volt'), 'b'), c));
    expect(runner.state.players.map(p => [p.id, p.side])).toEqual(options.participants.map(p => [p.id, p.side]));
  });
  it.each(['p2', 'p3'] as const)('T10-10: teammate and enemy Bot %s throw only toward their lock enemy', id => {
    const state = createInitialState(rosterMatch(localRoster('2v2', 'volt'), 'a'), c), bot = new Bot(id);
    state.now = c.ballStartDelay; state.ball = { mode: 'held', owner: id };
    state.danger = { side: state.players.find(p => p.id === id)!.side, expiresAt: state.now + c.dangerDuration };
    bot.think(state); state.now += 90_000;
    const commands = bot.think(state); expect(commands.some(command => command.kind === 'primary')).toBe(true);
    let after = step(state, commands).state;
    for (let i = 0; i < 9; i++) after = step(after, []).state;
    expect(after.ball.mode).toBe('flight');
    if (after.ball.mode === 'flight') expect(after.ball.attack!.target).toBe(state.players.find(p => p.id === id)!.lockTarget);
  });
  it('T10-10: only the nearest eligible teammate pursues loose balls, including the human in the comparison', () => {
    const state = createInitialState(rosterMatch(localRoster('2v2', 'volt'), 'a'), c); state.now = c.ballStartDelay;
    state.danger = { side: 'a', expiresAt: state.now + c.dangerDuration };
    state.players[1].move = { x: 1, z: 0 };
    const bot = new Bot('p2');
    expect(bot.think(state)).toMatchObject([{ kind: 'move', x: 0, z: 0 }]);
    state.players[0].action = { kind: 'hitstun', startedAt: state.now, moveEndsAt: state.now + 12_000, endsAt: state.now + 24_000, velocity: { x: 0, z: 0 } };
    const moving = bot.think(state); expect(moving).toMatchObject([{ kind: 'move', x: -1, z: 0 }]);
    const after = step(state, moving).state; after.ball = { mode: 'held', owner: 'p3' };
    expect(bot.think(after)).toMatchObject([{ kind: 'move', x: 0, z: 0 }]);
  });
  it('T10-11: HUD scores by local side, names teammates and enemies, and shows KO spectating', () => {
    const state = createInitialState(rosterMatch(localRoster('2v2', 'volt'), 'a'), c), el = { textContent: '' } as HTMLElement;
    state.players[0].hp = 0; state.match.wins.a = 1;
    new Hud(el, c, 'p1', rosterOf(state)).update(state, [{ kind: 'round-end', at: 0, winner: 'a', reason: 'ko' }], 0);
    expect(el.textContent).toContain('ラウンド勝利'); expect(el.textContent).toContain('味方 P2');
    expect(el.textContent).toContain('敵 P3'); expect(el.textContent).toContain('敵 P4');
    expect(el.textContent).toContain('KO'); expect(el.textContent).toContain('観戦');
    expect(el.textContent).toContain('味方 1 − 0 敵');
  });
  it('T10-11: friendly possession stays TPS; KO follows a living teammate in TPS and returns next round', () => {
    const state = createInitialState(rosterMatch(localRoster('2v2', 'volt'), 'a'), c); state.ball = { mode: 'held', owner: 'p2' };
    expect(cameraModeFor('tps', state, 'p1')).toBe('tps');
    state.players[0].hp = 0; state.players[0].action = { kind: 'recovery', endsAt: 1000 };
    expect(cameraPlayerFor(state, 'p1')).toBe('p2'); expect(cameraModeFor('fps', state, 'p1')).toBe('tps');
    state.players[0].hp = 100; state.players[0].action = null;
    expect(cameraPlayerFor(state, 'p1')).toBe('p1');
  });
  it('T10-11: rematch resets Bot hold time, shot cycle and sequence state', () => {
    const bot = new Bot('p3'), runner = new SimRunner(createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'b'), c), c, [bot]);
    const state = runner.state; state.ball = { mode: 'held', owner: 'p3' }; state.danger = { side: 'b', expiresAt: c.dangerDuration };
    bot.think(state); state.now = 90_000; const first = bot.think(state);
    state.ball = { mode: 'held', owner: 'p1' }; bot.think(state);
    state.ball = { mode: 'held', owner: 'p3' }; bot.think(state); state.now += 90_000;
    expect(bot.think(state)).toContainEqual(expect.objectContaining({ kind: 'keys', right: -1 }));
    runner.restart(createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'b'), c));
    runner.state.ball = { mode: 'held', owner: 'p3' }; runner.state.danger = { side: 'b', expiresAt: c.dangerDuration };
    expect(bot.think(runner.state)).toEqual([]); runner.state.now = 90_000;
    expect(bot.think(runner.state)).toEqual(first);
  });
});
