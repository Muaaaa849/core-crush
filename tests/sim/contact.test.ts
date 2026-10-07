import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { sweptCapsuleContact } from '../../src/sim/contact';

const radius = config.ballDiameter / 2 + config.capsuleRadius;
const speed = config.shotSpeed.straight;
const feet = { x: 0, y: 0, z: 0 };
const still = { x: 0, y: 0, z: 0 };
describe('swept sphere / capsule', () => {
  it.each([
    [{ x: -10, y: config.defenseHeight, z: 0 }, { x: speed * config.speedCapMultiplier, y: 0, z: 0 }, (10 - radius) / (speed * config.speedCapMultiplier)],
    [{ x: 0, y: 3, z: 0 }, { x: 0, y: -10, z: 0 }, (3 - config.capsuleTop - radius) / 10],
    [{ x: 0, y: -1, z: 0 }, { x: 0, y: 10, z: 0 }, (config.capsuleBottom + 1 - radius) / 10],
    [{ x: -1, y: 1, z: radius }, { x: 1, y: 0, z: 0 }, 1],
    [{ x: 0, y: 1, z: 0 }, still, 0],
  ] as const)('finds first contact including tunneling, caps, tangent and overlap', (p, v, time) => {
    expect(sweptCapsuleContact(p, v, feet, still, radius, config.capsuleBottom, config.capsuleTop)).toBeCloseTo(time, 10);
  });
  it('is invariant under interval splitting and relative translation', () => {
    const p = { x: -10, y: config.defenseHeight, z: 0 };
    const v = { x: speed, y: 0, z: 0 };
    const first = sweptCapsuleContact(p, v, feet, still, radius, config.capsuleBottom, config.capsuleTop);
    for (const t of [0.01, 0.1, 0.2]) {
      expect(t + sweptCapsuleContact({ ...p, x: p.x + v.x * t }, v, feet, still, radius, config.capsuleBottom, config.capsuleTop)).toBeCloseTo(first, 10);
    }
    expect(sweptCapsuleContact(p, { ...v, x: speed + 2 }, feet, { ...still, x: 2 }, radius, config.capsuleBottom, config.capsuleTop)).toBe(first);
    expect(sweptCapsuleContact(p, { ...v, x: -speed }, feet, still, radius, config.capsuleBottom, config.capsuleTop)).toBe(Infinity);
  });
});
