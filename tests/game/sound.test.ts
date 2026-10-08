import { describe, expect, it } from 'vitest';
import { describeSound, warningSound, type SoundListener } from '../../src/game/sound';
import type { DefenseGrade, SimEvent } from '../../src/sim/types';
import { active } from '../sim/cover-helpers';
import { defaultConfig as c } from '../../src/sim/config';

const listener: SoundListener = { player: 'p1', players: active().players, position: { x: 0, y: 1, z: 8 }, right: { x: 1, y: 0, z: 0 }, rallySpeedCap: c.rallySpeedCap };
const position = { x: 0, y: 1, z: 8 };
const success = (kind: 'parry' | 'catch', grade: DefenseGrade): SimEvent => kind === 'parry'
  ? { kind, grade, position, at: 0, player: 'p1', rallySpeed: 0 } : { kind, grade, position, at: 0, player: 'p1' };

describe('M3-1 synthetic tone plans', () => {
  it.each(['so-so', 'good', 'just'] as const)('F12-3: %s parry and catch differ in core and duration', grade => {
    const p = describeSound(success('parry', grade), listener)!;
    const k = describeSound(success('catch', grade), listener)!;
    expect(p.durationMs).toBe({ 'so-so': 90, good: 100, just: 110 }[grade]);
    expect(k.durationMs).toBe(120);
    expect(k.voices.find(v => v.wave !== 'noise')).toMatchObject({ fromHz: 500, toHz: 200 });
    expect(p).not.toEqual(k);
    const first = p.voices[0].fromHz;
    expect(first).toBe({ 'so-so': 550, good: 900, just: 1400 }[grade]);
  });
  it('F12-3: hit, explosion and crossing map once, pickup and whiff stay silent', () => {
    const events: SimEvent[] = [
      { kind: 'hit', at: 0, player: 'p1', position, damage: 20, direction: { x: 0, y: 0, z: 1 }, ko: false },
      { kind: 'explosion', at: 0, side: 'a', position }, { kind: 'crossing', at: 0, side: 'b', position },
    ];
    expect(events.map(e => describeSound(e, listener)?.durationMs)).toEqual([160, 240, 70]);
    for (const kind of ['pickup', 'whiff'] as const) expect(describeSound({ kind, at: 0, player: 'p1' }, listener)).toBeUndefined();
  });
  it('F12-3: self, ally and enemy are explicit; rally raises pitch only up to 15%', () => {
    const p = success('parry', 'good') as Extract<SimEvent, { kind: 'parry' }>;
    const before = structuredClone(p);
    const self = describeSound(p, listener)!;
    expect(self.relation).toBe('self');
    expect(describeSound({ ...p, player: 'p2' }, listener)?.relation).toBe('ally');
    const enemy = describeSound({ ...p, player: 'p3' }, listener)!;
    expect(enemy.relation).toBe('enemy'); expect(enemy.voices[0].fromHz).toBeLessThan(self.voices[0].fromHz);
    const max = describeSound({ ...p, rallySpeed: c.rallySpeedCap }, listener)!;
    expect(max.voices[0].fromHz).toBeCloseTo(self.voices[0].fromHz * 1.15);
    expect(describeSound({ ...p, rallySpeed: 10000 }, listener)).toEqual(max);
    expect(max.gain).toBe(self.gain); expect(p).toEqual(before);
  });
  it('F12-3: pan uses logical right vector, stays within ±0.7, distance retains audibility', () => {
    const p: Extract<SimEvent, { kind: 'catch' }> = { kind: 'catch', grade: 'just', position, at: 0, player: 'p1' };
    expect(describeSound({ ...p, position: { x: 100, y: 1, z: 8 } }, listener)?.pan).toBe(0.7);
    expect(describeSound({ ...p, position: { x: -100, y: 1, z: 8 } }, listener)?.pan).toBe(-0.7);
    expect(describeSound({ ...p, position: { x: 100, y: 1, z: 8 } }, listener)!.gain).toBeGreaterThan(0);
  });
  it('F12-9: own and enemy warnings use distinct two-tone plans lasting 70ms', () => {
    expect(warningSound('a', 'a').voices.map(v => v.fromHz)).toEqual([880, 1320]);
    expect(warningSound('b', 'a').voices.map(v => v.fromHz)).toEqual([660, 880]);
    expect(warningSound('a', 'a').durationMs).toBe(70);
  });
});
