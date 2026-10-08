import { describe, expect, it } from 'vitest';
import { evenMatch } from '../fixtures';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command } from '../../src/sim/types';

describe('M8-7 long random matches', () => {
  for (const mode of ['1v1', '1v2', '2v2'] as const) it.each([11, 23, 49])(`T10-12 ${mode} seed %i: living players keep moving and every completed round resets or ends the match`, seed => {
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    let state = createInitialState(evenMatch(mode, 'a'));
    let seq = 0, completed = 0, resets = 0;
    const stagnant = state.players.map(() => 0);
    const actions = ['primary', 'secondary', 'step', 'summon', 'feint', 'cycle-target'] as const;
    const ticks = 4 * (c.roundDuration + c.roundResultDuration + c.ballStartDelay) / c.tick;
    for (let tick = 0; tick < ticks && state.match.phase !== 'over'; tick++) {
      const commands: Command[] = [];
      for (const p of state.players) {
        const at = state.now + Math.floor(random() * c.tick);
        if (random() < 0.08) {
          const angle = random() * Math.PI * 2;
          commands.push({ kind: 'move', player: p.id, at, seq: seq++, x: Math.cos(angle), z: Math.sin(angle) });
          commands.push({ kind: 'keys', player: p.id, at, seq: seq++, forward: Math.floor(random() * 3) - 1, right: Math.floor(random() * 3) - 1 });
        }
        if (random() < 0.03) commands.push({ kind: 'yaw', player: p.id, at, seq: seq++, yaw: random() * Math.PI * 2 });
        if (random() < 0.06) commands.push({ kind: actions[Math.floor(random() * actions.length)], player: p.id, at, seq: seq++ });
      }
      const previous = state;
      const result = step(state, commands);
      state = result.state;
      for (const event of result.events) {
        if (event.kind === 'round-end') completed++;
        if (event.kind === 'spawn' && state.match.roundStartsAt === event.at + c.ballStartDelay) {
          resets++;
          expect(state.players.every(p => p.hp === p.maxHp && p.cost === c.initialCost && p.stepPoints === c.maxStepPoints)).toBe(true);
        }
      }
      if (state.match.phase !== 'play') continue;
      expect(['a', 'b'].every(side => state.players.some(p => p.side === side && p.hp > 0))).toBe(true);
      expect(state.now).toBeLessThanOrEqual(state.match.roundEndsAt);
      for (let i = 0; i < state.players.length; i++) {
        const p = state.players[i], before = previous.players[i];
        const depth = p.side === 'a' ? p.position.z : -p.position.z;
        const freeToWalk = state.now >= state.match.roundStartsAt && previous.match.phase === 'play'
          && previous.match.roundStartsAt === state.match.roundStartsAt && before.hp > 0 && p.hp > 0
          && p.action?.kind !== 'step' && before.action?.kind !== 'step'
          && p.action?.kind !== 'hitstun' && before.action?.kind !== 'hitstun'
          && Math.hypot(p.move.x, p.move.z) > 0
          && Math.abs(p.position.x) < c.playerHalfWidth - c.walkSpeed * c.tick / c.timeUnitsPerSecond
          && depth > c.playerMinDepth + c.walkSpeed * c.tick / c.timeUnitsPerSecond
          && depth < c.playerMaxDepth - c.walkSpeed * c.tick / c.timeUnitsPerSecond;
        const moved = p.position.x !== before.position.x || p.position.z !== before.position.z;
        stagnant[i] = freeToWalk && !moved ? stagnant[i] + state.now - previous.now : 0;
        expect(stagnant[i], `${p.id} stopped while alive at ${state.now}`).toBeLessThan(c.timeUnitsPerSecond);
      }
    }
    expect(completed).toBeGreaterThan(0);
    expect(resets).toBeGreaterThan(0);
    expect(state.match.phase === 'over' || resets >= 3).toBe(true);
    expect(completed - resets).toBe(state.match.phase === 'over' || state.match.phase === 'result' ? 1 : 0);
  });
});
