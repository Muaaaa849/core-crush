import { describe, expect, it } from 'vitest';
import { createPresentation, updatePresentation, type PresentationInput } from '../../src/game/presentation';
import { HitStop } from '../../src/game/hitstop';
import { SimRunner } from '../../src/game/runner';
import { defaultConfig as c } from '../../src/sim/config';
import type { SimEvent } from '../../src/sim/types';
import { active, defense, incoming } from '../sim/cover-helpers';

const hit: SimEvent = { kind: 'hit', at: 60000, player: 'p1', damage: 20, position: { x: 0, y: 1, z: 8 }, direction: { x: 0, y: 0, z: 1 }, ko: false };
const parry: SimEvent = { kind: 'parry', at: 60000, player: 'p1', grade: 'just', position: { x: 0, y: 1, z: 8 }, rallySpeed: 0.1 };
function input(edit: Partial<PresentationInput> = {}): PresentationInput {
  return { matchId: 'm', events: [{ seq: 1, event: parry }], state: active(), viewSimAt: 60000,
    displayNowMs: 1000, visible: true, running: true, audioReady: true, muted: false, config: c, ...edit };
}

describe('M3-1 presentation clock', () => {
  it('F12-4: waits for displayed contact, uses one start time and never mutates inputs', () => {
    let state = createPresentation('m');
    const i = input({ viewSimAt: parry.at - 0.1 }); const before = structuredClone(i);
    let r = updatePresentation(state, i); expect(r.effects).toEqual([]); expect(i).toEqual(before);
    r = updatePresentation(r.state, input({ events: [], displayNowMs: 1007 }));
    expect(r.effects).toEqual([{ event: parry, startedAtMs: 1007 }]);
    expect(r.events).toEqual([parry]);
    const stop = new HitStop(); stop.trigger(r.effects.map(e => e.event), 1007);
    expect(stop.timeScale(1007)).toBe(0);
    state = r.state;
    expect(updatePresentation(state, input()).effects).toEqual([]);
  });

  it.each([30, 60, 144])('F12-4/F12-12: %ifps changes no sim result and presents each result once', fps => {
    const initial = incoming(500); defense(initial, 'p1', 'parry');
    const runner = new SimRunner(initial); let state = createPresentation('m'), seq = 0, now = 0;
    const effects: SimEvent[] = [], events: SimEvent[] = [];
    for (let f = 0; f < fps; f++) {
      runner.advance(1000 / fps); now += 1000 / fps;
      const drained = runner.drainEvents(); events.push(...drained);
      const r = updatePresentation(state, input({ events: drained.map(event => ({ seq: ++seq, event })),
        state: runner.state, viewSimAt: runner.previous.now + runner.alpha * (runner.state.now - runner.previous.now), displayNowMs: now }));
      effects.push(...r.effects.map(e => e.event)); state = r.state;
    }
    const reference = new SimRunner(structuredClone(initial)); reference.advance(250); reference.advance(250); reference.advance(250); reference.advance(250);
    expect(runner.state.now).toBeGreaterThanOrEqual(reference.state.now - c.tick);
    expect(runner.state.players).toEqual(reference.state.players);
    expect(events).toEqual(reference.drainEvents());
    expect(effects.filter(e => e.kind === 'parry')).toHaveLength(1);
  });

  it('F12-6: duplicate, out of order and future events wait for actual contiguous delivery', () => {
    let r = updatePresentation(createPresentation('m'), input({ events: [{ seq: 2, event: hit }] }));
    expect(r.effects).toEqual([]); expect(r.state.consumed).toBe(0);
    r = updatePresentation(r.state, input({ events: [{ seq: 1, event: parry }, { seq: 2, event: hit }] }));
    expect(r.effects.map(e => e.event.kind)).toEqual(['parry', 'hit']);
    expect(updatePresentation(r.state, input({ events: [{ seq: 2, event: hit }] })).effects).toEqual([]);
  });

  it('F12-7: sync consumes history, clears pending, and a new match starts at seq 1', () => {
    let r = updatePresentation(createPresentation('m'), input({ viewSimAt: 59000 }));
    r = updatePresentation(r.state, input({ historyThrough: 4, events: [], running: false }));
    expect(r.state.pending).toEqual([]); expect(r.state.consumed).toBe(4);
    r = updatePresentation(r.state, input({ events: [{ seq: 4, event: hit }, { seq: 5, event: parry }] }));
    expect(r.effects.map(e => e.event)).toEqual([parry]);
    r = updatePresentation(r.state, input({ matchId: 'new' }));
    expect(r.effects).toHaveLength(1); expect(r.state.consumed).toBe(1);
  });

  it.each([300, 300.01])('F12-8: delay %ims suppresses only transient requests', delay => {
    const end: SimEvent = { kind: 'match-end', at: hit.at, winner: 'a' };
    const r = updatePresentation(createPresentation('m'), input({ events: [{ seq: 1, event: hit }, { seq: 2, event: end }], viewSimAt: hit.at + delay * c.timeUnitsPerSecond / 1000 }));
    expect(r.effects).toHaveLength(delay === 300 ? 1 : 0);
    expect(r.events).toContainEqual(end); expect(r.state.consumed).toBe(2);
    expect(r.state.skipped).toBe(delay === 300 ? 0 : 1);
  });

  it('F12-8: hidden frames and an old round cannot replay transient effects', () => {
    let r = updatePresentation(createPresentation('m'), input({ visible: false, viewSimAt: 59000 }));
    expect(r.effects).toEqual([]); expect(r.state.pending).toEqual([]);
    expect(updatePresentation(r.state, input()).effects).toEqual([]);
    const s = active(); s.match.roundStartsAt = hit.at + 1;
    expect(updatePresentation(createPresentation('m'), input({ state: s })).effects).toEqual([]);
  });

  it('F12-8/F12-13: audio unavailable or muted does not queue past sounds', () => {
    for (const edit of [{ audioReady: false }, { muted: true }]) {
      const r = updatePresentation(createPresentation('m'), input(edit));
      expect(r.effects).toHaveLength(1); expect(r.sounds).toEqual([]);
      expect(updatePresentation(r.state, input()).sounds).toEqual([]);
    }
  });
});

describe('M3-1 danger warnings', () => {
  const s = active(); s.danger = { side: 'a', expiresAt: 8 * c.timeUnitsPerSecond };
  const at = (seconds: number, edit: Partial<PresentationInput> = {}) => input({ events: [], state: s, viewSimAt: seconds * c.timeUnitsPerSecond, ...edit });
  it('F12-9: 7.00/7.25/7.50/7.75 intervals warn once and 8.00 is silent', () => {
    let state = createPresentation('m');
    for (const [seconds, count] of [[6.999, 0], [7, 1], [7.1, 0], [7.25, 1], [7.5, 1], [7.75, 1], [8, 0]]) {
      const r = updatePresentation(state, at(seconds)); expect(r.warnings).toHaveLength(count); state = r.state;
    }
  });
  it('F12-9: skips missed intervals, remembers corrections, and consumes muted intervals', () => {
    let r = updatePresentation(createPresentation('m'), at(7.6)); expect(r.warnings).toHaveLength(1);
    r = updatePresentation(r.state, at(7.5)); expect(r.warnings).toEqual([]);
    r = updatePresentation(r.state, at(7.25)); expect(r.warnings).toEqual([]);
    r = updatePresentation(r.state, at(7.75, { muted: true })); expect(r.warnings).toEqual([]);
    expect(updatePresentation(r.state, at(7.75)).warnings).toEqual([]);
  });
  it('F12-9: confirmed danger gates prediction, crossing and absent balls stop warnings', () => {
    const confirmed = structuredClone(s); confirmed.danger!.expiresAt++;
    expect(updatePresentation(createPresentation('m'), at(7, { confirmed })).warnings).toEqual([]);
    confirmed.danger = { ...s.danger! };
    expect(updatePresentation(createPresentation('m'), at(7, { confirmed })).warnings).toHaveLength(1);
    const absent = structuredClone(s); absent.ball = { mode: 'absent', side: 'b', appearsAt: 999999 };
    expect(updatePresentation(createPresentation('m'), at(7, { state: absent })).warnings).toEqual([]);
    expect(updatePresentation(createPresentation('m'), at(7, { running: false })).warnings).toEqual([]);
  });
});
