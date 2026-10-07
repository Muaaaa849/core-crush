// M0：通信チャンネル設定とRTTの集計。
import { describe, expect, it } from 'vitest';
import { channelOptions, summarizeRtt, validatePingCount } from '../src/net/metrics';

describe('loopback metrics', () => {
  it('uses unordered, non-retransmitted state and reliable, ordered event', () => {
    expect(channelOptions.state).toEqual({ ordered: false, maxRetransmits: 0 });
    expect(channelOptions.event).toEqual({ ordered: true });
  });

  it('reports response percentiles separately from timeouts', () => {
    const samples = [30, 10, 20];
    expect(summarizeRtt(5, samples)).toEqual({ sent: 5, received: 3, timedOut: 2, p50: 20, p95: 30 });
    expect(samples).toEqual([30, 10, 20]);
  });

  it('does not treat missing responses as zero latency', () => {
    expect(summarizeRtt(2, [])).toEqual({ sent: 2, received: 0, timedOut: 2, p50: null, p95: null });
  });

  it('accepts only integer counts within the demo limit', () => {
    expect(validatePingCount(1)).toBe(1);
    expect(validatePingCount(1000)).toBe(1000);
    for (const value of [0, -1, 1.5, 1001, NaN, Infinity]) {
      expect(() => validatePingCount(value)).toThrow();
    }
  });
});
