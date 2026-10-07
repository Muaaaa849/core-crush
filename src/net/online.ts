import type { Input } from '../game/runner';
import { localMatch } from '../game/match';
import { defaultConfig } from '../sim/config';
import { createInitialState } from '../sim/sim';
import type { Command, PlayerId, SimEvent, SimState } from '../sim/types';
import { MemoryClient } from './client';
import { MemoryHost } from './host';
import { belongs, canonical, envelope, validCommand, validMessage } from './messages';
import type { ConfirmedEvent, Delivery, HeldInput, Message, Session, SyncAckPacket } from './messages';
import { PROTOCOL } from './room-protocol';
import type { RoomView } from './room-protocol';

// 壁時計で通信を監視し、停止時間をsim時計から差し引く。simの規則は変えない。
export class OnlineMatch {
  readonly session: Session;
  readonly client: MemoryClient;
  status: 'running' | 'paused' | 'invalid' = 'running';
  private host?: MemoryHost;
  private readonly slots: Record<string, PlayerId>;
  private eventIndex = 0;
  private lastPing = -Infinity;
  private lastSync = -Infinity;
  private offset = 0;
  private lastReceived = new Map<string, number>();
  private pausedAt?: number;
  private frozenEvents: ConfirmedEvent[] = [];
  private syncAcks = new Map<string, SyncAckPacket>();
  private held: HeldInput = { move: { x: 0, z: 0 }, keys: { forward: 0, right: 0 } };
  previous: SimState;
  constructor(room: RoomView, readonly player: PlayerId, private readonly delivery: Delivery, private readonly now: () => number) {
    this.session = { matchId: room.matchId, epoch: 1, protocol: PROTOCOL, build: room.build, config: defaultConfig,
      initial: createInitialState(localMatch(room.mode, room.firstBall), defaultConfig) };
    this.client = new MemoryClient(this.session, player); this.previous = this.client.state;
    this.slots = Object.fromEntries(room.players.map(p => [p.id === 'p1' ? 'host' : p.id, p.id]));
    for (const peer of player === 'p1' ? Object.keys(this.slots) : ['host']) this.lastReceived.set(peer, now());
    if (player === 'p1') this.makeHost();
    delivery.bind(this.peer, (from, msg, at) => this.receive(from, msg, at));
  }
  private makeHost(): void {
    this.host = new MemoryHost(this.session, this.slots);
    this.host.events.push(...structuredClone(this.frozenEvents));
    for (const peer of Object.keys(this.slots)) this.host.connect(peer, this.session);
  }
  get peer(): string { return this.player === 'p1' ? 'host' : this.player; }
  get state(): SimState { return this.client.state; }
  get confirmed(): SimState { return this.client.confirmed; }
  get alpha(): number { return 1; }
  get finished(): boolean { return this.confirmed.match.phase === 'over' && this.client.events.some(e => e.event.kind === 'match-end'); }
  get remainingSeconds(): number { return this.pausedAt === undefined ? 10 : Math.max(0, Math.ceil((this.pausedAt + this.grace - this.now()) / this.second)); }
  private get second(): number { return this.session.config.timeUnitsPerSecond; }
  private get grace(): number { return 10 * this.second; }
  input(input: Input): void {
    if (this.finished || this.status === 'invalid' || input.player !== this.player) return;
    const { player: _player, ...command } = input;
    if (!validCommand({ ...command, player: this.player, seq: 0, at: 0 } as Command)) return;
    if (command.kind === 'move') this.held.move = { x: command.x, z: command.z };
    if (command.kind === 'keys') this.held.keys = { forward: command.forward, right: command.right };
    if (this.status !== 'running') return;
    this.client.input(command, this.now());
    this.send('host', 'input', this.client.batch());
  }
  private send(to: string, channel: 'input' | 'state' | 'event', msg: Message): void {
    this.delivery.send(this.peer, to, channel, msg, this.now());
  }
  private receive(from: string, msg: Message, at: number): void {
    if (this.status === 'invalid' || !validMessage(msg) || msg.matchId !== this.session.matchId) return;
    if (this.status === 'running' && belongs(this.session, msg) && from !== this.peer
      && this.lastReceived.has(from) && at - this.lastReceived.get(from)! >= 2 * this.second) {
      this.pause(this.lastReceived.get(from)! + 2 * this.second);
    }
    if (this.host && from in this.slots && msg.kind === 'rejoin') {
      if (this.finished) this.send(from, 'event', { ...envelope(this.session), kind: 'complete',
        snapshot: this.host.snapshot(), events: this.host.events, hostAt: this.host.C });
      if (this.status === 'paused') this.sync(true);
      return;
    }
    if (from === 'host' && !this.host && msg.kind === 'complete' && msg.epoch >= this.session.epoch) {
      if (this.finished) return;
      this.restart(msg.snapshot.confirmed, msg.events, msg.epoch, at);
      this.client.receive('host', msg.snapshot, at); this.eventIndex = msg.events.length; return;
    }
    if (from === 'host' && !this.host && msg.kind === 'sync' && msg.epoch >= this.session.epoch) {
      if (this.finished || msg.remaining <= 0) return;
      // 再接続端末にも同じ確定状態を渡す。繰り返し通知で期限を延長しない。
      this.pausedAt = Math.min(this.pausedAt ?? at, at - (this.grace - msg.remaining));
      this.status = 'paused'; this.session.epoch = msg.epoch;
      this.frozenEvents = structuredClone(msg.events);
      this.client.restore(msg.state, msg.events, msg.epoch, at); this.previous = this.state;
      this.eventIndex = this.client.events.length;
      this.ack(); return;
    }
    if (from === 'host' && !this.host && msg.kind === 'resume' && this.status === 'paused' && msg.epoch === this.session.epoch + 1) {
      if (at - this.pausedAt! >= this.grace) { this.invalidate(); return; }
      this.restart(msg.snapshot.confirmed, msg.events, msg.epoch, at);
      this.client.receive('host', msg.snapshot, at); this.client.reserveSequences(2); return;
    }
    if (!belongs(this.session, msg)) return;
    if (from === 'host' && msg.kind === 'invalid') { this.invalidate(); return; }
    if (this.host && msg.kind === 'sync-ack') {
      if (this.status !== 'paused' || at - this.pausedAt! >= this.grace) { if (this.status === 'paused') this.invalidate(); return; }
      if (from in this.slots && msg.nextEpoch === this.session.epoch + 1 && msg.through === this.frozenEvents.length) {
        this.syncAcks.set(from, structuredClone(msg)); this.lastReceived.set(from, at);
        if (this.syncAcks.size === Object.keys(this.slots).length) this.resume(at);
      }
      return;
    }
    if (this.status !== 'running') return;
    if (this.host && from in this.slots && ['input', 'ping', 'event-ack'].includes(msg.kind)) {
      if (msg.kind === 'input' && msg.commands.some(c => c.player !== this.slots[from])) return;
      if (msg.kind === 'event-ack' && msg.through > this.host.events.length) return;
      this.lastReceived.set(from, at);
      if (msg.kind === 'ping') this.send(from, 'event', { ...envelope(this.session), kind: 'pong', sent: msg.sent, hostAt: at - this.offset });
      else { this.host.receive(from, msg, at - this.offset); this.flush(); }
    } else if (from === 'host' && ['state', 'events', 'pong'].includes(msg.kind)) {
      this.lastReceived.set(from, at); this.client.receive(from, msg, at);
    }
  }
  private flush(): void { for (const out of this.host?.drain() ?? []) this.send(out.to, out.channel, out.message); }
  private pause(at: number): void {
    if (this.finished || this.status !== 'running') return;
    this.status = 'paused'; this.pausedAt = at; this.syncAcks.clear(); this.lastSync = -Infinity;
    const state = this.host?.freeze() ?? this.confirmed;
    this.frozenEvents = structuredClone(this.host?.events ?? this.client.events);
    this.client.restore(state, this.frozenEvents, this.session.epoch, at); this.previous = this.state;
    if (this.host) this.sync();
  }
  private sync(force = false): void {
    if (!this.host || this.status !== 'paused') return;
    if (!force && this.now() - this.lastSync < this.second / 4) return;
    this.lastSync = this.now();
    // ホスト自身も現在の移動状態を同期ACKとして扱う。
    this.syncAcks.set('host', { ...envelope(this.session), kind: 'sync-ack', nextEpoch: this.session.epoch + 1,
      through: this.frozenEvents.length, held: structuredClone(this.held) });
    for (const peer of Object.keys(this.slots).filter(p => p !== 'host')) this.send(peer, 'event', {
      ...envelope(this.session), kind: 'sync', nextEpoch: this.session.epoch + 1,
      remaining: Math.max(0, this.pausedAt! + this.grace - this.now()), state: this.state, events: this.frozenEvents,
    });
  }
  private ack(): void {
    this.send('host', 'event', { ...envelope(this.session), kind: 'sync-ack', nextEpoch: this.session.epoch + 1,
      through: this.client.events.length, held: this.held });
  }
  private restart(state: SimState, events: ConfirmedEvent[], epoch: number, at: number): void {
    this.session.epoch = epoch; this.session.initial = structuredClone(state);
    this.client.restore(state, events, epoch, at); this.previous = this.state;
    this.offset = at - state.now; this.pausedAt = undefined; this.status = 'running'; this.lastPing = -Infinity;
    this.eventIndex = Math.min(this.eventIndex, events.length);
    for (const peer of this.lastReceived.keys()) this.lastReceived.set(peer, at);
  }
  private resume(at: number): void {
    this.syncAcks.get('host')!.held = structuredClone(this.held);
    const state = structuredClone(this.state), events = this.frozenEvents, acks = [...this.syncAcks];
    this.restart(state, events, this.session.epoch + 1, at); this.makeHost();
    for (const [peer, ack] of acks) this.host!.receive(peer, { ...envelope(this.session), kind: 'input', commands: [
      { kind: 'move', player: this.slots[peer], seq: 0, at: state.now, ...ack.held.move },
      { kind: 'keys', player: this.slots[peer], seq: 1, at: state.now, ...ack.held.keys },
    ] }, state.now);
    const snapshot = this.host!.snapshot();
    this.client.receive('host', snapshot, at);
    // 再開入力のseqを採番にも反映し、通常入力との重複を防ぐ。
    this.client.reserveSequences(2);
    for (const peer of Object.keys(this.slots).filter(p => p !== 'host')) this.send(peer, 'event', {
      ...envelope(this.session), kind: 'resume', snapshot, events, hostAt: state.now,
    });
  }
  rejoin(): void { this.send('host', 'event', { ...envelope(this.session), kind: 'rejoin' }); }
  synchronized(peer: string): boolean { return this.status === 'paused' && this.syncAcks.has(peer); }
  waitForSync(): void { this.pause(this.now()); }
  hostLeft(): void { this.invalidate(); }
  private invalidate(): void {
    if (this.finished || this.status === 'invalid') return;
    if (this.status === 'running') this.pause(this.now());
    this.status = 'invalid';
    if (this.host) for (const peer of Object.keys(this.slots).filter(p => p !== 'host')) this.send(peer, 'event', { ...envelope(this.session), kind: 'invalid' });
  }
  advance(): void {
    const now = this.now(); this.previous = this.state;
    if (this.finished || this.status === 'invalid') return;
    if (this.status === 'running' && [...this.lastReceived].some(([peer, at]) => peer !== this.peer && now - at >= 2 * this.second)) {
      const deadline = Math.min(...[...this.lastReceived].filter(([peer]) => peer !== this.peer).map(([, at]) => at + 2 * this.second));
      this.pause(deadline);
    }
    if (this.status === 'paused') {
      if (now - this.pausedAt! >= this.grace) this.invalidate();
      else if (this.host) this.sync();
      return;
    }
    if (now - this.lastPing >= this.second / 2) {
      this.lastPing = now; this.send('host', 'event', { ...envelope(this.session), kind: 'ping', sent: now });
    }
    this.send('host', 'input', this.client.batch()); this.send('host', 'event', this.client.eventAck());
    if (this.host) { this.host.advance(Math.max(now - this.offset, this.host.H)); this.flush(); }
    this.client.advance(Math.max(this.state.now, this.client.clock.hostTime(now)));
  }
  drainEvents(): SimEvent[] {
    const events = this.client.events.slice(this.eventIndex).map(e => e.event); this.eventIndex = this.client.events.length; return events;
  }
  async signature(): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(this.session)));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
