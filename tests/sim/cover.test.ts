import { describe, expect, it } from 'vitest';
import { step } from '../../src/sim/sim';
import { defaultConfig as c } from '../../src/sim/config';
import { command, defense, flight, incoming, run, F, radius } from './cover-helpers';

describe('M2 cover and simultaneous contacts', () => {
  it.each(['catch', 'parry'] as const)('T10-17: a non-target teammate can %s before the target', kind => {
    const s = incoming(); s.players[0].position.z = 10; defense(s, 'p2', kind);
    const r = step(s, []); expect(r.events).toContainEqual(expect.objectContaining({ kind, at: s.now + 500, player: 'p2', grade: 'just' }));
    expect(r.state.players[0].hp).toBe(100);
  });
  it.each(['catch', 'parry'] as const)('T10-17: b-side %s cover uses throwerSide even before center crossing', kind => {
    const s = incoming(); const ball = flight(s);
    s.players[2].position.z = -10; defense(s, 'p4', kind);
    ball.attack!.target = 'p3'; ball.attack!.throwerSide = 'a'; ball.velocity.z = -60; ball.side = 'a';
    ball.position.z = ball.segmentOrigin.z = ball.origin.z = -8 + radius + 0.5;
    const r = step(s, []);
    expect(r.events.filter(e => e.kind === 'catch' || e.kind === 'parry' || e.kind === 'hit'))
      .toEqual([expect.objectContaining({ kind, at: s.now + 500, player: 'p4', grade: 'just' })]);
  });
  it.each(['none', 'startup', 'ended', 'behind', 'ko'] as const)('T10-17 T10-20: %s cover does not absorb a normal ball or stall time', mode => {
    const s = incoming(); s.players[0].position.z = 10;
    if (mode !== 'none') defense(s, 'p2', 'catch');
    if (mode === 'startup') defense(s, 'p2', 'catch', s.now + 8 * F);
    if (mode === 'ended') defense(s, 'p2', 'catch', s.now - 9 * F, s.now);
    if (mode === 'behind') s.players[1].yaw = Math.PI;
    if (mode === 'ko') s.players[1].hp = 0;
    const r = run(s, s.now + 4 * F);
    expect(r.state.now).toBe(s.now + 4 * F); expect(r.events.filter(e => e.kind === 'hit')).toHaveLength(1);
    expect(r.events.find(e => e.kind === 'hit')).toMatchObject({ player: 'p1' });
    expect(r.events.some(e => e.kind === 'catch')).toBe(false);
  });
  it('T10-18: an aimed ball hits the first live enemy once, ignores allies and KO, and breaks distance ties by ID', () => {
    for (const mode of ['first', 'id', 'ko', 'distance'] as const) {
      const s = incoming(500, null);
      if (mode === 'first') s.players[0].position.z = 10;
      if (mode === 'ko') s.players[0].hp = 0;
      if (mode === 'distance') { s.players[0].position.y = -0.2; s.players[1].position.y = 0.1; }
      s.players[2].position = { ...flight(s).position, y: 0 };
      const r = run(s, s.now + 4 * F);
      expect(r.events.filter(e => e.kind === 'hit')).toHaveLength(1);
      expect(r.events.find(e => e.kind === 'hit')).toMatchObject({ player: mode === 'id' ? 'p1' : 'p2' });
      expect(r.state.ball.mode).toBe('loose'); expect(r.state.players[2].hp).toBe(100);
    }
  });
  for (const a of ['catch', 'parry'] as const) for (const b of ['catch', 'parry'] as const) {
    it(`T10-19 R10: ${a}/${b} resolves equal contacts by defense-point distance then ID exactly once`, () => {
      for (const closer of [false, true]) {
        const s = incoming(); defense(s, 'p1', a); defense(s, 'p2', b);
        if (closer) s.players[0].position.y = -0.1;
        const r = step(s, []), winner = closer ? 1 : 0, loser = 1 - winner;
        const kind = winner === 0 ? a : b;
        expect(r.events.filter(e => e.kind === 'catch' || e.kind === 'parry' || e.kind === 'hit'))
          .toEqual([expect.objectContaining({ kind, at: s.now + 500, player: s.players[winner].id, grade: 'just' })]);
        expect(r.state.players[loser].cost).toBe(0); expect(r.state.players[loser].hp).toBe(80);
        expect(r.state.players[loser].action).toEqual(s.players[loser].action);
        expect(r.state.players[winner].cost).toBe(kind === 'catch' ? 4 : 1);
        expect(r.state.players[winner].hp).toBe(kind === 'catch' ? 83 : 80);
        expect(r.state.rally).toEqual(kind === 'catch' ? { speed: 0, power: 0 } : { speed: 0.07, power: 0.12 });
      }
    });
  }
  it('T10-19: earlier defense wins regardless of ID and a late cover cannot rescue an earlier hit', () => {
    const s = incoming(); s.players[0].position.z = 9; defense(s, 'p1', 'catch'); defense(s, 'p2', 'parry');
    expect(step(s, []).events.find(e => e.kind === 'parry')).toMatchObject({ player: 'p2', at: s.now + 500 });
    const late = incoming(); late.players[1].position.z = 9; defense(late, 'p2', 'catch');
    const r = step(late, []); expect(r.events.find(e => e.kind === 'hit')).toMatchObject({ player: 'p1' });
    expect(r.events.some(e => e.kind === 'catch')).toBe(false);
  });
  it('T10-19: sub-unit contact times round once to the same timestamp before distance resolution', () => {
    const s = incoming(500.1); defense(s, 'p1', 'catch'); defense(s, 'p2', 'parry');
    s.players[0].position.y = -0.1; s.players[1].position.z += 0.0008;
    expect(step(s, []).events.filter(e => e.kind === 'catch' || e.kind === 'parry' || e.kind === 'hit'))
      .toEqual([expect.objectContaining({ kind: 'parry', at: s.now + 501, player: 'p2', grade: 'just' })]);
  });
  it('T10-17 T10-21: cover returns use the successful defender own lock, keys and attack stats', () => {
    const s = incoming(); defense(s, 'p2', 'parry');
    s.players[1].lockTarget = 'p4'; s.players[1].keys.right = 1; s.players[1].stats.attack = 10;
    s.players[0].keys.right = -1; s.players[0].stats.attack = 1;
    const ball = flight(step(s, []).state);
    expect(ball.attack).toMatchObject({ target: 'p4', shot: 'right', throwerSide: 'a', homing: true });
    expect(ball.attack!.speed).toBeCloseTo(c.shotSpeed.right * 1.15 * (1 + c.dangerSpeedCoefficient * (500 / c.dangerDuration) ** 2) * 1.07);
  });
  it.each([500, F])('T10-20: overlap becomes valid at reception start %i, including an unprocessed tick boundary', offset => {
    const s = incoming(0); s.players[0].position.z = 12;
    defense(s, 'p2', 'catch', s.now + offset);
    const first = step(s, []);
    if (offset === F) expect(first.events.some(e => e.kind === 'catch')).toBe(false);
    const r = run(s, s.now + offset + 1);
    expect(r.events.find(e => e.kind === 'catch')).toMatchObject({ player: 'p2', at: s.now + offset });
  });
  it('T10-20: reception end is exclusive and same-time yaw at a tick boundary controls cover', () => {
    const s = incoming(F); defense(s, 'p2', 'catch', s.now - F, s.now + F);
    expect(run(s, s.now + F + 1).events.find(e => e.kind === 'hit')).toMatchObject({ player: 'p1' });
    const turned = incoming(F); defense(turned, 'p2', 'catch'); turned.players[1].yaw = Math.PI;
    const at = turned.now + F;
    const r = run(turned, at + 1, [{ kind: 'yaw', player: 'p2', at, seq: 0, yaw: 0 }]);
    expect(r.events.find(e => e.kind === 'catch')).toMatchObject({ player: 'p2', at });
  });
  it('T10-20 R10: timeout at an unprocessed contact boundary waits for same-time defense', () => {
    const s = incoming(F); defense(s, 'p1', 'catch'); s.players[1].hp = 80;
    s.players[2].hp = 81; s.players[3].hp = 80; s.match.roundEndsAt = s.now + F;
    const boundary = step(s, []);
    expect(boundary.state.match.phase).toBe('play'); expect(boundary.events).toEqual([]);
    const r = step(JSON.parse(JSON.stringify(boundary.state)), []);
    expect(r.events.filter(e => e.kind === 'catch' || e.kind === 'round-end')).toEqual([
      expect.objectContaining({ kind: 'catch', at: s.now + F, player: 'p1', grade: 'just' }),
      { kind: 'round-end', at: s.now + F, winner: 'a', reason: 'time' },
    ]);
  });
  it.each(['direct', 'cover'] as const)('T10-20 T10-24 R10: rounded tangent %s contact survives a pending boundary and JSON restoration', kind => {
    const s = incoming(); const ball = flight(s);
    ball.position = ball.origin = ball.segmentOrigin = { x: -0.5001, y: c.defenseHeight, z: 8 + radius };
    ball.velocity = { x: 60, y: 0, z: 0 };
    if (kind === 'cover') { s.players[0].position.z = 12; defense(s, 'p2', 'catch'); s.players[1].yaw = Math.PI / 2; }
    const full = step(s, [], { ...c, tick: 502 });
    const boundary = step(s, [], { ...c, tick: 501 });
    expect(boundary.events).toEqual([]);
    const resumed = step(JSON.parse(JSON.stringify(boundary.state)), [], { ...c, tick: 1 });
    expect(resumed).toEqual(full);
    expect(resumed.events.find(e => e.kind === (kind === 'cover' ? 'catch' : 'hit'))).toMatchObject({ at: s.now + 501 });
  });
  it('T10-20 T10-24: same-boundary yaw can enable a rounded tangent cover without absorbing invalid overlap', () => {
    const s = incoming(); const ball = flight(s); s.players[0].position.z = 12;
    ball.position = ball.origin = ball.segmentOrigin = { x: -0.5001, y: c.defenseHeight, z: 8 + radius };
    ball.velocity = { x: 60, y: 0, z: 0 }; defense(s, 'p2', 'catch'); s.players[1].yaw = -Math.PI / 2;
    const commands = [{ kind: 'yaw' as const, player: 'p2' as const, at: s.now + 501, seq: 0, yaw: Math.PI / 2 }];
    const full = step(s, commands, { ...c, tick: 502 });
    expect(full.events.find(e => e.kind === 'catch')).toMatchObject({ at: s.now + 501, player: 'p2' });
    const boundary = step(s, [], { ...c, tick: 501 });
    expect(step(JSON.parse(JSON.stringify(boundary.state)), commands, { ...c, tick: 1 })).toEqual(full);
    expect(step(s, [], { ...c, tick: 502 }).events.some(e => e.kind === 'catch')).toBe(false);
  });
  it('T10-21: an out-of-arc lock returns one target-null straight ball with reward and rally', () => {
    const s = incoming(); defense(s, 'p2', 'parry'); s.players[1].lockTarget = 'p3';
    s.players[2].position.x = 10; s.players[1].yaw = 80 * Math.PI / 180; s.players[1].keys.right = -1;
    const r = step(s, []); expect(r.events.filter(e => e.kind === 'parry')).toHaveLength(1);
    expect(flight(r.state).attack).toMatchObject({ target: null, shot: 'straight', homing: false });
    expect(flight(r.state).velocity.z).toBeLessThan(0); expect(r.state.players[1].cost).toBe(1);
    expect(r.state.rally).toEqual({ speed: 0.07, power: 0.12 });
    const valid = incoming(); defense(valid, 'p2', 'parry'); valid.players[1].keys.right = -1;
    expect(flight(step(valid, []).state).attack).toMatchObject({ target: 'p3', shot: 'left', homing: true });
  });
  it.each([-1, 0, 1])('T10-22 R10: explosion offset %i against two defenses, hit and timeout resolves the old ball once', offset => {
    const s = incoming(); defense(s, 'p1', 'catch'); defense(s, 'p2', 'parry');
    const at = s.now + 500; s.danger!.expiresAt = at + offset; s.match.roundEndsAt = at;
    const r = step(s, []);
    expect(r.events.filter(e => e.kind === 'round-end')).toHaveLength(1);
    expect(r.events.filter(e => e.kind === 'hit' || e.kind === 'parry')).toHaveLength(0);
    expect(r.events.filter(e => e.kind === 'catch')).toHaveLength(offset === 1 ? 1 : 0);
    expect(r.events.filter(e => e.kind === 'explosion')).toHaveLength(offset === 1 ? 0 : 1);
    expect(r.state.players[1].cost).toBe(0); expect(r.state.players[1].hp).toBe(offset === 1 ? 80 : 50);
    expect(r.state.players[0].hp).toBe(offset === 1 ? 83 : 50);
  });
  it('T10-22 R10: explosion KO and simultaneous timeout award one team win', () => {
    const s = incoming(F); defense(s, 'p1', 'catch'); defense(s, 'p2', 'parry');
    s.players[0].hp = s.players[1].hp = 30;
    s.match.roundEndsAt = s.danger!.expiresAt = s.now + F;
    const r = step(s, []); expect(r.events.filter(e => e.kind === 'round-end')).toHaveLength(1);
    expect(r.state.match.wins).toEqual({ a: 0, b: 1 });
    expect(r.events.filter(e => e.kind === 'catch' || e.kind === 'parry' || e.kind === 'hit')).toHaveLength(0);
  });
  it('T10-24 R09 R10: Q, simultaneous defense, partial KO, returned flight and pending boundaries survive JSON restoration and input permutation', () => {
    for (const contact of [500, F]) {
      const s = incoming(contact); defense(s, 'p1', 'parry'); defense(s, 'p2', 'catch'); s.players[2].hp = 0;
      s.players[0].lockTarget = 'p4';
      const at = s.now + contact;
      const commands = [command('cycle-target', at), { kind: 'yaw' as const, player: 'p2' as const, at, seq: 0, yaw: 0 }];
      const full = run(s, s.now + 3 * F, commands);
      const reordered = structuredClone(s); reordered.players.reverse();
      const permuted = run(reordered, s.now + 3 * F, [...commands].reverse());
      expect(permuted).toEqual(full);
      for (const offset of [contact, contact + 1]) {
        const prefix = run(s, s.now + offset, commands);
        const suffix = run(JSON.parse(JSON.stringify(prefix.state)), s.now + 3 * F, commands);
        expect(suffix.state).toEqual(full.state); expect([...prefix.events, ...suffix.events]).toEqual(full.events);
      }
    }
  });
  it('T10-24 R10: overlapping return contacts advance at least one time unit and never reuse old candidates', () => {
    const s = incoming(0); defense(s, 'p1', 'parry'); defense(s, 'p2', 'catch');
    s.players.forEach(p => { p.position.z = p.side === 'a' ? 0.5 : -0.5; });
    flight(s).position.z = flight(s).segmentOrigin.z = flight(s).origin.z = 0;
    defense(s, 'p3', 'parry'); defense(s, 'p4', 'parry');
    const r = step(s, [], { ...c, capsuleRadius: 1 });
    const contacts = r.events.filter(e => e.kind === 'catch' || e.kind === 'parry' || e.kind === 'hit');
    expect(contacts.slice(0, 2)).toEqual([
      expect.objectContaining({ kind: 'parry', at: s.now, player: 'p1', grade: 'just' }),
      expect.objectContaining({ kind: 'parry', at: s.now + 1, player: 'p3', grade: 'just' }),
    ]);
    expect(new Set(contacts.map(e => e.at)).size).toBe(contacts.length);
    expect(r.state.now).toBe(s.now + F);
  });
});
