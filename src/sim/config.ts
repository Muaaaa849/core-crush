import type { DefenseGrade, Shot, Side, Vec3 } from './types';

export interface SimConfig {
  timeUnitsPerSecond: number;
  frame: number;
  tick: number;
  dangerDuration: number;
  explosionDamage: number;
  newBallAppearDelay: number;
  ballStartDelay: number;
  roundDuration: number;
  roundResultDuration: number;
  roundsToWin: number;
  throwWindup: number;
  throwRecovery: number;
  windupWalkMultiplier: number;
  walkSpeed: number;
  /** キャラ中心の移動範囲（ケージの金網の内側。rules.md「プレイエリア」）。奥行は中央平面からの距離 */
  playerHalfWidth: number;
  playerMinDepth: number;
  playerMaxDepth: number;
  supply: Record<Side, Vec3>;
  teamSlotOffset: number;
  singletonHpMultiplier: number;
  throwArcDegrees: number;
  pickupRadius: number;
  pickupHeight: number;
  hitDirectionEpsilon: number;
  hitKnockbackDistance: number;
  hitKnockbackMoveDuration: number;
  hitstunDuration: number;
  looseSpeedFraction: number;
  looseSpeedCap: number;
  looseHitUpSpeed: number;
  looseLossVerticalSpeedCap: number;
  looseGravity: number;
  looseFloorRestitution: number;
  looseGroundSpeedThreshold: number;
  looseRollDeceleration: number;
  looseStopSpeed: number;
  looseBoundaryRestitution: number;
  ballDiameter: number;
  shotSpeed: Record<Shot, number>;
  minimumFlightSeconds: Record<Shot, number>;
  minimumBallSpeed: number;
  speedCapMultiplier: number;
  attackSpeedCoefficient: number;
  dangerSpeedCoefficient: number;
  dangerPowerCoefficient: number;
  hitDamage: number;
  powerCapMultiplier: number;
  defenseHeight: number;
  aimEyeHeight: number;
  aimMaxDistance: number;
  capsuleRadius: number;
  capsuleBottom: number;
  capsuleTop: number;
  /** 球が止まる・落ちる範囲（白線の内側、球の中心） */
  ballHalfWidth: number;
  ballHalfDepth: number;
  /** 追尾中の誘導点の範囲（金網の内側、球の中心）。白線の外にいる相手も追える */
  guidanceHalfWidth: number;
  guidanceHalfDepth: number;
  guidanceDistance: number;
  curveEndFraction: number;
  horizontalCurveFraction: number;
  upperCurveFraction: number;
  baseHp: number;
  defaultStat: number;
  agilityWalkCoefficient: number;
  defenseHpCoefficient: number;
  stepRecoveryBaseSeconds: number;
  maxCost: number;
  initialCost: number;
  summonCost: number;
  overchargeCost: number;
  overchargeCooldown: number;
  overchargeDuration: number;
  overchargeSpeedMultiplier: number;
  overchargePowerMultiplier: number;
  blinkCost: number;
  blinkCooldown: number;
  blinkDistance: number;
  chargeGoodReward: number;
  economySummonCost: number;
  maxStepPoints: number;
  stepDistance: number;
  stepMoveDuration: number;
  stepActionDuration: number;
  defenseStartup: number;
  defenseWindowFrames: number[];
  defenseJustDuration: number;
  defenseGoodDuration: number;
  defenseArcDegrees: number;
  feintCost: number;
  catchDuration: number;
  catchWhiffDuration: number;
  parryWhiffDuration: number;
  parryRecovery: number;
  catchReward: Record<DefenseGrade, number>;
  catchHealFraction: number;
  parryReward: number;
  rallyGain: Record<DefenseGrade, { speed: number; power: number }>;
  rallySpeedCap: number;
  rallyPowerCap: number;
}

const SECOND = 60_000;
const FRAME = 1_000;
const BALL_DIAMETER = 0.65; // 決定0006
export const aimPitchLimit = 1.2;
export const defaultConfig: SimConfig = {
  timeUnitsPerSecond: SECOND,
  frame: FRAME,
  tick: FRAME,
  dangerDuration: 8 * SECOND,
  explosionDamage: 30,
  newBallAppearDelay: SECOND,
  ballStartDelay: SECOND,
  roundDuration: 180 * SECOND,
  roundResultDuration: 3 * SECOND,
  roundsToWin: 2,
  throwWindup: 8 * FRAME,
  throwRecovery: 8 * FRAME,
  windupWalkMultiplier: 0.3,
  walkSpeed: 5,
  playerHalfWidth: 10.1,
  playerMinDepth: 0.5,
  playerMaxDepth: 17.6,
  supply: { a: { x: 0, y: BALL_DIAMETER / 2, z: 7.8 }, b: { x: 0, y: BALL_DIAMETER / 2, z: -7.8 } },
  teamSlotOffset: 2.6,
  singletonHpMultiplier: 1.6,
  throwArcDegrees: 160,
  pickupRadius: 1.2,
  pickupHeight: 0.8,
  // 被弾と未所持球の運動（決定0009）。能力値の倍率は掛けない。
  hitDirectionEpsilon: 0.000001,
  hitKnockbackDistance: 1.4,
  hitKnockbackMoveDuration: 12 * FRAME,
  hitstunDuration: 24 * FRAME,
  looseSpeedFraction: 0.20,
  looseSpeedCap: 5.0,
  looseHitUpSpeed: 3.0,
  looseLossVerticalSpeedCap: 3.0,
  looseGravity: 9.8,
  looseFloorRestitution: 0.50,
  looseGroundSpeedThreshold: 0.50,
  looseRollDeceleration: 3.0,
  looseStopSpeed: 0.10,
  looseBoundaryRestitution: 0.50,
  ballDiameter: BALL_DIAMETER,
  shotSpeed: { straight: 36.4, left: 29.9, right: 29.9, upper: 22.1 }, // 拡大したコートに合わせ1.3倍（0006）
  minimumFlightSeconds: { straight: 0.240, left: 0.270, right: 0.270, upper: 0.320 },
  minimumBallSpeed: 6.5,
  speedCapMultiplier: 1.6,
  attackSpeedCoefficient: 0.03,
  dangerSpeedCoefficient: 0.25,
  dangerPowerCoefficient: 0.60,
  hitDamage: 20,
  powerCapMultiplier: 2.5,
  defenseHeight: 1.2,
  aimEyeHeight: 1.60,
  aimMaxDistance: 60,
  capsuleRadius: 0.30,
  capsuleBottom: 0.30,
  capsuleTop: 1.50,
  // 白線（片側13m×15.6m）の内側から半径分（rules.md「球の範囲」）。小物の陰で止まらないようにする。
  ballHalfWidth: 6.175,
  ballHalfDepth: 15.275,
  // 追尾はキャラの移動範囲（金網の内側）まで追う。白線の外へ逃げて追尾を切れないようにする（R03）。
  guidanceHalfWidth: 10.175,
  guidanceHalfDepth: 17.675,
  guidanceDistance: 0.05,
  curveEndFraction: 0.65,
  horizontalCurveFraction: 0.60,
  upperCurveFraction: 0.90,
  baseHp: 100,
  defaultStat: 5,
  agilityWalkCoefficient: 0.03,
  defenseHpCoefficient: 6,
  stepRecoveryBaseSeconds: 20,
  maxCost: 20,
  initialCost: 4,
  summonCost: 4,
  overchargeCost: 6,
  overchargeCooldown: 8 * SECOND,
  overchargeDuration: 8 * SECOND,
  overchargeSpeedMultiplier: 1.10,
  overchargePowerMultiplier: 1.25,
  blinkCost: 6,
  blinkCooldown: 9 * SECOND,
  blinkDistance: 4,
  chargeGoodReward: 3,
  economySummonCost: 3,
  maxStepPoints: 2,
  stepDistance: 2.8,
  stepMoveDuration: 12 * FRAME,
  stepActionDuration: 18 * FRAME,
  defenseStartup: 3 * FRAME, // 押してから受付開始まで。1Fでは早めに押す必要があったため2F遅らせた（rules.md M1細則）
  defenseWindowFrames: [7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  defenseJustDuration: 2 * FRAME,
  defenseGoodDuration: 3 * FRAME,
  defenseArcDegrees: 160,
  feintCost: 1,
  catchDuration: 24 * FRAME,
  catchWhiffDuration: 54 * FRAME,
  parryWhiffDuration: 30 * FRAME,
  parryRecovery: 6 * FRAME,
  catchReward: { 'so-so': 1, good: 2, just: 4 },
  catchHealFraction: 0.03,
  parryReward: 1,
  rallyGain: { 'so-so': { speed: 0.03, power: 0.05 }, good: { speed: 0.05, power: 0.08 }, just: { speed: 0.07, power: 0.12 } },
  rallySpeedCap: 0.4,
  rallyPowerCap: 0.8,
};
