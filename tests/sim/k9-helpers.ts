import { duelParticipants } from '../fixtures';
import { defaultConfig as c, type SimConfig } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { BallState, Command, PlayerId, Side, SimEvent, SimState, Vec3 } from '../../src/sim/types';

export const F = c.frame, S = c.timeUnitsPerSecond, R = c.ballDiameter / 2;
export function active(side: Side = 'a', now = 123): SimState {
  const state = createInitialState({ participants: duelParticipants, firstBall: side });
  state.now = now;
  state.match.roundStartsAt = 0;
  state.danger = { side, expiresAt: now + c.dangerDuration };
  state.players.forEach(p => { p.position = { x: 0, y: 0, z: p.side === 'a' ? 8 : -8 }; });
  return state;
}
export function loose(position: Vec3, velocity: Vec3 = { x: 0, y: 0, z: 0 }, at = 123): Extract<BallState, { mode: 'loose' }> {
  return { mode: 'loose', position: { ...position }, velocity: { ...velocity }, startsAt: at,
    motionAt: at, nextPhysicsAt: (Math.floor(at / F) + 1) * F };
}
export function incoming(side: Side = 'a', velocity: Vec3 = { x: 0, y: 0, z: 36.4 }, now = 123) {
  const state = active(side, now);
  const player = state.players.find(p => p.side === side)!;
  const position = { ...player.position, y: c.defenseHeight };
  state.ball = { mode: 'flight', position: { ...position }, origin: { ...position }, segmentOrigin: { ...position },
    releasedAt: now, segmentAt: now, velocity: { ...velocity }, side,
    attack: { target: player.id, shot: 'straight', damage: c.hitDamage, speed: Math.hypot(velocity.x, velocity.y, velocity.z),
      homing: false, pure: true, launchDistance: 16, throwerSide: side === 'a' ? 'b' : 'a', guidanceIndex: 1 } };
  return state;
}
export function run(state: SimState, until: number, commands: Command[] = [], config: SimConfig = c) {
  const events: SimEvent[] = [];
  while (state.now < until && state.match.phase !== 'over') {
    const result = step(state, commands, { ...config,
      tick: Math.min(config.tick, until - state.now, config.frame - state.now % config.frame) });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
export const press = (kind: 'primary' | 'secondary' | 'step' | 'feint' | 'summon', at: number, player: PlayerId = 'p1', seq = 0): Command => ({ kind, at, player, seq });
export function ballOf(state: SimState) {
  if (state.ball.mode !== 'loose') throw Error(`expected loose, got ${state.ball.mode}`);
  return state.ball;
}
