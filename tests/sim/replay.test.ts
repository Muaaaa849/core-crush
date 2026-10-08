import { duelParticipants, evenMatch } from '../fixtures';
// 再実行（0004、0005「テスト」）：試合全体の入力記録から、最初からでも途中保存からでも同じ結果になる。
// M2の通信（ホストが入力を集めて同じsimを進める）の前提。
import { describe, expect, it } from 'vitest';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState, step } from '../../src/sim/sim';
import type { Command, PlayerId, SimEvent, SimState } from '../../src/sim/types';
import { SimRunner, type Controller } from '../../src/game/runner';

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** 両者の全種類の入力を記録。seed 1はラウンド境界を越える長さで実行する。 */
function record(seed: number): Command[][] {
  const random = rng(seed);
  let state = createInitialState({ participants: duelParticipants, firstBall: seed % 2 ? 'a' : 'b' });
  let seq = 0;
  const log: Command[][] = [];
  const duration = seed === 1 ? 2 * (config.roundDuration + config.roundResultDuration + config.ballStartDelay) : 40 * config.timeUnitsPerSecond;
  for (let tick = 0; tick < duration / config.tick; tick++) {
    const commands: Command[] = [];
    for (const player of ['p1', 'p2'] as PlayerId[]) {
      const at = state.now + Math.floor(random() * config.tick);
      if (random() < 0.1) {
        const angle = random() * Math.PI * 2;
        commands.push({ kind: 'move', player, at, seq: seq++, x: Math.cos(angle), z: Math.sin(angle) });
      }
      if (random() < 0.05) commands.push({ kind: 'keys', player, at, seq: seq++, forward: Math.floor(random() * 3) - 1, right: Math.floor(random() * 3) - 1 });
      if (random() < 0.05) commands.push({ kind: 'yaw', player, at, seq: seq++, yaw: (player === 'p1' ? 0 : Math.PI) + (random() - 0.5) });
      const r = random();
      const kind = r < 0.01 ? 'step' : r < 0.04 ? 'primary' : r < 0.06 ? 'secondary' : r < 0.063 ? 'summon' : r < 0.066 ? 'feint' : null;
      if (kind) commands.push({ kind, player, at, seq: seq++ } as Command);
    }
    log.push(commands);
    state = step(state, commands).state;
  }
  return log;
}

function run(state: SimState, log: Command[][]): { state: SimState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (const commands of log) {
    const result = step(state, commands);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe('whole-match replay', () => {
  it.each([1, 2, 3, 4])('seed %i: replaying from the start and from a mid-match snapshot gives the same result', (seed) => {
    const initial = createInitialState({ participants: duelParticipants, firstBall: seed % 2 ? 'a' : 'b' });
    const log = record(seed);
    const full = run(structuredClone(initial), log);
    // 試合として成り立っている（投擲・接触が起きている）ことも確かめる。
    expect(full.events.some((e) => e.kind === 'release')).toBe(true);
    expect(full.events.some((e) => e.kind === 'hit' || e.kind === 'catch' || e.kind === 'parry' || e.kind === 'explosion')).toBe(true);
    if (seed === 1) {
      expect(full.events.some(e => e.kind === 'round-end')).toBe(true);
      expect(full.events.some(e => e.kind === 'round-start' && e.round > 1)).toBe(true);
      // 保存直後にラウンドをまたぐ場合も、状態と事象列が一致する。
      const boundary = log.findIndex(commands => commands.some(c => c.at >= full.events.find(e => e.kind === 'round-end')!.at));
      const prefix = run(structuredClone(initial), log.slice(0, boundary));
      const suffix = run(structuredClone(prefix.state), log.slice(boundary));
      expect(suffix.state).toEqual(full.state);
      expect([...prefix.events, ...suffix.events]).toEqual(full.events);
    }

    const half = log.length / 2;
    const firstHalf = run(structuredClone(initial), log.slice(0, half));
    const resumed = run(structuredClone(firstHalf.state), log.slice(half));
    expect(resumed.state).toEqual(full.state);
    expect([...firstHalf.events, ...resumed.events]).toEqual(full.events);
  });
});

describe('T10-12 team replay', () => {
  for (const mode of ['1v1', '1v2', '2v2'] as const) it.each([1, 2, 3, 4])(`${mode} seed %i: 60 seconds, render rates and a 30-second snapshot agree`, seed => {
    const initial = createInitialState(evenMatch(mode, seed % 2 ? 'a' : 'b'), config);
    // 部分KOを含む固定ロスターでも60秒の時刻が前進する。
    if (mode === '2v2') initial.players.find(p => p.id === 'p2')!.hp = 0;
    const random = rng(seed), log: Command[][] = [];
    for (let tick = 0; tick < 60 * 60; tick++) {
      const commands: Command[] = [];
      for (const p of initial.players) {
        const at = tick * config.tick + Math.floor(random() * config.tick);
        if (random() < 0.1) {
          const angle = random() * Math.PI * 2;
          commands.push({ kind: 'move', player: p.id, at, seq: tick * 4, x: Math.cos(angle), z: Math.sin(angle) });
          commands.push({ kind: 'keys', player: p.id, at, seq: tick * 4 + 1, forward: Math.floor(random() * 3) - 1, right: Math.floor(random() * 3) - 1 });
        }
        if (random() < 0.05) commands.push({ kind: 'yaw', player: p.id, at, seq: tick * 4 + 2, yaw: (p.side === 'a' ? 0 : Math.PI) + random() - 0.5 });
        const kinds = ['primary', 'secondary', 'step', 'summon', 'feint', 'cycle-target'] as const;
        if (random() < 0.1) commands.push({ kind: kinds[Math.floor(random() * kinds.length)], player: p.id, at, seq: tick * 4 + 3 });
      }
      log.push(commands);
    }
    const full = run(initial, log), prefix = run(initial, log.slice(0, 1800));
    const suffix = run(structuredClone(prefix.state), log.slice(1800));
    expect(full.state.now).toBe(60 * config.timeUnitsPerSecond);
    expect(full.events.some(e => e.kind === 'release')).toBe(true);
    expect(suffix.state).toEqual(full.state); expect([...prefix.events, ...suffix.events]).toEqual(full.events);
    for (const fps of [30, 60, 144]) {
      let index = 0;
      const controller: Controller = { think: () => log[index++] ?? [] };
      const runner = new SimRunner(structuredClone(initial), config, [controller]);
      for (let frame = 0; frame < fps * 60; frame++) runner.advance(1000 / fps);
      expect(runner.state).toEqual(full.state); expect(runner.drainEvents()).toEqual(full.events);
    }
  });
});
