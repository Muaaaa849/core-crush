import type { MatchMode, PlayerId } from '../src/sim/types';
import type { IceReply, RoomView, Signal } from '../src/net/room-protocol';

export const ROOM_TTL = 2 * 60 * 60 * 1000;
export const TURN_TTL = 30 * 60;
export class Rejection extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function require(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new Rejection(message, status);
}
export function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
interface Slot { id: PlayerId; token: string; lastGrant: number; signature?: string }
interface RoomData { view: RoomView; slots: Slot[]; grants: number }
export class RoomLogic {
  readonly data: RoomData;
  constructor(mode: string, build: string, now: number, restored?: RoomData) {
    require(['1v1', '1v2', '2v2'].includes(mode), 'invalid format');
    require(typeof build === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(build), 'invalid build');
    this.data = restored ?? { view: { mode: mode as MatchMode, build, players: [], phase: 'lobby', expiresAt: now + ROOM_TTL,
      matchId: '', firstBall: 'a', deadline: 0, startAt: 0 }, slots: [], grants: 0 };
  }
  public(): RoomView { return structuredClone(this.data.view); }
  private live(now: number): void { require(now < this.data.view.expiresAt, 'room expired', 410); }
  join(build: string, now: number): Slot {
    this.live(now);
    const v = this.data.view;
    require(v.phase === 'lobby', 'match in progress', 409);
    require(v.build === build, 'different build', 409);
    const ids: PlayerId[] = v.mode === '2v2' ? ['p1', 'p2', 'p3', 'p4'] : v.mode === '1v2' ? ['p1', 'p3', 'p4'] : ['p1', 'p3'];
    require(this.data.slots.length < ids.length, 'room full', 409);
    // 永続化しても未発行の値を保持するため有限の初期値にする。
    const id = ids[this.data.slots.length], slot = { id, token: randomCode(), lastGrant: -60_000 };
    this.data.slots.push(slot);
    v.players.push({ id, side: id === 'p1' || id === 'p2' ? 'a' : 'b', loaded: false, confirmed: false });
    return { ...slot };
  }
  authenticate(token: string, now: number): Slot {
    this.live(now);
    const slot = this.data.slots.find(s => s.token === token);
    require(slot, 'invalid token', 401); return slot;
  }
  begin(id: PlayerId, now: number, connected: PlayerId[]): void {
    this.live(now); const v = this.data.view;
    require(id === 'p1', 'host only', 403);
    require(v.phase === 'lobby', 'already started', 409);
    const count = v.mode === '2v2' ? 4 : v.mode === '1v2' ? 3 : 2;
    require(v.players.length === count && v.players.every(p => connected.includes(p.id)), 'all players must be connected', 409);
    this.abort(); v.phase = 'connecting'; v.deadline = now + 20_000; v.matchId = randomCode();
    v.firstBall = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? 'a' : 'b';
  }
  loaded(id: PlayerId, signature: string, now: number): boolean {
    this.live(now); const v = this.data.view;
    require(v.phase === 'connecting' && now < v.deadline, 'connection deadline', 409);
    require(typeof signature === 'string' && signature.length > 0 && signature.length <= 80, 'invalid signature');
    require(this.data.slots.every(s => !s.signature || s.signature === signature), 'different session signature', 409);
    const slot = this.data.slots.find(s => s.id === id); require(slot, 'invalid slot', 401);
    slot.signature = signature; v.players.find(p => p.id === id)!.loaded = true;
    if (!v.players.every(p => p.loaded)) return false;
    v.phase = 'countdown'; v.startAt = now + 3000; return true;
  }
  relay(id: PlayerId, signal: Signal, now: number): Signal {
    this.live(now); const v = this.data.view;
    require(v.phase !== 'lobby' && signal.matchId === v.matchId, 'invalid match', 409);
    require(signal.to !== id && (id === 'p1' || signal.to === 'p1') && v.players.some(p => p.id === signal.to), 'star links only', 403);
    require((!!signal.description !== !!signal.candidate), 'invalid signal');
    if (signal.description) require(['offer', 'answer'].includes(signal.description.type) && typeof signal.description.sdp === 'string'
      && signal.description.sdp.length <= 32_000 && (signal.description.type === 'offer' ? id === 'p1' : signal.to === 'p1'), 'invalid SDP');
    if (signal.candidate) require(typeof signal.candidate.candidate === 'string' && signal.candidate.candidate.length <= 2048, 'invalid ICE');
    // 送信者はクライアント申告から取らず、認証済み接続から割り当てる。
    return { kind: 'signal', to: signal.to, matchId: v.matchId, description: signal.description, candidate: signal.candidate };
  }
  grant(token: string, now: number): void {
    const slot = this.authenticate(token, now);
    require(now - slot.lastGrant >= 60_000 && this.data.grants < 32, 'credential limit', 429);
    slot.lastGrant = now; this.data.grants++;
  }
  confirm(id: PlayerId): void {
    require(this.data.view.phase === 'countdown', 'no match', 409);
    const p = this.data.view.players.find(p => p.id === id); require(p, 'invalid slot', 401);
    p.confirmed = true;
    if (this.data.view.players.every(p => p.confirmed)) this.abort();
  }
  abort(): void {
    const v = this.data.view; v.phase = 'lobby'; v.startAt = 0; v.deadline = 0;
    for (const p of v.players) { p.loaded = false; p.confirmed = false; }
    for (const slot of this.data.slots) slot.signature = undefined;
  }
}
interface QuotaData { rooms: Record<string, number>; day: number; created: number; grants: number; requests: number }
export class Quotas {
  readonly data: QuotaData;
  constructor(data?: QuotaData) { this.data = data ?? { rooms: {}, day: -1, created: 0, grants: 0, requests: 0 }; }
  private reset(now: number): void {
    const day = Math.floor(now / 86_400_000);
    if (this.data.day !== day) { this.data.day = day; this.data.created = 0; this.data.grants = 0; this.data.requests = 0; }
    for (const [code, expiry] of Object.entries(this.data.rooms)) if (expiry <= now) delete this.data.rooms[code];
  }
  request(now: number): void { this.reset(now); require(this.data.requests++ < 5000, 'request limit', 429); }
  create(code: string, now: number): void {
    this.reset(now); require(Object.keys(this.data.rooms).length < 4 && this.data.created < 24, 'room limit', 429);
    this.data.rooms[code] = now + ROOM_TTL; this.data.created++;
  }
  has(code: string, now: number): boolean { this.reset(now); return Object.hasOwn(this.data.rooms, code); }
  turn(now: number): void { this.reset(now); require(this.data.grants < 96, 'daily credential limit', 429); this.data.grants++; }
}
interface TurnEnv { TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string; TURN_ENABLED?: string }
export async function issueIce(env: TurnEnv, now: number, fetcher: typeof fetch = fetch): Promise<IceReply> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN || env.TURN_ENABLED !== 'true') return {
    mode: 'stun-only', reason: !env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN ? 'secrets-missing' : 'turn-disabled',
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], expiresAt: now + TURN_TTL * 1000,
  };
  try {
    const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL }), signal: AbortSignal.timeout(8000),
    });
    require(response.ok, 'TURN service refused credentials', 502);
    const body = await response.json() as { iceServers?: RTCIceServer[] };
    require(Array.isArray(body.iceServers) && body.iceServers.length <= 8, 'TURN response invalid', 502);
    const iceServers: RTCIceServer[] = body.iceServers.map(server => {
      const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
      require(Array.isArray(urls) && urls.length > 0 && urls.length <= 16 && urls.every(url => typeof url === 'string' && /^(stun|turn|turns):/.test(url)), 'TURN response invalid', 502);
      const turn = urls.some(url => /^turns?:/.test(url));
      require(!turn || typeof server.username === 'string' && typeof server.credential === 'string', 'TURN credentials invalid', 502);
      return { urls, ...(turn ? { username: server.username, credential: server.credential } : {}) };
    });
    require(iceServers.some(s => (s.urls as string[]).some(u => /^turns?:/.test(u))), 'TURN missing', 502);
    return { mode: 'turn', iceServers, expiresAt: now + TURN_TTL * 1000 };
  } catch { throw new Rejection('TURN credential service unavailable', 502); }
}
