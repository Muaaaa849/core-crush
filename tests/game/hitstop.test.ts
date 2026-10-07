// ヒットストップ（表示だけ。progress.md H1〜H2）：キャッチ・跳ね返しの成功で表示の時間を段階別に止め、カメラを揺らす。
import { describe, expect, it } from 'vitest';
import { HitStop } from '../../src/game/hitstop';
import type { SimEvent } from '../../src/sim/types';

const size = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
const success = (kind: 'catch' | 'parry', grade: 'just' | 'good' | 'so-so'): SimEvent => ({ kind, at: 0, player: 'p1', grade });

describe('HitStop', () => {
  it('H1: stops display time for a grade-dependent duration, then resumes', () => {
    for (const [grade, ms] of [['so-so', 20], ['good', 28], ['just', 35]] as const) {
      const stop = new HitStop();
      expect(stop.timeScale(1000)).toBe(1);
      stop.trigger([success('catch', grade)], 1000);
      expect(stop.timeScale(1000)).toBe(0);
      expect(stop.timeScale(1000 + ms - 1)).toBe(0);
      expect(stop.timeScale(1000 + ms)).toBe(1);
    }
  });

  it('H2: shakes the camera harder for better grades and settles within 120ms', () => {
    const amplitude = (grade: 'just' | 'good' | 'so-so') => {
      const stop = new HitStop();
      stop.trigger([success('parry', grade)], 0);
      return Math.max(...[1, 5, 9, 13].map((t) => size(stop.shake(t))));
    };
    expect(amplitude('just')).toBeGreaterThan(amplitude('good'));
    expect(amplitude('good')).toBeGreaterThan(amplitude('so-so'));
    expect(amplitude('just')).toBeLessThanOrEqual(0.05);
    const stop = new HitStop();
    stop.trigger([success('catch', 'just')], 0);
    expect(size(stop.shake(120))).toBe(0);
  });

  it('H2: other events do not trigger it', () => {
    const stop = new HitStop();
    stop.trigger([{ kind: 'whiff', at: 0, player: 'p1' },
      { kind: 'hit', at: 0, player: 'p1', damage: 20, position: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: 1 }, ko: false }], 0);
    expect(stop.timeScale(0)).toBe(1);
    expect(size(stop.shake(10))).toBe(0);
  });
});
