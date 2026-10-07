// 決定0006：ステージ約1.3倍・球の直径0.65m・基本球速1.3倍。sim の寸法がステージの見た目と一致すること。
import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';

describe('dimensions (decision 0006)', () => {
  it('uses the enlarged court, cage and ball', () => {
    expect(config.ballDiameter).toBe(0.65);
    expect({ x: config.playerHalfWidth, min: config.playerMinDepth, max: config.playerMaxDepth }).toEqual({ x: 10.1, min: 0.5, max: 17.6 });
    expect({ x: config.ballHalfWidth, z: config.ballHalfDepth }).toEqual({ x: 6.175, z: 15.275 });
    expect({ x: config.guidanceHalfWidth, z: config.guidanceHalfDepth }).toEqual({ x: 10.175, z: 17.675 });
    expect(config.supply.a).toEqual({ x: 0, y: 0.325, z: 7.8 });
    expect(config.supply.b).toEqual({ x: 0, y: 0.325, z: -7.8 });
  });

  it('scales base shot speeds by 1.3 and keeps walking, step and the flight-time rules', () => {
    expect(config.shotSpeed).toEqual({ straight: 36.4, left: 29.9, right: 29.9, upper: 22.1 });
    expect(config.walkSpeed).toBe(5);
    expect(config.stepDistance).toBe(2.8);
    expect(config.minimumBallSpeed).toBe(6.5);
  });

  it('keeps every player position inside the guidance range (R03)', () => {
    expect(config.playerHalfWidth).toBeLessThan(config.guidanceHalfWidth);
    expect(config.playerMaxDepth).toBeLessThan(config.guidanceHalfDepth);
  });
});
