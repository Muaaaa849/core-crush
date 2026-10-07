// 落球の転がりの見た目（0009「画面と将来のアニメーション」）：接地中の水平移動量 d に対し d / r 回し、軸は 上 × 移動方向。
import { describe, expect, it } from 'vitest';
import { rollRotation } from '../../src/game/ballview';

describe('rollRotation', () => {
  it('rolls by distance / radius around up × direction', () => {
    const roll = rollRotation({ x: 0, y: 0.325, z: 0 }, { x: 0, y: 0.325, z: -0.65 }, 0.325)!;
    expect(roll.angle).toBeCloseTo(2);
    expect(roll.axis.x).toBeCloseTo(-1); // -zへ転がると、x軸まわりに負の向きへ回る
    expect(roll.axis.y).toBe(0);
    expect(roll.axis.z).toBeCloseTo(0);
  });

  it('does not roll in the air or without horizontal movement', () => {
    expect(rollRotation({ x: 0, y: 0.8, z: 0 }, { x: 1, y: 0.7, z: 0 }, 0.325)).toBeNull();
    expect(rollRotation({ x: 1, y: 0.325, z: 2 }, { x: 1, y: 0.325, z: 2 }, 0.325)).toBeNull();
  });
});
