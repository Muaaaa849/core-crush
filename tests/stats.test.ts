// M0-5：計測表示のフレーム時間集計。
import { describe, expect, it } from 'vitest';
import { summarizeFrameTimes } from '../src/stats';

describe('summarizeFrameTimes', () => {
  it('returns nearest-rank percentiles and average fps', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
    expect(summarizeFrameTimes(samples)).toEqual({ p50: 50, p95: 95, p99: 99, fps: 1000 / 50.5 });
  });

  it('does not reorder the caller array', () => {
    const samples = [30, 10, 20];
    summarizeFrameTimes(samples);
    expect(samples).toEqual([30, 10, 20]);
  });

  it('returns null without samples', () => {
    expect(summarizeFrameTimes([])).toBeNull();
  });
});
