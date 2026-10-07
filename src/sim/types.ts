export type Side = 'p1' | 'p2';
export type PlayerId = Side;
export interface Vec3 { x: number; y: number; z: number }

export interface PlayerState {
  id: PlayerId;
  side: Side;
  hp: number;
  position: Vec3;
  yaw: number;
  move: { x: number; z: number };
  action: { kind: 'windup' | 'recovery'; endsAt: number } | null;
}

export type BallState =
  | { mode: 'absent'; side: Side; appearsAt: number }
  | { mode: 'loose'; position: Vec3; startsAt: number }
  | { mode: 'held'; owner: PlayerId }
  | { mode: 'flight'; position: Vec3; origin: Vec3; releasedAt: number; velocity: Vec3; side: Side };

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
  | { kind: 'primary' }
);

export type SimEvent =
  | { kind: 'explosion' | 'spawn' | 'clock-start' | 'crossing'; at: number; side: Side }
  | { kind: 'pickup' | 'release'; at: number; player: PlayerId };
