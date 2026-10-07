import { describe, expect, it } from 'vitest';
import { sweptCapsuleContact } from '../../src/sim/contact';

const feet = { x: 0, y: 0, z: 0 };
const still = { x: 0, y: 0, z: 0 };
describe('swept sphere / capsule', () => {
  it.each([
    [{ x: -10, y: 1.2, z: 0 }, { x: 44.8, y: 0, z: 0 }, 9.45 / 44.8],
    [{ x: 0, y: 3, z: 0 }, { x: 0, y: -10, z: 0 }, 0.095],
    [{ x: 0, y: -1, z: 0 }, { x: 0, y: 10, z: 0 }, 0.075],
    [{ x: -1, y: 1, z: 0.55 }, { x: 1, y: 0, z: 0 }, 1],
    [{ x: 0, y: 1, z: 0 }, still, 0],
  ] as const)('finds first contact including tunneling, caps, tangent and overlap', (p, v, time) => {
    expect(sweptCapsuleContact(p, v, feet, still, 0.55, 0.3, 1.5)).toBeCloseTo(time, 10);
  });
  it('is invariant under interval splitting and relative translation', () => {
    const p = { x: -10, y: 1.2, z: 0 };
    const v = { x: 28, y: 0, z: 0 };
    const first = sweptCapsuleContact(p, v, feet, still, 0.55, 0.3, 1.5);
    for (const t of [0.01, 0.1, 0.2]) {
      expect(t + sweptCapsuleContact({ ...p, x: p.x + v.x * t }, v, feet, still, 0.55, 0.3, 1.5)).toBeCloseTo(first, 10);
    }
    expect(sweptCapsuleContact(p, { ...v, x: 30 }, feet, { ...still, x: 2 }, 0.55, 0.3, 1.5)).toBe(first);
    expect(sweptCapsuleContact(p, { ...v, x: -28 }, feet, still, 0.55, 0.3, 1.5)).toBe(Infinity);
  });
});
