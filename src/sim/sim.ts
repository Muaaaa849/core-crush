import { defaultConfig, type SimConfig } from './config';
import { centerCrossingAt, flightPosition, opposite } from './ball';
import type { Command, PlayerState, Side, SimEvent, SimState } from './types';

export function createInitialState(side: Side, config: SimConfig = defaultConfig): SimState {
  return {
    now: 0,
    players: (['p1', 'p2'] as const).map(id => ({
      id, side: id, hp: config.initialHp, position: { ...config.supply[id] },
      yaw: id === 'p1' ? 0 : Math.PI, move: { x: 0, z: 0 }, action: null,
    })),
    ball: { mode: 'loose', position: { ...config.supply[side] }, startsAt: config.ballStartDelay },
    danger: null,
  };
}

function bounds(player: PlayerState, config: SimConfig) {
  return player.side === 'p1'
    ? { minZ: Number.EPSILON, maxZ: config.courtSideLength }
    : { minZ: -config.courtSideLength, maxZ: -Number.EPSILON };
}

function walkVelocity(player: PlayerState, state: SimState, config: SimConfig) {
  if (!state.danger || player.hp <= 0) return { x: 0, z: 0 };
  const scale = config.walkSpeed * (player.action?.kind === 'windup' ? config.windupWalkMultiplier : 1);
  const { minZ, maxZ } = bounds(player, config);
  let x = player.move.x * scale;
  let z = player.move.z * scale;
  if ((x < 0 && player.position.x <= -config.courtWidth / 2) || (x > 0 && player.position.x >= config.courtWidth / 2)) x = 0;
  if ((z < 0 && player.position.z <= minZ) || (z > 0 && player.position.z >= maxZ)) z = 0;
  return { x, z };
}

function movementBoundaryAt(state: SimState, config: SimConfig): number {
  let next = Infinity;
  for (const player of state.players) {
    const v = walkVelocity(player, state, config);
    const { minZ, maxZ } = bounds(player, config);
    for (const [position, speed, min, max] of [
      [player.position.x, v.x, -config.courtWidth / 2, config.courtWidth / 2],
      [player.position.z, v.z, minZ, maxZ],
    ]) {
      if (speed !== 0) next = Math.min(next, state.now + ((speed > 0 ? max : min) - position) / speed * config.timeUnitsPerSecond);
    }
  }
  return next;
}

function pickupAt(state: SimState, config: SimConfig): { at: number; player: PlayerState | null } {
  let result: { at: number; player: PlayerState | null } = { at: Infinity, player: null };
  if (state.ball.mode !== 'loose' || !state.danger) return result;
  for (const player of state.players) {
    if (player.hp <= 0) continue;
    const dx = player.position.x - state.ball.position.x;
    const dz = player.position.z - state.ball.position.z;
    const c = dx * dx + dz * dz - config.pickupRadius ** 2;
    const v = walkVelocity(player, state, config);
    const a = v.x * v.x + v.z * v.z;
    const b = 2 * (dx * v.x + dz * v.z);
    const discriminant = b * b - 4 * a * c;
    const seconds = c <= 0 ? 0 : a > 0 && b < 0 && discriminant >= 0 ? (-b - Math.sqrt(discriminant)) / (2 * a) : Infinity;
    const at = state.now + seconds * config.timeUnitsPerSecond;
    if (at < result.at) result = { at, player };
  }
  return result;
}

function advancePositions(state: SimState, at: number, config: SimConfig) {
  const seconds = (at - state.now) / config.timeUnitsPerSecond;
  for (const player of state.players) {
    const v = walkVelocity(player, state, config);
    const { minZ, maxZ } = bounds(player, config);
    player.position.x = Math.max(-config.courtWidth / 2, Math.min(config.courtWidth / 2, player.position.x + v.x * seconds));
    player.position.z = Math.max(minZ, Math.min(maxZ, player.position.z + v.z * seconds));
  }
  if (state.ball.mode === 'flight') state.ball.position = flightPosition(state.ball, at, config);
  state.now = at;
}

function applyCommand(state: SimState, command: Command, config: SimConfig) {
  const player = state.players.find(p => p.id === command.player);
  if (!player || player.hp <= 0 || !state.danger) return;
  switch (command.kind) {
    case 'yaw': player.yaw = command.yaw; break;
    case 'move': {
      const magnitude = Math.max(1, Math.hypot(command.x, command.z));
      player.move = { x: command.x / magnitude, z: command.z / magnitude };
      break;
    }
    case 'primary':
      if (!player.action && state.ball.mode === 'held' && state.ball.owner === player.id) {
        player.action = { kind: 'windup', endsAt: state.now + config.throwWindup };
      }
      break;
  }
}

export function step(input: SimState, commands: readonly Command[], config: SimConfig = defaultConfig): { state: SimState; events: SimEvent[] } {
  const state = structuredClone(input);
  const events: SimEvent[] = [];
  const end = input.now + config.tick;
  // 入力受付は[開始, 終了)。境界上の入力は次のtickへ渡す。
  const ordered = commands.filter(c => c.at >= input.now && c.at < end).sort((a, b) => a.at - b.at || a.seq - b.seq);
  let index = 0;
  for (;;) {
    const crossing = centerCrossingAt(state.ball, config);
    const pickup = pickupAt(state, config);
    const appearsAt = state.ball.mode === 'absent' ? state.ball.appearsAt : Infinity;
    const startsAt = state.ball.mode === 'loose' && !state.danger ? state.ball.startsAt : Infinity;
    const actionAt = Math.min(...state.players.map(p => p.action?.endsAt ?? Infinity));
    const at = Math.min(end, state.danger?.expiresAt ?? Infinity, ordered[index]?.at ?? Infinity,
      appearsAt, startsAt, actionAt, crossing, pickup.at, movementBoundaryAt(state, config));
    advancePositions(state, at, config);

    // 同時刻の中央通過より爆発を先に確定する。
    if (state.danger && state.danger.expiresAt === at) {
      let side = state.danger.side;
      if (state.ball.mode === 'flight' || state.ball.mode === 'loose') {
        const z = state.ball.position.z;
        if (z !== 0 && crossing !== at) side = z > 0 ? 'p1' : 'p2';
      } else if (state.ball.mode === 'held') {
        const owner = state.ball.owner;
        side = state.players.find(p => p.id === owner)!.side;
      }
      for (const player of state.players) {
        if (player.side === side && player.hp > 0) player.hp = Math.max(0, player.hp - config.explosionDamage);
        player.action = null;
      }
      state.ball = { mode: 'absent', side: opposite(side), appearsAt: at + config.newBallAppearDelay };
      state.danger = null;
      events.push({ kind: 'explosion', at, side });
    }

    if (state.ball.mode === 'absent' && state.ball.appearsAt === at) {
      const side = state.ball.side;
      state.ball = { mode: 'loose', position: { ...config.supply[side] }, startsAt: at + config.ballStartDelay };
      events.push({ kind: 'spawn', at, side });
    }
    if (state.ball.mode === 'loose' && !state.danger && state.ball.startsAt === at) {
      const side = state.ball.position.z > 0 ? 'p1' : 'p2';
      state.danger = { side, expiresAt: at + config.dangerDuration };
      events.push({ kind: 'clock-start', at, side });
    }

    while (ordered[index]?.at === at) applyCommand(state, ordered[index++], config);
    for (const player of state.players) {
      // 行動境界は同時刻の入力が必要なので、終了境界なら次のtickで解決する。
      if (at === end || player.action?.endsAt !== at) continue;
      if (player.action.kind === 'windup' && state.ball.mode === 'held' && state.ball.owner === player.id) {
        const origin = { ...player.position };
        state.ball = { mode: 'flight', position: { ...origin }, origin, releasedAt: at, side: player.side,
          velocity: { x: -Math.sin(player.yaw) * config.aimedThrowSpeed, y: 0, z: -Math.cos(player.yaw) * config.aimedThrowSpeed } };
        player.action = { kind: 'recovery', endsAt: at + config.throwRecovery };
        events.push({ kind: 'release', at, player: player.id });
      } else player.action = null;
    }
    if (state.ball.mode === 'flight' && crossing === at) {
      state.ball.side = opposite(state.ball.side);
      state.danger = { side: state.ball.side, expiresAt: at + config.dangerDuration };
      events.push({ kind: 'crossing', at, side: state.ball.side });
    }
    if (state.ball.mode === 'loose' && state.danger) {
      // 起動時も、その場の球は自動回収する。
      const currentPickup = pickup.at === at ? pickup : pickupAt(state, config);
      if (currentPickup.at === at && currentPickup.player) {
        state.ball = { mode: 'held', owner: currentPickup.player.id };
        events.push({ kind: 'pickup', at, player: currentPickup.player.id });
      }
    }
    if (at === end) break;
  }
  return { state, events };
}
