import { expect, it, vi } from 'vitest';
import { RoomConnection } from '../../src/net/room';
import { RoomLogic } from '../../worker/logic';
import type { OnlineMatch } from '../../src/net/online';

it('T10-32 advances network time without render frames and reconnects signaling with the same token', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(0);
  const room = new RoomLogic('1v1', 'build', 0), host = room.join('build', 0), guest = room.join('build', 0);
  const sockets: Socket[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onclose?: (e: { reason: string }) => void;
    onmessage?: (e: { data: string }) => void;
    sent: { kind: string }[] = [];
    constructor(_url: string, readonly protocols: string[]) { sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send(text: string) { this.sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; this.onclose?.({ reason: '' }); }
    room() { this.onmessage?.({ data: JSON.stringify({ kind: 'room', room: room.public(), serverNow: Date.now() }) }); }
  }
  class Channel extends EventTarget {
    readyState = 'open'; bufferedAmount = 0;
    constructor(readonly label: string) { super(); }
    send() {}
    close() { this.readyState = 'closed'; }
  }
  class Peer {
    localDescription?: { toJSON(): RTCSessionDescriptionInit };
    createDataChannel(label: string) { return new Channel(label); }
    async createOffer() { return { type: 'offer', sdp: 'offer' }; }
    async setLocalDescription(d: RTCSessionDescriptionInit) { this.localDescription = { toJSON: () => d }; }
    close() {}
  }
  const storage = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.endsWith('/ice')
    ? { mode: 'stun-only', reason: 'secrets-missing', iceServers: [], expiresAt: 1_800_000 }
    : { code: 'code', player: host.id, token: host.token, room: room.public() })));
  let match: OnlineMatch | undefined;
  const connection = new RoomConnection('http://localhost:8787', 'build', {
    view: vi.fn(), preparing: m => { match = m; }, status: vi.fn(), lobby: vi.fn(), disconnected: vi.fn(),
  });
  try {
    await connection.enter('1v1');
    room.begin(host.id, 0, [host.id, guest.id]); sockets[0].room();
    await vi.advanceTimersByTimeAsync(50);
    room.loaded(host.id, 'same', 50); room.loaded(guest.id, 'same', 50); sockets[0].room();
    await vi.advanceTimersByTimeAsync(4000);
    expect(match!.state.now).toBeGreaterThan(0); expect(match!.status).toBe('running');
    sockets[0].close(); await vi.advanceTimersByTimeAsync(300);
    expect(sockets).toHaveLength(2); expect(sockets[1].protocols).toEqual(['corecrush', host.token]);
    expect(sockets.flatMap(s => s.sent).some(m => m.kind === 'abort')).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(match!.status).toBe('paused');
    const frozen = structuredClone(match!.state); await vi.advanceTimersByTimeAsync(1000);
    expect(match!.state).toEqual(frozen);
    connection.close(); expect(vi.getTimerCount()).toBe(0);
  } finally { connection.close(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

it('T10-34 treats host state loss on reload as silence instead of explicit departure', async () => {
  const room = new RoomLogic('1v1', 'build', Date.now()), host = room.join('build', Date.now()), guest = room.join('build', Date.now());
  room.begin(host.id, Date.now(), [host.id, guest.id]);
  room.loaded(host.id, 'same', Date.now()); room.loaded(guest.id, 'same', Date.now());
  const admission = { code: 'code', token: host.token, player: host.id, room: room.public() };
  const sent: { kind: string }[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (e: { data: string }) => void;
    constructor() { queueMicrotask(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ kind: 'room', room: room.public(), serverNow: Date.now() }) }); }); }
    send(text: string) { sent.push(JSON.parse(text)); }
    close() {}
  }
  vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ build: 'build', admission }), setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('fetch', vi.fn(async () => Response.json(admission)));
  const connection = new RoomConnection('http://localhost:8787', 'build', {
    view: vi.fn(), preparing: vi.fn(), status: vi.fn(), lobby: vi.fn(), disconnected: vi.fn(),
  });
  try {
    await connection.enter(undefined, 'code');
    expect(sent.some(p => p.kind === 'leave' || p.kind === 'abort')).toBe(false);
  } finally { connection.close(false); vi.unstubAllGlobals(); }
});
