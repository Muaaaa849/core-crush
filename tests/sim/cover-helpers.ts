import { localMatch } from '../../src/game/match';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, PlayerId, SimEvent, SimState } from '../../src/sim/types';

export const F = c.frame, S = c.timeUnitsPerSecond, radius = c.capsuleRadius + c.ballDiameter / 2;
export function active(): SimState {
  const state = createInitialState(localMatch('2v2', 'a'));
  state.now = S; state.match.roundStartsAt = 0;
  state.danger = { side: 'a', expiresAt: state.now + c.dangerDuration };
  state.players.forEach(p => { p.position = { x: 0, y: 0, z: p.side === 'a' ? 8 : -8 }; });
  state.ball = { mode: 'held', owner: 'p1' };
  return state;
}
export function incoming(contact = 500, target: PlayerId | null = 'p1'): SimState {
  const state = active();
  const origin = { x: 0, y: c.defenseHeight, z: 8 - radius - contact / F };
  state.ball = { mode: 'flight', position: { ...origin }, origin, segmentOrigin: { ...origin },
    releasedAt: state.now - F, segmentAt: state.now, side: 'a', velocity: { x: 0, y: 0, z: 60 },
    attack: { target, shot: 'straight', speed: 60, damage: 20, homing: false, pure: true,
      launchDistance: 16, throwerSide: 'b', guidanceIndex: 1 } };
  return state;
}
export function defense(state: SimState, id: PlayerId, kind: 'catch' | 'parry', startsAt = state.now, endsAt = state.now + 9 * F): void {
  const p = state.players.find(p => p.id === id)!;
  p.hp = 80; p.cost = 0;
  p.action = { kind, pressedAt: startsAt - c.defenseStartup, startsAt, endsAt };
}
export function flight(state: SimState) {
  if (state.ball.mode !== 'flight') throw Error(`expected flight, got ${state.ball.mode}`);
  return state.ball;
}
export const command = (kind: 'cycle-target' | 'primary' | 'secondary', at: number, player: PlayerId = 'p1', seq = 0): Command => ({ kind, at, player, seq });
export function run(state: SimState, until: number, commands: Command[] = []) {
  const events: SimEvent[] = [];
  while (state.now < until && state.match.phase !== 'over') {
    const result = step(state, commands, { ...c, tick: Math.min(F, until - state.now) });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
