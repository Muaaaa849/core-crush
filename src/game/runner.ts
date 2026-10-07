// 描画フレームと固定60Hzのsimをつなぐ（0004）。sim時刻は1/60,000秒単位の整数。
import { defaultConfig, type SimConfig } from '../sim/config';
import { step } from '../sim/sim';
import type { Command, SimEvent, SimState } from '../sim/types';

/** tickごとにsimの状態を見てコマンドを返す相手（ボット）。 */
export interface Controller {
  think(state: SimState): Command[];
}

const MAX_FRAME_MS = 250; // これを超える描画の空白は中断とみなす

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type Input = DistributiveOmit<Command, 'at' | 'seq'>;

export class SimRunner {
  readonly pending: Command[] = [];
  private accumulated = 0; // sim時刻単位
  private seq = 0;
  private events: SimEvent[] = [];

  /** 直前のtickの状態（表示の補間用）。 */
  previous: SimState;

  constructor(
    public state: SimState,
    private readonly config: SimConfig = defaultConfig,
    private readonly controllers: readonly Controller[] = [],
  ) {
    this.previous = state;
  }

  /** 押した時点のsim時刻を付けて、次に処理するtickへ渡す。 */
  input(input: Input): void {
    this.pending.push({ ...input, at: this.state.now + Math.floor(this.accumulated), seq: this.seq++ } as Command);
  }

  advance(frameMs: number): void {
    const unitsPerMs = this.config.timeUnitsPerSecond / 1000;
    this.accumulated += Math.min(frameMs, MAX_FRAME_MS) * unitsPerMs;
    while (this.accumulated >= this.config.tick) {
      const end = this.state.now + this.config.tick;
      const due = this.pending.filter((c) => c.at < end);
      const fromControllers = this.controllers.flatMap((c) => c.think(this.state));
      const result = step(this.state, [...due, ...fromControllers], this.config);
      this.previous = this.state;
      this.state = result.state;
      this.events.push(...result.events);
      this.pending.splice(0, due.length);
      this.accumulated -= this.config.tick;
    }
  }

  /** 前回のtickから次のtickまでの進み具合（表示の補間用、0〜1）。 */
  get alpha(): number {
    return this.accumulated / this.config.tick;
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
