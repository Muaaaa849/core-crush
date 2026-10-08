import { expect, it } from 'vitest';
import { OnlineMatch } from '../../src/net/online';
import { DataChannelDelivery } from '../../src/net/webrtc';
import { RoomLogic } from '../../worker/logic';
import { MemoryDelivery } from '../../src/net/memory';
import type { MatchMode } from '../../src/sim/types';
import { envelope } from '../../src/net/messages';

it('T10-29 runs host input through prediction and waits for confirmed results without automatic rematch', () => {
  const room = new RoomLogic('1v1', 'build', 0);
  const a = room.join('build', 'volt', 0), b = room.join('build', 'volt', 0);
  room.begin(a.id, 0, [a.id, b.id]);
  let now = 0;
  const delivery = new DataChannelDelivery('host', () => now);
  const match = new OnlineMatch(room.public(), 'p1', delivery, () => now);
  match.input({ kind: 'move', player: 'p1', x: 1, z: 0 });
  now = 6000; match.advance();
  expect(match.state.players[0].move.x).toBe(1);
  expect(match.confirmed.now).toBe(0);
  now = 12000; match.advance();
  expect(match.confirmed.now).toBe(6000);
  expect(match.finished).toBe(false);
  expect(match.session.initial.players.map(p => p.id)).toEqual(['p1', 'p3']);
});

it.each(['1v1', '1v2', '2v2'] as MatchMode[])('T10-29 connects all %s participants through the delivery contract', mode => {
  const room = new RoomLogic(mode, 'build', 0);
  const count = mode === '2v2' ? 4 : mode === '1v2' ? 3 : 2;
  const slots = Array.from({ length: count }, () => room.join('build', 'volt', 0));
  room.begin('p1', 0, slots.map(s => s.id));
  let now = 0;
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
  const matches = slots.map(s => new OnlineMatch(room.public(), s.id, delivery, () => now));
  for (const match of matches) match.input({ kind: 'yaw', player: match.player, yaw: 0.5 });
  for (now = 0; now <= 72_000; now += 1000) { delivery.advance(now); for (const match of matches) match.advance(); delivery.advance(now); }
  const first = matches[0];
  expect(first.state.players.every(p => p.yaw === 0.5)).toBe(true);
  for (const match of matches) expect(match.confirmed).toEqual(first.confirmed);
});

it('T10-29 gates result confirmation on both final state and the confirmed match event', () => {
  const room = new RoomLogic('1v1', 'build', 0);
  room.join('build', 'volt', 0); room.join('build', 'volt', 0); room.begin('p1', 0, ['p1', 'p3']);
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
  let now = 0;
  const match = new OnlineMatch(room.public(), 'p3', delivery, () => now);
  const final = structuredClone(match.state); final.match.phase = 'over';
  delivery.send('host', 'p3', 'state', { ...envelope(match.session), kind: 'state', number: 1, confirmed: final, provisional: final, inputs: [], acks: [], eventTail: 1 }, now);
  delivery.advance(now); expect(match.finished).toBe(false);
  delivery.send('host', 'p3', 'event', { ...envelope(match.session), kind: 'events', events: [{ seq: 1, event: { kind: 'match-end', at: 0, winner: 'a' } }] }, now);
  delivery.advance(now); expect(match.finished).toBe(true);
  now = 300_000; match.advance();
  expect(match.finished).toBe(true); expect(match.state.match.phase).toBe('over');
});

it('C12-3b builds the session from the room roster, and a different character changes the start signature', async () => {
  const room = new RoomLogic('1v2', 'build', 0);
  const host = room.join('build', 'volt', 0); room.join('build', 'echo', 0); room.join('build', 'anchor', 0);
  room.begin(host.id, 0, ['p1', 'p3', 'p4']);
  const view = room.public();
  const match = (v: typeof view) => new OnlineMatch(v, 'p3', new DataChannelDelivery('p3', () => 0), () => 0);
  const a = match(view);
  expect(a.session.roster).toEqual([{ id: 'p1', side: 'a', characterId: 'volt' }, { id: 'p3', side: 'b', characterId: 'echo' }, { id: 'p4', side: 'b', characterId: 'anchor' }]);
  expect(a.session.initial.players.map(p => p.maxHp)).toEqual([94 * 1.6, 106, 112].map(v => expect.closeTo(v)));
  expect(await match(structuredClone(view)).signature()).toBe(await a.signature());
  const other = structuredClone(view); other.players[1].characterId = 'switch';
  expect(await match(other).signature()).not.toBe(await a.signature());
});
