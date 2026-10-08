import type { CharacterId } from '../game/characters';
import type { MatchMode, PlayerId, Side } from '../sim/types';

export interface RoomPlayer { id: PlayerId; side: Side; characterId: CharacterId; loaded: boolean; confirmed: boolean }
export interface RoomView {
  mode: MatchMode; build: string; players: RoomPlayer[];
  phase: 'lobby' | 'connecting' | 'countdown'; expiresAt: number;
  matchId: string; firstBall: Side; deadline: number; startAt: number;
}
export interface Signal {
  kind: 'signal'; to: PlayerId; matchId: string; generation: number;
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
}
export interface IceReply { mode: 'turn' | 'stun-only'; reason?: string; iceServers: RTCIceServer[]; expiresAt: number }
export type RoomReply = { kind: 'room'; room: RoomView; serverNow: number }
  | { kind: 'signal'; from: PlayerId; matchId: string; generation: number; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { kind: 'repair'; from: PlayerId; matchId: string }
  | { kind: 'host-left'; matchId: string }
  | { kind: 'error' | 'aborted'; reason: string };
export const PROTOCOL = 2;
export interface Admission { code: string; token: string; player: PlayerId; room: RoomView }
