import { defaultConfig, type SimConfig } from './config';
import { attackLossAt, centerCrossingAt, createLooseBall, dropBall, flightPosition, guidanceAt, launchBall, opposite, updateGuidance, updateLooseBall } from './ball';
import { ballContactPoint, sweptCapsuleContact } from './contact';
import { initialTarget } from './target';
import type { Command, DefenseGrade, MatchOptions, PlayerState, Side, SimEvent, SimState, Vec3 } from './types';

/** 参加構成は試合中固定。IDと陣を分け、同じ入力から同じ配置・HPを作る（0010）。 */
export function createInitialState({ participants, firstBall }: MatchOptions, config: SimConfig = defaultConfig): SimState {
  const counts = { a: 0, b: 0 };
  const ids = new Set<string>();
  if (!participants || participants.length < 2 || participants.length > 4) throw new Error('参加者は2〜4人');
  for (const p of participants) {
    if (!['p1', 'p2', 'p3', 'p4'].includes(p.id) || ids.has(p.id)) throw new Error('参加者IDが不正');
    if (p.side !== 'a' && p.side !== 'b') throw new Error('陣が不正');
    if (!p.stats || ![p.stats.attack, p.stats.defense, p.stats.agility].every(n => Number.isInteger(n) && n >= 1 && n <= 10)) throw new Error('能力値が不正');
    ids.add(p.id); counts[p.side]++;
  }
  if (counts.a < 1 || counts.a > 2 || counts.b < 1 || counts.b > 2) throw new Error('各陣は1〜2人');
  if (firstBall !== 'a' && firstBall !== 'b') throw new Error('初球の陣が不正');
  const players: PlayerState[] = [...participants].sort((a, b) => a.id.localeCompare(b.id)).map(p => {
    const stats = { ...p.stats };
    const multiplier = counts[p.side] === 1 && counts[opposite(p.side)] === 2 ? config.singletonHpMultiplier : 1;
    const maxHp = (config.baseHp + config.defenseHpCoefficient * (stats.defense - config.defaultStat)) * multiplier;
    return { id: p.id, side: p.side, hp: maxHp, maxHp, stats, cost: config.initialCost,
      stepPoints: config.maxStepPoints, stepRecoveryProgress: 0, position: { ...config.supply[p.side], y: 0 },
      keys: { forward: 0, right: 0 }, yaw: p.side === 'a' ? 0 : Math.PI, lockTarget: null, move: { x: 0, z: 0 }, action: null };
  });
  placePlayers(players, config);
  for (const p of players) p.lockTarget = initialTarget(p, players);
  return {
    now: 0,
    match: { round: 1, wins: { a: 0, b: 0 }, phase: 'play', firstBall,
      roundStartsAt: config.ballStartDelay, roundEndsAt: config.ballStartDelay + config.roundDuration, nextRoundAt: null },
    players, ball: createLooseBall(config.supply[firstBall], 0, config.ballStartDelay, config),
    danger: null, rally: { speed: 0, power: 0 },
  };
}

function placePlayers(players: PlayerState[], config: SimConfig): void {
  for (const side of ['a', 'b'] as const) {
    const team = players.filter(p => p.side === side), sign = side === 'a' ? 1 : -1;
    team.forEach((p, i) => { p.position = { ...config.supply[side], y: 0,
      x: team.length === 1 ? 0 : (i === 0 ? -sign : sign) * config.teamSlotOffset }; });
  }
}

function refreshTargets(state: SimState): void {
  for (const p of state.players) {
    if (!state.players.some(enemy => enemy.id === p.lockTarget && enemy.side !== p.side && enemy.hp > 0)) p.lockTarget = initialTarget(p, state.players);
  }
  const ball = state.ball;
  if (ball.mode === 'flight' && ball.attack?.homing && !state.players.some(p => p.id === ball.attack!.target && p.hp > 0)) ball.attack.homing = false;
}

function lockReceiver(player: PlayerState, state: SimState): PlayerState | undefined {
  return state.players.find(p => p.id === player.lockTarget && p.side !== player.side && p.hp > 0);
}

function bounds(player: PlayerState, config: SimConfig) {
  return player.side === 'a'
    ? { minZ: config.playerMinDepth, maxZ: config.playerMaxDepth }
    : { minZ: -config.playerMaxDepth, maxZ: -config.playerMinDepth };
}

function canMove(state: SimState): boolean {
  return state.match.phase === 'play' && (state.danger !== null || state.now >= state.match.roundStartsAt);
}

function movementVelocity(player: PlayerState, state: SimState, config: SimConfig) {
  if (!canMove(state) || player.hp <= 0) return { x: 0, z: 0 };
  const scale = config.walkSpeed * (1 + config.agilityWalkCoefficient * (player.stats.agility - config.defaultStat))
    * (player.action?.kind === 'windup' || player.action?.kind === 'feint' ? config.windupWalkMultiplier : 1);
  const { minZ, maxZ } = bounds(player, config);
  let x = player.move.x * scale;
  let z = player.move.z * scale;
  if (player.action?.kind === 'step' || player.action?.kind === 'hitstun') {
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
      if (speed !== 0) {
        // 壁の直前の微小距離が時刻の浮動小数点精度より小さくても、同時刻を再処理し続けない。
        const at = Math.ceil(state.now + ((speed > 0 ? max : min) - position) / speed * config.timeUnitsPerSecond);
        next = Math.min(next, Math.max(state.now + 1, at));
      }
    }
  }
  return next;
}

function pickupPlayer(state: SimState, config: SimConfig): PlayerState | null {
  if (state.ball.mode !== 'loose' || !state.danger || state.ball.position.y > config.pickupHeight) return null;
  const side = state.ball.position.z > 0 ? 'a' : 'b';
  let result: PlayerState | null = null, distance = Infinity;
  for (const player of state.players) {
    if (player.hp <= 0 || player.side !== side || player.action?.kind === 'hitstun') continue;
    const dx = player.position.x - state.ball.position.x;
    const dz = player.position.z - state.ball.position.z;
    const squared = dx * dx + dz * dz;
    if (squared <= config.pickupRadius ** 2 && (squared < distance || (squared === distance && (!result || player.id < result.id)))) {
      result = player; distance = squared;
    }
  }
  return result;
}

function hitAt(state: SimState, config: SimConfig): number {
  if (state.ball.mode !== 'flight' || !state.ball.attack) return Infinity;
  const ball = state.ball;
  const receiver = state.players.find(p => p.id === ball.attack!.target);
  if (!receiver || receiver.hp <= 0) return Infinity;
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
    : ball.mode === 'flight' ? ball.side : ball.position.z > 0 ? 'a' : 'b';
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
  if (!player || state.match.phase === 'over') return false;
  // 入力状態は開始待機・結果表示・KO中も記録し、次ラウンドまで保持する。
  const stateInput = command.kind === 'move' || command.kind === 'yaw' || command.kind === 'keys';
  if (!stateInput && (player.hp <= 0 || state.match.phase !== 'play')) return false;
  if (!stateInput && (command.kind === 'step' ? !canMove(state) : !state.danger)) return false;
  if (player.action?.kind === 'feint' && state.now > player.action.startedAt && !stateInput) player.action = null;
  switch (command.kind) {
    case 'yaw': player.yaw = command.yaw; break;
    case 'keys': {
      const keys = { forward: Math.sign(command.forward), right: Math.sign(command.right) };
      if (player.action?.kind === 'feint' && state.now > player.action.startedAt
        && (keys.forward !== player.keys.forward || keys.right !== player.keys.right)) player.action = null;
      player.keys = keys;
      break;
    }
    case 'move': {
      const magnitude = Math.max(1, Math.hypot(command.x, command.z));
      player.move = { x: command.x / magnitude, z: command.z / magnitude };
      break;
    }
    case 'secondary':
    case 'primary': {
      if (player.action) break;
      const holding = state.ball.mode === 'held' && state.ball.owner === player.id;
      if (command.kind === 'primary' && holding) {
        player.action = { kind: 'windup', endsAt: state.now + config.throwWindup, ...(command.aim ? { aim: true } : {}) };
        return true;
      }
      if (!holding) {
        const startsAt = state.now + config.defenseStartup;
        player.action = { kind: command.kind === 'secondary' ? 'catch' : 'parry', pressedAt: state.now, startsAt,
          endsAt: startsAt + config.defenseWindowFrames[player.stats.defense - 1] * config.frame };
        return true;
      }
      break;
    }
    case 'step': {
      if ((player.action && player.action.kind !== 'catch-whiff') || player.stepPoints < 1 || (player.move.x === 0 && player.move.z === 0)) break;
      // 前は中央、右はその陣から中央を向いた右方向。
      const basis = player.side === 'a' ? 1 : -1;
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
    case 'feint':
      if (!player.action && player.cost >= config.feintCost && state.ball.mode === 'held' && state.ball.owner === player.id) {
        player.cost -= config.feintCost;
        player.action = { kind: 'feint', startedAt: state.now, endsAt: state.now + config.throwWindup };
        return true;
      }
      break;
    case 'summon':
      if (!player.action && player.cost >= config.summonCost && state.ball.mode === 'loose'
        && (state.ball.position.z > 0 ? 'a' : 'b') === player.side) {
        player.cost -= config.summonCost;
        state.ball = { mode: 'held', owner: player.id };
        events.push({ kind: 'summon', at: state.now, player: player.id });
        return true;
      }
      break;
  }
  return false;
}

/** 接触時の水平入射方向を論理yawの正面160度で評価する。 */
function inDefenseArc(velocity: Vec3, yaw: number, config: SimConfig): boolean {
  const forward = Math.sin(yaw) * velocity.x + Math.cos(yaw) * velocity.z;
  const right = -Math.cos(yaw) * velocity.x + Math.sin(yaw) * velocity.z;
  return Math.hypot(velocity.x, velocity.z) > 0
    && Math.abs(Math.atan2(right, forward)) <= config.defenseArcDegrees / 2 * Math.PI / 180 + 1e-12;
}

function defend(state: SimState, player: PlayerState, config: SimConfig, events: SimEvent[]): boolean {
  const action = player.action;
  const ball = state.ball;
  if (ball.mode !== 'flight' || !ball.attack || !action || (action.kind !== 'catch' && action.kind !== 'parry')
    || state.now < action.startsAt || state.now >= action.endsAt) return false;
  // yawの正面弧は水平の入射方向で評価する。
  if (!inDefenseArc(ball.velocity, player.yaw, config)) return false;
  const offset = state.now - action.startsAt;
  const grade: DefenseGrade = offset < config.defenseJustDuration ? 'just'
    : offset < config.defenseJustDuration + config.defenseGoodDuration ? 'good' : 'so-so';
  if (action.kind === 'catch') {
    state.ball = { mode: 'held', owner: player.id };
    state.rally = { speed: 0, power: 0 };
    player.cost = Math.min(config.maxCost, player.cost + config.catchReward[grade]);
    if (grade === 'just') player.hp = Math.min(player.maxHp, player.hp + player.maxHp * config.catchHealFraction);
    player.action = { kind: 'catch-recovery', endsAt: action.pressedAt + config.catchDuration };
  } else {
    const receiver = lockReceiver(player, state);
    if (!receiver) return false;
    const gain = config.rallyGain[grade];
    state.rally.speed = Math.min(config.rallySpeedCap, state.rally.speed + gain.speed);
    state.rally.power = Math.min(config.rallyPowerCap, state.rally.power + gain.power);
    const elapsed = state.danger?.side === player.side
      ? (config.dangerDuration - (state.danger.expiresAt - state.now)) / config.timeUnitsPerSecond : 0;
    const origin = ballContactPoint(ball.position, player.position, config.ballDiameter / 2, config.capsuleBottom, config.capsuleTop);
    state.ball = launchBall(player, receiver, state.now, elapsed, false, config, origin, state.rally);
    player.cost = Math.min(config.maxCost, player.cost + config.parryReward);
    player.action = { kind: 'recovery', endsAt: state.now + config.parryRecovery };
  }
  events.push({ kind: action.kind, at: state.now, player: player.id, grade });
  return true;
}

/** 同じ時刻のダメージ・KOを解決した後、一度だけラウンドを確定する。 */
function decideRound(state: SimState, config: SimConfig, events: SimEvent[]): boolean {
  if (state.match.phase !== 'play') return false;
  const alive = (side: Side) => state.players.some(p => p.side === side && p.hp > 0);
  const a = alive('a'), b = alive('b');
  const ko = !a || !b;
  if (!ko && state.now < state.match.roundEndsAt) return false;
  let winner: Side | null;
  if (ko) winner = a === b ? null : a ? 'a' : 'b';
  else {
    const totals = (side: Side) => state.players.filter(p => p.side === side)
      .reduce((sum, p) => ({ hp: sum.hp + p.hp, maxHp: sum.maxHp + p.maxHp }), { hp: 0, maxHp: 0 });
    const a = totals('a'), b = totals('b');
    const difference = a.hp * b.maxHp - b.hp * a.maxHp;
    winner = difference === 0 ? null : difference > 0 ? 'a' : 'b';
  }
  events.push({ kind: 'round-end', at: state.now, winner, reason: ko ? 'ko' : 'time' });
  if (winner) state.match.wins[winner]++;
  state.danger = null;
  if (winner && state.match.wins[winner] >= config.roundsToWin) {
    state.match.phase = 'over';
    state.match.nextRoundAt = null;
    events.push({ kind: 'match-end', at: state.now, winner });
    return true;
  } else {
    state.match.phase = 'result';
    state.match.nextRoundAt = state.now + config.roundResultDuration;
  }
  return false;
}

function startNextRound(state: SimState, config: SimConfig, events: SimEvent[]): void {
  const match = state.match;
  match.round = match.wins.a + match.wins.b + 1;
  match.firstBall = opposite(match.firstBall);
  match.phase = 'play';
  match.roundStartsAt = state.now + config.ballStartDelay;
  match.roundEndsAt = match.roundStartsAt + config.roundDuration;
  match.nextRoundAt = null;
  for (const player of state.players) {
    player.yaw = player.side === 'a' ? 0 : Math.PI;
    player.hp = player.maxHp;
    player.cost = config.initialCost;
    player.stepPoints = config.maxStepPoints;
    player.stepRecoveryProgress = 0;
    player.action = null;
  }
  placePlayers(state.players, config);
  for (const p of state.players) p.lockTarget = initialTarget(p, state.players);
  state.ball = createLooseBall(config.supply[match.firstBall], state.now, match.roundStartsAt, config);
  state.danger = null;
  state.rally = { speed: 0, power: 0 };
  events.push({ kind: 'spawn', at: state.now, side: match.firstBall });
}

export function step(input: SimState, commands: readonly Command[], config: SimConfig = defaultConfig): { state: SimState; events: SimEvent[] } {
  const state = structuredClone(input);
  const events: SimEvent[] = [];
  if (state.match.phase === 'over') return { state, events };
  refreshTargets(state);
  const end = input.now + config.tick;
  // 入力受付は[開始, 終了)。境界上の入力は次のtickへ渡す。
  const ordered = commands.filter(c => c.at >= input.now && c.at < end).sort((a, b) => a.at - b.at || a.player.localeCompare(b.player) || a.seq - b.seq);
  let index = 0;
  for (;;) {
    if (state.match.phase === 'result') {
      const at = Math.min(end, state.match.nextRoundAt!, ordered[index]?.at ?? Infinity);
      state.now = at; // 結果表示では球・行動・回復も進めない。
      if (at === state.match.nextRoundAt) startNextRound(state, config, events);
      while (ordered[index]?.at === at) applyCommand(state, ordered[index++], config, events);
      if (at === end) break;
      continue;
    }
    const crossing = centerCrossingAt(state.ball, config);
    const guidance = guidanceAt(state.ball, config);
    const hit = hitAt(state, config);
    const loss = attackLossAt(state.ball, state.now, config);
    const physicsAt = state.ball.mode === 'loose' ? state.ball.nextPhysicsAt : Infinity;
    const appearsAt = state.ball.mode === 'absent' ? state.ball.appearsAt : Infinity;
    const startsAt = state.ball.mode === 'loose' && !state.danger ? state.ball.startsAt : Infinity;
    const actionAt = Math.min(...state.players.map(p => (p.action?.kind === 'step' || p.action?.kind === 'hitstun') && p.action.moveEndsAt > state.now
      ? p.action.moveEndsAt : p.action?.endsAt ?? Infinity));
    const at = Math.min(end, state.danger?.expiresAt ?? Infinity, ordered[index]?.at ?? Infinity,
      !state.players.some(p => p.side === 'a' && p.hp > 0) || !state.players.some(p => p.side === 'b' && p.hp > 0) ? state.now : state.match.roundEndsAt,
      appearsAt, startsAt, actionAt, crossing, guidance, hit, loss, physicsAt, movementBoundaryAt(state, config));
    advancePositions(state, at, config);

    // 同時刻の中央通過より爆発を先に確定する。
    if (state.danger && state.danger.expiresAt === at) {
      let side = state.danger.side;
      if (state.ball.mode === 'flight' || state.ball.mode === 'loose') {
        const z = state.ball.position.z;
        if (z !== 0 && crossing !== at) side = z > 0 ? 'a' : 'b';
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
      state.rally = { speed: 0, power: 0 };
      events.push({ kind: 'explosion', at, side });
    }

    if (state.ball.mode === 'absent' && state.ball.appearsAt === at) {
      const side = state.ball.side;
      state.ball = createLooseBall(config.supply[side], at, at + config.ballStartDelay, config);
      events.push({ kind: 'spawn', at, side });
    }
    if (state.ball.mode === 'loose' && !state.danger && state.ball.startsAt === at) {
      const side = state.ball.position.z > 0 ? 'a' : 'b';
      state.danger = { side, expiresAt: at + config.dangerDuration };
      if (at === state.match.roundStartsAt) events.push({ kind: 'round-start', at, round: state.match.round, side });
      events.push({ kind: 'clock-start', at, side });
    }

    // 硬直の終了時刻から次の行動を受け付ける。投擲発生は同時刻の向き入力を待つ。
    for (const player of state.players) {
      const action = player.action;
      if (!action || action.endsAt !== at || action.kind === 'windup') continue;
      if (action.kind === 'catch' || action.kind === 'parry') {
        player.action = { kind: action.kind === 'catch' ? 'catch-whiff' : 'parry-whiff',
          endsAt: action.pressedAt + (action.kind === 'catch' ? config.catchWhiffDuration : config.parryWhiffDuration) };
        events.push({ kind: 'whiff', at, player: player.id });
      } else if (at !== end || action.kind === 'feint') player.action = null;
    }
    const simultaneous: Command[] = [];
    while (ordered[index]?.at === at) simultaneous.push(ordered[index++]);
    for (const command of simultaneous.filter(c => c.kind === 'move' || c.kind === 'yaw' || c.kind === 'keys')) applyCommand(state, command, config, events);
    // 行動の優先順位は入力のseqに依存させない。
    for (const player of state.players) {
      let succeeded = false;
      for (const kind of ['step', 'secondary', 'primary', 'feint', 'summon'] as const) {
        for (const command of simultaneous.filter(c => c.player === player.id && c.kind === kind)) {
          if (!succeeded) succeeded = applyCommand(state, command, config, events);
        }
      }
    }
    for (const player of state.players) {
      // 行動境界は同時刻の入力が必要なので、終了境界なら次のtickで解決する。
      if (at === end || player.action?.endsAt !== at) continue;
      if (player.action.kind === 'windup' && state.ball.mode === 'held' && state.ball.owner === player.id) {
        const receiver = lockReceiver(player, state);
        if (!receiver) { player.action = null; continue; }
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
    const contactingBall = state.ball;
    // 終了境界の接触は次tickへ渡し、同時刻の向き・移動入力を先に反映する。
    if (at !== end && state.ball.mode === 'flight' && state.ball.attack && hit === at) {
      const ball = state.ball;
      const receiver = state.players.find(p => p.id === ball.attack!.target)!;
      const defense = defend(state, receiver, config, events);
      if (!defense) {
        const damage = ball.attack!.damage;
        receiver.hp = Math.max(0, receiver.hp - damage);
        const horizontal = Math.hypot(ball.velocity.x, ball.velocity.z);
        const direction = horizontal <= config.hitDirectionEpsilon ? { x: 0, y: 0, z: receiver.side === 'a' ? 1 : -1 }
          : { x: ball.velocity.x / horizontal, y: 0, z: ball.velocity.z / horizontal };
        const ko = receiver.hp === 0;
        const speed = config.hitKnockbackDistance / config.hitKnockbackMoveDuration * config.timeUnitsPerSecond;
        receiver.action = ko ? null : { kind: 'hitstun', startedAt: at, moveEndsAt: at + config.hitKnockbackMoveDuration,
          endsAt: at + config.hitstunDuration, velocity: { x: direction.x * speed, z: direction.z * speed } };
        events.push({ kind: 'hit', at, player: receiver.id, damage,
          position: ballContactPoint(ball.position, receiver.position, config.ballDiameter / 2, config.capsuleBottom, config.capsuleTop), direction, ko });
        state.ball = dropBall(ball, at, config, 'hit');
        state.rally = { speed: 0, power: 0 };
      }
    }
    if (!(at === end && hit === at) && state.ball === contactingBall && state.ball.mode === 'flight' && loss === at) {
      state.ball = dropBall(state.ball, at, config, 'loss');
      state.rally = { speed: 0, power: 0 };
    }
    if (!(at === end && hit === at) && state.ball === contactingBall && state.ball.mode === 'flight' && state.ball.attack?.homing && guidance === at) {
      const ball = state.ball;
      ball.attack!.guidanceIndex++;
      updateGuidance(ball, state.players.find(p => p.id === ball.attack!.target)!, at, config);
    }
    // 終了境界は次tickの入力を待つ。この時刻に生まれたlooseの予定は必ず次の境界。
    if (at !== end && state.ball.mode === 'loose' && state.ball.nextPhysicsAt === at) {
      state.ball = updateLooseBall(state.ball, config);
      const player = pickupPlayer(state, config);
      if (player) {
        state.ball = { mode: 'held', owner: player.id };
        events.push({ kind: 'pickup', at, player: player.id });
      }
    }
    // tick終了の接触・物理更新は同時刻入力を待つので、勝敗もその後で決める。
    const pendingBoundary = at === end && ((hit === at && state.ball === contactingBall && state.ball.mode === 'flight' && state.ball.attack)
      || (state.ball.mode === 'loose' && state.ball.nextPhysicsAt === at));
    refreshTargets(state);
    if (!pendingBoundary) {
      if (decideRound(state, config, events)) break;
    }
    if (at === end) break;
  }
  return { state, events };
}
