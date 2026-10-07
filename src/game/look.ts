// 防御のマウス方向の入力（0007）。判定はsimが行い、ここは換算と視点の減衰だけ。
import type { PlayerId, SimEvent } from '../sim/types';

const DEFENSE_LOOK_MULTIPLIER = 0.25;

/** マウスのカウントを視角（度）へ。右＝正、手前へ引く（画面の下方向）＝正。Y反転の影響を受けない。 */
export function mouseDegrees(movementX: number, movementY: number, degreesPerCount: number) {
  return { rightDegrees: movementX * degreesPerCount, pullDegrees: movementY * degreesPerCount };
}

/** 自分の防御が成立してから受付終了まで、視点の回転だけ25%にする。被弾・爆発で解除。 */
export class DefenseLook {
  private endsAt = -Infinity;

  constructor(private readonly player: PlayerId) {}

  observe(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === 'defense-start' && e.player === this.player) this.endsAt = e.endsAt;
      if ((e.kind === 'hit' && e.player === this.player) || e.kind === 'explosion') this.endsAt = -Infinity;
    }
  }

  multiplier(simNow: number): number {
    return simNow < this.endsAt ? DEFENSE_LOOK_MULTIPLIER : 1;
  }
}
