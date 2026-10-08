import type { SimConfig } from '../sim/config';
import type { ConfirmedEvent } from '../net/messages';
import type { Side, SimEvent, SimState } from '../sim/types';

export interface PresentationState {
  matchId: string;
  consumed: number;
  pending: (ConfirmedEvent & { audible: boolean })[];
  warning?: { key: string; through: number };
  skipped: number;
  lastDelayMs: number;
}
export interface PresentationInput {
  matchId: string;
  events: readonly ConfirmedEvent[];
  state: SimState;
  confirmed?: SimState;
  viewSimAt: number;
  displayNowMs: number;
  visible: boolean;
  running: boolean;
  audioReady: boolean;
  muted: boolean;
  historyThrough?: number;
  config: SimConfig;
}
export function createPresentation(matchId: string): PresentationState {
  return { matchId, consumed: 0, pending: [], skipped: 0, lastDelayMs: 0 };
}
export function updatePresentation(previous: PresentationState, input: PresentationInput) {
  const state = input.matchId === previous.matchId ? structuredClone(previous) : createPresentation(input.matchId);
  const events: SimEvent[] = [];
  const effects: { event: SimEvent; startedAtMs: number }[] = [];
  const sounds: SimEvent[] = [];
  const warnings: { side: Side; startedAtMs: number }[] = [];
  const audible = input.audioReady && !input.muted && input.visible && input.running;
  const reset = input.historyThrough !== undefined;
  if (reset) {
    state.consumed = input.historyThrough!;
    state.pending = []; state.warning = undefined;
  }
  for (const e of input.events) {
    if (e.seq > state.consumed && !state.pending.some(p => p.seq === e.seq)) state.pending.push({ ...structuredClone(e), audible });
  }
  state.pending.sort((a, b) => a.seq - b.seq);
  const active = input.visible && input.running;
  while (state.pending.length) {
    const next = state.pending[0];
    if (active && (next.seq !== state.consumed + 1 || next.event.at > input.viewSimAt)) break;
    state.pending.shift(); state.consumed = next.seq;
    const e = next.event;
    const transient = e.kind === 'parry' || e.kind === 'catch' || e.kind === 'hit' || e.kind === 'explosion' || e.kind === 'crossing' || e.kind === 'skill-rejected';
    if (!transient) { events.push(e); continue; }
    state.lastDelayMs = (input.viewSimAt - e.at) * 1000 / input.config.timeUnitsPerSecond;
    if (!active || reset || state.lastDelayMs > 300 || e.at < input.state.match.roundStartsAt) { state.skipped++; continue; }
    events.push(e);
    // 不成立は該当HUD枠の短文だけ。SE・VFX・ヒットストップへ渡さない。
    if (e.kind === 'skill-rejected') continue;
    effects.push({ event: e, startedAtMs: input.displayNowMs });
    if (audible && next.audible) sounds.push(e);
  }

  const danger = input.confirmed ? input.confirmed.danger : input.state.danger;
  const predicted = input.state.danger;
  if (danger) {
    const key = `${input.matchId}:${danger.side}:${danger.expiresAt}`;
    if (state.warning?.key !== key) state.warning = { key, through: -1 };
    const elapsed = (input.config.dangerDuration + input.viewSimAt - danger.expiresAt) / input.config.timeUnitsPerSecond;
    const interval = Math.min(4, Math.floor((elapsed - 7) / 0.25));
    const eligible = predicted?.side === danger.side && predicted.expiresAt === danger.expiresAt
      && input.state.ball.mode !== 'absent' && input.state.match.phase === 'play'
      && (!input.confirmed || input.confirmed.ball.mode !== 'absent' && input.confirmed.match.phase === 'play');
    if (eligible && interval >= 0 && interval > state.warning.through) {
      state.warning.through = interval;
      if (interval < 4 && audible && !reset) warnings.push({ side: danger.side, startedAtMs: input.displayNowMs });
    }
  }
  return { state, events, effects, sounds, warnings };
}
