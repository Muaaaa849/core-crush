// プレイヤーはどんな入力でも移動範囲（金網の内側、自陣）から出ない（rules.md M1細則「プレイエリア」）。
import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, PlayerId } from '../../src/sim/types';

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('player bounds under random play', () => {
  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('seed %i', (seed) => {
    const random = rng(seed);
    let state = createInitialState(seed % 2 ? 'p1' : 'p2');
    let seq = 0;
    for (let tick = 0; tick < 60 * 40; tick++) {
      const commands: Command[] = [];
      for (const player of ['p1', 'p2'] as PlayerId[]) {
        if (random() < 0.15) {
          const angle = random() * Math.PI * 2;
          commands.push({ kind: 'move', player, at: state.now + Math.floor(random() * 1000), seq: seq++, x: Math.cos(angle), z: Math.sin(angle) });
        }
        if (random() < 0.05) commands.push({ kind: 'yaw', player, at: state.now, seq: seq++, yaw: random() * Math.PI * 2 });
        const r = random();
        const kind = r < 0.02 ? 'step' : r < 0.04 ? 'primary' : r < 0.05 ? 'secondary' : r < 0.055 ? 'summon' : null;
        if (kind) commands.push({ kind, player, at: state.now + Math.floor(random() * 1000), seq: seq++ } as Command);
      }
      state = step(state, commands).state;
      for (const p of state.players) {
        const depth = p.side === 'p1' ? p.position.z : -p.position.z;
        expect(Math.abs(p.position.x), `${p.id} x at ${state.now}`).toBeLessThanOrEqual(config.playerHalfWidth + 1e-9);
        expect(depth, `${p.id} depth at ${state.now}`).toBeGreaterThanOrEqual(config.playerMinDepth - 1e-9);
        expect(depth, `${p.id} depth at ${state.now}`).toBeLessThanOrEqual(config.playerMaxDepth + 1e-9);
      }
    }
  });
});
