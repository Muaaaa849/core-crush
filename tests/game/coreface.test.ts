import { describe, expect, it } from 'vitest';
import { coreFace } from '../../src/game/coreface';

const SECOND = 60_000;

describe('coreFace', () => {
  it.each([
    [0, 'calm', false],
    [2.999, 'calm', false],
    [3.000, 'panic', false],
    [4.999, 'panic', false],
    [5.000, 'rage', false],
    [6.999, 'rage', false],
    [7.000, 'rage', true],
    [7.999, 'rage', true],
  ] as const)('at %s elapsed seconds shows %s, cracked=%s', (seconds, expression, cracked) => {
    expect(coreFace(Math.round(seconds * SECOND), SECOND)).toEqual({ expression, cracked });
  });

  it('returns calm without cracks while the danger clock is stopped', () => {
    expect(coreFace(null, SECOND)).toEqual({ expression: 'calm', cracked: false });
  });

  it('returns calm when a new danger clock resets the elapsed time', () => {
    expect(coreFace(7 * SECOND, SECOND)).toEqual({ expression: 'rage', cracked: true });
    expect(coreFace(0, SECOND)).toEqual({ expression: 'calm', cracked: false });
  });
});
