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
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private networkTimer?: ReturnType<typeof setInterval>;
  private repairing = new Set<PlayerId>();
  private delivery?: DataChannelDelivery;
  private invalidReported = false;
  private wasPaused = false;
  private lastRepair = -Infinity;
  private restored = false;
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
  private get storageKey(): string { return `corecrush-room:${this.url}`; }
  static savedCode(url: string, build: string): string | undefined {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`corecrush-room:${url}`) ?? 'null');
      return saved?.build === build ? saved.admission?.code : undefined;
    } catch { return undefined; }
  }
  private saveAdmission(): void {
    sessionStorage.setItem(this.storageKey, JSON.stringify({ build: this.build, admission: this.admission, ice: this.ice }));
  }
  async enter(mode: MatchMode | undefined, code?: string): Promise<void> {
    let token: string | undefined;
    if (!mode && code) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(this.storageKey) ?? 'null');
        if (saved?.build === this.build && saved.admission?.code === code) { token = saved.admission.token; this.ice = saved.ice; }
      } catch { /* 壊れた保存内容は使用しない。 */ }
    }
    this.restored = !!token;
    this.admission = await this.request<Admission>(mode ? '/rooms' : `/rooms/${code}/join`, mode ? { mode, build: this.build } : { build: this.build }, token);
    this.saveAdmission();
    if (!this.closed) await this.openSocket();
  }
  private async openSocket(): Promise<void> {
    const a = this.admission!;
    const ws = new WebSocket(this.url.replace(/^http/, 'ws') + `/rooms/${a.code}/socket`, ['corecrush', a.token]);
    this.socket = ws;
    ws.onmessage = e => {
      if (this.socket !== ws || this.closed) return;
      try { this.receive(JSON.parse(e.data) as RoomReply); } catch (error) { this.fail(error); }
    };
    ws.onclose = e => {
      if (this.closed || this.socket !== ws) return;
      if (e.reason === 'replaced') {
        this.stop(); this.callbacks.status('同じ参加枠は別の接続で復帰しました'); this.callbacks.disconnected(); return;
      }
      if (!this.match) { this.stop(); this.callbacks.status('部屋への接続が切れました'); this.callbacks.disconnected(); return; }
      this.reconnectSocket();
    };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(Error('部屋への接続がタイムアウトしました')); }, 3000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(Error('部屋に接続できません')); };
    });
  }
  private reconnectSocket(): void {
    if (this.reconnectTimer || this.closed || this.match?.status === 'invalid') return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openSocket().catch(() => this.reconnectSocket());
    }, 250);
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
    if (msg.kind === 'host-left') {
      if (msg.matchId === this.activeId) this.match?.hostLeft(); return;
    }
    if (msg.kind === 'repair') {
      if (msg.matchId === this.activeId && this.admission?.player === 'p1'
        && (!this.match?.synchronized(msg.from) || this.links?.needsRepair(msg.from))) void this.repair(msg.from);
      return;
    }
    if (msg.kind === 'signal') {
      if (msg.matchId !== this.activeId) return;
      if (!this.links) { if (this.queued.length < 200) this.queued.push(msg); else this.fail(Error('信号が多すぎます')); }
      else void this.links.receive(msg.from, msg.generation, msg.description, msg.candidate).catch(error => this.fail(error));
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
    } else if (msg.room.phase === 'countdown' && !this.match && this.restored) {
      this.activeId = msg.room.matchId;
      this.startPerf = performance.now() + msg.room.startAt - (Date.now() + this.serverOffset);
      if (this.admission.player === 'p1') {
        // 確定状態を失ったホストは沈黙として扱い、相手側の2秒／10秒監視に任せる。
        this.callbacks.status('無効試合：ホストの確定状態を失いました'); return;
      }
      this.setup = new AbortController(); const signal = this.setup.signal;
      void this.prepare(msg.room, signal, true).catch(error => { if (!signal.aborted) this.fail(error); });
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
    this.saveAdmission();
    this.callbacks.status(this.ice.mode === 'turn' ? '直接接続を優先・必要時はTURN中継' : `STUNのみ（${this.ice.reason === 'secrets-missing' ? 'TURN秘密が未設定' : 'TURNが無効'}）`);
    if (this.relay && this.ice.mode !== 'turn') throw Error('relay試験にはTURNの設定が必要です');
    return this.ice;
  }
  private async prepare(room: RoomView, signal: AbortSignal, reconnect = false): Promise<void> {
    const ice = await this.credentials(); if (signal.aborted) return;
    const player = this.admission!.player;
    const now = () => Math.max(0, Math.floor((performance.now() - this.startPerf) * 60));
    const delivery = this.delivery = new DataChannelDelivery(player === 'p1' ? 'host' : player, now);
    this.match = new OnlineMatch(room, player, delivery, now);
    if (reconnect) this.match.waitForSync();
    // 非表示タブでも描画フレーム待ちでheartbeatを止めない。
    this.networkTimer = setInterval(() => {
      if (!this.playing) return;
      try { this.match?.advance(); this.poll(); } catch (error) { this.fail(error); }
    }, 50);
    this.links = new StarLinks(player, room.matchId, delivery, s => this.send(s), error => this.fail(error), {
      iceServers: ice.iceServers, iceTransportPolicy: this.relay ? 'relay' : 'all',
    }, room.players.map(p => p.id));
    for (const queued of this.queued.splice(0)) await this.links.receive(queued.from, queued.generation, queued.description, queued.candidate);
    this.callbacks.preparing(this.match);
    await this.links.offer();
    if (reconnect) this.send({ kind: 'repair', matchId: room.matchId });
    const peers = player === 'p1' ? room.players.filter(p => p.id !== 'p1').map(p => p.id) : ['host'];
    await waitForLinks(() => delivery.ready(peers), reconnect ? 8000 : Math.max(0, room.deadline - Date.now() - this.serverOffset), signal);
    if (reconnect) { this.match.rejoin(); this.scheduleRefresh(ice); return; }
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
    if (this.match && this.playing) return;
    const reason = error instanceof Error ? error.message : String(error);
    try { this.send({ kind: 'abort', matchId: this.activeId }); } catch { /* 切断済みでもローカルは止める。 */ }
    this.stop(); this.callbacks.lobby(); this.callbacks.status(reason);
  }
  // 中断中だけリンクを修復する。Escや信号用接続だけの切断では試合を止めない。
  poll(): void {
    if (!this.match) return;
    if (this.match.status === 'invalid') {
      if (!this.invalidReported) {
        this.invalidReported = true; this.callbacks.status('無効試合');
        clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
      }
      return;
    }
    if (this.match.status !== 'paused') {
      if (this.wasPaused) { this.wasPaused = false; this.callbacks.status('再接続しました'); }
      return;
    }
    this.wasPaused = true;
    this.callbacks.status(`通信が途切れました…再接続を待っています（残り${this.match.remainingSeconds}秒）`);
    if (this.socket?.readyState !== WebSocket.OPEN || performance.now() - this.lastRepair < 1000) return;
    this.lastRepair = performance.now();
    if (this.admission!.player === 'p1') {
      for (const p of this.room!.players) if (p.id !== 'p1' && this.links?.needsRepair(p.id)) void this.repair(p.id);
    } else this.send({ kind: 'repair', matchId: this.activeId });
  }
  private async repair(peer: PlayerId): Promise<void> {
    if (!this.links || this.repairing.has(peer) || this.match?.status === 'invalid') return;
    this.repairing.add(peer); const links = this.links;
    try {
      await links.reconnect(peer);
      await waitForLinks(() => this.delivery?.ready([peer]) ?? false, 3000, this.setup?.signal);
    } catch { /* 次の監視で期限内に再試行する。 */ }
    finally { this.repairing.delete(peer); }
  }
  private stop(): void {
    this.setup?.abort(); this.setup = undefined;
    this.delivery = undefined; this.repairing.clear(); this.invalidReported = false;
    this.wasPaused = false;
    clearInterval(this.networkTimer); this.networkTimer = undefined;
    clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
    this.links?.close(); this.links = undefined;
    clearTimeout(this.refreshTimer); this.refreshTimer = undefined;
    this.match = undefined; this.startPerf = Infinity; this.activeId = ''; this.queued = [];
  }
  close(leave = true): void {
    if (leave) {
      if (this.admission?.player === 'p1' && this.activeId && !this.match?.finished) {
        try { this.send({ kind: 'leave', matchId: this.activeId }); } catch { /* 相手は通信期限で停止する。 */ }
      }
      sessionStorage.removeItem(this.storageKey);
    }
    this.closed = true; clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
    this.stop(); this.socket?.close(); this.socket = undefined;
  }
  get view(): RoomView | undefined { return this.room; }
}
