import type { Shot, Side, Vec3 } from './types';

export interface SimConfig {
  timeUnitsPerSecond: number;
  frame: number;
  tick: number;
  dangerDuration: number;
  explosionDamage: number;
  newBallAppearDelay: number;
  ballStartDelay: number;
  throwWindup: number;
  throwRecovery: number;
  windupWalkMultiplier: number;
  walkSpeed: number;
  /** キャラ中心の移動範囲（ケージの金網の内側。rules.md「プレイエリア」）。奥行は中央平面からの距離 */
  playerHalfWidth: number;
  playerMinDepth: number;
  playerMaxDepth: number;
  supply: Record<Side, Vec3>;
  pickupRadius: number;
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
  maxStepPoints: number;
  stepDistance: number;
  stepMoveDuration: number;
  stepActionDuration: number;
}

const SECOND = 60_000;
const FRAME = 1_000;
const BALL_DIAMETER = 0.5;
export const defaultConfig: SimConfig = {
  timeUnitsPerSecond: SECOND,
  frame: FRAME,
  tick: FRAME,
  dangerDuration: 8 * SECOND,
  explosionDamage: 30,
  newBallAppearDelay: SECOND,
  ballStartDelay: SECOND,
  throwWindup: 8 * FRAME,
  throwRecovery: 8 * FRAME,
  windupWalkMultiplier: 0.3,
  walkSpeed: 5,
  playerHalfWidth: 7.1,
  playerMinDepth: 0.5,
  playerMaxDepth: 13.1,
  supply: { p1: { x: 0, y: BALL_DIAMETER / 2, z: 6 }, p2: { x: 0, y: BALL_DIAMETER / 2, z: -6 } },
  pickupRadius: 1.2,
  ballDiameter: BALL_DIAMETER,
  shotSpeed: { straight: 28, left: 23, right: 23, upper: 17 },
  minimumFlightSeconds: { straight: 0.240, left: 0.270, right: 0.270, upper: 0.320 },
  minimumBallSpeed: 6.5,
  speedCapMultiplier: 1.6,
  attackSpeedCoefficient: 0.03,
  dangerSpeedCoefficient: 0.25,
  dangerPowerCoefficient: 0.60,
  hitDamage: 20,
  powerCapMultiplier: 2.5,
  defenseHeight: 1.2,
  capsuleRadius: 0.30,
  capsuleBottom: 0.30,
  capsuleTop: 1.50,
  // 白線（片側10m×12m）の内側から半径分（rules.md「球の範囲」）。小物の陰で止まらないようにする。
  ballHalfWidth: 4.75,
  ballHalfDepth: 11.75,
  // 追尾はキャラの移動範囲（金網の内側）まで追う。白線の外へ逃げて追尾を切れないようにする（R03）。
  guidanceHalfWidth: 7.25,
  guidanceHalfDepth: 13.25,
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
  maxStepPoints: 2,
  stepDistance: 2.8,
  stepMoveDuration: 12 * FRAME,
  stepActionDuration: 18 * FRAME,
};
