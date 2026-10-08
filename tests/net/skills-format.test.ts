import { expect, it } from 'vitest';
import { validCommand, validMessage, type Message, type StatePacket } from '../../src/net/messages';
import { PROTOCOL } from '../../src/net/room-protocol';
import { rosterMatch, localRoster } from '../../src/game/match';
import { createInitialState } from '../../src/sim/sim';
import type { Command, SimState } from '../../src/sim/types';

const envelope = { matchId: 'skills', epoch: 1 };
function snapshot(): StatePacket {
  const initial = createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'a'));
  return { ...envelope, kind: 'state', number: 1, confirmed: structuredClone(initial), provisional: initial, inputs: [], acks: [], eventTail: 0 };
}
const skill = { kind: 'skill', at: 0, seq: 0, player: 'p1', slot: 1 } as Command;

it('K14-22: accepts slots 1/2, rejects malformed slot, unknown player and extra keys', () => {
  for (const slot of [1, 2]) expect(validCommand({ ...skill, slot } as Command)).toBe(true);
  for (const slot of [undefined, 0, 3, '1', 1.5, NaN]) expect(validCommand({ ...skill, slot } as Command)).toBe(false);
  for (const extra of [{ skillId: 'blink' }, { x: 1, z: 1 }, { success: true }]) expect(validCommand({ ...skill, ...extra })).toBe(false);
  for (const command of [skill, { kind: 'primary', at: 0, seq: 0 }, { kind: 'yaw', yaw: 0, at: 0, seq: 0 }]) {
    expect(validCommand({ ...command, player: 'unknown' } as unknown as Command)).toBe(false);
  }
});

const invalidPlayers: [string, (s: SimState) => void][] = [
  ['skills missing', s => { delete (s.players[0] as Partial<typeof s.players[0]>).skills; }],
  ['skills length', s => { s.players[0].skills = ['blink'] as never; }],
  ['sparse skills', s => { s.players[0].skills = new Array(2) as never; }],
  ['unknown skill', s => { s.players[0].skills = ['blink', 'unknown'] as never; }],
  ['ready missing', s => { delete (s.players[0] as Partial<typeof s.players[0]>).skillReadyAt; }],
  ['ready length', s => { s.players[0].skillReadyAt = [0] as never; }],
  ['sparse ready', s => { s.players[0].skillReadyAt = new Array(2) as never; }],
  ['negative ready', s => { s.players[0].skillReadyAt = [-1, 0]; }],
  ['nonfinite ready', s => { s.players[0].skillReadyAt = [Infinity, 0]; }],
  ['fractional ready', s => { s.players[0].skillReadyAt = [0.5, 0]; }],
  ['passive ready', s => { s.players[0].skills = ['charge', 'economy']; s.players[0].skillReadyAt = [1, 0]; }],
  ['unimplemented ready', s => { s.players[0].skills = ['chain', 'phantom']; s.players[0].skillReadyAt = [1, 0]; }],
  ['reservation missing', s => { delete (s.players[0] as Partial<typeof s.players[0]>).overcharge; }],
  ['reservation slot', s => { s.players[0].overcharge = { slot: 3, expiresAt: 1000 } as never; }],
  ['reservation string slot', s => { s.players[0].overcharge = { slot: '1', expiresAt: 1000 } as never; }],
  ['reservation negative expiry', s => { s.players[0].overcharge = { slot: 1, expiresAt: -1 }; }],
  ['reservation nonfinite expiry', s => { s.players[0].overcharge = { slot: 1, expiresAt: NaN }; }],
  ['reservation extra key', s => { s.players[0].overcharge = { slot: 1, expiresAt: 1000, extra: true } as never; }],
  ['reservation source', s => { s.players[0].overcharge = { slot: 2, expiresAt: 1000 }; }],
  ['reservation cooldown', s => { s.players[0].overcharge = { slot: 1, expiresAt: 1000 }; s.players[0].skillReadyAt = [1, 0]; }],
  ['KO reservation', s => { s.players[0].overcharge = { slot: 1, expiresAt: 1000 }; s.players[0].hp = 0; }],
  ['result reservation', s => { s.players[0].overcharge = { slot: 1, expiresAt: 1000 }; s.match.phase = 'result'; }],
  ['over reservation', s => { s.players[0].overcharge = { slot: 1, expiresAt: 1000 }; s.match.phase = 'over'; }],
];
it.each(invalidPlayers)('K14-23: rejects %s in snapshots/sync/resume/complete', (_name, edit) => {
  const packet = snapshot();
  const completed = structuredClone(packet); completed.confirmed.match.phase = completed.provisional.match.phase = 'over'; completed.eventTail = 1;
  const packets: Message[] = [packet, { ...envelope, kind: 'sync', nextEpoch: 2, remaining: 1000, state: packet.confirmed, events: [] },
    { ...envelope, kind: 'resume', snapshot: packet, hostAt: 0, events: [] },
    { ...envelope, kind: 'complete', snapshot: completed, hostAt: 0, events: [{ seq: 1, event: { kind: 'match-end', at: 0, winner: 'a' } }] }];
  for (const msg of packets) expect(validMessage(msg)).toBe(true);
  edit(packet.confirmed); edit(packet.provisional); edit(completed.confirmed); edit(completed.provisional);
  for (const msg of packets) expect(validMessage(msg)).toBe(false);
});
it.each(['state', 'sync', 'resume', 'complete'] as const)('K14-23: %s recursively rejects bad skill inputs/events', kind => {
  const wrap = (invalid: 'input' | 'event' | null): Message => {
    const packet = snapshot();
    if (kind === 'resume') packet.eventTail = 1;
    if (kind === 'complete') { packet.confirmed.match.phase = packet.provisional.match.phase = 'over'; packet.eventTail = 2; }
    if (invalid === 'input') packet.inputs = [{ ...skill, slot: 3 } as never];
    const events = [{ seq: 1, event: { kind: 'skill-rejected' as const, at: 0, player: 'p1' as const, slot: 1 as const, reason: invalid === 'event' ? 'unknown' as never : 'cost' as const } }];
    if (kind === 'complete') events.push({ seq: 2, event: { kind: 'match-end', at: 0, winner: 'a' } as never });
    return kind === 'state' ? packet : kind === 'sync' ? { ...envelope, kind, state: packet.confirmed, events, nextEpoch: 2, remaining: 1000 }
      : { ...envelope, kind, snapshot: packet, events, hostAt: 0 };
  };
  expect(validMessage(wrap(null))).toBe(true);
  if (kind !== 'sync') expect(validMessage(wrap('input'))).toBe(false);
  if (kind !== 'state') expect(validMessage(wrap('event'))).toBe(false);
});
it('K14-23: validates nested input and event payloads, permits expired reservations, and uses PROTOCOL 3', () => {
  expect(PROTOCOL).toBe(3);
  const packet = snapshot(); expect(validMessage(packet)).toBe(true);
  packet.confirmed.players[0].overcharge = { slot: 1, expiresAt: 0 };
  expect(validMessage(packet)).toBe(true);
  packet.inputs = [{ ...skill, slot: 0 } as unknown as Command]; expect(validMessage(packet)).toBe(false);
  const event = { kind: 'skill-rejected', at: 0, player: 'p1', slot: 1, reason: 'cost' };
  const wrap = (e: unknown) => ({ ...envelope, kind: 'events', events: [{ seq: 1, event: e }] }) as Message;
  expect(validMessage(wrap(event))).toBe(true);
  for (const edit of [{ reason: 'unknown' }, { slot: 0 }, { slot: '1' }, { at: -1 }, { player: 'unknown' }]) {
    expect(validMessage(wrap({ ...event, ...edit }))).toBe(false);
  }
});
