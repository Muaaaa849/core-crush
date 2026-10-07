import type { Bot } from '../game/bot';
import type { Command, PlayerId, SimEvent, SimState } from '../sim/types';
import { advanceTick, belongs, canonical, envelope, inputKey, ordered, validCommand } from './messages';
import type { ConfirmedEvent, EventPacket, InputAck, Message, Outgoing, RejectReason, Session, StatePacket } from './messages';

interface RecordInput { command: Command; fingerprint: string; ack: InputAck }
interface Frame {
  state: SimState;
  bots: ReturnType<Bot['snapshot']>[];
  inputs: Command[];
  events: SimEvent[];
}

export class MemoryHost {
  readonly events: ConfirmedEvent[] = [];
  readonly stats = { lateRejected: 0, finalRejected: 0, rollbacks: 0, replayedTicks: 0 };
  private readonly records = new Map<string, RecordInput>();
  private readonly activeInputs = new Map<string, Command>();
  private readonly acks: InputAck[] = [];
  private readonly frames = new Map<number, Frame>();
  private readonly connected = new Set<string>();
  private readonly eventReceipts = new Map<string, number>();
  private outbox: Outgoing[] = [];
  private dirty = Infinity;
  private number = 0;
  private horizon: number;
  private confirmedAt: number;
  private readonly start: number;
  private readonly window: number;
  private readonly signature: string;
  private frozen = false;
  readonly session: Session;
  readonly slots: Readonly<Record<string, PlayerId>>;

  constructor(s: Session, slots: Readonly<Record<string, PlayerId>>, private readonly bots: Bot[] = []) {
    this.session = structuredClone(s); this.slots = { ...slots };
    this.start = this.horizon = this.confirmedAt = s.initial.now;
    this.window = s.config.timeUnitsPerSecond / 10;
    if (s.config.tick !== s.config.frame || s.config.tick * 60 !== s.config.timeUnitsPerSecond
      || !Number.isSafeInteger(this.start) || this.window % s.config.tick !== 0) throw Error('60Hz integer clock required');
    const assigned = [...Object.values(slots), ...bots.map(b => b.player)].sort();
    if (canonical(assigned) !== canonical(s.initial.players.map(p => p.id).sort())) throw Error('Each participant needs one slot or Bot');
    this.signature = canonical(this.session);
    this.frames.set(this.start, { state: structuredClone(s.initial), bots: bots.map(b => b.snapshot()), inputs: [], events: [] });
  }
  get state(): SimState { this.settle(); return this.frames.get(this.horizon)!.state; }
  get H(): number { return this.horizon; }
  get C(): number { return this.confirmedAt; }
  freeze(): SimState {
    this.settle(); this.frozen = true;
    const frame = this.frames.get(this.C)!;
    this.bots.forEach((b, i) => b.restore(frame.bots[i]));
    this.horizon = this.C; this.activeInputs.clear(); this.outbox = [];
    return structuredClone(frame.state);
  }
  connect(peer: string, s: Session): boolean {
    if (!Object.hasOwn(this.slots, peer) || canonical(s) !== this.signature) return false;
    this.connected.add(peer); return true;
  }
  receive(peer: string, msg: Message, receivedAt: number): InputAck[] {
    if (this.frozen) return [];
    if (!this.connected.has(peer) || !belongs(this.session, msg) || !Number.isSafeInteger(receivedAt) || receivedAt < this.start) return [];
    if (msg.kind === 'event-ack') {
      if (Number.isSafeInteger(msg.through) && msg.through >= 0 && msg.through <= this.events.length) {
        this.eventReceipts.set(peer, Math.max(this.eventReceipts.get(peer) ?? 0, msg.through));
      }
      return [];
    }
    if (msg.kind === 'ping') {
      if (Number.isSafeInteger(msg.sent)) this.outbox.push({ to: peer, channel: 'event',
        message: { ...envelope(this.session), kind: 'pong', sent: msg.sent, hostAt: receivedAt } });
      return [];
    }
    if (msg.kind !== 'input' || !Array.isArray(msg.commands) || msg.commands.length > 256) return [];
    return msg.commands.map(command => {
      const ack: InputAck = { player: command?.player, from: command?.seq, to: command?.seq, status: 'accepted' };
      const reject = (reason: RejectReason) => ({ ...ack, status: 'rejected' as const, reason });
      if (!validCommand(command)) return reject('invalid');
      if (command.player !== this.slots[peer]) return reject('identity');
      const key = inputKey(command), fingerprint = canonical(command), previous = this.records.get(key);
      if (previous) return previous.fingerprint === fingerprint ? previous.ack : reject('changed');
      if (command.at < this.C) { ack.status = 'rejected'; ack.reason = 'final'; this.stats.finalRejected++; }
      else if (receivedAt - command.at > this.window) { ack.status = 'rejected'; ack.reason = 'late'; this.stats.lateRejected++; }
      else if (command.at > receivedAt + this.session.config.frame) { ack.status = 'rejected'; ack.reason = 'future'; }
      this.records.set(key, { command: structuredClone(command), fingerprint, ack });
      this.acks.push({ ...ack });
      this.acks.sort((a, b) => a.player.localeCompare(b.player) || a.from - b.from);
      for (let i = 1; i < this.acks.length;) {
        const a = this.acks[i - 1], b = this.acks[i];
        if (a.player === b.player && a.to + 1 === b.from && a.status === b.status && a.reason === b.reason) {
          a.to = b.to; this.acks.splice(i, 1);
        } else i++;
      }
      if (ack.status === 'accepted') {
        this.activeInputs.set(key, structuredClone(command));
        if (command.at < this.H) this.dirty = Math.min(this.dirty, command.at);
      }
      return ack;
    });
  }
  private simulate(): void {
    const at = this.H, previous = this.frames.get(at)!;
    const inputs = ordered([...this.activeInputs.values()].filter(c => c.at >= at && c.at < at + this.session.config.tick)
      .concat(this.bots.flatMap(b => b.think(previous.state))));
    const result = advanceTick(previous.state, inputs, this.session.config);
    previous.inputs = inputs; previous.events = result.events;
    this.horizon += this.session.config.tick;
    this.frames.set(this.H, { state: result.state, bots: this.bots.map(b => b.snapshot()), inputs: [], events: [] });
  }
  private settle(): void {
    if (this.dirty === Infinity) return;
    const end = this.H;
    const at = this.start + Math.floor((this.dirty - this.start) / this.session.config.tick) * this.session.config.tick;
    const frame = this.frames.get(at)!;
    this.bots.forEach((b, i) => b.restore(frame.bots[i]));
    this.horizon = at; this.dirty = Infinity; this.stats.rollbacks++;
    while (this.H < end) { this.simulate(); this.stats.replayedTicks++; }
  }
  advance(until: number): void {
    if (this.frozen) return;
    if (this.connected.size !== Object.keys(this.slots).length) throw Error('Initialization incomplete');
    if (!Number.isSafeInteger(until) || until < this.H) throw Error('Clock must advance monotonically');
    this.settle();
    while (this.H + this.session.config.tick <= until) {
      this.simulate();
      const nextC = Math.max(this.start, this.H - this.window), oldC = this.C;
      const newlyFinal = [...this.frames.values()].flatMap(f => f.events).filter(e => e.at >= oldC && e.at < nextC);
      this.confirmedAt = nextC;
      for (const [key, input] of this.activeInputs) if (input.at < nextC) this.activeInputs.delete(key);
      for (const event of newlyFinal) this.events.push({ seq: this.events.length + 1, event: structuredClone(event) });
      for (const at of this.frames.keys()) if (at < this.C - this.session.config.tick) this.frames.delete(at);
      const stateDue = (this.H - this.start) % (3 * this.session.config.tick) === 0;
      const snapshot = stateDue ? this.snapshot() : undefined;
      for (const peer of this.connected) {
        if (snapshot) this.queue({ to: peer, channel: 'state', message: snapshot });
        if (newlyFinal.length || stateDue) {
          const events = this.eventsFor(peer);
          if (events.events.length) this.queue({ to: peer, channel: 'event', message: events });
        }
      }
    }
  }
  private queue(out: Outgoing): void {
    // 未送信stateは最新1件。未受領eventは最新の完全な連番列にまとめる。
    const index = this.outbox.findIndex(old => old.to === out.to && old.message.kind === out.message.kind);
    if (index < 0) this.outbox.push(out);
    else this.outbox[index] = out;
  }
  snapshot(): StatePacket {
    this.settle();
    const inputs = ordered([...this.activeInputs.values()].concat([...this.frames.entries()].filter(([at]) => at >= this.C)
        .flatMap(([, f]) => f.inputs.filter(c => this.bots.some(b => b.player === c.player)))));
    return structuredClone({ ...envelope(this.session), kind: 'state', number: ++this.number,
      provisional: this.frames.get(this.H)!.state, confirmed: this.frames.get(this.C)!.state,
      inputs, acks: this.acks, eventTail: this.events.length });
  }
  eventsFor(peer: string): EventPacket {
    return { ...envelope(this.session), kind: 'events', events: structuredClone(this.events.slice(this.eventReceipts.get(peer) ?? 0)) };
  }
  drain(): Outgoing[] { const out = this.outbox; this.outbox = []; return out; }
}
