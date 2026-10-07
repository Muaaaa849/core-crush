// ヒットストップ（feel.md「ヒットストップは通信の時計を止めない」）。表示だけで、simの時刻・入力・球の移動は止めない。
import type { DefenseGrade, SimEvent } from '../sim/types';

const STOP_MS: Record<DefenseGrade, number> = { 'so-so': 20, good: 28, just: 35 };
const SHAKE_M: Record<DefenseGrade, number> = { 'so-so': 0.02, good: 0.03, just: 0.05 };
const SHAKE_MS = 120;
const SHAKE_HZ = 30;

export class HitStop {
  private startedAt = -Infinity;
  private stopMs = 0;
  private amplitude = 0;

  /** キャッチ・跳ね返しの成功だけで始める。now は表示の時刻（ms）。 */
  trigger(events: readonly SimEvent[], now: number): void {
    for (const e of events) {
      if (e.kind !== 'catch' && e.kind !== 'parry') continue;
      this.startedAt = now;
      this.stopMs = STOP_MS[e.grade];
      this.amplitude = SHAKE_M[e.grade];
    }
  }

  /** アニメーション・球の自転に掛ける時間の進み。停止中は0。 */
  timeScale(now: number): number {
    return now - this.startedAt < this.stopMs ? 0 : 1;
  }

  /** カメラの揺れ（画面の右・上方向、m）。線形に減衰し120msで0。 */
  shake(now: number): { x: number; y: number } {
    const t = now - this.startedAt;
    if (t >= SHAKE_MS) return { x: 0, y: 0 };
    const size = this.amplitude * (1 - t / SHAKE_MS);
    const phase = 2 * Math.PI * SHAKE_HZ * t / 1000;
    const swing = size * Math.sin(phase), direction = phase * 0.37; // 揺れる向きを少しずつ回す
    return { x: swing * Math.cos(direction), y: swing * Math.sin(direction) };
  }
}
