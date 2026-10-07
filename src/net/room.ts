import type { MatchMode, PlayerId } from '../sim/types';
import type { Admission, IceReply, RoomReply, RoomView } from './room-protocol';
import { OnlineMatch } from './online';
import { DataChannelDelivery, StarLinks, waitForLinks } from './webrtc';

export function roomUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('部屋URLはオリジンだけを設定してください');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error('部屋URLにはHTTPSを使ってください');
  return url.origin;
}
export interface RoomCallbacks {
  view(room: RoomView, code: string, player: PlayerId): void;
  preparing(match: OnlineMatch): void;
  status(text: string): void;
  lobby(): void;
  disconnected(): void;
}
export class RoomConnection {
  private socket?: WebSocket;
  private admission?: Admission;
  private links?: StarLinks;
  private setup?: AbortController;
  private ice?: IceReply;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private queued: Extract<RoomReply, { kind: 'signal' }>[] = [];
  private room?: RoomView;
  private match?: OnlineMatch;
  private startPerf = Infinity;
  private activeId = '';
  private closed = false;
  private serverOffset = 0;
  constructor(private readonly url: string, private readonly build: string, private readonly callbacks: RoomCallbacks, private readonly relay = false) {}
  private async request<T>(path: string, value: unknown, token?: string): Promise<T> {
    const response = await fetch(this.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(value), signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw Error(data.error ?? `HTTP ${response.status}`); return data;
  }
  async enter(mode: MatchMode | undefined, code?: string): Promise<void> {
    this.admission = await this.request<Admission>(mode ? '/rooms' : `/rooms/${code}/join`, mode ? { mode, build: this.build } : { build: this.build });
    if (this.closed) return;
    const ws = new WebSocket(this.url.replace(/^http/, 'ws') + `/rooms/${this.admission.code}/socket`, ['corecrush', this.admission.token]);
    this.socket = ws;
    ws.onmessage = e => {
      try { this.receive(JSON.parse(e.data) as RoomReply); } catch (error) { this.fail(error); }
    };
    ws.onclose = () => { if (!this.closed) { this.stop(); this.callbacks.status('部屋への接続が切れました。新しい部屋で参加し直してください'); this.callbacks.disconnected(); } };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(Error('部屋への接続がタイムアウトしました')); }, 10_000);
      ws.onopen = () => { clearTimeout(timer); this.callbacks.status('部屋に接続しました'); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(Error('部屋に接続できません')); };
    });
  }
  private send(value: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw Error('部屋に接続していません');
    this.socket.send(JSON.stringify(value));
  }
  begin(): void { this.send({ kind: 'begin' }); }
  confirm(): void { this.send({ kind: 'confirm', matchId: this.activeId }); }
  private receive(msg: RoomReply): void {
    if (msg.kind === 'error') { this.callbacks.status(`部屋：${msg.reason}`); return; }
    if (msg.kind === 'aborted') { this.stop(); this.callbacks.lobby(); this.callbacks.status(msg.reason); return; }
    if (msg.kind === 'signal') {
      if (msg.matchId !== this.activeId) return;
      if (!this.links) { if (this.queued.length < 200) this.queued.push(msg); else this.fail(Error('信号が多すぎます')); }
      else void this.links.receive(msg.from, msg.description, msg.candidate).catch(error => this.fail(error));
      return;
    }
    if (msg.kind !== 'room' || !this.admission) return;
    this.room = msg.room; this.serverOffset = msg.serverNow - Date.now();
    this.callbacks.view(msg.room, this.admission.code, this.admission.player);
    if (msg.room.phase === 'lobby') { this.stop(); this.callbacks.lobby(); }
    else if (msg.room.phase === 'connecting' && msg.room.matchId !== this.activeId) {
      this.stop(); this.activeId = msg.room.matchId; this.setup = new AbortController();
      const signal = this.setup.signal;
      void this.prepare(msg.room, signal).catch(error => { if (!signal.aborted) this.fail(error); });
    } else if (msg.room.phase === 'countdown' && this.startPerf === Infinity) {
      this.startPerf = performance.now() + Math.max(0, msg.room.startAt - (Date.now() + this.serverOffset));
    }
  }
  get playing(): boolean { return !!this.match && performance.now() >= this.startPerf; }
  get countdown(): number | undefined { return this.startPerf === Infinity ? undefined : Math.max(0, Math.ceil((this.startPerf - performance.now()) / 1000)); }
  private async credentials(): Promise<IceReply> {
    if (this.ice && this.ice.expiresAt - Date.now() > 5 * 60_000) return this.ice;
    const a = this.admission!;
    this.ice = await this.request<IceReply>(`/rooms/${a.code}/ice`, {}, a.token);
    this.callbacks.status(this.ice.mode === 'turn' ? '直接接続を優先・必要時はTURN中継' : `STUNのみ（${this.ice.reason === 'secrets-missing' ? 'TURN秘密が未設定' : 'TURNが無効'}）`);
    if (this.relay && this.ice.mode !== 'turn') throw Error('relay試験にはTURNの設定が必要です');
    return this.ice;
  }
  private async prepare(room: RoomView, signal: AbortSignal): Promise<void> {
    const ice = await this.credentials(); if (signal.aborted) return;
    const player = this.admission!.player;
    const now = () => Math.max(0, Math.floor((performance.now() - this.startPerf) * 60));
    const delivery = new DataChannelDelivery(player === 'p1' ? 'host' : player, now);
    this.match = new OnlineMatch(room, player, delivery, now);
    this.links = new StarLinks(player, room.matchId, delivery, s => this.send(s), error => this.fail(error), {
      iceServers: ice.iceServers, iceTransportPolicy: this.relay ? 'relay' : 'all',
    }, room.players.map(p => p.id));
    for (const queued of this.queued.splice(0)) await this.links.receive(queued.from, queued.description, queued.candidate);
    this.callbacks.preparing(this.match);
    await this.links.offer();
    const peers = player === 'p1' ? room.players.filter(p => p.id !== 'p1').map(p => p.id) : ['host'];
    await waitForLinks(() => delivery.ready(peers), Math.max(0, room.deadline - Date.now() - this.serverOffset), signal);
    const signature = await this.match.signature(); if (signal.aborted) return;
    this.send({ kind: 'loaded', matchId: room.matchId, signature });
    this.scheduleRefresh(ice);
  }
  private scheduleRefresh(ice: IceReply): void {
    if (ice.mode !== 'turn') return;
    this.refreshTimer = setTimeout(() => { void this.refresh().catch(error => this.fail(error)); }, Math.max(1000, ice.expiresAt - Date.now() - 5 * 60_000));
  }
  private async refresh(): Promise<void> {
    const id = this.activeId, ice = await this.credentials();
    if (id !== this.activeId || !this.links) return;
    await this.links.refresh(ice.iceServers); this.scheduleRefresh(ice);
  }
  private fail(error: unknown): void {
    if (this.closed || !this.activeId) return;
    const reason = error instanceof Error ? error.message : String(error);
    try { this.send({ kind: 'abort', matchId: this.activeId }); } catch { /* 切断済みでもローカルは止める。 */ }
    this.stop(); this.callbacks.lobby(); this.callbacks.status(reason);
  }
  private stop(): void {
    this.setup?.abort(); this.setup = undefined;
    this.links?.close(); this.links = undefined;
    clearTimeout(this.refreshTimer); this.refreshTimer = undefined;
    this.match = undefined; this.startPerf = Infinity; this.activeId = ''; this.queued = [];
  }
  close(): void { this.closed = true; this.stop(); this.socket?.close(); this.socket = undefined; }
  get view(): RoomView | undefined { return this.room; }
}
