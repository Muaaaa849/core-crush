import type { MatchMode, PlayerId, Side } from '../sim/types';

export interface RoomPlayer { id: PlayerId; side: Side; loaded: boolean; confirmed: boolean }
export interface RoomView {
  mode: MatchMode; build: string; players: RoomPlayer[];
  phase: 'lobby' | 'connecting' | 'countdown'; expiresAt: number;
  matchId: string; firstBall: Side; deadline: number; startAt: number;
}
export interface Signal {
  kind: 'signal'; to: PlayerId; matchId: string;
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
}
export interface IceReply { mode: 'turn' | 'stun-only'; reason?: string; iceServers: RTCIceServer[]; expiresAt: number }
export type RoomReply = { kind: 'room'; room: RoomView; serverNow: number }
  | { kind: 'signal'; from: PlayerId; matchId: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { kind: 'error' | 'aborted'; reason: string };
export const PROTOCOL = 1;
export interface Admission { code: string; token: string; player: PlayerId; room: RoomView }
