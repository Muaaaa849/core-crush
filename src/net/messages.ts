import type { SimConfig } from '../sim/config';
import { step } from '../sim/sim';
import type { Command, PlayerId, SimEvent, SimState } from '../sim/types';

export interface Session {
  matchId: string;
  epoch: number;
  build: string;
  protocol: number;
  config: SimConfig;
  initial: SimState;
}
export interface Envelope { matchId: string; epoch: number }
export type RejectReason = 'late' | 'final' | 'future' | 'invalid' | 'identity' | 'changed';
export interface InputAck {
  player: PlayerId;
  from: number;
  to: number;
  status: 'accepted' | 'rejected';
  reason?: RejectReason;
}
export interface InputPacket extends Envelope { kind: 'input'; commands: Command[] }
export interface StatePacket extends Envelope {
  kind: 'state';
  number: number;
  provisional: SimState;
  confirmed: SimState;
  inputs: Command[];
  acks: InputAck[];
  eventTail: number;
}
export interface ConfirmedEvent { seq: number; event: SimEvent }
export interface EventPacket extends Envelope { kind: 'events'; events: ConfirmedEvent[] }
export interface EventAckPacket extends Envelope { kind: 'event-ack'; through: number }
export interface PingPacket extends Envelope { kind: 'ping'; sent: number }
export interface PongPacket extends Envelope { kind: 'pong'; sent: number; hostAt: number }
export interface HeldInput { move: { x: number; z: number }; keys: { forward: number; right: number } }
export interface SyncPacket extends Envelope {
  kind: 'sync'; nextEpoch: number; remaining: number; state: SimState; events: ConfirmedEvent[];
}
export interface SyncAckPacket extends Envelope { kind: 'sync-ack'; nextEpoch: number; through: number; held: HeldInput }
export interface ResumePacket extends Envelope { kind: 'resume' | 'complete'; snapshot: StatePacket; events: ConfirmedEvent[]; hostAt: number }
export interface RejoinPacket extends Envelope { kind: 'rejoin' }
export interface InvalidPacket extends Envelope { kind: 'invalid' }
export type Message = InputPacket | StatePacket | EventPacket | EventAckPacket | PingPacket | PongPacket
  | SyncPacket | SyncAckPacket | ResumePacket | RejoinPacket | InvalidPacket;
export type Channel = 'input' | 'state' | 'event';
export type Receiver = (from: string, message: Message, receivedAt: number) => void;
export interface Delivery {
  bind(peer: string, receiver: Receiver): void;
  send(from: string, to: string, channel: Channel, message: Message, at: number): void;
}
export interface Outgoing { to: string; channel: Channel; message: Message }
type OmitCommand<T> = T extends unknown ? Omit<T, 'player' | 'at' | 'seq'> : never;
export type PlayerInput = OmitCommand<Command>;

// オブジェクトのキー順ではなく内容で初期化と同一seqの一致を判定する。
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
export function envelope(s: Session): Envelope { return { matchId: s.matchId, epoch: s.epoch }; }
export function belongs(s: Session, msg: Envelope): boolean { return msg.matchId === s.matchId && msg.epoch === s.epoch; }
// 生存監視には、認証済みリンクから届いた有効なパケットだけを使う。
export function validMessage(msg: Message): boolean {
  if (!msg || typeof msg.matchId !== 'string' || !Number.isSafeInteger(msg.epoch) || msg.epoch < 1) return false;
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const side = (s: unknown) => s === 'a' || s === 'b';
  const player = (p: unknown) => ['p1', 'p2', 'p3', 'p4'].includes(p as string);
  const vector = (v: { x: number; y: number; z: number }) => v && [v.x, v.y, v.z].every(Number.isFinite);
  const event = (e: SimEvent) => {
    if (!e || !integer(e.at)) return false;
    switch (e.kind) {
      case 'match-end': return side(e.winner);
      case 'round-end': return (side(e.winner) || e.winner === null) && ['ko', 'time'].includes(e.reason);
      case 'round-start': return integer(e.round) && side(e.side);
      case 'catch': return player(e.player) && ['just', 'good', 'so-so'].includes(e.grade) && vector(e.position);
      case 'parry': return player(e.player) && ['just', 'good', 'so-so'].includes(e.grade) && vector(e.position) && Number.isFinite(e.rallySpeed) && e.rallySpeed >= 0;
      case 'whiff': case 'pickup': case 'release': case 'summon': return player(e.player);
      case 'step': return player(e.player) && ['forward', 'back', 'left', 'right'].includes(e.direction);
      case 'hit': return player(e.player) && Number.isFinite(e.damage) && vector(e.position) && vector(e.direction) && typeof e.ko === 'boolean';
      case 'explosion': case 'crossing': return side(e.side) && vector(e.position);
      case 'spawn': case 'clock-start': return side(e.side);
      default: return false;
    }
  };
  const events = (es: ConfirmedEvent[]) => Array.isArray(es) && es.every(e => integer(e?.seq) && e.seq > 0 && event(e.event));
  const state = (s: SimState) => s && integer(s.now) && Array.isArray(s.players) && s.players.length >= 2
    && s.players.length <= 4 && s.players.every(p => p && ['p1', 'p2', 'p3', 'p4'].includes(p.id)
      && Number.isFinite(p.hp) && Number.isFinite(p.maxHp) && vector(p.position) && side(p.side)
      && p.move && p.keys && Number.isFinite(p.yaw) && p.stats
      && [p.stats.attack, p.stats.defense, p.stats.agility, p.cost, p.stepPoints, p.stepRecoveryProgress].every(Number.isFinite)
      && validCommand({ kind: 'move', player: p.id, at: 0, seq: 0, x: p.move.x, z: p.move.z })
      && validCommand({ kind: 'keys', player: p.id, at: 0, seq: 0, forward: p.keys.forward, right: p.keys.right }))
    && s.match && ['play', 'result', 'over'].includes(s.match.phase) && s.match.wins
    && integer(s.match.wins.a) && integer(s.match.wins.b) && integer(s.match.roundStartsAt)
    && s.ball && ['absent', 'loose', 'held', 'flight'].includes(s.ball.mode)
    && (s.danger === null || s.danger && side(s.danger.side) && integer(s.danger.expiresAt));
  const ack = (a: InputAck) => a && player(a.player) && integer(a.from) && integer(a.to) && a.to >= a.from
    && (a.status === 'accepted' || a.status === 'rejected' && ['late', 'final', 'future', 'invalid', 'identity', 'changed'].includes(a.reason!));
  switch (msg.kind) {
    case 'input': return Array.isArray(msg.commands) && msg.commands.length <= 256 && msg.commands.every(validCommand);
    case 'ping': return integer(msg.sent);
    case 'pong': return integer(msg.sent) && integer(msg.hostAt);
    case 'event-ack': return integer(msg.through);
    case 'events': return events(msg.events);
    case 'state': return integer(msg.number) && integer(msg.eventTail) && !!state(msg.confirmed) && !!state(msg.provisional)
      && msg.confirmed.now <= msg.provisional.now && Array.isArray(msg.inputs) && msg.inputs.every(validCommand)
      && Array.isArray(msg.acks) && msg.acks.every(ack);
    case 'sync': return integer(msg.nextEpoch) && msg.nextEpoch === msg.epoch + 1 && integer(msg.remaining)
      && !!state(msg.state) && events(msg.events) && msg.events.every((e, i) => e.seq === i + 1);
    case 'sync-ack': return integer(msg.nextEpoch) && integer(msg.through) && !!msg.held?.move && !!msg.held.keys
      && Object.keys(msg.held.move).every(k => ['x', 'z'].includes(k))
      && Object.keys(msg.held.keys).every(k => ['forward', 'right'].includes(k))
      && validCommand({ kind: 'move', player: 'p1', seq: 0, at: 0, x: msg.held.move.x, z: msg.held.move.z })
      && validCommand({ kind: 'keys', player: 'p1', seq: 0, at: 0, forward: msg.held.keys.forward, right: msg.held.keys.right });
    case 'resume': case 'complete': return integer(msg.hostAt) && msg.snapshot?.kind === 'state' && msg.snapshot.epoch === msg.epoch && msg.snapshot.matchId === msg.matchId
      && validMessage(msg.snapshot) && events(msg.events) && msg.events.every((e, i) => e.seq === i + 1)
      && msg.snapshot.eventTail === msg.events.length
      && (msg.kind === 'resume' || msg.snapshot.confirmed.match.phase === 'over' && msg.events.some(e => e.event.kind === 'match-end'));
    case 'rejoin': case 'invalid': return true;
    default: return false;
  }
}
export function inputKey(c: Command): string { return `${c.player}:${c.seq}`; }
export function ordered(commands: Command[]): Command[] {
  return commands.sort((a, b) => a.at - b.at || a.player.localeCompare(b.player) || a.seq - b.seq);
}
export function validCommand(command: Command): boolean {
  if (!command || !Number.isSafeInteger(command.at) || command.at < 0
    || !Number.isSafeInteger(command.seq) || command.seq < 0) return false;
  const fields = ['at', 'seq', 'player', 'kind'];
  const unit = (v: number) => Number.isFinite(v) && Math.abs(v) <= 1;
  switch (command.kind) {
    case 'move':
      fields.push('x', 'z');
      if (!unit(command.x) || !unit(command.z) || Math.hypot(command.x, command.z) > 1 + 1e-12) return false;
      break;
    case 'keys':
      fields.push('forward', 'right');
      if (!unit(command.forward) || !unit(command.right) || !Number.isInteger(command.forward) || !Number.isInteger(command.right)) return false;
      break;
    case 'yaw':
      fields.push('yaw'); if (!Number.isFinite(command.yaw) || Math.abs(command.yaw) > 1e6) return false;
      break;
    case 'primary':
      fields.push('aim'); if (command.aim !== undefined && typeof command.aim !== 'boolean') return false;
      break;
    case 'secondary': case 'step': case 'feint': case 'summon': case 'cycle-target': break;
    default: return false;
  }
  return Object.keys(command).every(key => fields.includes(key));
}

// 終了したsimも配送の時計は進める。論理結果を変えず最後の100msを確定する。
export function advanceTick(state: SimState, commands: Command[], config: SimConfig) {
  const result = step(state, commands, config);
  result.state.now = state.now + config.tick;
  return result;
}
export function predict(state: SimState, until: number, commands: Command[], config: SimConfig): SimState {
  state = structuredClone(state);
  while (state.now + config.tick <= until) {
    state = advanceTick(state, commands.filter(c => c.at >= state.now && c.at < state.now + config.tick), config).state;
  }
  return state;
}

// 呼び出し側が単調時計を1/60,000秒単位で渡す。実時間をsimから読まない。
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];
  private baseOffset = 0;
  get ready(): boolean { return this.samples.length >= 8; }
  get rtt(): number { return this.best?.rtt ?? 0; }
  get offset(): number { return this.best?.offset ?? this.baseOffset; }
  reset(offset: number): void { this.samples = []; this.baseOffset = offset; }
  private get best() { return this.samples.reduce<(typeof this.samples)[number] | undefined>((best, s) => !best || s.rtt < best.rtt ? s : best, undefined); }
  observe(sent: number, hostAt: number, received: number): void {
    if (![sent, hostAt, received].every(Number.isSafeInteger) || received < sent) return;
    this.samples.push({ rtt: received - sent, offset: hostAt - (sent + received) / 2 });
    if (this.samples.length > 8) this.samples.shift();
  }
  hostTime(localAt: number): number { return Math.round(localAt + this.offset); }
}
