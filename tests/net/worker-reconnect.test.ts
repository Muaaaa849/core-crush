import { expect, it, vi } from 'vitest';
import { Room } from '../../worker/index';

class Socket {
  readyState = 1;
  attachment: unknown;
  sent: string[] = [];
  serializeAttachment(value: unknown) { this.attachment = value; }
  deserializeAttachment<T>(): T { return this.attachment as T; }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
}

it('T10-33 replaces the old worker WebSocket and ignores its late messages and close callback', async () => {
  const sockets: Socket[] = [];
  const NativeResponse = Response;
  vi.stubGlobal('WebSocketPair', class { 0 = new Socket(); 1 = new Socket(); });
  vi.stubGlobal('Response', class extends NativeResponse {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      if (init?.status === 101) Object.defineProperty(this, 'status', { value: 101 });
    }
  });
  try {
    const ctx = { blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
      storage: { get: async () => undefined, put: vi.fn(), setAlarm: vi.fn() },
      getWebSockets: () => sockets, acceptWebSocket: (socket: Socket) => sockets.push(socket) };
    const room = new Room(ctx as unknown as DurableObjectState, {} as never);
    const init = await room.fetch(new Request('https://internal/init', { method: 'POST', body: JSON.stringify({ code: 'code', mode: '1v1', build: 'build', characterId: 'volt' }) }));
    const admission = await init.json() as { token: string };
    const connect = () => room.fetch(new Request('https://internal/socket', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `corecrush, ${admission.token}` } }));
    expect((await connect()).status).toBe(101);
    expect((await connect()).status).toBe(101);
    expect(sockets[0].readyState).toBe(3);
    const newer = sockets[1], count = newer.sent.length;
    await room.webSocketMessage(sockets[0] as unknown as WorkerWebSocket, JSON.stringify({ kind: 'begin' }));
    await room.webSocketClose(sockets[0] as unknown as WorkerWebSocket);
    expect(newer.sent).toHaveLength(count);
  } finally { vi.unstubAllGlobals(); }
});
