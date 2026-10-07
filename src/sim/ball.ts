import { defaultConfig, type SimConfig } from './config';
import { sweptCapsuleContact } from './contact';
import type { BallState, PlayerState, Rally, Shot, Side, Vec3 } from './types';

type Flight = Extract<BallState, { mode: 'flight' }>;
type Loose = Extract<BallState, { mode: 'loose' }>;
const still = { x: 0, y: 0, z: 0 };
export function opposite(side: Side): Side { return side === 'a' ? 'b' : 'a'; }

export function flightPosition(ball: Flight, at: number, config: SimConfig): Vec3 {
  const seconds = (at - ball.segmentAt) / config.timeUnitsPerSecond;
  return { x: ball.segmentOrigin.x + ball.velocity.x * seconds, y: ball.segmentOrigin.y + ball.velocity.y * seconds,
    z: ball.segmentOrigin.z + ball.velocity.z * seconds };
}

export function centerCrossingAt(ball: BallState, config: SimConfig): number {
  if (ball.mode !== 'flight') return Infinity;
  const towardCenter = ball.side === 'a' ? ball.velocity.z < 0 : ball.velocity.z > 0;
  if (!towardCenter) return Infinity;
  // 線分の開始を基準にし、幾何時刻を一度だけ切り上げる。
  return Math.ceil(ball.segmentAt - ball.segmentOrigin.z / ball.velocity.z * config.timeUnitsPerSecond);
}

export function selectShot(player: PlayerState): Shot {
  // 移動方向ではなく押しているキーで決める。S ＞ A/D ＞ W（AとD、WとSは相殺済み）。
  const { forward, right } = player.keys;
  if (forward < 0) return 'upper';
  if (right < 0) return 'left';
  if (right > 0) return 'right';
  return 'straight';
}

export function curveOffset(shot: Shot, length: number, traveled: number, side: Side, config: SimConfig = defaultConfig): Vec3 {
  const u = length > 0 ? Math.max(0, Math.min(1, traveled / (config.curveEndFraction * length))) : 1;
  const f = 1 - 3 * u * u + 2 * u * u * u;
  const horizontal = shot === 'left' ? -1 : shot === 'right' ? 1 : 0;
  return { x: horizontal * (side === 'a' ? 1 : -1) * config.horizontalCurveFraction * length * f || 0,
    y: shot === 'upper' ? config.upperCurveFraction * length * f : 0, z: 0 };
}

function guide(position: Vec3, feet: Vec3, shot: Shot, length: number, traveled: number, side: Side, pure: boolean, config: SimConfig): { direction: Vec3; pure: boolean } {
  const offset = curveOffset(shot, length, pure ? length : traveled, side, config);
  const point = { x: Math.max(-config.guidanceHalfWidth, Math.min(config.guidanceHalfWidth, feet.x + offset.x)),
    y: feet.y + config.defenseHeight + offset.y,
    z: Math.max(-config.guidanceHalfDepth, Math.min(config.guidanceHalfDepth, feet.z)) };
  const distance = Math.hypot(point.x - position.x, point.y - position.y, point.z - position.z);
  if (!pure && distance <= config.guidanceDistance) return guide(position, feet, shot, length, traveled, side, true, config);
  return { direction: distance === 0 ? { ...still } : { x: (point.x - position.x) / distance,
    y: (point.y - position.y) / distance, z: (point.z - position.z) / distance }, pure: pure || traveled >= config.curveEndFraction * length };
}

export function rawLaunchSpeed(shot: Shot, attack: number, elapsedSeconds: number, config: SimConfig, rallySpeed = 0): number {
  const base = config.shotSpeed[shot];
  const danger = elapsedSeconds / (config.dangerDuration / config.timeUnitsPerSecond);
  return Math.min(base * (1 + config.attackSpeedCoefficient * (attack - config.defaultStat))
    * (1 + config.dangerSpeedCoefficient * danger ** 2) * (1 + rallySpeed), config.speedCapMultiplier * base);
}

export function launchDamage(elapsedSeconds: number, config: SimConfig, rallyPower = 0): number {
  const danger = elapsedSeconds / (config.dangerDuration / config.timeUnitsPerSecond);
  return config.hitDamage * Math.min((1 + config.dangerPowerCoefficient * danger ** 2) * (1 + rallyPower), config.powerCapMultiplier);
}

/** 静止受け手までの軌道長。実飛行と同じ誘導・接触・整数時刻を使う。 */
function stationaryPathLength(origin: Vec3, feet: Vec3, shot: Shot, side: Side, speed: number, config: SimConfig): number {
  const length = Math.hypot(feet.x - origin.x, feet.y + config.defenseHeight - origin.y, feet.z - origin.z);
  let position = { ...origin }, traveled = 0, at = 0, pure = false;
  for (let index = 1; ; index++) {
    const guidance = guide(position, feet, shot, length, traveled, side, pure, config);
    pure = guidance.pure;
    const v = { x: guidance.direction.x * speed, y: guidance.direction.y * speed, z: guidance.direction.z * speed };
    const nextAt = Math.ceil(index * config.guidanceDistance / speed * config.timeUnitsPerSecond);
    const distance = (nextAt - at) / config.timeUnitsPerSecond * speed;
    const contact = sweptCapsuleContact(position, v, feet, still, config.ballDiameter / 2 + config.capsuleRadius, config.capsuleBottom, config.capsuleTop);
    if (contact * speed <= distance) return traveled + contact * speed;
    position = { x: position.x + v.x * distance / speed, y: position.y + v.y * distance / speed, z: position.z + v.z * distance / speed };
    traveled += distance; at = nextAt;
  }
}

export function launchBall(player: PlayerState, receiver: PlayerState, at: number, elapsedSeconds: number, aim: boolean, config: SimConfig,
  origin: Vec3 = { ...player.position, y: player.position.y + config.defenseHeight }, rally: Rally = { speed: 0, power: 0 }): Flight {
  const shot = aim ? 'straight' : selectShot(player);
  const raw = rawLaunchSpeed(shot, player.stats.attack, elapsedSeconds, config, rally.speed);
  let speed = Math.max(config.minimumBallSpeed, raw);
  if (!aim) {
    // 丸めが速度へ与える微小な差も、同じ誘導で再評価する。
    for (let i = 0; i < 3; i++) {
      const path = stationaryPathLength(origin, receiver.position, shot, player.side, speed, config);
      speed = Math.max(config.minimumBallSpeed, Math.min(raw, path / config.minimumFlightSeconds[shot]));
    }
  }
  const ball: Flight = { mode: 'flight', position: { ...origin }, origin, releasedAt: at, side: player.side,
    segmentOrigin: { ...origin }, segmentAt: at,
    velocity: { x: -Math.sin(player.yaw) * speed, y: 0, z: -Math.cos(player.yaw) * speed },
    attack: { target: receiver.id, shot, damage: launchDamage(elapsedSeconds, config, rally.power), speed,
      homing: !aim, pure: false, launchDistance: Math.hypot(receiver.position.x - origin.x,
        receiver.position.y + config.defenseHeight - origin.y, receiver.position.z - origin.z), throwerSide: player.side, guidanceIndex: 1 } };
  if (!aim) updateGuidance(ball, receiver, at, config);
  return ball;
}

export function guidanceAt(ball: BallState, config: SimConfig): number {
  if (ball.mode !== 'flight' || !ball.attack?.homing) return Infinity;
  return Math.ceil(ball.releasedAt + ball.attack.guidanceIndex * config.guidanceDistance / ball.attack.speed * config.timeUnitsPerSecond);
}

export function updateGuidance(ball: Flight, receiver: PlayerState, at: number, config: SimConfig) {
  const attack = ball.attack!;
  const traveled = (at - ball.releasedAt) / config.timeUnitsPerSecond * attack.speed;
  const guidance = guide(ball.position, receiver.position, attack.shot, attack.launchDistance, traveled, attack.throwerSide, attack.pure, config);
  attack.pure = guidance.pure;
  ball.velocity = { x: guidance.direction.x * attack.speed, y: guidance.direction.y * attack.speed, z: guidance.direction.z * attack.speed };
  ball.segmentOrigin = { ...ball.position }; ball.segmentAt = at;
}

export function attackLossAt(ball: BallState, now: number, config: SimConfig): number {
  if (ball.mode !== 'flight' || ball.attack?.homing) return Infinity;
  let next = Infinity;
  for (const [origin, velocity, min, max] of [[ball.segmentOrigin.x, ball.velocity.x, -config.ballHalfWidth, config.ballHalfWidth],
    [ball.segmentOrigin.z, ball.velocity.z, -config.ballHalfDepth, config.ballHalfDepth],
    [ball.segmentOrigin.y, ball.velocity.y, config.ballDiameter / 2, Infinity]]) {
    const position = origin + velocity * (now - ball.segmentAt) / config.timeUnitsPerSecond;
    if (position <= min || position >= max) return now;
    if (velocity !== 0) next = Math.min(next, Math.ceil(ball.segmentAt + ((velocity > 0 ? max : min) - origin) / velocity * config.timeUnitsPerSecond));
  }
  return next;
}

export function createLooseBall(position: Vec3, at: number, startsAt: number, config: SimConfig): Loose {
  return { mode: 'loose', position: { ...position }, velocity: { ...still }, startsAt, motionAt: at,
    nextPhysicsAt: (Math.floor(at / config.frame) + 1) * config.frame };
}

function floorBoundary(ball: Loose, config: SimConfig): void {
  const radius = config.ballDiameter / 2;
  if (ball.position.y <= radius && ball.velocity.y < 0) {
    ball.position.y = radius;
    ball.velocity.y *= -config.looseFloorRestitution;
    if (ball.velocity.y <= config.looseGroundSpeedThreshold) ball.velocity.y = 0;
  }
}

function horizontalBoundary(ball: Loose, side: Side, config: SimConfig): void {
  const radius = config.ballDiameter / 2;
  // 角ではx、zの順。内向き成分は保ち、余った移動距離は折り返さない。
  for (const [axis, min, max] of [['x', -config.ballHalfWidth, config.ballHalfWidth],
    ['z', side === 'a' ? radius : -config.ballHalfDepth, side === 'a' ? config.ballHalfDepth : -radius]] as const) {
    const position = ball.position[axis], velocity = ball.velocity[axis];
    if ((position <= min && velocity < 0) || (position >= max && velocity > 0)) ball.velocity[axis] *= -config.looseBoundaryRestitution;
    ball.position[axis] = Math.max(min, Math.min(max, position));
  }
}

export function dropBall(ball: Flight, at: number, config: SimConfig, reason: 'hit' | 'loss'): Loose {
  const loose = createLooseBall({ ...ball.position, y: Math.max(config.ballDiameter / 2, ball.position.y) }, at, at, config);
  const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const horizontal = Math.min(speed * config.looseSpeedFraction, config.looseSpeedCap) * (reason === 'hit' ? -1 : 1);
  loose.velocity = { x: speed === 0 ? 0 : ball.velocity.x / speed * horizontal,
    y: reason === 'hit' ? config.looseHitUpSpeed : Math.max(-config.looseLossVerticalSpeedCap,
      Math.min(config.looseLossVerticalSpeedCap, ball.velocity.y * config.looseSpeedFraction)),
    z: speed === 0 ? 0 : ball.velocity.z / speed * horizontal };
  floorBoundary(loose, config);
  horizontalBoundary(loose, ball.side, config);
  return loose;
}

/** 絶対60Hz境界でだけ更新する。入力による区間分割では積分しない（0009）。 */
export function updateLooseBall(input: Loose, config: SimConfig): Loose {
  const ball = structuredClone(input);
  const dt = (ball.nextPhysicsAt - ball.motionAt) / config.timeUnitsPerSecond;
  const side = ball.position.z > 0 ? 'a' : 'b';
  const grounded = ball.position.y === config.ballDiameter / 2 && ball.velocity.y === 0;
  ball.position.x += ball.velocity.x * dt;
  ball.position.z += ball.velocity.z * dt;
  if (!grounded) {
    ball.position.y += ball.velocity.y * dt - 0.5 * config.looseGravity * dt ** 2;
    ball.velocity.y -= config.looseGravity * dt;
    floorBoundary(ball, config);
  } else {
    const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
    const reduced = Math.max(0, speed - config.looseRollDeceleration * dt);
    if (reduced <= config.looseStopSpeed) { ball.velocity.x = 0; ball.velocity.z = 0; }
    else {
      ball.velocity.x *= reduced / speed;
      ball.velocity.z *= reduced / speed;
    }
  }
  horizontalBoundary(ball, side, config);
  ball.motionAt = ball.nextPhysicsAt;
  ball.nextPhysicsAt += config.frame;
  return ball;
}
