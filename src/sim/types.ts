export type Side = 'a' | 'b';
export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4';
export type MatchMode = '1v1' | '1v2' | '2v2';
export interface Vec3 { x: number; y: number; z: number }
export interface Stats { attack: number; defense: number; agility: number }
export interface Participant { id: PlayerId; side: Side; stats: Stats }
export interface MatchOptions { participants: readonly Participant[]; firstBall: Side }
export type StepDirection = 'forward' | 'back' | 'left' | 'right';
export type Shot = 'straight' | 'left' | 'right' | 'upper';
export type DefenseGrade = 'just' | 'good' | 'so-so';
export interface Rally { speed: number; power: number }
export interface BallAttack {
  target: PlayerId | null;
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
  lockTarget: PlayerId | null;
  move: { x: number; z: number };
  /** 押している移動キーの意図（カメラ基準、前=W・右=D）。球種の選択に使う（feel.md「入力設定」） */
  keys: { forward: number; right: number };
  action: { kind: 'windup' | 'recovery'; endsAt: number; aim?: boolean }
    | { kind: 'catch' | 'parry'; pressedAt: number; startsAt: number; endsAt: number }
    | { kind: 'catch-recovery' | 'catch-whiff' | 'parry-whiff'; endsAt: number }
    | { kind: 'feint'; startedAt: number; endsAt: number }
    | { kind: 'hitstun'; startedAt: number; moveEndsAt: number; endsAt: number; velocity: { x: number; z: number } }
    | { kind: 'step'; endsAt: number; moveEndsAt: number; velocity: { x: number; z: number } } | null;
}

export type BallState =
  | { mode: 'absent'; side: Side; appearsAt: number }
  | { mode: 'loose'; position: Vec3; startsAt: number; velocity: Vec3; motionAt: number; nextPhysicsAt: number }
  | { mode: 'held'; owner: PlayerId }
  | { mode: 'flight'; position: Vec3; origin: Vec3; releasedAt: number; velocity: Vec3; side: Side;
      segmentOrigin: Vec3; segmentAt: number; attack: BallAttack | null;
      /** 切り上げ済みの終了境界接触。接線接触も保存復元後の同時刻入力を待つ。 */
      pendingContacts?: { at: number; candidates: { player: PlayerId; defense: boolean }[] } };

export interface SimState {
  now: number;
  match: {
    round: number;
    wins: Record<Side, number>;
    phase: 'play' | 'result' | 'over';
    /** 各ラウンドの最初の操作・時計開始時刻。爆発後の待機とは区別する。 */
    roundStartsAt: number;
    roundEndsAt: number;
    nextRoundAt: number | null;
    firstBall: Side;
  };
  players: PlayerState[];
  ball: BallState;
  danger: { side: Side; expiresAt: number } | null;
  rally: Rally;
}

type InputTime = { at: number; seq: number; player: PlayerId };
export type Command = InputTime & (
  | { kind: 'move'; x: number; z: number }
  | { kind: 'yaw'; yaw: number }
  | { kind: 'keys'; forward: number; right: number }
  | { kind: 'primary'; aim?: boolean }
  | { kind: 'secondary' | 'step' | 'feint' | 'summon' | 'cycle-target' }
);

export type SimEvent =
  | { kind: 'round-end'; at: number; winner: Side | null; reason: 'ko' | 'time' }
  | { kind: 'round-start'; at: number; round: number; side: Side }
  | { kind: 'match-end'; at: number; winner: Side }
  | { kind: 'catch'; at: number; player: PlayerId; grade: DefenseGrade; position: Vec3 }
  | { kind: 'parry'; at: number; player: PlayerId; grade: DefenseGrade; position: Vec3; rallySpeed: number }
  | { kind: 'whiff'; at: number; player: PlayerId }
  | { kind: 'explosion' | 'crossing'; at: number; side: Side; position: Vec3 }
  | { kind: 'spawn' | 'clock-start'; at: number; side: Side }
  | { kind: 'pickup' | 'release' | 'summon'; at: number; player: PlayerId }
  | { kind: 'step'; at: number; player: PlayerId; direction: StepDirection }
  | { kind: 'hit'; at: number; player: PlayerId; damage: number; position: Vec3; direction: Vec3; ko: boolean };
