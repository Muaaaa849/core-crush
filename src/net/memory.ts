import type { Channel, Message } from './messages';

export interface DeliveryOptions { rttMs: number; jitterMs: number; loss: number; duplicate?: number; seed: number }
type Receiver = (from: string, message: Message, receivedAt: number) => void;
interface Delivery { from: string; to: string; text: string; at: number; order: number }

// 遅延・損失はアプリ外の整数時刻で再現する。自前PRNG以外の乱数を使わない。
export class MemoryDelivery {
  readonly stats = { bytes: 0, packets: 0, dropped: 0, duplicates: 0, delivered: 0, maxQueued: 0 };
  private randomState: number;
  private receivers = new Map<string, Receiver>();
  private queue: Delivery[] = [];
  private eventEnds = new Map<string, number>();
  private order = 0;
  private now = 0;
  constructor(private readonly options: DeliveryOptions) {
    if (![options.rttMs, options.jitterMs, options.loss, options.duplicate ?? 0].every(Number.isFinite)
      || options.rttMs < 0 || options.jitterMs < 0 || options.loss < 0 || options.loss >= 1
      || (options.duplicate ?? 0) < 0 || (options.duplicate ?? 0) > 1 || !Number.isSafeInteger(options.seed)) throw Error('Invalid delivery options');
    this.randomState = options.seed >>> 0;
  }
  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  bind(peer: string, receiver: Receiver): void { this.receivers.set(peer, receiver); }
  get pendingCount(): number { return this.queue.length; }
  send(from: string, to: string, channel: Channel, message: Message, at: number): void {
    if (!Number.isSafeInteger(at) || at < this.now) throw Error('Send time must be monotonic');
    const text = JSON.stringify(message), bytes = new TextEncoder().encode(text).byteLength;
    let sent = at;
    for (;;) {
      this.stats.packets++; this.stats.bytes += bytes;
      if (this.random() >= this.options.loss) break;
      this.stats.dropped++;
      if (channel !== 'event') return;
      // 信頼性eventの輸送再送。inputの再送はクライアントが担当する。
      sent += Math.max(6000, Math.round(this.options.rttMs * 60));
    }
    let due = sent + Math.round(Math.max(0, this.options.rttMs / 2 + (this.random() * 2 - 1) * this.options.jitterMs) * 60);
    if (channel === 'event') {
      const key = `${from}:${to}`;
      due = Math.max(due, this.eventEnds.get(key) ?? 0); this.eventEnds.set(key, due);
    }
    this.queue.push({ from, to, text, at: due, order: this.order++ });
    if (this.random() < (this.options.duplicate ?? 0)) {
      this.stats.duplicates++; this.stats.packets++; this.stats.bytes += bytes;
      this.queue.push({ from, to, text, at: due + Math.round(this.random() * 1000), order: this.order++ });
    }
    this.queue.sort((a, b) => a.at - b.at || a.order - b.order);
    this.stats.maxQueued = Math.max(this.stats.maxQueued, this.queue.length);
  }
  advance(until: number): void {
    if (!Number.isSafeInteger(until) || until < this.now) throw Error('Delivery clock must advance monotonically');
    while (this.queue[0]?.at <= until) {
      const d = this.queue.shift()!; this.now = d.at;
      this.receivers.get(d.to)?.(d.from, JSON.parse(d.text) as Message, d.at); this.stats.delivered++;
    }
    this.now = until;
  }
}
