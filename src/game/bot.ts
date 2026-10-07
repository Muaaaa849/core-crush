// 練習用の相手。simと同じコマンドだけで動き、乱数を使わない。
// 球種を ストレート→左→右→上 の順に巡回し、4回に1回はフリを入れてから投げる（0007）。
import { defaultConfig } from '../sim/config';
import type { Command, PlayerId, SimState } from '../sim/types';

const HOLD_BEFORE_THROW = 1.5 * defaultConfig.timeUnitsPerSecond;
const SHOTS = [
  { forward: 0, right: 0 }, { forward: 0, right: -1 },
  { forward: 0, right: 1 }, { forward: -1, right: 0 },
];

export class Bot {
  private heldSince: number | null = null;
  private thrown = false;
  private feinted = false;
  private throwCount = 0;
  private seq = 0;
  private roundStartsAt: number | null = null;

  constructor(private readonly id: PlayerId) {}

  reset(): void {
    this.heldSince = null; this.thrown = false; this.feinted = false;
    this.throwCount = 0; this.seq = 0; this.roundStartsAt = null;
  }

  private stop(state: SimState): Command[] {
    const self = state.players.find(p => p.id === this.id)!;
    return self.move.x === 0 && self.move.z === 0 ? []
      : [{ kind: 'move', player: this.id, at: state.now, seq: this.seq++, x: 0, z: 0 }];
  }

  /** 次のtickで処理するコマンドを返す。 */
  think(state: SimState): Command[] {
    const holding = state.ball.mode === 'held' && state.ball.owner === this.id;
    // 引き分けの再試合は番号が変わらない。開始時刻で新ラウンドを識別する。
    if (this.roundStartsAt !== state.match.roundStartsAt || state.match.phase !== 'play' || !holding) {
      this.heldSince = null;
      this.thrown = false;
      this.feinted = false;
      this.roundStartsAt = state.match.roundStartsAt;
    }
    const self = state.players.find(p => p.id === this.id)!;
    if (state.match.phase !== 'play' || self.hp <= 0
      || (self.action?.kind === 'hitstun' && state.now < self.action.endsAt)) return [];
    if (!holding) {
      if (state.danger && state.ball.mode === 'loose' && (state.ball.position.z > 0 ? 'a' : 'b') === self.side) {
        const position = state.ball.position;
        const distanceSquared = (p: typeof self) => (p.position.x - position.x) ** 2 + (p.position.z - position.z) ** 2;
        const nearest = state.players.filter(p => p.side === self.side && p.hp > 0
          && !(p.action?.kind === 'hitstun' && state.now < p.action.endsAt))
          .sort((a, b) => distanceSquared(a) - distanceSquared(b) || a.id.localeCompare(b.id))[0];
        if (nearest?.id !== this.id) return this.stop(state);
        const dx = state.ball.position.x - self.position.x, dz = state.ball.position.z - self.position.z;
        const distance = Math.hypot(dx, dz);
        return [{ kind: 'move', player: this.id, at: state.now, seq: this.seq++,
          x: distance === 0 ? 0 : dx / distance, z: distance === 0 ? 0 : dz / distance }];
      }
      return this.stop(state);
    }
    this.heldSince ??= state.now;
    // 取得後は追いかける入力を止め、保持時間と球種巡回は従来どおり。
    if (self.move.x !== 0 || self.move.z !== 0) return [{ kind: 'move', player: this.id, at: state.now, seq: this.seq++, x: 0, z: 0 }];
    if (this.thrown || state.now - this.heldSince < HOLD_BEFORE_THROW) return [];

    if (!state.danger) return [];
    if (self.action) return [];
    if (!this.feinted && (this.throwCount + 1) % 4 === 0 && self.cost >= defaultConfig.feintCost) {
      this.feinted = true;
      return [{ kind: 'feint', player: this.id, at: state.now, seq: this.seq++ }];
    }
    const target = state.players.find(p => p.id === self.lockTarget && p.side !== self.side && p.hp > 0);
    if (!target) return [];
    // yaw 0 で -z を向く（simの規約）。
    const yaw = Math.atan2(-(target.position.x - self.position.x), -(target.position.z - self.position.z));
    const keys = SHOTS[this.throwCount % SHOTS.length];
    this.throwCount++;
    this.thrown = true;
    return [
      { kind: 'yaw', player: this.id, yaw, at: state.now, seq: this.seq++ },
      { kind: 'keys', player: this.id, ...keys, at: state.now, seq: this.seq++ },
      { kind: 'primary', player: this.id, at: state.now, seq: this.seq++ },
    ];
  }
}
