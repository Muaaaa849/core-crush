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
  courtSideLength: number;
  courtWidth: number;
  supply: Record<Side, Vec3>;
  pickupRadius: number;
  aimedThrowSpeed: number;
  ballDiameter: number;
  initialHp: number;
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
  courtSideLength: 12,
  courtWidth: 10,
  supply: { p1: { x: 0, y: BALL_DIAMETER / 2, z: 6 }, p2: { x: 0, y: BALL_DIAMETER / 2, z: -6 } },
  pickupRadius: 1.2,
  aimedThrowSpeed: 28,
  ballDiameter: BALL_DIAMETER,
  initialHp: 100,
};
