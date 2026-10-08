import { expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import { validCommand, validMessage, type Message, type StatePacket } from '../../src/net/messages';
import { PROTOCOL } from '../../src/net/room-protocol';
import type { Command, SimState } from '../../src/sim/types';
import { evenMatch } from '../fixtures';

const env = { matchId: 'vertical', epoch: 1 };
const command = (value: unknown): Command => ({ kind: 'pitch', player: 'p1', at: 0, seq: 0, pitch: value } as Command);
const invalid = [undefined, '0', NaN, Infinity, -Infinity, -1.200001, 1.200001];
it.each([0, -1.2, 1.2, 0.123456789])('V15-2: accepts pitch %s with exact precision', value => {
  expect(validCommand(command(value))).toBe(true);
  expect(validMessage({ ...env, kind: 'input', commands: [command(value)] })).toBe(true);
});
it.each(invalid)('V15-2: rejects invalid pitch command %s', value => { expect(validCommand(command(value))).toBe(false); });
it('V15-2: rejects missing pitch, invalid envelopes and extra coordinates', () => {
  const cmd = command(0); delete (cmd as Partial<Extract<Command, { kind: 'pitch' }>>).pitch;
  expect(validCommand(cmd)).toBe(false);
  for (const extra of [{ x: 0 }, { target: { x: 0, y: 0, z: 0 } }, { at: -1 }, { seq: 0.5 }, { player: 'unknown' }]) {
    expect(validCommand({ ...command(0), ...extra } as Command)).toBe(false);
  }
});
function packet(): StatePacket {
  const state = createInitialState(evenMatch('2v2', 'a'));
  return { ...env, kind: 'state', number: 1, provisional: state, confirmed: structuredClone(state), inputs: [], acks: [], eventTail: 0 };
}
function wrap(kind: 'state' | 'sync' | 'resume' | 'complete', edit: (s: SimState) => void): Message {
  const p = packet();
  if (kind === 'complete') { p.confirmed.match.phase = p.provisional.match.phase = 'over'; p.eventTail = 1; }
  edit(p.confirmed); edit(p.provisional);
  return kind === 'state' ? p : kind === 'sync' ? { ...env, kind, nextEpoch: 2, remaining: 1000, state: p.confirmed, events: [] }
    : { ...env, kind, snapshot: p, hostAt: 0, events: kind === 'complete' ? [{ seq: 1, event: { kind: 'match-end', at: 0, winner: 'a' } }] : [] };
}
for (const kind of ['state', 'sync', 'resume', 'complete'] as const) {
  it.each([0, -1.2, 1.2])(`V15-2: ${kind} accepts pitch %s`, value => {
    expect(validMessage(wrap(kind, s => { s.players[0].pitch = value; }))).toBe(true);
  });
  it.each(invalid)(`V15-2: ${kind} rejects pitch %s`, value => {
    expect(validMessage(wrap(kind, s => { s.players[0].pitch = value as number; }))).toBe(false);
  });
  it(`V15-2: ${kind} rejects missing pitch without fallback`, () => {
    expect(validMessage(wrap(kind, s => { delete (s.players[0] as Partial<typeof s.players[0]>).pitch; }))).toBe(false);
  });
}
it('V15-23: uses protocol 4 and includes shared aim geometry in config', () => {
  expect(PROTOCOL).toBe(4); expect(c.aimEyeHeight).toBe(1.6); expect(c.aimMaxDistance).toBe(60);
});
