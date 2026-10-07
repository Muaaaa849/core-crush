// スライス5の操作側（progress.md I1・I2、0007）：マウス量の換算と、防御受付中の視点減衰。
import { describe, expect, it } from 'vitest';
import { DefenseLook, mouseDegrees } from '../../src/game/look';
import type { SimEvent } from '../../src/sim/types';

describe('mouseDegrees', () => {
  it('I1: right is positive, pulling toward the player (screen down) is positive, in degrees', () => {
    expect(mouseDegrees(10, 5, 0.044)).toEqual({ rightDegrees: 10 * 0.044, pullDegrees: 5 * 0.044 });
    expect(mouseDegrees(-10, -5, 0.044)).toEqual({ rightDegrees: -10 * 0.044, pullDegrees: -5 * 0.044 });
  });
});

describe('DefenseLook', () => {
  const start: SimEvent = { kind: 'defense-start', at: 1000, player: 'p1', defense: 'parry', endsAt: 10_000 };

  it('I2: 25% from my defense-start until the window ends', () => {
    const look = new DefenseLook('p1');
    expect(look.multiplier(0)).toBe(1);
    look.observe([start]);
    expect(look.multiplier(1000)).toBe(0.25);
    expect(look.multiplier(9999)).toBe(0.25);
    expect(look.multiplier(10_000)).toBe(1);
  });

  it("I2: the opponent's defense does not damp my camera", () => {
    const look = new DefenseLook('p1');
    look.observe([{ ...start, player: 'p2' }]);
    expect(look.multiplier(2000)).toBe(1);
  });

  it('I2: being hit or an explosion clears the damping at once', () => {
    for (const end of [
      { kind: 'hit', at: 2000, player: 'p1', damage: 10, position: { x: 0, y: 1, z: 0 } },
      { kind: 'explosion', at: 2000, side: 'p1' },
    ] as SimEvent[]) {
      const look = new DefenseLook('p1');
      look.observe([start]);
      look.observe([end]);
      expect(look.multiplier(3000)).toBe(1);
    }
  });
});
