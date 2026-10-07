import type { Channel, Delivery, Message, Receiver } from './messages';
import type { PlayerId } from '../sim/types';
import type { Signal } from './room-protocol';

export const channelOptions: Record<Channel, RTCDataChannelInit> = {
  input: { ordered: false, maxRetransmits: 0 }, state: { ordered: false, maxRetransmits: 0 }, event: { ordered: true },
};
const incoming = (host: boolean, channel: Channel, message: Message) => host
  ? channel === 'input' ? message.kind === 'input' : channel === 'event' && ['ping', 'event-ack', 'sync-ack', 'rejoin'].includes(message.kind)
  : channel === 'state' ? message.kind === 'state' : channel === 'event' && ['pong', 'events', 'sync', 'resume', 'complete', 'invalid'].includes(message.kind);

// 受信者IDはDataChannelを作った認証済みリンクから割り当てる。
export class DataChannelDelivery implements Delivery {
  private receiver?: Receiver;
  private channels = new Map<string, Map<Channel, RTCDataChannel>>();
  constructor(readonly local: string, private readonly now: () => number) {}
  bind(peer: string, receiver: Receiver): void {
    if (peer !== this.local) throw Error('Invalid local peer');
    this.receiver = receiver;
  }
  attach(peer: string, channel: RTCDataChannel): void {
    if (!Object.hasOwn(channelOptions, channel.label)) { channel.close(); return; }
    const label = channel.label as Channel;
    const links = this.channels.get(peer) ?? new Map<Channel, RTCDataChannel>();
    if (links.has(label)) { channel.close(); return; }
    links.set(label, channel); this.channels.set(peer, links);
    channel.addEventListener('message', e => {
      if (this.channels.get(peer)?.get(label) !== channel) return;
      if (typeof e.data !== 'string' || e.data.length > 262_144) return;
      try {
        const msg = JSON.parse(e.data) as Message;
        if (msg && incoming(this.local === 'host', label, msg)) this.receiver?.(peer, msg, this.now());
      } catch { /* 不正パケットはゲーム入力にしない。 */ }
    });
  }
  ready(peers: string[]): boolean {
    return peers.every(peer => Object.keys(channelOptions).every(label => this.channels.get(peer)?.get(label as Channel)?.readyState === 'open'));
  }
  detach(peer: string): void {
    const links = this.channels.get(peer); this.channels.delete(peer);
    for (const channel of links?.values() ?? []) channel.close();
  }
  send(from: string, to: string, label: Channel, message: Message, at: number): void {
    if (from !== this.local) throw Error('Invalid sender');
    if (to === this.local) { this.receiver?.(from, structuredClone(message), at); return; }
    const c = this.channels.get(to)?.get(label);
    if (!c || c.readyState !== 'open') return;
    if (c.bufferedAmount > 262_144) {
      if (label === 'event') throw Error('Reliable channel cannot make progress');
      return;
    }
    c.send(JSON.stringify(message));
  }
  close(): void { for (const peer of [...this.channels.keys()]) this.detach(peer); }
}

export function waitForLinks(ready: () => boolean, timeoutMs = 20_000, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const finish = (error?: Error) => { clearInterval(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const abort = () => finish(Error('Connection cancelled'));
    const timer = setInterval(() => {
      if (signal?.aborted) abort();
      else if (ready()) finish();
      else if (performance.now() - started >= timeoutMs) finish(Error('Connection exceeded 20 seconds'));
    }, 25);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else if (ready()) finish();
  });
}

export class StarLinks {
  private links = new Map<PlayerId, RTCPeerConnection>();
  private candidates = new Map<PlayerId, RTCIceCandidateInit[]>();
  private localCandidates = new Map<PlayerId, RTCIceCandidateInit[]>();
  private chains = new Map<PlayerId, Promise<void>>();
  private generations = new Map<PlayerId, number>();
  private failed = new Set<PlayerId>();
  constructor(readonly player: PlayerId, readonly matchId: string, private readonly delivery: DataChannelDelivery,
    private readonly send: (signal: Signal) => void, private readonly fail: (error: Error) => void,
    private readonly ice: RTCConfiguration, roster: PlayerId[]) {
    const peers = player === 'p1' ? roster.filter(id => id !== 'p1') : ['p1' as const];
    for (const peer of peers) this.create(peer, 1);
  }
  private create(peer: PlayerId, generation: number): RTCPeerConnection {
    this.generations.set(peer, generation); this.failed.delete(peer);
    const pc = new RTCPeerConnection(this.ice); this.links.set(peer, pc);
    pc.onicecandidate = e => {
      if (!e.candidate || this.links.get(peer) !== pc) return;
      const candidate = e.candidate.toJSON(), pending = this.localCandidates.get(peer);
      if (pending) {
        if (pending.length >= 100) { this.fail(Error('Too many ICE candidates')); return; }
        pending.push(candidate);
      } else this.send({ kind: 'signal', to: peer, matchId: this.matchId, generation, candidate });
    };
    const failed = () => {
      if (this.links.get(peer) !== pc) return;
      this.failed.add(peer); this.fail(Error('対戦相手との接続が切れました'));
    };
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState)) failed(); };
    const attach = (channel: RTCDataChannel) => {
      if (this.links.get(peer) !== pc) { channel.close(); return; }
      channel.onclose = failed;
      this.delivery.attach(peer === 'p1' ? 'host' : peer, channel);
    };
    if (this.player === 'p1') for (const [label, options] of Object.entries(channelOptions)) attach(pc.createDataChannel(label, options));
    else pc.ondatachannel = e => attach(e.channel);
    return pc;
  }
  private remove(peer: PlayerId): void {
    const pc = this.links.get(peer); this.links.delete(peer);
    this.delivery.detach(peer === 'p1' ? 'host' : peer); pc?.close();
    this.candidates.delete(peer); this.localCandidates.delete(peer); this.chains.delete(peer);
  }
  needsRepair(peer: PlayerId): boolean { return this.failed.has(peer) || !this.delivery.ready([peer === 'p1' ? 'host' : peer]); }
  async reconnect(peer: PlayerId): Promise<void> {
    if (this.player !== 'p1' || !this.links.has(peer)) return;
    const generation = this.generations.get(peer)! + 1;
    this.remove(peer); const pc = this.create(peer, generation);
    await this.describe(peer, pc, await pc.createOffer());
  }
  private async describe(peer: PlayerId, pc: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void> {
    const pending: RTCIceCandidateInit[] = []; this.localCandidates.set(peer, pending);
    await pc.setLocalDescription(description);
    if (this.links.get(peer) !== pc) return;
    this.send({ kind: 'signal', to: peer, matchId: this.matchId, generation: this.generations.get(peer)!, description: pc.localDescription!.toJSON() });
    this.localCandidates.delete(peer);
    for (const candidate of pending) this.send({ kind: 'signal', to: peer, matchId: this.matchId, generation: this.generations.get(peer)!, candidate });
  }
  async offer(restart = false): Promise<void> {
    if (this.player !== 'p1') return;
    await Promise.all([...this.links].map(async ([peer, pc]) => {
      await this.describe(peer, pc, await pc.createOffer({ iceRestart: restart }));
    }));
  }
  receive(from: PlayerId, generation: number, description?: RTCSessionDescriptionInit, candidate?: RTCIceCandidateInit): Promise<void> {
    if (!this.links.has(from)) return Promise.resolve();
    if (this.player !== 'p1' && description?.type === 'offer' && generation > this.generations.get(from)!) {
      this.remove(from); this.create(from, generation);
    }
    if (generation !== this.generations.get(from)) return Promise.resolve();
    const pc = this.links.get(from)!;
    const work = (this.chains.get(from) ?? Promise.resolve()).then(async () => {
      if (this.links.get(from) !== pc) return;
      if (description) {
        await pc.setRemoteDescription(description);
        if (this.links.get(from) !== pc) return;
        for (const c of this.candidates.get(from) ?? []) await pc.addIceCandidate(c);
        this.candidates.delete(from);
        if (description.type === 'offer') {
          await this.describe(from, pc, await pc.createAnswer());
        }
      }
      if (candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else { const list = this.candidates.get(from) ?? []; if (list.length >= 100) throw Error('Too many ICE candidates'); list.push(candidate); this.candidates.set(from, list); }
      }
    });
    this.chains.set(from, work); return work;
  }
  async refresh(iceServers: RTCIceServer[]): Promise<void> {
    this.ice.iceServers = iceServers;
    for (const pc of this.links.values()) pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
    await this.offer(true);
  }
  close(): void { for (const peer of [...this.links.keys()]) this.remove(peer); this.delivery.close(); }
}
