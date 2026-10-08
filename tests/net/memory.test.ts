import { PROTOCOL } from '../../src/net/room-protocol';
import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/game/bot';
import { evenMatch, rosterOf } from '../fixtures';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import type { Command, SimState } from '../../src/sim/types';
import { MemoryHost } from '../../src/net/host';
import { MemoryClient } from '../../src/net/client';
import { ClockSync, type Session, type InputPacket } from '../../src/net/messages';
import { MemoryDelivery } from '../../src/net/memory';
import { runScenario } from './scenario';
import { active, command, defense, incoming } from '../sim/cover-helpers';

export function session(initial: SimState = active()): Session {
  initial.players[0].lockTarget = 'p3';
  return { matchId: 'm2', epoch: 1, build: 'ed315f6-net', protocol: PROTOCOL, config: c, roster: rosterOf(initial), initial };
}
export function host(s = session(), bots: Bot[] = []) {
  const slots = Object.fromEntries(s.initial.players.filter(p => !bots.some(b => b.player === p.id))
    .map(p => [p.id === 'p1' ? 'host' : p.id, p.id]));
  const h = new MemoryHost(s, slots, bots);
  for (const id of Object.keys(slots)) expect(h.connect(id, s)).toBe(true);
  return h;
}
export function packet(s: Session, ...commands: Command[]): InputPacket {
  return { kind: 'input', matchId: s.matchId, epoch: s.epoch, commands };
}

describe('M2 memory synchronization', () => {
  it.each(['1v1', '1v2', '2v2'] as const)('T10-25: %s recovers predictions and agrees on complete confirmed state and events', mode => {
    const r = runScenario({ mode, rttMs: 80, loss: 0.01, jitterMs: 20, seconds: 3, seed: 1 });
    expect(r.mismatches).toBe(0); expect(r.invariantFailures).toBe(0);
    expect(r.corrections).toBeGreaterThan(0); expect(r.bytes).toBeGreaterThan(0);
  });

  it.each([-1, 0, 1])('T10-26: arrival at 100ms offset %i uses the unrounded reception timestamp', offset => {
    const s = session(), h = host(s), at = s.initial.now;
    h.advance(at + 6000);
    const result = h.receive('host', packet(s, command('cycle-target', at)), at + 6000 + offset);
    expect(result[0].status).toBe(offset > 0 ? 'rejected' : 'accepted');
    expect(result[0].reason).toBe(offset > 0 ? 'late' : undefined);
    const reference = host(s);
    if (offset <= 0) reference.receive('host', packet(s, command('cycle-target', at)), at);
    reference.advance(at + 6000);
    expect(h.snapshot().provisional).toEqual(reference.snapshot().provisional);
  });

  it('T10-26: C is mutable but C-1 is final and both host and guests use the same rule', () => {
    const s = session(), h = host(s), at = s.initial.now;
    h.advance(at + 7000);
    for (const [peer, player] of [['host', 'p1'], ['p2', 'p2']] as const) {
      expect(h.receive(peer, packet(s, command('cycle-target', at + 999, player, 0)), at + 7000)[0])
        .toMatchObject({ status: 'rejected', reason: 'final' });
      expect(h.receive(peer, packet(s, command('cycle-target', at + 1000, player, 1)), at + 7000)[0].status).toBe('accepted');
    }
  });

  it('T10-26: future input is held up to 1F and invalid or modified identities are rejected', () => {
    const s = session(), h = host(s), at = s.initial.now;
    const q = command('cycle-target', at + c.frame);
    expect(h.receive('host', packet(s, q), at)[0].status).toBe('accepted');
    h.advance(at + c.frame); expect(h.state.players[0].lockTarget).toBe('p3');
    h.advance(at + 2 * c.frame); expect(h.state.players[0].lockTarget).toBe('p4');
    expect(h.receive('host', packet(s, { ...q, at: at + 1 }), at + 2000)[0].reason).toBe('changed');
    for (const [i, input] of [
      command('cycle-target', at + 3001, 'p1', 1), command('cycle-target', at + 0.5, 'p1', 2),
      { kind: 'move', player: 'p1', at, seq: 3, x: Infinity, z: 0 },
      { kind: 'keys', player: 'p1', at, seq: 4, forward: 2, right: 0 },
    ].entries()) {
      expect(h.receive('host', packet(s, input as Command), at + 2000)[0].reason).toBe(i === 0 ? 'future' : 'invalid');
    }
  });

  it('T10-26: rollback regenerates Bot memory and commands instead of retaining its old decisions', () => {
    const s = session(createInitialState(evenMatch('2v2', 'a'))), at = s.initial.now;
    const early = host(s, [new Bot('p2'), new Bot('p3'), new Bot('p4')]);
    const late = host(s, [new Bot('p2'), new Bot('p3'), new Bot('p4')]);
    const move: Command = { kind: 'move', player: 'p1', at, seq: 0, x: 1, z: 0 };
    early.receive('host', packet(s, move), at); early.advance(at + 6000);
    late.advance(at + 6000); late.receive('host', packet(s, move), at + 6000);
    expect(late.snapshot().provisional).toEqual(early.snapshot().provisional);
    expect(late.snapshot().inputs).toEqual(early.snapshot().inputs);
    early.advance(at + 180000); late.advance(at + 180000);
    expect(late.snapshot().confirmed).toEqual(early.snapshot().confirmed);
    expect(late.events).toEqual(early.events);
  });

  it('T10-25: a predicted catch becomes a hit after late rejection and events never add damage again', () => {
    const s = session(incoming(5000)), h = host(s), client = new MemoryClient(s, 'p1');
    const at = s.initial.now;
    client.input({ kind: 'secondary' }, at); client.advance(at + 6000);
    expect(client.state.ball).toEqual({ mode: 'held', owner: 'p1' });
    h.advance(at + 7000); h.receive('host', client.batch(), at + 7000);
    client.receive('host', h.snapshot());
    expect(client.state.players[0].hp).toBe(80); expect(client.state.ball.mode).toBe('loose');
    h.advance(at + 12000); client.receive('host', h.snapshot());
    const before = structuredClone(client.state);
    client.receive('host', h.eventsFor('host')); client.receive('host', h.eventsFor('host'));
    expect(client.state).toEqual(before); expect(client.events.filter(e => e.event.kind === 'hit')).toHaveLength(1);
  });

  it('T10-27: reordered seq gaps and duplicate Q and defense batches execute once', () => {
    const s = session(incoming(5000)), h = host(s), at = s.initial.now;
    const q = command('cycle-target', at, 'p2', 1), catchInput = command('secondary', at, 'p2', 0);
    h.receive('p2', packet(s, q), at); h.receive('p2', packet(s, q, catchInput), at + 4000);
    h.receive('p2', packet(s, catchInput, q), at + 5000); h.advance(at + 12000);
    expect(h.state.players[1].lockTarget).toBe('p4');
    expect(h.events.filter(e => e.event.kind === 'catch')).toHaveLength(1);
    expect(h.state.players[1].cost).toBe(c.initialCost + c.catchReward.good);
  });

  it.each(['before', 'after'] as const)('T10-27: accepted ACK %s reflection preserves a pending prediction without applying it twice', order => {
    const s = session(), h = host(s), cl = new MemoryClient(s, 'p1'), at = s.initial.now;
    cl.input({ kind: 'cycle-target' }, at); cl.advance(at + 4000);
    const old = h.snapshot(); h.receive('host', cl.batch(), at + 4000);
    if (order === 'after') cl.receive('host', old);
    cl.acknowledge([{ player: 'p1', from: 0, to: 0, status: 'accepted' }]);
    if (order === 'before') cl.receive('host', old);
    expect(cl.pendingCount).toBe(1); expect(cl.state.players[0].lockTarget).toBe('p4');
    h.advance(at + 4000); cl.receive('host', h.snapshot());
    expect(cl.pendingCount).toBe(0); expect(cl.state.players[0].lockTarget).toBe('p4');
    cl.receive('host', old); expect(cl.state.players[0].lockTarget).toBe('p4');
  });

  it('T10-27: state tail does not acknowledge missing events; gaps are filled in sequence once', () => {
    const s = session(), h = host(s), cl = new MemoryClient(s, 'p1'), at = s.initial.now;
    h.advance(at + 610000); const snap = h.snapshot(), events = h.eventsFor('host');
    expect(events.events.length).toBeGreaterThan(1);
    cl.receive('host', snap); expect(cl.eventAck().through).toBe(0);
    const last = events.events.at(-1)!;
    cl.receive('host', { ...events, events: [last] }); expect(cl.events).toHaveLength(0);
    cl.receive('host', events); cl.receive('host', events);
    expect(cl.events).toEqual(h.events); expect(cl.eventAck().through).toBe(last.seq);
    h.receive('host', cl.eventAck(), at + 610000); expect(h.eventsFor('host').events).toHaveLength(0);
    expect(cl.state).toEqual(snap.provisional);
  });

  it('T10-27: mismatched initialization cannot start and forged IDs, host events and old epochs are ignored', () => {
    const s = session(), h = new MemoryHost(s, { host: 'p1', guest: 'p2', p3: 'p3', p4: 'p4' });
    for (const changed of [{ ...s, build: 'other' }, { ...s, protocol: 2 }, { ...s, epoch: 0 },
      { ...s, config: { ...c, hitDamage: 99 } }, { ...s, initial: { ...s.initial, match: { ...s.initial.match, firstBall: 'b' as const } } }]) {
      expect(h.connect('guest', changed)).toBe(false);
    }
    expect(() => h.advance(s.initial.now + 1000)).toThrow();
    h.connect('host', s); h.connect('guest', s); h.connect('p3', s); h.connect('p4', s);
    expect(h.receive('guest', packet(s, command('cycle-target', s.initial.now)), s.initial.now)[0].reason).toBe('identity');
    expect(h.receive('guest', { ...packet(s, command('secondary', s.initial.now, 'p2')), epoch: 0 }, s.initial.now)).toEqual([]);
    const cl = new MemoryClient(s, 'p1'); const before = structuredClone(cl.state);
    const snap = h.snapshot(); cl.receive('guest', snap); cl.receive('host', { ...snap, epoch: 0 });
    expect(cl.state).toEqual(before); expect(cl.snapshotNumber).toBe(0);
    h.receive('guest', h.eventsFor('host'), s.initial.now); expect(h.events).toHaveLength(0);
  });

  it('T10-26: the network clock confirms the final 100ms even after the sim ends', () => {
    const s = session(), at = s.initial.now;
    s.initial.players.filter(p => p.side === 'a').forEach(p => { p.hp = 0; }); s.initial.match.wins.b = 1;
    const h = host(s); h.advance(at + 1000); expect(h.state.match.phase).toBe('over'); expect(h.events).toHaveLength(0);
    h.advance(at + 7000); expect(h.events.filter(e => e.event.kind === 'match-end')).toHaveLength(1);
    expect(h.snapshot().confirmed.now).toBe(at + 1000);
  });

  it('T10-27: clock synchronization chooses the lowest RTT and never changes already stamped retransmissions', () => {
    const clock = new ClockSync();
    for (let i = 0; i < 8; i++) clock.observe(i * 60000, i * 60000 + 3000, i * 60000 + 2000 + i * 100);
    expect(clock.ready).toBe(true); expect(clock.offset).toBe(2000); expect(clock.rtt).toBe(2000);
    const cl = new MemoryClient(session(), 'p1', clock); cl.input({ kind: 'cycle-target' }, 60000);
    const stamped = cl.batch().commands[0]; clock.observe(600000, 602000, 600200);
    expect(cl.batch().commands[0]).toEqual(stamped);
  });

  it('T10-25: authoritative snapshots replace divergent ownership, HP, clock and match results immediately', () => {
    const s = session(), h = host(s), cl = new MemoryClient(s, 'p1');
    cl.state.ball = { mode: 'held', owner: 'p4' }; cl.state.players[0].hp = 0;
    cl.state.danger = { side: 'b', expiresAt: 0 }; cl.state.match.wins.b = 99;
    const snapshot = h.snapshot(); cl.receive('host', snapshot);
    expect(cl.state).toEqual(snapshot.provisional); expect(cl.confirmed).toEqual(snapshot.confirmed);
    expect(cl.stats.corrections).toBe(1);
  });

  it('T10-27: ACK ranges keep reversed seq holes and periodic move state repairs a lost release without recreating Q edges', () => {
    const s = session(), h = host(s), cl = new MemoryClient(s, 'p1'), at = s.initial.now;
    cl.input({ kind: 'move', x: 1, z: 0 }, at); h.receive('host', cl.batch(), at); h.advance(at + 1000);
    cl.receive('host', h.snapshot());
    cl.input({ kind: 'move', x: 0, z: 0 }, at + 1000); cl.input({ kind: 'cycle-target' }, at + 1000);
    // 解除の初便を落とし、後続の現在値＋未応答入力で回復する。
    cl.input({ kind: 'move', x: 0, z: 0 }, at + 2000);
    const batch = cl.batch(), last = batch.commands.at(-1)!;
    h.receive('host', packet(s, last), at + 2000);
    const acks = h.snapshot().acks;
    expect(acks).toEqual([
      { player: 'p1', from: 0, to: 0, status: 'accepted' },
      { player: 'p1', from: 3, to: 3, status: 'accepted' },
    ]);
    h.receive('host', batch, at + 3000); h.receive('host', batch, at + 4000); h.advance(at + 5000);
    expect(h.state.players[0].move).toEqual({ x: 0, z: 0 }); expect(h.state.players[0].lockTarget).toBe('p4');
    cl.receive('host', h.snapshot()); expect(cl.pendingCount).toBe(0);
  });

  it('T10-27: unsent states coalesce while all final events remain available until receipt', () => {
    const s = session(), h = host(s); h.advance(s.initial.now + 610000);
    const outgoing = h.drain();
    expect(outgoing.filter(out => out.to === 'p2' && out.channel === 'state')).toHaveLength(1);
    const event = outgoing.find(out => out.to === 'p2' && out.message.kind === 'events')!.message;
    expect(event).toEqual(h.eventsFor('p2')); expect(h.drain()).toEqual([]);
  });

  it('T10-27: eight delivered ping/pong samples estimate a shifted monotonic clock', () => {
    const s = session(createInitialState(evenMatch('1v1', 'a'))), h = host(s), cl = new MemoryClient(s, 'p3');
    const d = new MemoryDelivery({ rttMs: 40, jitterMs: 0, loss: 0, seed: 1 });
    d.bind('host', (from, msg, at) => {
      h.receive(from, msg, at);
      for (const out of h.drain()) d.send('host', out.to, out.channel, out.message, at);
    });
    d.bind('p3', (from, msg, at) => cl.receive(from, msg, at - 9000));
    for (let i = 0; i < 8; i++) {
      const at = 60000 + i * 5000;
      d.send('p3', 'host', 'event', { matchId: s.matchId, epoch: s.epoch, kind: 'ping', sent: at - 9000 }, at);
      d.advance(at + 2400);
    }
    expect(cl.clock.ready).toBe(true); expect(cl.clock.offset).toBe(9000); expect(cl.clock.rtt).toBe(2400);
    expect(cl.input({ kind: 'secondary' }, 120000 - 9000).at).toBe(120000);
  });

  it('T10-28: reliable ordered event delivery recovers seeded transport loss', () => {
    const d = new MemoryDelivery({ rttMs: 40, jitterMs: 20, loss: 0.5, seed: 1 });
    const received: number[] = [];
    d.bind('b', (_from, msg) => { if (msg.kind === 'event-ack') received.push(msg.through); });
    for (let i = 1; i <= 20; i++) d.send('a', 'b', 'event', { matchId: 'm2', epoch: 1, kind: 'event-ack', through: i }, i * 100);
    d.advance(1000000);
    expect(received).toEqual(Array.from({ length: 20 }, (_, i) => i + 1)); expect(d.stats.dropped).toBeGreaterThan(0);
  });

  it('T10-28: seeded delivery reproduces loss, jitter, reverse order and duplicates with serialization isolation', () => {
    const run = () => {
      const d = new MemoryDelivery({ rttMs: 40, jitterMs: 20, loss: 0.03, duplicate: 0.5, seed: 1 });
      const received: unknown[] = [];
      d.bind('b', (_from, msg, at) => received.push({ msg, at }));
      for (let i = 0; i < 100; i++) {
        const msg = { ...packet(session()), commands: [command('cycle-target', 60000, 'p1', i)] };
        d.send('a', 'b', 'input', msg, i * 10); msg.commands.length = 0;
      }
      d.advance(60000);
      return { received, stats: d.stats };
    };
    const a = run(); expect(a).toEqual(run());
    expect(a.stats.dropped).toBeGreaterThan(0); expect(a.stats.duplicates).toBeGreaterThan(0);
    const seqs = a.received.map(x => (x as { msg: InputPacket }).msg.commands[0].seq);
    expect(seqs.some((seq, i) => i > 0 && seq < seqs[i - 1])).toBe(true);
  });

  for (const rttMs of [0, 40, 80, 120, 160]) for (const offset of [-1, 0, 1]) {
    it(`T10-28 T10-15 T10-19 T10-22: RTT ${rttMs}ms preserves Q/contact/explosion boundary ${offset}`, () => {
      for (const kind of ['q', 'cover', 'explosion']) {
        const s = session(incoming(5000)); const at = s.initial.now + 5000 + offset;
        if (kind === 'q') defense(s.initial, 'p2', 'parry', s.initial.now, s.initial.now + 10000);
        if (kind === 'explosion') {
          defense(s.initial, 'p1', 'catch'); defense(s.initial, 'p2', 'parry');
          s.initial.danger!.expiresAt = at; s.initial.match.roundEndsAt = s.initial.now + 5000;
        }
        if (kind === 'explosion') s.initial.players[0].action = s.initial.players[1].action = null;
        const inputs = kind === 'q' ? [command('cycle-target', at, 'p2')]
          : [command('secondary', s.initial.now, 'p1'), command(kind === 'cover' ? 'secondary' : 'primary', s.initial.now, 'p2')];
        const early = host(s), late = host(s);
        inputs.forEach(input => early.receive(input.player === 'p1' ? 'host' : input.player, packet(s, input), input.at));
        const d = new MemoryDelivery({ rttMs, jitterMs: 0, loss: 0, duplicate: 1, seed: 1 });
        d.bind('host', (from, msg, r) => late.receive(from, msg, r));
        inputs.forEach(input => d.send(input.player === 'p1' ? 'host' : input.player, 'host', 'input', packet(s, input), input.at));
        for (let r = s.initial.now; r <= s.initial.now + 18000; r += 1000) { d.advance(r); early.advance(r); late.advance(r); }
        expect(late.snapshot().confirmed).toEqual(early.snapshot().confirmed); expect(late.events).toEqual(early.events);
      }
    });
  }
});
