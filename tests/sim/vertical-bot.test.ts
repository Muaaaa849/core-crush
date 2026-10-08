import { expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import type { Command, SimState } from '../../src/sim/types';
import { active, incoming } from './cover-helpers';

it.each(['holding', 'cover', 'loose', 'aimed'] as const)('V15-24: Bot %s snapshot/restore preserves commands without pitch/aim/skill', mode => {
  const state: SimState = mode === 'cover' || mode === 'aimed' ? incoming(4000, mode === 'aimed' ? null : 'p1') : active();
  const id = mode === 'holding' ? 'p1' : 'p2', bot = new Bot(id);
  if (mode === 'loose') state.ball = { mode: 'loose', position: { x: 0, y: 0.325, z: 4 }, startsAt: state.now,
    velocity: { x: 0, y: 0, z: 0 }, motionAt: state.now, nextPhysicsAt: state.now + 1000 };
  const memory = bot.snapshot(), normal: Command[] = [], restored: Command[] = [];
  for (const offset of [0, 1000, 90000, 91000]) { const s = structuredClone(state); s.now += offset; normal.push(...bot.think(s)); }
  bot.restore(JSON.parse(JSON.stringify(memory)));
  for (const offset of [0, 1000, 90000, 91000]) {
    const s = structuredClone(state); s.now += offset; s.players.forEach(p => { p.pitch = 1.2; }); restored.push(...bot.think(s));
  }
  expect(restored).toEqual(normal);
  expect(restored.some(cmd => cmd.kind === 'pitch' || cmd.kind === 'skill' || cmd.kind === 'primary' && cmd.aim)).toBe(false);
});
