import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import { launchBall } from '../../src/sim/ball';
import { localRoster, rosterMatch } from '../../src/game/match';
import { MemoryHost } from '../../src/net/host';
import { MemoryClient } from '../../src/net/client';
import { OnlineMatch } from '../../src/net/online';
import { MemoryDelivery } from '../../src/net/memory';
import { PROTOCOL } from '../../src/net/room-protocol';
import { canonical, envelope, validMessage, type Message, type Session, type StatePacket } from '../../src/net/messages';
import { RoomLogic } from '../../worker/logic';
import type { Command, MatchMode, SimState } from '../../src/sim/types';

function session(mode: MatchMode = '1v1'): Session {
  const roster = localRoster(mode, 'volt'), initial = createInitialState(rosterMatch(roster, 'a'));
  initial.now = c.timeUnitsPerSecond; initial.danger = { side: 'a', expiresAt: initial.now + c.dangerDuration };
  initial.players.forEach(p => { p.cost = 20; p.skills = ['overcharge', 'blink']; }); initial.ball = { mode: 'held', owner: 'p1' };
  return { matchId: 'skills', epoch: 1, build: 'skills', protocol: PROTOCOL, config: c, roster, initial };
}
function host(s: Session) {
  const slots = Object.fromEntries(s.initial.players.map(p => [p.id === 'p1' ? 'host' : p.id, p.id]));
  const h = new MemoryHost(s, slots); for (const peer of Object.keys(slots)) expect(h.connect(peer, s)).toBe(true); return h;
}
const packet = (s: Session, commands: Command[]): Message => ({ ...envelope(s), kind: 'input', commands });

it('K14-22: skill uses authenticated identity, duplicate seq and exact 100ms acceptance', () => {
  const s = session(), at = s.initial.now;
  const cmd: Command = { kind: 'skill', player: 'p1', slot: 2, at, seq: 0 };
  const h = host(s);
  expect(h.receive('p3', packet(s, [cmd]), at)[0]).toMatchObject({ status: 'rejected', reason: 'identity' });
  expect(h.receive('host', packet(s, [cmd]), at + 6000)[0].status).toBe('accepted');
  expect(h.receive('host', packet(s, [cmd]), at + 6001)[0].status).toBe('accepted');
  expect(h.receive('host', packet(s, [{ ...cmd, slot: 1 }]), at + 6001)[0]).toMatchObject({ reason: 'changed' });
  h.advance(at + 8000); expect(h.state.players[0].cost).toBe(14);
  const late = host(s); expect(late.receive('host', packet(s, [cmd]), at + 6001)[0]).toMatchObject({ reason: 'late' });
});
it('K14-23: protocol 2 cannot connect to a protocol 3 session', () => {
  const s = session(), h = new MemoryHost(s, { host: 'p1', p3: 'p3' });
  expect(h.connect('host', { ...s, protocol: 2 })).toBe(false);
  expect(h.connect('host', s)).toBe(true);
});

const edits: [string, (s: SimState) => void][] = [
  ['ID set', s => { s.players[1].id = 'p4'; }], ['side', s => { s.players[1].side = 'a'; }],
  ['stats', s => { s.players[1].stats.attack++; }], ['maxHp', s => { s.players[1].maxHp++; }],
  ['skills only', s => { s.players[0].skills = ['blink', 'overcharge']; }],
];
for (const kind of ['state', 'sync', 'resume', 'complete'] as const) it.each(edits)(`K14-24: ${kind} rejects roster mismatch (%s)`, (_label, edit) => {
  const room = new RoomLogic('1v1', 'skills', 0); room.join('skills', 'volt', 0); room.join('skills', 'echo', 0); room.begin('p1', 0, ['p1', 'p3']);
  const d = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
  const client = new OnlineMatch(room.public(), 'p3', d, () => 0);
  const state = structuredClone(client.state); if (kind === 'complete') state.match.phase = 'over'; edit(state);
  const snapshot: StatePacket = { ...envelope(client.session), kind: 'state', number: 1, confirmed: state, provisional: state, inputs: [], acks: [], eventTail: 0 };
  const events = kind === 'complete' ? [{ seq: 1, event: { kind: 'match-end' as const, at: 0, winner: 'a' as const } }] : [];
  snapshot.eventTail = events.length;
  const message: Message = kind === 'state' ? snapshot : kind === 'sync' ? { ...envelope(client.session), kind, state, nextEpoch: 2, remaining: 1000, events: [] }
    : { ...envelope(client.session), kind, snapshot, hostAt: 0, events };
  expect(validMessage(message)).toBe(true);
  d.send('host', 'p3', 'state', message, 0); d.advance(0);
  expect(client.status).toBe('invalid');
});
it('K14-24: normal variable HP/cost/CT/reservation is accepted in state/sync/resume/complete', () => {
  for (const kind of ['state', 'sync', 'resume', 'complete'] as const) {
    const room = new RoomLogic('1v1', 'skills', 0); room.join('skills', 'volt', 0); room.join('skills', 'volt', 0); room.begin('p1', 0, ['p1', 'p3']);
    const d = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
    const client = new OnlineMatch(room.public(), 'p3', d, () => 0), state = structuredClone(client.state);
    state.players[0].hp = 60; state.players[0].cost = 8;
    state.players[0].overcharge = { slot: 1, expiresAt: 480000 }; state.players[0].skillReadyAt[1] = 540000;
    if (kind === 'complete') { state.match.phase = 'over'; state.players[0].overcharge = null; }
    const snapshot: StatePacket = { ...envelope(client.session), kind: 'state', number: 1, confirmed: state, provisional: state, inputs: [], acks: [], eventTail: 0 };
    const events = kind === 'complete' ? [{ seq: 1, event: { kind: 'match-end' as const, at: 0, winner: 'a' as const } }] : [];
    snapshot.eventTail = events.length;
    if (kind === 'resume') client.waitForSync();
    const message: Message = kind === 'state' ? snapshot : kind === 'sync' ? { ...envelope(client.session), kind, state, nextEpoch: 2, remaining: 1000, events: [] }
      : { ...envelope(client.session), kind, epoch: kind === 'resume' ? 2 : 1, snapshot: { ...snapshot, epoch: kind === 'resume' ? 2 : 1 }, hostAt: 0, events };
    d.send('host', 'p3', 'state', message, 0); d.advance(0);
    expect(client.status).toBe(kind === 'sync' ? 'paused' : 'running');
    expect(client.confirmed.players[0]).toMatchObject(state.players[0]);
  }
});
for (const mode of ['1v1', '1v2', '2v2'] as MatchMode[]) it.each([1, 5999, 6000])(
  `K14-26: ${mode} replays skills delayed %d units identically with duplicate deliveries`, delay => {
    const s = session(mode), early = host(s), late = host(s), at = s.initial.now;
    const commands: Command[] = [{ kind: 'skill', slot: 1, player: 'p1', at, seq: 0 },
      { kind: 'primary', player: 'p1', at: at + 1000, seq: 1 }, { kind: 'skill', slot: 2, player: 'p1', at: at + 17000, seq: 2 }];
    for (const cmd of commands) expect(early.receive('host', packet(s, [cmd]), cmd.at)[0].status).toBe('accepted');
    for (let now = at; now <= at + 30000; now += 1000) {
      for (const cmd of commands.filter(cmd => cmd.at + delay > now - 1000 && cmd.at + delay <= now)) {
        const receivedAt = cmd.at + delay;
        expect(late.receive('host', packet(s, [cmd]), receivedAt)[0].status).toBe('accepted');
        late.receive('host', packet(s, [cmd]), receivedAt);
      }
      early.advance(now); late.advance(now);
    }
    expect(late.snapshot().confirmed).toEqual(early.snapshot().confirmed); expect(late.events).toEqual(early.events);
    expect(late.state.players[0].cost).toBe(8);
    if (delay > 1000) expect(late.stats.rollbacks).toBeGreaterThan(0);
  });
it.each([1, 2] as const)('K14-26: rejected predicted slot %d restores position/tracking/resources/CT from final state', slot => {
  const s = session(); s.initial.ball = launchBall(s.initial.players[1], s.initial.players[0], s.initial.now - 1, 0, c);
  const h = host(s), cl = new MemoryClient(s, 'p1'), at = s.initial.now;
  const input = cl.input({ kind: 'skill', slot }, at); cl.advance(at + 1000);
  if (slot === 1) expect(cl.state.players[0].overcharge).not.toBeNull();
  else { expect(cl.state.players[0].cost).toBe(14); expect(cl.state.players[0].position.z).not.toBe(s.initial.players[0].position.z); }
  expect(h.receive('host', packet(s, [input]), at + 6001)[0]).toMatchObject({ reason: 'late' });
  h.advance(at + 10000); cl.receive('host', h.snapshot());
  expect(cl.state).toEqual(h.state); expect(cl.state.players[0]).toMatchObject({ cost: 20, overcharge: null, skillReadyAt: [0, 0], position: s.initial.players[0].position });
  expect(cl.state.ball.mode === 'flight' && cl.state.ball.attack?.homing).toBe(true);
});
it('K14-26: state-first and gapped duplicate event delivery cannot repeat skill payment', () => {
  const s = session(), h = host(s), cl = new MemoryClient(s, 'p1'), at = s.initial.now;
  const commands: Command[] = [{ kind: 'skill', player: 'p1', slot: 2, at, seq: 0 },
    { kind: 'skill', player: 'p1', slot: 2, at: at + 1000, seq: 1 }, { kind: 'skill', player: 'p1', slot: 2, at: at + 2000, seq: 2 }];
  for (const cmd of commands) { h.receive('host', packet(s, [cmd]), cmd.at); h.receive('host', packet(s, [cmd]), cmd.at); }
  h.advance(at + 10000); cl.receive('host', h.snapshot());
  expect(cl.state.players[0].cost).toBe(14); expect(cl.events).toEqual([]); expect(h.events).toHaveLength(2);
  cl.receive('host', { ...envelope(s), kind: 'events', events: [h.events[1]] }); expect(cl.events).toEqual([]);
  cl.receive('host', { ...envelope(s), kind: 'events', events: h.events }); cl.receive('host', { ...envelope(s), kind: 'events', events: h.events });
  expect(cl.events).toEqual(h.events); expect(cl.state.players[0].cost).toBe(14);
});
it.each(['1v1', '1v2', '2v2'] as MatchMode[])('K14-27: %s pause/resume retains logical expiry, CT, roster and wounds; ignores paused/old-epoch skills', mode => {
  const room = new RoomLogic(mode, 'skills', 0), count = mode === '2v2' ? 4 : mode === '1v2' ? 3 : 2;
  const slots = Array.from({ length: count }, () => room.join('skills', 'volt', 0)); room.begin('p1', 0, slots.map(s => s.id));
  const d = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 }); let now = 0;
  const matches = slots.map(s => new OnlineMatch(room.public(), s.id, d, () => now));
  const tick = (at: number) => { now = at; d.advance(now); matches.forEach(m => m.advance()); d.advance(now); };
  for (let at = 0; at <= 72000; at += 1000) tick(at);
  const h = (matches[0] as unknown as { host: MemoryHost }).host;
  h.state.players.forEach(p => { p.cost = 20; p.hp = 60; });
  matches[0].input({ kind: 'skill', slot: 1, player: 'p1' });
  const guest = matches.at(-1)!; guest.input({ kind: 'skill', slot: 2, player: guest.player });
  for (let at = now; at <= 108000; at += 1000) tick(at);
  expect(matches[0].confirmed.players[0].overcharge).not.toBeNull();
  expect(matches[0].confirmed.players.find(p => p.id === guest.player)!.skillReadyAt[1]).toBeGreaterThan(now);
  const disconnectedAt = now;
  d.disconnect(guest.peer); tick(disconnectedAt + 120000);
  expect(matches.every(m => m.status === 'paused')).toBe(true);
  const frozen = structuredClone(matches[0].state), oldEpoch = matches[0].session.epoch;
  matches.forEach(m => { m.input({ kind: 'skill', slot: 1, player: m.player }); m.input({ kind: 'skill', slot: 2, player: m.player }); });
  tick(disconnectedAt + 120000 + 590000); expect(canonical(matches[0].state)).toBe(canonical(frozen));
  d.reconnect(guest.peer); guest.rejoin(); tick(now); tick(now);
  expect(matches.map(m => [m.status, m.session.epoch])).toEqual(matches.map(() => ['running', oldEpoch + 1]));
  for (const m of matches) { expect(m.state).toEqual(frozen); expect(m.drainEvents()).toEqual([]); }
  d.send(guest.peer, 'host', 'input', { ...envelope(matches[0].session), epoch: oldEpoch, kind: 'input', commands: [
    { kind: 'skill', slot: 1, player: guest.player, at: frozen.now, seq: 999 }] }, now);
  tick(now + 3000);
  expect(matches[0].state.players.map(p => [p.hp, p.cost, p.skills, p.skillReadyAt, p.overcharge])).toEqual(
    frozen.players.map(p => [p.hp, p.cost, p.skills, p.skillReadyAt, p.overcharge]));
});
