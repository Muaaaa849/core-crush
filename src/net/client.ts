import type { Command, PlayerId, SimState } from '../sim/types';
import { belongs, canonical, ClockSync, envelope, inputKey, ordered, predict, validCommand } from './messages';
import type { ConfirmedEvent, EventAckPacket, InputAck, InputPacket, Message, PlayerInput, Session, StatePacket } from './messages';

export class MemoryClient {
  state: SimState;
  confirmed: SimState;
  readonly events: ConfirmedEvent[] = [];
  readonly stats = { corrections: 0, rejected: 0 };
  snapshotNumber = 0;
  eventTail = 0;
  private seq = 0;
  private pending = new Map<string, { command: Command; accepted: boolean }>();
  private eventBuffer = new Map<number, ConfirmedEvent>();
  private latest?: StatePacket;
  private known: Command[] = [];
  readonly session: Session;

  constructor(s: Session, readonly player: PlayerId, readonly clock = new ClockSync()) {
    if (!s.initial.players.some(p => p.id === player)) throw Error('Unknown participant');
    this.session = structuredClone(s); this.state = structuredClone(s.initial); this.confirmed = structuredClone(s.initial);
  }
  get pendingCount(): number { return this.pending.size; }
  reserveSequences(count: number): void { this.seq = Math.max(this.seq, count); }
  // 中断で予測・旧入力を捨てる。確定イベントの受領位置も完全状態と一緒に同期する。
  restore(state: SimState, events: ConfirmedEvent[], epoch: number, localAt: number): void {
    this.session.epoch = epoch; this.session.initial = structuredClone(state);
    this.state = structuredClone(state); this.confirmed = structuredClone(state);
    this.events.splice(0, this.events.length, ...structuredClone(events));
    this.pending.clear(); this.eventBuffer.clear(); this.known = []; this.latest = undefined;
    this.snapshotNumber = 0; this.eventTail = events.length; this.seq = 0;
    this.clock.reset(state.now - localAt);
  }
  input(input: PlayerInput, localAt: number): Command {
    const command = { ...input, player: this.player, at: this.clock.hostTime(localAt), seq: this.seq++ } as Command;
    if (!validCommand(command)) throw Error('Invalid input');
    this.pending.set(inputKey(command), { command, accepted: false });
    // 到着済みstateより古い入力も、未確定なら次の予測でCから再実行する。
    if (command.at < this.state.now) this.reconcile();
    else this.known.push(command);
    return structuredClone(command);
  }
  batch(): InputPacket {
    return { ...envelope(this.session), kind: 'input', commands: structuredClone([...this.pending.values()]
      .filter(p => !p.accepted).map(p => p.command).slice(0, 256)) };
  }
  acknowledge(acks: InputAck[]): void {
    for (const [key, pending] of this.pending) {
      const ack = acks.find(a => a.player === this.player && a.from <= pending.command.seq && a.to >= pending.command.seq);
      if (ack?.status === 'rejected') { this.pending.delete(key); this.stats.rejected++; }
      else if (ack?.status === 'accepted') pending.accepted = true;
    }
  }
  receive(from: string, msg: Message, localReceivedAt?: number): void {
    if (from !== 'host' || !belongs(this.session, msg)) return;
    if (msg.kind === 'pong' && localReceivedAt !== undefined) { this.clock.observe(msg.sent, msg.hostAt, localReceivedAt); return; }
    if (msg.kind === 'events') {
      for (const e of msg.events) {
        if (Number.isSafeInteger(e.seq) && e.seq > this.events.length && !this.eventBuffer.has(e.seq)) this.eventBuffer.set(e.seq, structuredClone(e));
      }
      while (this.eventBuffer.has(this.events.length + 1)) {
        const next = this.eventBuffer.get(this.events.length + 1)!;
        this.eventBuffer.delete(next.seq); this.events.push(next);
      }
      return;
    }
    if (msg.kind !== 'state' || msg.number <= this.snapshotNumber) return;
    const before = this.state;
    this.latest = structuredClone(msg); this.snapshotNumber = msg.number; this.eventTail = msg.eventTail;
    this.confirmed = structuredClone(msg.confirmed);
    this.acknowledge(msg.acks);
    const included = new Set(msg.inputs.map(inputKey));
    for (const [key, pending] of this.pending) {
      if (pending.command.at < msg.confirmed.now || included.has(key)) this.pending.delete(key);
    }
    this.reconcile();
    if (canonical(before) !== canonical(this.state)) this.stats.corrections++;
  }
  private reconcile(): void {
    const pending = [...this.pending.values()].map(p => p.command), snapshot = this.latest;
    const target = Math.max(this.state.now, snapshot?.provisional.now ?? this.session.initial.now);
    const rewind = snapshot && pending.some(c => c.at < snapshot.provisional.now);
    const base = snapshot ? rewind ? snapshot.confirmed : snapshot.provisional : this.session.initial;
    const merged = new Map((snapshot?.inputs ?? []).map(c => [inputKey(c), c]));
    for (const command of pending) merged.set(inputKey(command), command);
    this.known = ordered([...merged.values()]);
    this.state = predict(base, target, this.known, this.session.config);
  }
  advance(until: number): void {
    if (!Number.isSafeInteger(until) || until < this.state.now) throw Error('Clock must advance monotonically');
    this.state = predict(this.state, until, this.known, this.session.config);
  }
  eventAck(): EventAckPacket { return { ...envelope(this.session), kind: 'event-ack', through: this.events.length }; }
}
