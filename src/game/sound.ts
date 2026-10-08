import type { PlayerId, Side, SimEvent, Vec3 } from '../sim/types';

export interface SoundVoice {
  wave: OscillatorType | 'noise';
  fromHz: number;
  toHz: number;
  gain: number;
  startMs: number;
  durationMs: number;
  filter?: { type: BiquadFilterType; hz: number; q: number };
}
export interface SoundPlan {
  voices: SoundVoice[];
  durationMs: number;
  gain: number;
  pan: number;
  relation: 'self' | 'ally' | 'enemy';
}
export interface SoundListener {
  player: PlayerId;
  players: readonly { id: PlayerId; side: Side }[];
  position: Vec3;
  right: Vec3;
  rallySpeedCap: number;
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const tone = (fromHz: number, toHz: number, durationMs: number, gain: number, wave: OscillatorType = 'sine', startMs = 0): SoundVoice =>
  ({ wave, fromHz, toHz, gain, startMs, durationMs });
const noise = (hz: number, durationMs: number, gain: number, type: BiquadFilterType = 'lowpass'): SoundVoice =>
  ({ ...tone(hz, hz, durationMs, gain), wave: 'noise', filter: { type, hz, q: 0.7 } });

export function describeSound(event: SimEvent, listener: SoundListener): SoundPlan | undefined {
  if (event.kind !== 'parry' && event.kind !== 'catch' && event.kind !== 'hit' && event.kind !== 'explosion' && event.kind !== 'crossing') return;
  const localSide = listener.players.find(p => p.id === listener.player)!.side;
  const side = 'player' in event ? listener.players.find(p => p.id === event.player)!.side : event.side;
  const relation = 'player' in event && event.player === listener.player ? 'self' : side === localSide ? 'ally' : 'enemy';
  let voices: SoundVoice[], durationMs: number;
  switch (event.kind) {
    case 'parry': {
      durationMs = { 'so-so': 90, good: 100, just: 110 }[event.grade];
      const pitch = (relation === 'enemy' ? 0.9 : 1) * (1 + 0.15 * clamp(event.rallySpeed / listener.rallySpeedCap, 0, 1));
      const cores = { 'so-so': [550, 680], good: [900, 1450], just: [1400, 2300] }[event.grade];
      voices = cores.map(hz => tone(hz * pitch, hz * pitch, durationMs, 0.24, 'triangle'));
      voices.push(tone(event.grade === 'just' ? 80 : 100, 60, 50, 0.16));
      if (event.grade !== 'good') voices.push(noise(event.grade === 'just' ? 3500 : 700, 25, 0.16, event.grade === 'just' ? 'highpass' : 'lowpass'));
      break;
    }
    case 'catch': {
      durationMs = 120;
      const pitch = relation === 'enemy' ? 0.9 : 1;
      voices = [tone(500 * pitch, 200 * pitch, durationMs, { 'so-so': 0.18, good: 0.26, just: 0.34 }[event.grade]), noise(900, 90, 0.22)];
      break;
    }
    case 'hit': durationMs = 160; voices = [tone(160, 60, durationMs, 0.35), noise(600, 90, 0.28)]; break;
    case 'explosion': durationMs = 240; voices = [tone(80, 35, durationMs, 0.4), noise(3000, 20, 0.25, 'highpass'), noise(800, 130, 0.3)]; break;
    case 'crossing': durationMs = 70; voices = [{ ...tone(600, 1000, durationMs, 0.2), filter: { type: 'bandpass', hz: 800, q: 2 } }]; break;
  }
  const delta = { x: event.position.x - listener.position.x, y: event.position.y - listener.position.y, z: event.position.z - listener.position.z };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  const lateral = delta.x * listener.right.x + delta.y * listener.right.y + delta.z * listener.right.z;
  return { voices, durationMs, relation, pan: clamp(lateral / 8, -0.7, 0.7), gain: Math.max(0.4, 1 / (1 + distance / 30)) };
}
export function warningSound(side: Side, localSide: Side): SoundPlan {
  const own = side === localSide, frequencies = own ? [880, 1320] : [660, 880];
  return { voices: frequencies.map((hz, i) => tone(hz, hz, 35, 0.3, 'sine', i * 35)), durationMs: 70,
    gain: 1, pan: 0, relation: own ? 'self' : 'enemy' };
}
