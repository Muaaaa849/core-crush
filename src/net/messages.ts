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
export type Message = InputPacket | StatePacket | EventPacket | EventAckPacket | PingPacket | PongPacket;
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
  get ready(): boolean { return this.samples.length >= 8; }
  get rtt(): number { return this.best?.rtt ?? 0; }
  get offset(): number { return this.best?.offset ?? 0; }
  private get best() { return this.samples.reduce<(typeof this.samples)[number] | undefined>((best, s) => !best || s.rtt < best.rtt ? s : best, undefined); }
  observe(sent: number, hostAt: number, received: number): void {
    if (![sent, hostAt, received].every(Number.isSafeInteger) || received < sent) return;
    this.samples.push({ rtt: received - sent, offset: hostAt - (sent + received) / 2 });
    if (this.samples.length > 8) this.samples.shift();
  }
  hostTime(localAt: number): number { return Math.round(localAt + this.offset); }
}
