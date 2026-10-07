export type Side = 'p1' | 'p2';
export type PlayerId = Side;
export interface Vec3 { x: number; y: number; z: number }
export interface Stats { attack: number; defense: number; agility: number }
export type StepDirection = 'forward' | 'back' | 'left' | 'right';
export type Shot = 'straight' | 'left' | 'right' | 'upper';
export interface BallAttack {
  target: PlayerId;
  shot: Shot;
  damage: number;
  speed: number;
  homing: boolean;
  pure: boolean;
  launchDistance: number;
  throwerSide: Side;
  guidanceIndex: number;
}

export interface PlayerState {
  id: PlayerId;
  side: Side;
  hp: number;
  maxHp: number;
  stats: Stats;
  cost: number;
  stepPoints: number;
  stepRecoveryProgress: number;
  position: Vec3;
  yaw: number;
  move: { x: number; z: number };
  action: { kind: 'windup' | 'recovery'; endsAt: number; aim?: boolean }
    | { kind: 'step'; endsAt: number; moveEndsAt: number; velocity: { x: number; z: number } } | null;
}

export type BallState =
  | { mode: 'absent'; side: Side; appearsAt: number }
  | { mode: 'loose'; position: Vec3; startsAt: number }
  | { mode: 'held'; owner: PlayerId }
  | { mode: 'flight'; position: Vec3; origin: Vec3; releasedAt: number; velocity: Vec3; side: Side;
      segmentOrigin: Vec3; segmentAt: number; attack: BallAttack | null };

export interface SimState {
  now: number;
  players: PlayerState[];
  ball: BallState;
  danger: { side: Side; expiresAt: number } | null;
}

type InputTime = { at: number; seq: number; player: PlayerId };
export type Command = InputTime & (
  | { kind: 'move'; x: number; z: number }
  | { kind: 'yaw'; yaw: number }
  | { kind: 'primary'; aim?: boolean }
  | { kind: 'step' | 'summon' }
);

export type SimEvent =
  | { kind: 'explosion' | 'spawn' | 'clock-start' | 'crossing'; at: number; side: Side }
  | { kind: 'pickup' | 'release' | 'summon'; at: number; player: PlayerId }
  | { kind: 'step'; at: number; player: PlayerId; direction: StepDirection }
  | { kind: 'hit'; at: number; player: PlayerId; damage: number; position: Vec3 };
