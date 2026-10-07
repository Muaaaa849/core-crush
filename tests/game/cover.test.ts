import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import { Hud } from '../../src/game/hud';
import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import { flight, incoming, F } from '../sim/cover-helpers';

describe('M2 cover bot and target display', () => {
  it('T10-23: non-target bot walks two metres ball-side of its teammate using only commands', () => {
    const s = incoming(8 * F); s.players[0].position.x = 3;
    const before = structuredClone(s), commands = new Bot('p2').think(s);
    expect(commands.find(cmd => cmd.kind === 'move')).toMatchObject({ x: expect.any(Number), z: expect.any(Number) });
    const move = commands.find(cmd => cmd.kind === 'move');
    if (move?.kind !== 'move') throw Error('move');
    const dx = flight(s).position.x - s.players[0].position.x, dz = flight(s).position.z - s.players[0].position.z;
    const distance = Math.hypot(dx, dz);
    const x = 3 + 2 * dx / distance, z = 8 + 2 * dz / distance;
    expect(move.x).toBeCloseTo(x / Math.hypot(x, z - 8)); expect(move.z).toBeCloseTo((z - 8) / Math.hypot(x, z - 8));
    expect(commands.every(cmd => cmd.player === 'p2')).toBe(true); expect(s).toEqual(before);
    expect(new Bot('p1').think(s).some(cmd => cmd.kind === 'primary' || cmd.kind === 'secondary')).toBe(false);
  });
  it.each([2, 3, 6, 7])('T10-23: equal-speed prediction at %iF attempts defense only from 3 through 6F', frames => {
    const s = incoming(frames * F); const commands = new Bot('p2').think(s);
    expect(commands.filter(cmd => cmd.kind === 'secondary')).toHaveLength(frames >= 3 && frames <= 6 ? 1 : 0);
    if (frames >= 3 && frames <= 6) {
      expect(commands.find(cmd => cmd.kind === 'yaw')).toMatchObject({ yaw: 0 });
      expect(commands.find(cmd => cmd.kind === 'move')).toMatchObject({ x: 0, z: 0 });
      expect(step(s, commands).events.some(e => e.kind === 'catch')).toBe(false);
    }
  });
  it('T10-23: attempts once per flight, alternates even on failure, and stops old movement', () => {
    const s = incoming(4 * F), bot = new Bot('p2');
    expect(bot.think(s).filter(cmd => cmd.kind === 'secondary')).toHaveLength(1);
    s.now++; expect(bot.think(s).some(cmd => cmd.kind === 'primary' || cmd.kind === 'secondary')).toBe(false);
    flight(s).releasedAt++; flight(s).segmentAt = s.now;
    expect(bot.think(s).filter(cmd => cmd.kind === 'primary')).toHaveLength(1);
    bot.reset(); expect(bot.think(s).filter(cmd => cmd.kind === 'secondary')).toHaveLength(1);
    s.players[1].move.x = 1; s.ball = { mode: 'held', owner: 'p3' };
    expect(bot.think(s)).toContainEqual(expect.objectContaining({ kind: 'move', x: 0, z: 0 }));
  });
  it('T10-23: HUD separates selection from self, teammate and untargeted flights', () => {
    const s = incoming(), el = { textContent: '' } as HTMLElement;
    const hud = new Hud(el, c, 'p1'); s.players[0].lockTarget = 'p4';
    hud.update(s, [], 0); expect(el.textContent).toContain('ロック：敵 P4'); expect(el.textContent).toContain('飛行対象：あなた');
    flight(s).attack!.target = 'p2'; hud.update(s, [], 0); expect(el.textContent).toContain('飛行対象：味方 P2');
    flight(s).attack!.target = null; hud.update(s, [], 0); expect(el.textContent).toContain('飛行対象：なし');
  });
});
