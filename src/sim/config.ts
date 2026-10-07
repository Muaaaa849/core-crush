import type { Side, Vec3 } from './types';

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
  aimedThrowSpeed: number;
  ballDiameter: number;
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
  aimedThrowSpeed: 28,
  ballDiameter: BALL_DIAMETER,
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
