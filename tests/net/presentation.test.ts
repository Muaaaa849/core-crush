import { expect, it } from 'vitest';
import { MemoryClient } from '../../src/net/client';
import { MemoryHost } from '../../src/net/host';
import { OnlineMatch } from '../../src/net/online';
import { MemoryDelivery } from '../../src/net/memory';
import { envelope, type Session } from '../../src/net/messages';
import { PROTOCOL } from '../../src/net/room-protocol';
import { RoomLogic } from '../../worker/logic';
import { createPresentation, updatePresentation } from '../../src/game/presentation';
import { defaultConfig as c } from '../../src/sim/config';
import { active, incoming } from '../sim/cover-helpers';

it.each(['host', 'p2'])('F12-5/F12-6: %s prediction has no effects, confirmed rejection hits once', peer => {
  const initial = incoming(5000);
  const s: Session = { matchId: 'm', epoch: 1, build: 'b', protocol: PROTOCOL, config: c, initial };
  const h = new MemoryHost(s, { host: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' }); for (const id of ['host', 'p2', 'p3', 'p4']) h.connect(id, s);
  const client = new MemoryClient(s, 'p1'), at = initial.now;
  client.input({ kind: 'secondary' }, at); client.advance(at + 6000);
  expect(client.state.ball.mode).toBe('held');
  let presentation = createPresentation('m'); let index = 0;
  const display = () => {
    const r = updatePresentation(presentation, { matchId: 'm', events: client.events.slice(index),
      state: client.state, confirmed: client.confirmed, viewSimAt: client.state.now, displayNowMs: 1000,
      visible: true, running: true, audioReady: true, muted: false, config: c });
    index = client.events.length; presentation = r.state; return r;
  };
  expect(display().effects).toEqual([]);
  h.advance(at + 7000); h.receive('host', client.batch(), at + 7000);
  h.advance(at + 12000); client.receive('host', h.snapshot());
  expect(client.eventTail).toBeGreaterThan(0);
  expect(display().effects).toEqual([]); expect(presentation.consumed).toBe(0);
  client.receive('host', h.eventsFor(peer));
  expect(display().effects.map(e => e.event.kind)).toEqual(['hit']);
  client.receive('host', h.eventsFor(peer)); client.advance(at + 13000);
  expect(display().effects).toEqual([]);
});

it('F12-5: a confirmed success is presented once after prediction and reordered delivery', () => {
  const initial = incoming(5000), at = initial.now;
  const s: Session = { matchId: 'm', epoch: 1, build: 'b', protocol: PROTOCOL, config: c, initial };
  const h = new MemoryHost(s, { host: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' }); for (const id of ['host', 'p2', 'p3', 'p4']) h.connect(id, s);
  const client = new MemoryClient(s, 'p1'); client.input({ kind: 'secondary' }, at);
  h.receive('host', client.batch(), at); h.advance(at + 12000);
  client.receive('host', h.snapshot()); client.receive('host', h.eventsFor('host'));
  const i = { matchId: 'm', events: client.events, state: client.state, confirmed: client.confirmed,
    viewSimAt: client.state.now, displayNowMs: 1000, visible: true, running: true, audioReady: true, muted: false, config: c };
  const r = updatePresentation(createPresentation('m'), i);
  expect(r.effects.filter(e => e.event.kind === 'catch')).toHaveLength(1);
  expect(updatePresentation(r.state, i).effects).toEqual([]);
});

it('F12-7: OnlineMatch preserves seq and marks restored history consumed across same-epoch sync and resume', () => {
  const room = new RoomLogic('1v1', 'b', 0); room.join('b', 0); room.join('b', 0); room.begin('p1', 0, ['p1', 'p3']);
  let now = 0;
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
  const match = new OnlineMatch(room.public(), 'p3', delivery, () => now);
  const event = { kind: 'clock-start' as const, at: 0, side: 'a' as const };
  const es = [{ seq: 1, event }];
  const send = (msg: Parameters<typeof delivery.send>[3]) => { delivery.send('host', 'p3', 'event', msg, now); delivery.advance(now); };
  send({ ...envelope(match.session), kind: 'events', events: es });
  expect(match.drainEvents()).toEqual(es);
  const version = match.presentationRevision;
  send({ ...envelope(match.session), kind: 'sync', nextEpoch: 2, remaining: 600000, state: match.confirmed, events: es });
  expect(match.presentationRevision).toBeGreaterThan(version);
  expect(match.presentationHistoryThrough).toBe(1); expect(match.drainEvents()).toEqual([]);
  now = 1000;
  const state = active(); state.players = match.state.players; state.now = 1000;
  send({ ...envelope(match.session), kind: 'resume', epoch: 2, events: es, hostAt: 1000,
    snapshot: { ...envelope(match.session), epoch: 2, kind: 'state', number: 1, confirmed: state, provisional: state, eventTail: 1, inputs: [], acks: [] } });
  expect(match.status).toBe('running'); expect(match.drainEvents()).toEqual([]);
  send({ ...envelope(match.session), kind: 'events', events: [...es, { seq: 2, event }] });
  expect(match.drainEvents()).toEqual([{ seq: 2, event }]);
});
