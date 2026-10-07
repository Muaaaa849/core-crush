import type { Input } from '../game/runner';
import { localMatch } from '../game/match';
import { defaultConfig } from '../sim/config';
import { createInitialState } from '../sim/sim';
import type { PlayerId, SimEvent, SimState } from '../sim/types';
import { MemoryClient } from './client';
import { MemoryHost } from './host';
import { canonical, envelope } from './messages';
import type { Delivery, Message, Session } from './messages';
import { PROTOCOL } from './room-protocol';
import type { RoomView } from './room-protocol';

// simと描画を分け、ホストの操作者にも同じ100ms受付と予測訂正を適用する。
export class OnlineMatch {
  readonly session: Session;
  readonly client: MemoryClient;
  private host?: MemoryHost;
  private eventIndex = 0;
  private lastPing = -Infinity;
  previous: SimState;
  constructor(room: RoomView, readonly player: PlayerId, private readonly delivery: Delivery, private readonly now: () => number) {
    this.session = { matchId: room.matchId, epoch: 1, protocol: PROTOCOL, build: room.build, config: defaultConfig,
      initial: createInitialState(localMatch(room.mode, room.firstBall), defaultConfig) };
    this.client = new MemoryClient(this.session, player); this.previous = this.client.state;
    if (player === 'p1') {
      const slots = Object.fromEntries(room.players.map(p => [p.id === 'p1' ? 'host' : p.id, p.id]));
      this.host = new MemoryHost(this.session, slots);
      for (const peer of Object.keys(slots)) this.host.connect(peer, this.session);
    }
    delivery.bind(this.peer, (from, msg, at) => this.receive(from, msg, at));
  }
  get peer(): string { return this.player === 'p1' ? 'host' : this.player; }
  get state(): SimState { return this.client.state; }
  get confirmed(): SimState { return this.client.confirmed; }
  get alpha(): number { return 1; }
  get finished(): boolean { return this.confirmed.match.phase === 'over' && this.client.events.some(e => e.event.kind === 'match-end'); }
  input(input: Input): void {
    if (this.finished || input.player !== this.player) return;
    const { player: _player, ...command } = input;
    this.client.input(command, this.now());
    this.delivery.send(this.peer, 'host', 'input', this.client.batch(), this.now());
  }
  private receive(from: string, msg: Message, at: number): void {
    if (this.host && ['input', 'ping', 'event-ack'].includes(msg.kind)) {
      this.host.receive(from, msg, at); this.flush();
    } else this.client.receive(from, msg, at);
  }
  private flush(): void { for (const out of this.host?.drain() ?? []) this.delivery.send('host', out.to, out.channel, out.message, this.now()); }
  advance(): void {
    const now = this.now(); this.previous = this.state;
    if (now - this.lastPing >= (this.client.clock.ready ? 60_000 : 3000)) {
      this.lastPing = now;
      this.delivery.send(this.peer, 'host', 'event', { ...envelope(this.session), kind: 'ping', sent: now }, now);
    }
    this.delivery.send(this.peer, 'host', 'input', this.client.batch(), now);
    this.delivery.send(this.peer, 'host', 'event', this.client.eventAck(), now);
    if (this.host) { this.host.advance(Math.max(now, this.host.H)); this.flush(); }
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
