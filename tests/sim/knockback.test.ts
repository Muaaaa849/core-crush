import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../../src/sim/config';
import { step } from '../../src/sim/sim';
import type { Command, PlayerState } from '../../src/sim/types';
import { ballOf, F, incoming, loose, press, R, run, S } from './k9-helpers';

describe('0009 hit knockback', () => {
  it.each(['a', 'b'] as const)('K9-1: pushes %s 1.4m in 12F, then holds still until 24F', side => {
    const initial = incoming(side, { x: 21, y: -9, z: side === 'a' ? 28 : -28 });
    const self = initial.players.find(p => p.side === side)!;
    self.yaw = 0.7; self.stats = { attack: 10, defense: 10, agility: 10 };
    const moved = run(initial, initial.now + 12 * F);
    const player = moved.state.players.find(p => p.side === side)!;
    expect(player.hp).toBe(self.hp - c.hitDamage);
    expect(player.position.x - self.position.x).toBeCloseTo(1.4 * 0.6, 10);
    expect(player.position.z - self.position.z).toBeCloseTo(1.4 * 0.8 * (side === 'a' ? 1 : -1), 10);
    expect(player.position.y).toBe(self.position.y); expect(player.yaw).toBe(self.yaw);
    expect(player.action).toMatchObject({ kind: 'hitstun', startedAt: initial.now,
      moveEndsAt: initial.now + 12 * F, endsAt: initial.now + 24 * F });
    expect(run(moved.state, initial.now + 24 * F).state.players.find(p => p.side === side)!.position).toEqual(player.position);
  });

  it.each(['a', 'b'] as const)('K9-1: vertical or negligible horizontal incidence pushes %s toward the back', side => {
    for (const vx of [0, 0.000001]) {
      const initial = incoming(side, { x: vx, y: -60, z: 0 });
      const result = run(initial, initial.now + 12 * F);
      const before = initial.players.find(p => p.side === side)!, after = result.state.players.find(p => p.side === side)!;
      expect(after.position.x).toBe(before.position.x);
      expect(after.position.z - before.position.z).toBeCloseTo(side === 'a' ? 1.4 : -1.4, 10);
      expect(result.events.find(e => e.kind === 'hit')).toMatchObject({ direction: { x: 0, y: 0, z: side === 'a' ? 1 : -1 } });
    }
  });

  it('K9-2: records move/keys/yaw, rejects all actions and pickup, and does not queue presses', () => {
    const initial = incoming();
    const hit = run(initial, initial.now + 1).state;
    hit.ball = loose({ ...hit.players[0].position, y: R }, { x: 0, y: 0, z: 0 }, hit.now);
    const at = initial.now + F, endsAt = initial.now + 24 * F;
    const commands: Command[] = [
      { kind: 'move', player: 'p1', at, seq: 0, x: 1, z: 0 },
      { kind: 'keys', player: 'p1', at, seq: 1, forward: -1, right: 1 },
      { kind: 'yaw', player: 'p1', at, seq: 2, yaw: Math.PI / 2 },
      ...(['step', 'primary', 'secondary', 'feint', 'summon'] as const).map((kind, i) => press(kind, at, 'p1', i + 3)),
    ];
    const locked = run(hit, endsAt, commands);
    expect(locked.state.players[0].position.x).toBe(0);
    expect(locked.state.players[0]).toMatchObject({ move: { x: 1, z: 0 }, keys: { forward: -1, right: 1 }, yaw: Math.PI / 2,
      cost: initial.players[0].cost, stepPoints: initial.players[0].stepPoints });
    expect(locked.events).toEqual([]); expect(locked.state.ball.mode).toBe('loose');
    const walking = run(locked.state, endsAt + F);
    expect(walking.state.players[0].action).toBeNull();
    expect(walking.state.players[0].position.x).toBeCloseTo(c.walkSpeed / 60);
    const fresh = run(locked.state, endsAt + 1, [press('primary', endsAt)]);
    expect(fresh.state.players[0].action?.kind).toBe('parry');
  });

  const actions: NonNullable<PlayerState['action']>[] = [
    { kind: 'step', endsAt: 18 * F, moveEndsAt: 12 * F, velocity: { x: 14, z: 0 } },
    { kind: 'windup', endsAt: 8 * F }, { kind: 'recovery', endsAt: 8 * F },
    { kind: 'catch', pressedAt: 0, startsAt: 0, endsAt: 10 * F },
    { kind: 'parry', pressedAt: 0, startsAt: 0, endsAt: 10 * F },
    { kind: 'catch-whiff', endsAt: 54 * F }, { kind: 'parry-whiff', endsAt: 30 * F },
    { kind: 'catch-recovery', endsAt: 24 * F }, { kind: 'feint', startedAt: 0, endsAt: 8 * F },
  ];
  it.each(actions)('K9-3: interrupts $kind permanently without refunding resources', action => {
    const initial = incoming(); initial.players[0].action = action;
    initial.players[0].yaw = Math.PI; initial.players[0].cost = 0; initial.players[0].stepPoints = 0;
    const result = run(initial, initial.now + 1);
    expect(result.state.players[0].action?.kind).toBe('hitstun');
    expect(result.state.players[0].cost).toBe(0); expect(result.state.players[0].stepPoints).toBe(0);
    const recovered = run(result.state, initial.now + 24 * F + 1);
    expect(recovered.state.players[0].action).toBeNull();
    expect(recovered.events.some(e => e.kind === 'whiff' || e.kind === 'release')).toBe(false);
  });

  it.each(['secondary', 'primary'] as const)('K9-3: same-time successful %s prevents hitstun', kind => {
    const initial = incoming();
    const result = step(initial, [press(kind, initial.now)], { ...c, defenseStartup: 0, tick: 1 });
    expect(result.events).toContainEqual({ kind: kind === 'secondary' ? 'catch' : 'parry', at: initial.now, player: 'p1', grade: 'just' });
    expect(result.events.some(e => e.kind === 'hit')).toBe(false);
    expect(result.state.players[0].action?.kind).not.toBe('hitstun');
  });

  it('K9-3: same-time step consumes its point before hitstun replaces it', () => {
    const initial = incoming(); initial.players[0].move = { x: 1, z: 0 };
    const result = step(initial, [press('step', initial.now)], { ...c, tick: 1 });
    expect(result.events.map(e => e.kind)).toEqual(['step', 'hit']);
    expect(result.state.players[0].stepPoints).toBe(c.maxStepPoints - 1);
    expect(result.state.players[0].action?.kind).toBe('hitstun');
  });

  for (const side of ['a', 'b'] as const) it.each(['back', 'center', 'corner', 'slide'] as const)(`K9-4: ${side} clamps at %s without shortening hitstun`, boundary => {
    const sign = side === 'a' ? 1 : -1;
    const initial = incoming(side, { x: 21, y: 0, z: (boundary === 'center' ? -28 : 28) * sign });
    const self = initial.players.find(p => p.side === side)!;
    self.position.x = boundary === 'corner' || boundary === 'slide' ? c.playerHalfWidth - 0.1 : 0;
    self.position.z = sign * (boundary === 'center' ? c.playerMinDepth + 0.1
      : boundary === 'slide' ? 8 : c.playerMaxDepth - 0.1);
    if (initial.ball.mode !== 'flight') throw Error('flight');
    initial.ball.position = initial.ball.origin = initial.ball.segmentOrigin = { ...self.position, y: c.defenseHeight };
    const result = run(initial, initial.now + 12 * F).state.players.find(p => p.side === side)!;
    expect(result.position.x).toBeCloseTo(boundary === 'corner' || boundary === 'slide' ? c.playerHalfWidth : 0.84, 10);
    expect(result.position.z).toBeCloseTo(sign * (boundary === 'center' ? c.playerMinDepth
      : boundary === 'slide' ? 8 + 1.12 : c.playerMaxDepth), 10);
    expect(result.action?.endsAt).toBe(initial.now + 24 * F);
  });

  it.each([false, true])('K9-5: lethal hit drops once and freezes KO and ball through result/over (final=%s)', final => {
    const initial = incoming(); initial.players[0].hp = c.hitDamage;
    initial.players[0].action = { kind: 'recovery', endsAt: initial.now + F };
    if (final) initial.match.wins.b = c.roundsToWin - 1;
    const result = step(initial, []);
    expect(result.events.filter(e => e.kind === 'hit')).toHaveLength(1);
    expect(result.events.find(e => e.kind === 'hit')).toMatchObject({ ko: true });
    expect(result.events.filter(e => e.kind === 'round-end')).toHaveLength(1);
    expect(result.events.filter(e => e.kind === 'match-end')).toHaveLength(final ? 1 : 0);
    expect(result.state.players[0].position).toEqual(initial.players[0].position);
    expect(result.state.players[0].action).toBeNull();
    expect(ballOf(result.state).velocity).toEqual({ x: -0, y: 3, z: -5 });
    const frozen = final ? step(result.state, []) : run(result.state, initial.now + S);
    expect(frozen.events).toEqual([]); expect(frozen.state.ball).toEqual(result.state.ball);
  });

  it('K9-5: explosion clears existing hitstun without making another knockback or loose ball', () => {
    const initial = incoming(); const hit = run(initial, initial.now + F).state;
    hit.danger!.expiresAt = hit.now;
    const result = step(hit, [], { ...c, tick: 1 });
    expect(result.events).toEqual([{ kind: 'explosion', at: hit.now, side: 'a' }]);
    expect(result.state.players[0].position).toEqual(hit.players[0].position);
    expect(result.state.players[0].action).toBeNull(); expect(result.state.ball.mode).toBe('absent');
  });

  it('K9-15: reports direction/ko once and preserves the surface contact point', () => {
    const initial = incoming('a', { x: 30, y: 0, z: 40 });
    if (initial.ball.mode !== 'flight') throw Error('flight');
    initial.ball.position.x = initial.ball.origin.x = initial.ball.segmentOrigin.x = -0.5;
    const result = run(initial, initial.now + 25 * F);
    const hits = result.events.filter(e => e.kind === 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({ kind: 'hit', at: initial.now, player: 'p1', damage: c.hitDamage,
      position: { x: -0.5 + R, y: c.defenseHeight, z: 8 }, direction: { x: 0.6, y: 0, z: 0.8 }, ko: false });
  });
});
