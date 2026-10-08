import { expect, it } from 'vitest';
import { createAudioOutput, MASTER_GAIN_LIMIT } from '../../src/game/audio';
import { warningSound } from '../../src/game/sound';

class Param {
  value = 0;
  calls: { kind: string; value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number) { this.value = value; this.calls.push({ kind: 'set', value, at }); }
  linearRampToValueAtTime(value: number, at: number) { this.calls.push({ kind: 'ramp', value, at }); }
  exponentialRampToValueAtTime(value: number, at: number) { this.calls.push({ kind: 'exp', value, at }); }
  cancelScheduledValues(_at: number) {}
  cancelAndHoldAtTime(_at: number) {}
}
class Node {
  disconnected = false;
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param();
  type = ''; buffer: unknown;
  connect(_node: unknown) {}
  disconnect() { this.disconnected = true; }
}
class Source extends Node {
  started = Infinity; stopped = Infinity; onended?: () => void;
  start(at: number) { this.started = at; }
  stop(at: number) { this.stopped = at; }
}
class Context {
  state = 'suspended'; currentTime = 0; sampleRate = 48000; destination = new Node();
  nodes: Node[] = []; sources: Source[] = []; buffers: Float32Array[] = [];
  resumeCalls = 0; fail = false; stateChange?: () => void;
  async resume() { this.resumeCalls++; if (this.fail) throw Error('blocked'); this.state = 'running'; }
  addEventListener(_kind: string, callback: () => void) { this.stateChange = callback; }
  createGain() { const node = new Node(); this.nodes.push(node); return node; }
  createStereoPanner() { return this.createGain(); }
  createBiquadFilter() { return this.createGain(); }
  createOscillator() { const node = new Source(); this.nodes.push(node); this.sources.push(node); return node; }
  createBufferSource() { return this.createOscillator(); }
  createBuffer(_channels: number, length: number, _rate: number) {
    const data = new Float32Array(length); this.buffers.push(data); return { getChannelData: () => data };
  }
  advance(seconds: number) {
    this.currentTime = seconds;
    for (const source of this.sources) if (source.stopped <= seconds) { const done = source.onended; source.onended = undefined; done?.(); }
  }
}
const factory = (ctx: Context) => () => ctx as unknown as AudioContext;

it('F12-13: creates/resumes only on explicit start, reports failure and retries one context', async () => {
  const ctx = new Context(); let made = 0;
  const out = createAudioOutput(() => { made++; return factory(ctx)(); });
  out.play(warningSound('a', 'a')); expect(made).toBe(0); expect(out.ready).toBe(false);
  ctx.fail = true;
  expect(await out.start()).toBe(false); expect(out.status).toContain('blocked'); expect(ctx.sources).toEqual([]);
  ctx.fail = false;
  expect(await out.start()).toBe(true); expect(made).toBe(1); expect(ctx.resumeCalls).toBe(2);
  expect(out.ready).toBe(true); expect(ctx.buffers).toHaveLength(1);
  ctx.state = 'suspended'; ctx.stateChange?.(); expect(out.ready).toBe(false);
  expect(out.status).toContain('再試行');
  expect(await out.start()).toBe(true); expect(ctx.buffers).toHaveLength(1);
});

it('F12-10: eight sounds replace the oldest with a short fade, and exact expiry releases nodes', async () => {
  const ctx = new Context(), out = createAudioOutput(factory(ctx)); await out.start();
  for (let i = 0; i < 9; i++) { ctx.currentTime = i / 1000; out.play(warningSound('a', 'a')); }
  expect(out.activeCount).toBe(8);
  expect(ctx.sources[0].stopped).toBeCloseTo(0.013); expect(ctx.sources[2].stopped).toBeCloseTo(0.036);
  ctx.advance(0.0779); expect(out.activeCount).toBe(1);
  ctx.advance(0.0781); expect(out.activeCount).toBe(0);
  expect(ctx.nodes.slice(1).every(n => n.disconnected)).toBe(true);
});

it('F12-10: node schedules use AudioContext time, cap master gain, and shape both ends', async () => {
  const ctx = new Context(), out = createAudioOutput(factory(ctx)); await out.start();
  out.setVolume(100, false); ctx.currentTime = 42;
  out.play(warningSound('a', 'a'));
  expect(ctx.sources.map(s => s.started)).toEqual([42, 42.035]);
  const master = ctx.nodes[0]; expect(Math.max(...master.gain.calls.map(c => c.value))).toBeLessThanOrEqual(MASTER_GAIN_LIMIT);
  const envelopes = ctx.nodes.filter(n => n.gain.calls.some(c => c.kind === 'ramp' && c.value === 0));
  expect(envelopes.length).toBeGreaterThanOrEqual(2);
});

it('F12-13: mute, stop and suspension cancel scheduled future tones and never retain playback', async () => {
  for (const reason of ['mute', 'stop', 'suspend']) {
    const ctx = new Context(), out = createAudioOutput(factory(ctx)); await out.start();
    out.play(warningSound('a', 'a'));
    if (reason === 'mute') out.setVolume(1, true);
    else if (reason === 'stop') out.stop();
    else { ctx.state = 'suspended'; ctx.stateChange?.(); }
    expect(out.activeCount).toBe(0);
    expect(ctx.sources.every(s => s.stopped < 0.035)).toBe(true);
    ctx.advance(0.01); expect(ctx.nodes.slice(1).every(n => n.disconnected)).toBe(true);
  }
});

it('F12-13: constructor failure is visible and the same operation can retry', async () => {
  const ctx = new Context(); let fail = true;
  const out = createAudioOutput(() => { if (fail) throw Error('unavailable'); return factory(ctx)(); });
  expect(await out.start()).toBe(false); expect(out.status).toContain('unavailable');
  fail = false; expect(await out.start()).toBe(true);
});
