// 練習用の相手。simと同じコマンドだけで動き、乱数を使わない。
import type { Command, PlayerId, SimState } from '../sim/types';

const HOLD_BEFORE_THROW = 1.5 * 60_000;

export class Bot {
  private heldSince: number | null = null;
  private thrown = false;
  private seq = 0;

  constructor(private readonly id: PlayerId) {}

  /** 次のtickで処理するコマンドを返す。 */
  think(state: SimState): Command[] {
    const holding = state.ball.mode === 'held' && state.ball.owner === this.id;
    if (!holding) {
      this.heldSince = null;
      this.thrown = false;
      return [];
    }
    this.heldSince ??= state.now;
    if (this.thrown || state.now - this.heldSince < HOLD_BEFORE_THROW) return [];

    const self = state.players.find((p) => p.id === this.id)!;
    const target = state.players.find((p) => p.id !== this.id)!;
    // yaw 0 で -z を向く（simの規約）。
    const yaw = Math.atan2(-(target.position.x - self.position.x), -(target.position.z - self.position.z));
    this.thrown = true;
    const at = state.now;
    return [
      { kind: 'yaw', player: this.id, yaw, at, seq: this.seq++ },
      { kind: 'primary', player: this.id, at, seq: this.seq++ },
    ];
  }
}
