import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import { canonical, envelope, type Session } from '../../src/net/messages';
import type { Message, StatePacket } from '../../src/net/messages';
import { MemoryHost } from '../../src/net/host';
import { MemoryClient } from '../../src/net/client';
import { MemoryDelivery } from '../../src/net/memory';
import { OnlineMatch } from '../../src/net/online';
import { PROTOCOL } from '../../src/net/room-protocol';
import { RoomLogic } from '../../worker/logic';
import type { Command, MatchMode } from '../../src/sim/types';
import { evenMatch, rosterOf } from '../fixtures';

function session(mode: MatchMode): Session {
  const initial = createInitialState(evenMatch(mode, 'a'));
  initial.now = c.timeUnitsPerSecond; initial.match.roundStartsAt = 0;
  initial.ball = { mode: 'held', owner: 'p1' }; initial.danger = { side: 'a', expiresAt: initial.now + c.dangerDuration };
  initial.players[0].cost = 20; initial.players[0].overcharge = { slot: 1, expiresAt: initial.now + 20000 };
  initial.players.slice(1).forEach(p => { p.position.x = 5; });
  return { matchId: 'vertical', epoch: 1, build: 'vertical', protocol: PROTOCOL, config: c, roster: rosterOf(initial), initial };
}
function host(s: Session) {
  const h = new MemoryHost(s, Object.fromEntries(s.initial.players.map(p => [p.id, p.id])));
  for (const p of s.initial.players) expect(h.connect(p.id, s)).toBe(true);
  return h;
}
for (const mode of ['1v1', '1v2', '2v2'] as MatchMode[]) it.each([1, 5999, 6000])(
  `V15-22: ${mode} late pitch delayed %s replays release identically with reordered duplicates`, delay => {
    const s = session(mode), early = host(s), late = host(s), at = s.initial.now;
    const commands: Command[] = [{ kind: 'primary', player: 'p1', aim: true, at, seq: 0 },
      { kind: 'pitch', player: 'p1', pitch: 0.4, at: at + 3000, seq: 1 },
      { kind: 'pitch', player: 'p1', pitch: -0.2, at: at + 8000, seq: 2 },
      { kind: 'pitch', player: 'p1', pitch: 1.2, at: at + 8000, seq: 3 }];
    const receive = (h: MemoryHost, cmds: Command[], time: number) => h.receive('p1', { ...envelope(s), kind: 'input', commands: cmds }, time);
    for (let now = at; now <= at + 40000; now += 1000) {
      const onTime = commands.filter(cmd => cmd.at === now);
      if (onTime.length) receive(early, onTime, now);
      const arrived = commands.filter(cmd => cmd.at + delay > now - 1000 && cmd.at + delay <= now);
      if (arrived.length) {
        const receivedAt = arrived[0].at + delay;
        expect(receive(late, [...arrived].reverse(), receivedAt).every(ack => ack.status === 'accepted')).toBe(true);
        receive(late, arrived, receivedAt);
      }
      early.advance(now); late.advance(now);
    }
    expect(late.snapshot().confirmed).toEqual(early.snapshot().confirmed); expect(late.events).toEqual(early.events);
    expect(late.state.players[0]).toMatchObject({ pitch: 1.2, cost: 14 });
    expect(late.events.filter(e => e.event.kind === 'release')).toHaveLength(1);
    if (delay > 1000) expect(late.stats.rollbacks).toBeGreaterThan(0);
    const old = { ...commands[1], at: late.C - 1, seq: 99 };
    expect(receive(late, [old], at + 40000)[0]).toMatchObject({ status: 'rejected', reason: 'final' });
  });
it('V15-22: rejected predicted pitch reconciles to confirmed state through normal input delivery', () => {
  const s = session('1v1'), h = host(s), client = new MemoryClient(s, 'p1'), at = s.initial.now;
  const cmd = client.input({ kind: 'pitch', pitch: 0.8 }, at); client.advance(at + 1000);
  expect(client.state.players[0].pitch).toBe(0.8);
  expect(h.receive('p1', { ...envelope(s), kind: 'input', commands: [cmd] }, at + 6001)[0]).toMatchObject({ reason: 'late' });
  h.advance(at + 10000); client.receive('host', h.snapshot());
  expect(client.state).toEqual(h.state); expect(client.state.players[0].pitch).toBe(0);
});
it('V15-23: protocol 4 sessions reject old protocol, missing pitch and different aim config in agreement', async () => {
  const s = session('1v1'), h = host(s);
  for (const protocol of [2, 3]) expect(h.connect('p1', { ...s, protocol })).toBe(false);
  for (const config of [{ ...c, aimEyeHeight: 1.7 }, { ...c, aimMaxDistance: 59 }]) expect(h.connect('p1', { ...s, config })).toBe(false);
  const missing = structuredClone(s); delete (missing.initial.players[0] as Partial<typeof missing.initial.players[0]>).pitch;
  expect(h.connect('p1', missing)).toBe(false);
  const room = new RoomLogic('1v1', 'vertical', 0); room.join('vertical', 'volt', 0); room.join('vertical', 'volt', 0); room.begin('p1', 0, ['p1', 'p3']);
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 });
  const a = new OnlineMatch(room.public(), 'p1', delivery, () => 0), b = new OnlineMatch(room.public(), 'p3', delivery, () => 0);
  expect(a.session.protocol).toBe(4); expect(await a.signature()).toBe(await b.signature());
  room.loaded('p1', await a.signature(), 0); expect(room.loaded('p3', await b.signature(), 0)).toBe(true);
});
it.each(['1v1', '1v2', '2v2'] as MatchMode[])('V15-20 V15-23: %s resume restores confirmed pitch and excludes paused angles from HeldInput', mode => {
  const room = new RoomLogic(mode, 'vertical', 0), count = mode === '2v2' ? 4 : mode === '1v2' ? 3 : 2;
  const slots = Array.from({ length: count }, () => room.join('vertical', 'volt', 0)); room.begin('p1', 0, slots.map(s => s.id));
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 }); let now = 0;
  const matches = slots.map(s => new OnlineMatch(room.public(), s.id, delivery, () => now));
  const tick = (at: number) => { now = at; delivery.advance(now); matches.forEach(m => m.advance()); delivery.advance(now); };
  for (let at = 0; at <= 60000; at += 1000) tick(at);
  matches.forEach(m => { m.input({ kind: 'pitch', player: m.player, pitch: 0.7 }); m.input({ kind: 'yaw', player: m.player, yaw: 0.8 }); });
  for (let at = 60000; at <= 75000; at += 1000) tick(at);
  expect(matches[0].confirmed.players.every(p => p.pitch === 0.7)).toBe(true);
  const guest = matches.at(-1)!; delivery.disconnect(guest.peer); tick(now + 120000);
  expect(matches.every(m => m.status === 'paused')).toBe(true);
  const frozen = structuredClone(matches[0].state);
  matches.forEach(m => { m.input({ kind: 'pitch', player: m.player, pitch: -1.2 }); m.input({ kind: 'yaw', player: m.player, yaw: -2 }); });
  delivery.reconnect(guest.peer); guest.rejoin(); tick(now); tick(now);
  expect(matches.every(m => m.status === 'running' && m.session.epoch === 2)).toBe(true);
  for (const m of matches) expect(canonical(m.state)).toBe(canonical(frozen));
  tick(now + 3000);
  expect(matches[0].state.players.map(p => [p.yaw, p.pitch])).toEqual(frozen.players.map(p => [p.yaw, p.pitch]));
});
it('V15-20 V15-21: resume at windup end uses synchronized pitch instead of paused local aim', () => {
  const room = new RoomLogic('1v1', 'vertical', 0); room.join('vertical', 'volt', 0); room.join('vertical', 'volt', 0); room.begin('p1', 0, ['p1', 'p3']);
  const delivery = new MemoryDelivery({ rttMs: 0, jitterMs: 0, loss: 0, seed: 1 }); let now = 0;
  const guest = new OnlineMatch(room.public(), 'p3', delivery, () => now), state = structuredClone(guest.state);
  state.now = 60000; state.match.roundStartsAt = 0; state.danger = { side: 'b', expiresAt: state.now + c.dangerDuration };
  state.ball = { mode: 'held', owner: 'p3' }; state.players[1].pitch = 0.7;
  state.players[1].action = { kind: 'windup', aim: true, endsAt: state.now };
  const send = (msg: Message) => { delivery.send('host', 'p3', 'event', msg, now); delivery.advance(now); };
  send({ ...envelope(guest.session), kind: 'sync', nextEpoch: 2, remaining: 600000, state, events: [] });
  guest.input({ kind: 'pitch', player: 'p3', pitch: -1.2 }); guest.input({ kind: 'yaw', player: 'p3', yaw: 0 });
  const snapshot: StatePacket = { ...envelope(guest.session), epoch: 2, kind: 'state', number: 1, confirmed: state, provisional: state, inputs: [], acks: [], eventTail: 0 };
  send({ ...envelope(guest.session), epoch: 2, kind: 'resume', snapshot, events: [], hostAt: state.now });
  expect(guest.client.pendingCount).toBe(0);
  now += 1000; guest.advance();
  expect(guest.state).toEqual(step(state, []).state);
  expect(guest.state.players[1].pitch).toBe(0.7);
});
