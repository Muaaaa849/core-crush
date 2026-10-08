import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import { ballContactPoint } from '../../src/sim/contact';
import { active, defense, incoming } from './cover-helpers';
import { envelope, validMessage } from '../../src/net/messages';
import { PROTOCOL } from '../../src/net/room-protocol';

describe('M3-1 event facts', () => {
  it.each(['catch', 'parry'] as const)('F12-1/F12-2: %s preserves contact before replacement and replay', kind => {
    const s = incoming(0); defense(s, 'p1', kind);
    s.rally.speed = c.rallySpeedCap - c.rallyGain.just.speed / 2;
    if (s.ball.mode !== 'flight') throw Error('flight');
    const position = ballContactPoint(s.ball.position, s.players[0].position, c.ballDiameter / 2, c.capsuleBottom, c.capsuleTop);
    const before = structuredClone(s), result = step(s, []);
    const event = result.events.find(e => e.kind === kind)!;
    expect(event).toMatchObject({ kind, position, grade: 'just', ...(kind === 'parry' ? { rallySpeed: c.rallySpeedCap } : {}) });
    expect(step(structuredClone(before), [])).toEqual(result);
    result.state.players[0].position.x = 99;
    expect(event).toMatchObject({ position });
    expect(s).toEqual(before);
  });

  it.each(['held', 'flight', 'loose'] as const)('F12-1: explosion saves %s center before removal', mode => {
    const s = mode === 'flight' ? incoming(500) : active();
    const position = { x: 2, y: 1.2, z: 5 };
    if (mode === 'held') s.players[0].position = { x: 2, y: 0, z: 5 };
    if (mode === 'flight' && s.ball.mode === 'flight') {
      s.ball.position = { ...position }; s.ball.origin = { ...position }; s.ball.segmentOrigin = { ...position };
    }
    if (mode === 'loose') s.ball = { mode, position: { ...position }, startsAt: 0, velocity: { x: 0, y: 0, z: 0 }, motionAt: s.now, nextPhysicsAt: s.now + c.tick };
    s.danger = { side: 'a', expiresAt: s.now };
    const expected = mode === 'held' ? { ...position, y: c.defenseHeight } : position;
    const result = step(s, []);
    expect(result.events[0]).toEqual({ kind: 'explosion', at: s.now, side: 'a', position: expected });
    expect(result.state.ball.mode).toBe('absent');
  });

  it('F12-1: crossing saves the center on z=0', () => {
    const s = incoming(500);
    if (s.ball.mode !== 'flight') throw Error('flight');
    s.ball.position = { x: 2, y: 1.2, z: 0 };
    s.ball.origin = { ...s.ball.position }; s.ball.segmentOrigin = { ...s.ball.position };
    s.ball.side = 'b'; s.ball.velocity.z = 60;
    const result = step(s, []);
    expect(result.events.find(e => e.kind === 'crossing')).toMatchObject({ position: { x: 2, y: 1.2, z: 0 } });
  });

  it('F12-2: two simultaneous covers emit one success and expiry emits none', () => {
    const s = incoming(0); defense(s, 'p1', 'parry'); defense(s, 'p3', 'parry');
    expect(step(s, []).events.filter(e => e.kind === 'parry')).toHaveLength(1);
    s.danger!.expiresAt = s.now;
    expect(step(s, []).events.some(e => e.kind === 'parry' || e.kind === 'catch')).toBe(false);
  });

  it('F12-2: reception requires new facts, including finite rally speed', () => {
    const session = { matchId: 'm', epoch: 1, protocol: PROTOCOL, build: 'b', config: c, roster: [], initial: active() };
    const event = { kind: 'parry', at: 0, player: 'p1', grade: 'just', position: { x: 0, y: 1, z: 2 }, rallySpeed: 1 };
    const packet = { ...envelope(session), kind: 'events', events: [{ seq: 1, event }] };
    expect(validMessage(packet as never)).toBe(true);
    for (const key of ['position', 'rallySpeed']) {
      const bad = structuredClone(packet); delete (bad.events[0].event as Record<string, unknown>)[key];
      expect(validMessage(bad as never)).toBe(false);
    }
    event.rallySpeed = NaN; expect(validMessage(packet as never)).toBe(false);
  });
});
