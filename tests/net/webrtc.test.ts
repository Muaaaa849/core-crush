import { expect, it, vi } from 'vitest';
import { DataChannelDelivery, StarLinks, channelOptions, waitForLinks } from '../../src/net/webrtc';
import type { Delivery, Message } from '../../src/net/messages';
import { MemoryDelivery } from '../../src/net/memory';
import type { Signal } from '../../src/net/room-protocol';

class Channel extends EventTarget {
  readyState = 'open'; bufferedAmount = 0; sent: string[] = [];
  constructor(readonly label: string) { super(); }
  send(text: string) { this.sent.push(text); }
  close() { this.readyState = 'closed'; }
}
it('T10-29 preserves the existing delivery contract and authenticates channel direction', () => {
  const transport = new DataChannelDelivery('host', () => 123);
  const channels = ['input', 'state', 'event'].map(label => new Channel(label));
  for (const c of channels) transport.attach('p3', c as unknown as RTCDataChannel);
  const deliveries: Delivery[] = [transport, new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 })];
  const packet: Message = { kind: 'ping', matchId: 'm', epoch: 1, sent: 0 };
  for (const delivery of deliveries) {
    delivery.bind('host', vi.fn());
    delivery.send('host', 'p3', 'event', packet, 0);
  }
  expect(JSON.parse(channels[2].sent[0])).toEqual(packet);
  const receive = vi.fn(); transport.bind('host', receive);
  channels[2].dispatchEvent(new MessageEvent('message', { data: JSON.stringify(packet) }));
  expect(receive).toHaveBeenCalledWith('p3', packet, 123);
  channels[1].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ kind: 'state', matchId: 'm', epoch: 1 }) }));
  channels[2].dispatchEvent(new MessageEvent('message', { data: '{' }));
  expect(receive).toHaveBeenCalledTimes(1);
  expect(channelOptions.input).toEqual({ ordered: false, maxRetransmits: 0 });
  expect(channelOptions.state).toEqual({ ordered: false, maxRetransmits: 0 });
  expect(channelOptions.event).toEqual({ ordered: true });
});
it('T10-29 drops obsolete state under backpressure and bounds reliable traffic', () => {
  const t = new DataChannelDelivery('host', () => 0), state = new Channel('state'), event = new Channel('event');
  t.attach('p3', state as unknown as RTCDataChannel); t.attach('p3', event as unknown as RTCDataChannel);
  state.bufferedAmount = 1_000_000;
  t.send('host', 'p3', 'state', { kind: 'state' } as Message, 0);
  expect(state.sent).toHaveLength(0);
  event.bufferedAmount = 1_000_000;
  expect(() => t.send('host', 'p3', 'event', { kind: 'ping' } as Message, 0)).toThrow('progress');
});
it('T10-29 stops connection setup at 20 seconds and cleans the timer', async () => {
  vi.useFakeTimers();
  const pending = waitForLinks(() => false);
  const failure = expect(pending).rejects.toThrow('20');
  await vi.advanceTimersByTimeAsync(20_000);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('T10-31 sends SDP before early ICE candidates on initial offers and credential refresh', async () => {
  class Peer {
    localDescription?: { toJSON(): RTCSessionDescriptionInit };
    onicecandidate?: (e: { candidate: { toJSON(): RTCIceCandidateInit } }) => void;
    config: RTCConfiguration;
    constructor(config: RTCConfiguration) { this.config = config; }
    createDataChannel(label: string) { return new Channel(label); }
    async createOffer() { return { type: 'offer', sdp: 'offer' }; }
    async setLocalDescription(description: RTCSessionDescriptionInit) {
      this.localDescription = { toJSON: () => description };
      this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'early' }) } });
    }
    getConfiguration() { return this.config; }
    setConfiguration(config: RTCConfiguration) { this.config = config; }
    close() {}
  }
  vi.stubGlobal('RTCPeerConnection', Peer);
  try {
    const sent: Signal[] = [], delivery = new DataChannelDelivery('host', () => 0);
    const links = new StarLinks('p1', 'match', delivery, s => sent.push(s), vi.fn(), { iceServers: [] }, ['p1', 'p3']);
    await links.offer(); await links.refresh([{ urls: 'turn:example.test', username: 'short', credential: 'short' }]);
    expect(sent.map(s => s.description ? 'sdp' : 'ice')).toEqual(['sdp', 'ice', 'sdp', 'ice']);
    links.close();
  } finally { vi.unstubAllGlobals(); }
});
