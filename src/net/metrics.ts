import { summarizeFrameTimes } from '../stats';

export const channelOptions = {
  state: { ordered: false, maxRetransmits: 0 },
  event: { ordered: true },
} satisfies Record<string, RTCDataChannelInit>;

export function validatePingCount(count: number): number {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('回数は1〜1000の整数にしてください。');
  }
  return count;
}

export function summarizeRtt(sent: number, samples: readonly number[]) {
  const summary = summarizeFrameTimes(samples);
  return {
    sent,
    received: samples.length,
    timedOut: sent - samples.length,
    p50: summary?.p50 ?? null,
    p95: summary?.p95 ?? null,
  };
}
