import { expect, it } from 'vitest';
import { MemoryDelivery } from '../../src/net/memory';
import { OnlineMatch } from '../../src/net/online';
import { envelope } from '../../src/net/messages';
import { RoomLogic } from '../../worker/logic';
import type { MatchMode } from '../../src/sim/types';
import { Bot } from '../../src/game/bot';
import { MemoryHost } from '../../src/net/host';
import { canonical } from '../../src/net/messages';

function setup(mode: MatchMode = '1v1') {
  const room = new RoomLogic(mode, 'build', 0);
  const count = mode === '2v2' ? 4 : mode === '1v2' ? 3 : 2;
  const slots = Array.from({ length: count }, () => room.join('build', 'volt', 0));
  room.begin('p1', 0, slots.map(s => s.id));
  let now = 0;
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
  const matches = slots.map(s => new OnlineMatch(room.public(), s.id, delivery, () => now));
  const tick = (at: number) => { now = at; delivery.advance(now); matches.forEach(m => m.advance()); delivery.advance(now); };
  for (let at = 0; at <= 60_000; at += 1000) tick(at);
  return { room, slots, delivery, matches, tick, get now() { return now; } };
}

it.each(['1v1', '1v2', '2v2'] as MatchMode[])('T10-32 freezes all clocks and rewinds prediction at exactly two seconds in %s', mode => {
  const s = setup(mode), guest = s.matches.at(-1)!;
  s.delivery.disconnect(guest.peer);
  s.tick(60_000 + 119_940);
  expect(s.matches.every(m => m.status === 'running')).toBe(true);
  s.tick(180_000);
  expect(s.matches.every(m => m.status === 'paused')).toBe(true);
  const states = s.matches.map(m => structuredClone(m.state));
  expect(s.matches[0].state).toEqual(s.matches[0].confirmed);
  s.tick(300_000);
  s.matches.forEach((m, i) => expect(m.state).toEqual(states[i]));
});

it('T10-32 ignores invalid epochs and malformed heartbeat without postponing timeout', () => {
  const s = setup(); s.delivery.disconnect('p3');
  s.delivery.reconnect('p3');
  for (const epoch of [0, 1]) s.delivery.send('p3', 'host', 'event', {
    ...envelope(s.matches[0].session), epoch, kind: 'ping', sent: epoch ? NaN : s.now,
  }, 150_000);
  s.delivery.advance(150_000); s.delivery.disconnect('p3');
  s.tick(180_000);
  expect(s.matches[0].status).toBe('paused');
});

it('T10-32 rejects malformed event and state packets without extending host liveness', () => {
  const s = setup(); s.delivery.disconnect('host'); s.delivery.reconnect('host');
  const guest = s.matches[1];
  s.delivery.send('host', 'p3', 'event', { ...envelope(guest.session), kind: 'events',
    events: [{ seq: 999, event: { kind: 'unknown', at: 0 } }] } as never, 150_000);
  s.delivery.send('host', 'p3', 'state', { ...envelope(guest.session), kind: 'state', number: 999,
    provisional: guest.state, confirmed: guest.confirmed, inputs: [], acks: [null], eventTail: 0 } as never, 150_000);
  expect(() => s.delivery.advance(150_000)).not.toThrow();
  s.delivery.disconnect('host'); s.tick(180_000);
  expect(guest.status).toBe('paused');
});

it.each(['1v1', '1v2', '2v2'] as MatchMode[])('T10-33 resumes %s with fresh epoch and current movement only before ten seconds', mode => {
  const s = setup(mode), guest = s.matches.at(-1)!;
  s.delivery.disconnect(guest.peer); s.tick(180_000);
  const frozen = structuredClone(s.matches[0].state);
  guest.input({ player: guest.player, kind: 'move', x: 1, z: 0 });
  guest.input({ player: guest.player, kind: 'keys', forward: 0, right: 1 });
  guest.input({ player: guest.player, kind: 'primary' });
  guest.input({ player: guest.player, kind: 'step' });
  s.delivery.reconnect(guest.peer);
  s.tick(180_000 + 599_940);
  s.tick(180_000 + 599_940);
  expect(s.matches.every(m => m.status === 'running' && m.session.epoch === 2)).toBe(true);
  expect(s.matches[0].state.now).toBe(frozen.now);
  expect(s.matches[0].state.players.map(p => [p.id, p.hp, p.maxHp])).toEqual(frozen.players.map(p => [p.id, p.hp, p.maxHp]));
  s.delivery.send(guest.peer, 'host', 'input', { matchId: guest.session.matchId, epoch: 1, kind: 'input',
    commands: [{ kind: 'primary', player: guest.player, seq: 900, at: frozen.now }] }, s.now);
  s.tick(s.now + 3000);
  const player = s.matches[0].state.players.find(p => p.id === guest.player)!;
  expect(player.move).toEqual({ x: 1, z: 0 });
  expect(player.keys).toEqual({ forward: 0, right: 1 });
  expect(player.action).toBeNull();
  expect(s.matches[0].state.now).toBeLessThan(frozen.now + 4000);
});

it('T10-33 rejects synchronization ACK at exactly ten seconds and does not add wins', () => {
  const s = setup(); s.delivery.disconnect('p3'); s.tick(180_000);
  const wins = structuredClone(s.matches[0].state.match.wins);
  s.delivery.reconnect('p3'); s.tick(780_000);
  expect(s.matches.every(m => m.status === 'invalid')).toBe(true);
  expect(s.matches[0].state.match.wins).toEqual(wins);
});

it('T10-34 invalidates host silence after a frozen grace period and preserves the roster', () => {
  const s = setup('2v2'); s.delivery.disconnect('host'); s.tick(180_000);
  const frozen = structuredClone(s.matches[1].state);
  s.tick(780_001);
  expect(s.matches[1].status).toBe('invalid');
  expect(s.matches[1].state).toEqual(frozen);
  expect(s.matches[1].state.players).toHaveLength(4);
});

it('T10-34 invalidates explicit host departure immediately but retains a confirmed normal result', () => {
  const s = setup(); s.matches.forEach(m => m.hostLeft());
  expect(s.matches.every(m => m.status === 'invalid')).toBe(true);
  const final = setup(), guest = final.matches[1];
  const state = structuredClone(guest.state); state.match.phase = 'over'; state.match.wins.a = 2;
  final.delivery.send('host', guest.peer, 'state', { ...envelope(guest.session), kind: 'state', number: 999,
    provisional: state, confirmed: state, inputs: [], acks: [], eventTail: 1 }, final.now);
  final.delivery.send('host', guest.peer, 'event', { ...envelope(guest.session), kind: 'events',
    events: [{ seq: 1, event: { kind: 'match-end', at: state.now, winner: 'a' } }] }, final.now);
  final.delivery.advance(final.now); guest.hostLeft(); final.tick(900_000);
  expect(guest.finished).toBe(true); expect(guest.status).toBe('running');
  expect(guest.confirmed.match.wins.a).toBe(2);
});

it('T10-33 reuses the authenticated worker slot and rejects duplicate joins and wrong tokens', () => {
  const s = setup('1v2'), guest = s.slots[1], before = s.room.public();
  expect(s.room.rejoin('build', undefined, guest.token, s.now).id).toBe(guest.id);
  expect(s.room.public()).toEqual(before);
  expect(() => s.room.rejoin('other', undefined, guest.token, s.now)).toThrow('build');
  expect(() => s.room.rejoin('build', undefined, 'wrong', s.now)).toThrow('token');
  expect(() => s.room.join('build', 'volt', s.now)).toThrow('progress');
});

it('T10-32 freezes Bot thinking and the entire confirmed sim state without advancing step', () => {
  const s = setup(), bot = new Bot('p3');
  const host = new MemoryHost(s.matches[0].session, { host: 'p1' }, [bot]);
  host.connect('host', s.matches[0].session); host.advance(240_000);
  const state = host.freeze(), memory = bot.snapshot();
  host.advance(840_000);
  expect(canonical(host.state)).toBe(canonical(state));
  expect(bot.snapshot()).toEqual(memory); expect(host.H).toBe(host.C);
});

it('T10-32 pauses even when the next valid packet arrives at the two second boundary', () => {
  const s = setup();
  s.delivery.send('p3', 'host', 'event', { ...envelope(s.matches[0].session), kind: 'ping', sent: 180_000 }, 180_000);
  s.tick(180_000);
  expect(s.matches[0].state.now).toBeLessThan(180_000);
});

it('T10-33 requires synchronization ACK from every participant and restores event receipt positions', () => {
  const s = setup('2v2');
  s.delivery.disconnect('p3'); s.delivery.disconnect('p4'); s.tick(180_000);
  s.delivery.reconnect('p3'); s.tick(240_000);
  expect(s.matches[0].status).toBe('paused');
  s.delivery.reconnect('p4'); s.tick(300_000);
  expect(s.matches.every(m => m.status === 'running')).toBe(true);
  s.matches.forEach(m => expect(m.client.eventAck().through).toBe(s.matches[0].client.events.length));
});

it('T10-33 accepts normal input after repeated reconnection without sequence conflicts', () => {
  const s = setup();
  for (let i = 0; i < 2; i++) {
    s.delivery.disconnect('p3'); s.tick(s.now + 120_000);
    s.delivery.reconnect('p3'); s.tick(s.now + 60_000);
    const guest = s.matches[1];
    expect(guest.status).toBe('running');
    guest.input({ player: 'p3', kind: 'yaw', yaw: 0.8 + i });
    s.tick(s.now + 3000); s.tick(s.now + 9000);
    expect(s.matches[0].state.players.find(p => p.id === 'p3')!.yaw).toBe(0.8 + i);
    expect(guest.client.stats.rejected).toBe(0);
  }
  expect(s.matches[0].session.epoch).toBe(3);
});

it('T10-33 rejects a synchronization ACK that substitutes a press for held movement', () => {
  const s = setup(); s.delivery.disconnect('p3'); s.tick(180_000); s.delivery.reconnect('p3');
  s.delivery.send('p3', 'host', 'event', { ...envelope(s.matches[0].session), kind: 'sync-ack', nextEpoch: 2,
    through: s.matches[0].client.events.length, held: { move: { kind: 'primary' }, keys: { forward: 0, right: 0 } } } as never, s.now);
  s.delivery.advance(s.now);
  expect(s.matches[0].status).toBe('paused');
});

it('T10-34 synchronizes an already confirmed normal result to a returning participant', () => {
  const s = setup();
  for (let at = s.now + 6000; at <= 18_000_000 && !s.matches[0].finished; at += 6000) s.tick(at);
  expect(s.matches[0].finished).toBe(true);
  const result = structuredClone(s.matches[0].confirmed);
  s.delivery.disconnect('p3'); s.delivery.reconnect('p3');
  const returning = new OnlineMatch(s.room.public(), 'p3', s.delivery, () => s.now);
  returning.waitForSync(); returning.rejoin(); s.delivery.advance(s.now);
  expect(returning.finished).toBe(true);
  expect(returning.confirmed).toEqual(result);
  expect(returning.drainEvents()).toEqual([]);
});
