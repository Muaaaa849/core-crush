import { issueIce, Quotas, randomCode, Rejection, RoomLogic } from './logic';
import type { PlayerId } from '../src/sim/types';
import type { Signal } from '../src/net/room-protocol';

export interface RoomEnv {
  ROOMS: DurableObjectNamespace; REGISTRY: DurableObjectNamespace;
  ALLOWED_ORIGINS: string; ROOMS_ENABLED: string; TURN_ENABLED: string;
  TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string;
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function reject(message: string, status = 400): never { throw new Rejection(message, status); }
const failure = (error: unknown) => json({ error: error instanceof Rejection ? error.message : 'invalid request' }, error instanceof Rejection ? error.status : 400);
async function body(request: Request): Promise<Record<string, string>> {
  // ストリームを上限まで読み、Content-Lengthの自己申告に依存しない。
  const reader = request.body?.getReader(); if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const item = await reader.read(); if (item.done) break;
    size += item.value.byteLength; if (size > 8192) { await reader.cancel(); reject('request too large', 413); }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('invalid body');
  return value;
}
const registry = (env: RoomEnv) => env.REGISTRY.get(env.REGISTRY.idFromName('limits'));
async function quota(env: RoomEnv, action: string, code = ''): Promise<void> {
  const reply = await registry(env).fetch('https://internal/' + action, { method: 'POST', body: JSON.stringify({ code }) });
  if (!reply.ok) { const data = await reply.json() as { error: string }; reject(data.error, reply.status); }
}

export default {
  async fetch(request: Request, env: RoomEnv): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    if (!env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(origin)) return json({ error: 'origin refused' }, 403);
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let response: Response;
    try {
      if (env.ROOMS_ENABLED !== 'true') reject('rooms disabled', 503);
      const path = new URL(request.url).pathname;
      if (path === '/rooms' && request.method === 'POST') {
        const input = await body(request);
        // 不正な形式で部屋作成枠を消費しない。
        new RoomLogic(input.mode, input.build, Date.now());
        const code = randomCode(); await quota(env, 'create', code);
        response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://internal/init', {
          method: 'POST', body: JSON.stringify({ ...input, code }),
        });
      } else {
        const match = /^\/rooms\/([a-f0-9]{32})\/(join|ice|socket)$/.exec(path);
        if (!match || (match[2] === 'socket' ? request.method !== 'GET' : request.method !== 'POST')) reject('route not found', 404);
        const [, code, action] = match;
        await quota(env, 'request', code);
        // 登録済みのコードだけをDOに渡し、任意IDによる生成を抑える。
        response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(`https://internal/${action}`, request));
      }
    } catch (error) { response = failure(error); }
    if (response.status === 101) return response;
    const headers = new Headers(response.headers); for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};

export class Registry {
  private quotas = new Quotas();
  constructor(private readonly ctx: DurableObjectState) {
    ctx.blockConcurrencyWhile(async () => { this.quotas = new Quotas(await ctx.storage.get('quota')); });
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const { code } = await body(request), action = new URL(request.url).pathname;
      const now = Date.now(); this.quotas.request(now);
      if (action === '/create') this.quotas.create(code, now);
      else {
        if (!this.quotas.has(code, now)) reject('room not found or expired', 404);
        if (action === '/turn') this.quotas.turn(now);
      }
      await this.ctx.storage.put('quota', this.quotas.data);
      return json({ ok: true });
    } catch (error) {
      await this.ctx.storage.put('quota', this.quotas.data);
      return failure(error);
    }
  }
}

interface SocketInfo { id: PlayerId; minute: number; count: number; total: number }
export class Room {
  private logic?: RoomLogic;
  private code = '';
  constructor(private readonly ctx: DurableObjectState, private readonly env: RoomEnv) {
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<{ code: string; data: RoomLogic['data'] }>('room');
      if (saved) { this.code = saved.code; this.logic = new RoomLogic(saved.data.view.mode, saved.data.view.build, Date.now(), saved.data); }
    });
  }
  private async save(): Promise<void> { await this.ctx.storage.put('room', { code: this.code, data: this.logic!.data }); }
  private sockets(): WorkerWebSocket[] { return this.ctx.getWebSockets().filter(s => s.readyState === 1); }
  private broadcast(): void {
    const text = JSON.stringify({ kind: 'room', room: this.logic!.public(), serverNow: Date.now() });
    for (const socket of this.sockets()) socket.send(text);
  }
  private async abort(reason: string): Promise<void> {
    this.logic!.abort(); await this.save(); await this.ctx.storage.setAlarm(this.logic!.public().expiresAt);
    for (const socket of this.sockets()) socket.send(JSON.stringify({ kind: 'aborted', reason }));
    this.broadcast();
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const action = new URL(request.url).pathname, now = Date.now();
      if (action === '/init') {
        if (this.logic) reject('room exists', 409);
        const input = await body(request); this.code = input.code; this.logic = new RoomLogic(input.mode, input.build, now);
        await this.ctx.storage.setAlarm(now + 2 * 60 * 60 * 1000);
      }
      if (!this.logic) reject('room missing', 404);
      const room = this.logic;
      if (action === '/init' || action === '/join') {
        const input = action === '/init' ? { build: room.public().build } : await body(request);
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
        const slot = token ? room.rejoin(input.build, token, now) : room.join(input.build, now); await this.save(); this.broadcast();
        return json({ code: this.code, token: slot.token, player: slot.id, room: room.public() });
      }
      if (action === '/ice') {
        await body(request);
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
        room.grant(token, now); await this.save(); await quota(this.env, 'turn', this.code);
        return json(await issueIce(this.env, now));
      }
      if (action === '/socket') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') reject('websocket required', 426);
        const [protocol, token] = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(s => s.trim());
        if (protocol !== 'corecrush') reject('invalid protocol');
        const slot = room.authenticate(token, now);
        for (const old of this.sockets().filter(s => s.deserializeAttachment<SocketInfo>().id === slot.id)) old.close(1000, 'replaced');
        const pair = new WebSocketPair(), client = pair[0], server = pair[1];
        server.serializeAttachment({ id: slot.id, minute: 0, count: 0, total: 0 });
        this.ctx.acceptWebSocket(server); this.broadcast();
        return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'corecrush' } });
      }
      reject('route missing', 404);
    } catch (error) { return failure(error); }
  }
  async webSocketMessage(socket: WorkerWebSocket, text: string | ArrayBuffer): Promise<void> {
    if (!this.sockets().includes(socket)) return;
    try {
      const now = Date.now(), info = socket.deserializeAttachment<SocketInfo>();
      const minute = Math.floor(now / 60_000); if (info.minute !== minute) { info.minute = minute; info.count = 0; }
      info.count++; info.total++; socket.serializeAttachment(info);
      if (info.count > 120 || info.total > 2000) { socket.close(1008, 'signal limit'); await this.abort('信号の回数上限に達しました'); return; }
      if (typeof text !== 'string' || text.length > 40_000) reject('invalid message');
      const msg = JSON.parse(text), room = this.logic!;
      if (now >= room.public().expiresAt) reject('room expired', 410);
      if (msg.kind === 'begin') {
        room.begin(info.id, now, this.sockets().map(s => s.deserializeAttachment<SocketInfo>().id));
        await this.ctx.storage.setAlarm(room.public().deadline);
      } else if (msg.kind === 'signal') {
        const signal = room.relay(info.id, msg as Signal, now);
        const target = this.sockets().find(s => s.deserializeAttachment<SocketInfo>().id === signal.to);
        if (!target) reject('peer disconnected', 409);
        target.send(JSON.stringify({ ...signal, from: info.id })); return;
      } else {
        if (msg.matchId !== room.public().matchId) reject('invalid match', 409);
        if (msg.kind === 'repair') {
          if (info.id === 'p1' || room.public().phase !== 'countdown') reject('invalid repair', 409);
          this.sockets().find(s => s.deserializeAttachment<SocketInfo>().id === 'p1')?.send(JSON.stringify({ kind: 'repair', from: info.id, matchId: msg.matchId }));
          return;
        }
        if (msg.kind === 'leave' && info.id === 'p1') {
          for (const s of this.sockets()) s.send(JSON.stringify({ kind: 'host-left', matchId: msg.matchId }));
          return;
        }
        if (msg.kind === 'loaded') {
          if (room.loaded(info.id, msg.signature, now)) await this.ctx.storage.setAlarm(room.public().expiresAt);
        } else if (msg.kind === 'confirm') room.confirm(info.id);
        else if (msg.kind === 'abort') { await this.abort('接続準備または対戦を中断しました'); return; }
        else reject('invalid message');
      }
      await this.save(); this.broadcast();
    } catch (error) {
      socket.send(JSON.stringify({ kind: 'error', reason: error instanceof Rejection ? error.message : 'invalid message' }));
      if (this.logic?.public().phase === 'connecting') await this.abort('接続準備に失敗しました。再試行してください');
    }
  }
  async webSocketClose(socket: WorkerWebSocket): Promise<void> {
    socket.close();
    if (!this.logic) return;
    if (this.sockets().some(s => s.deserializeAttachment<SocketInfo>().id === socket.deserializeAttachment<SocketInfo>().id)) return;
    if (this.logic.public().phase === 'connecting') await this.abort('参加者が部屋から切断しました');
    else this.broadcast();
  }
  async webSocketError(socket: WorkerWebSocket): Promise<void> { await this.webSocketClose(socket); }
  async alarm(): Promise<void> {
    if (!this.logic) return;
    if (Date.now() >= this.logic.public().expiresAt) {
      for (const socket of this.sockets()) socket.close(1008, 'room expired');
      await this.ctx.storage.deleteAll(); this.logic = undefined;
    } else if (this.logic.public().phase === 'connecting') await this.abort('接続が20秒以内に完了しませんでした');
  }
}
