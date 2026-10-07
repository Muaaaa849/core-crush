import { defaultConfig, type SimConfig } from './config';
import { attackLossAt, centerCrossingAt, dropBall, flightPosition, guidanceAt, launchBall, opposite, updateGuidance } from './ball';
import { ballContactPoint, sweptCapsuleContact } from './contact';
import type { Command, PlayerState, Side, SimEvent, SimState, Stats } from './types';

export function createInitialState(side: Side, config: SimConfig = defaultConfig, playerStats: Partial<Record<Side, Stats>> = {}): SimState {
  return {
    now: 0,
    players: (['p1', 'p2'] as const).map(id => {
      const stats = { ...(playerStats[id] ?? { attack: config.defaultStat, defense: config.defaultStat, agility: config.defaultStat }) };
      const maxHp = config.baseHp + config.defenseHpCoefficient * (stats.defense - config.defaultStat);
      return {
        id, side: id, hp: maxHp, maxHp, stats, cost: config.initialCost,
        stepPoints: config.maxStepPoints, stepRecoveryProgress: 0, position: { ...config.supply[id], y: 0 },
        yaw: id === 'p1' ? 0 : Math.PI, move: { x: 0, z: 0 }, action: null,
      };
    }),
    ball: { mode: 'loose', position: { ...config.supply[side] }, startsAt: config.ballStartDelay },
    danger: null,
  };
}

function bounds(player: PlayerState, config: SimConfig) {
  return player.side === 'p1'
    ? { minZ: config.playerMinDepth, maxZ: config.playerMaxDepth }
    : { minZ: -config.playerMaxDepth, maxZ: -config.playerMinDepth };
}

function movementVelocity(player: PlayerState, state: SimState, config: SimConfig) {
  if (!state.danger || player.hp <= 0) return { x: 0, z: 0 };
  const scale = config.walkSpeed * (1 + config.agilityWalkCoefficient * (player.stats.agility - config.defaultStat))
    * (player.action?.kind === 'windup' ? config.windupWalkMultiplier : 1);
  const { minZ, maxZ } = bounds(player, config);
  let x = player.move.x * scale;
  let z = player.move.z * scale;
  if (player.action?.kind === 'step') {
    const moving = state.now < player.action.moveEndsAt;
    x = moving ? player.action.velocity.x : 0;
    z = moving ? player.action.velocity.z : 0;
  }
  if ((x < 0 && player.position.x <= -config.playerHalfWidth) || (x > 0 && player.position.x >= config.playerHalfWidth)) x = 0;
  if ((z < 0 && player.position.z <= minZ) || (z > 0 && player.position.z >= maxZ)) z = 0;
  return { x, z };
}

function movementBoundaryAt(state: SimState, config: SimConfig): number {
  let next = Infinity;
  for (const player of state.players) {
    const v = movementVelocity(player, state, config);
    const { minZ, maxZ } = bounds(player, config);
    for (const [position, speed, min, max] of [
      [player.position.x, v.x, -config.playerHalfWidth, config.playerHalfWidth],
      [player.position.z, v.z, minZ, maxZ],
    ]) {
      if (speed !== 0) next = Math.min(next, Math.ceil(state.now + ((speed > 0 ? max : min) - position) / speed * config.timeUnitsPerSecond));
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
    const v = movementVelocity(player, state, config);
    const a = v.x * v.x + v.z * v.z;
    const b = 2 * (dx * v.x + dz * v.z);
    const discriminant = b * b - 4 * a * c;
    const seconds = c <= 0 ? 0 : a > 0 && b < 0 && discriminant >= 0 ? (-b - Math.sqrt(discriminant)) / (2 * a) : Infinity;
    const at = Math.ceil(state.now + seconds * config.timeUnitsPerSecond);
    if (at < result.at) result = { at, player };
  }
  return result;
}

function hitAt(state: SimState, config: SimConfig): number {
  if (state.ball.mode !== 'flight' || !state.ball.attack) return Infinity;
  const ball = state.ball;
  const receiver = state.players.find(p => p.id === ball.attack!.target)!;
  if (receiver.hp <= 0) return Infinity;
  const v = movementVelocity(receiver, state, config);
  const seconds = sweptCapsuleContact(state.ball.position, state.ball.velocity, receiver.position, { ...v, y: 0 },
    config.ballDiameter / 2 + config.capsuleRadius, config.capsuleBottom, config.capsuleTop);
  return Math.ceil(state.now + seconds * config.timeUnitsPerSecond);
}

function advancePositions(state: SimState, at: number, config: SimConfig) {
  const duration = at - state.now;
  const seconds = (at - state.now) / config.timeUnitsPerSecond;
  const ball = state.ball;
  const ballSide = ball.mode === 'absent' ? null : ball.mode === 'held'
    ? state.players.find(p => p.id === ball.owner)!.side
    : ball.mode === 'flight' ? ball.side : ball.position.z > 0 ? 'p1' : 'p2';
  for (const player of state.players) {
    if (player.stepPoints >= config.maxStepPoints) player.stepRecoveryProgress = 0;
    else if (state.danger && player.hp > 0 && ballSide !== null) {
      if (ballSide !== player.side) {
        const recovery = (config.stepRecoveryBaseSeconds - player.stats.agility) * config.timeUnitsPerSecond;
        player.stepRecoveryProgress += duration;
        while (player.stepPoints < config.maxStepPoints && player.stepRecoveryProgress >= recovery) {
          player.stepRecoveryProgress -= recovery;
          player.stepPoints++;
        }
        if (player.stepPoints === config.maxStepPoints) player.stepRecoveryProgress = 0;
      }
    }
    const v = movementVelocity(player, state, config);
    const { minZ, maxZ } = bounds(player, config);
    player.position.x = Math.max(-config.playerHalfWidth, Math.min(config.playerHalfWidth, player.position.x + v.x * seconds));
    player.position.z = Math.max(minZ, Math.min(maxZ, player.position.z + v.z * seconds));
  }
  if (state.ball.mode === 'flight') state.ball.position = flightPosition(state.ball, at, config);
  state.now = at;
}

function applyCommand(state: SimState, command: Command, config: SimConfig, events: SimEvent[]): boolean {
  const player = state.players.find(p => p.id === command.player);
  if (!player || player.hp <= 0 || !state.danger) return false;
  switch (command.kind) {
    case 'yaw': player.yaw = command.yaw; break;
    case 'move': {
      const magnitude = Math.max(1, Math.hypot(command.x, command.z));
      player.move = { x: command.x / magnitude, z: command.z / magnitude };
      break;
    }
    case 'primary':
      if (!player.action && state.ball.mode === 'held' && state.ball.owner === player.id) {
        player.action = { kind: 'windup', endsAt: state.now + config.throwWindup, ...(command.aim ? { aim: true } : {}) };
        return true;
      }
      break;
    case 'step': {
      if (player.action || player.stepPoints < 1 || (player.move.x === 0 && player.move.z === 0)) break;
      // 前は中央、右はその陣から中央を向いた右方向。
      const basis = player.side === 'p1' ? 1 : -1;
      const forward = -basis * player.move.z;
      const right = basis * player.move.x;
      const longitudinal = Math.abs(forward) >= Math.abs(right);
      const direction = longitudinal ? forward > 0 ? 'forward' : 'back' : right > 0 ? 'right' : 'left';
      const axis = longitudinal ? { x: 0, z: Math.sign(player.move.z) } : { x: Math.sign(player.move.x), z: 0 };
      const { minZ, maxZ } = bounds(player, config);
      if ((axis.x < 0 && player.position.x <= -config.playerHalfWidth) || (axis.x > 0 && player.position.x >= config.playerHalfWidth)
        || (axis.z < 0 && player.position.z <= minZ) || (axis.z > 0 && player.position.z >= maxZ)) break;
      const speed = config.stepDistance / config.stepMoveDuration * config.timeUnitsPerSecond;
      player.action = { kind: 'step', endsAt: state.now + config.stepActionDuration, moveEndsAt: state.now + config.stepMoveDuration,
        velocity: { x: axis.x * speed, z: axis.z * speed } };
      player.stepPoints--;
      const ball = state.ball;
      if (ball.mode === 'flight' && ball.attack?.homing && ball.attack.target === player.id && state.now > ball.releasedAt) {
        const valid = ball.attack.shot === 'straight' || (ball.attack.shot === 'upper'
          ? direction === 'left' || direction === 'right' : direction === 'forward' || direction === 'back');
        if (valid) ball.attack.homing = false;
      }
      events.push({ kind: 'step', at: state.now, player: player.id, direction });
      return true;
    }
    case 'summon':
      if (!player.action && player.cost >= config.summonCost && state.ball.mode === 'loose'
        && (state.ball.position.z > 0 ? 'p1' : 'p2') === player.side) {
        player.cost -= config.summonCost;
        state.ball = { mode: 'held', owner: player.id };
        events.push({ kind: 'summon', at: state.now, player: player.id });
        return true;
      }
      break;
  }
  return false;
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
    const guidance = guidanceAt(state.ball, config);
    const hit = hitAt(state, config);
    const loss = attackLossAt(state.ball, state.now, config);
    const pickup = pickupAt(state, config);
    const appearsAt = state.ball.mode === 'absent' ? state.ball.appearsAt : Infinity;
    const startsAt = state.ball.mode === 'loose' && !state.danger ? state.ball.startsAt : Infinity;
    const actionAt = Math.min(...state.players.map(p => p.action?.kind === 'step' && p.action.moveEndsAt > state.now
      ? p.action.moveEndsAt : p.action?.endsAt ?? Infinity));
    const at = Math.min(end, state.danger?.expiresAt ?? Infinity, ordered[index]?.at ?? Infinity,
      appearsAt, startsAt, actionAt, crossing, guidance, hit, loss, pickup.at, movementBoundaryAt(state, config));
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

    // 硬直の終了時刻から次の行動を受け付ける。投擲発生は同時刻の向き入力を待つ。
    if (at !== end) {
      for (const player of state.players) {
        if (player.action && player.action.kind !== 'windup' && player.action.endsAt === at) player.action = null;
      }
    }
    const simultaneous: Command[] = [];
    while (ordered[index]?.at === at) simultaneous.push(ordered[index++]);
    for (const command of simultaneous.filter(c => c.kind === 'move' || c.kind === 'yaw')) applyCommand(state, command, config, events);
    // 行動の優先順位は入力のseqに依存させない。
    for (const player of state.players) {
      let succeeded = false;
      for (const kind of ['step', 'primary', 'summon'] as const) {
        for (const command of simultaneous.filter(c => c.player === player.id && c.kind === kind)) {
          if (!succeeded) succeeded = applyCommand(state, command, config, events);
        }
      }
    }
    for (const player of state.players) {
      // 行動境界は同時刻の入力が必要なので、終了境界なら次のtickで解決する。
      if (at === end || player.action?.endsAt !== at) continue;
      if (player.action.kind === 'windup' && state.ball.mode === 'held' && state.ball.owner === player.id) {
        const receiver = state.players.find(p => p.side !== player.side)!;
        const elapsed = state.danger?.side === player.side
          ? (config.dangerDuration - (state.danger.expiresAt - at)) / config.timeUnitsPerSecond : 0;
        state.ball = launchBall(player, receiver, at, elapsed, player.action.aim === true, config);
        player.action = { kind: 'recovery', endsAt: at + config.throwRecovery };
        events.push({ kind: 'release', at, player: player.id });
      } else player.action = null;
    }
    if (state.ball.mode === 'flight' && crossing === at) {
      state.ball.side = opposite(state.ball.side);
      state.danger = { side: state.ball.side, expiresAt: at + config.dangerDuration };
      events.push({ kind: 'crossing', at, side: state.ball.side });
    }
    if (state.ball.mode === 'flight' && state.ball.attack && hit === at) {
      const ball = state.ball;
      const receiver = state.players.find(p => p.id === ball.attack!.target)!;
      const damage = ball.attack!.damage;
      receiver.hp = Math.max(0, receiver.hp - damage);
      events.push({ kind: 'hit', at, player: receiver.id, damage,
        position: ballContactPoint(ball.position, receiver.position, config.ballDiameter / 2, config.capsuleBottom, config.capsuleTop) });
      state.ball = dropBall(ball, at, config);
    }
    if (state.ball.mode === 'flight' && loss === at) state.ball = dropBall(state.ball, at, config);
    if (state.ball.mode === 'flight' && state.ball.attack?.homing && guidance === at) {
      const ball = state.ball;
      ball.attack!.guidanceIndex++;
      updateGuidance(ball, state.players.find(p => p.id === ball.attack!.target)!, at, config);
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
