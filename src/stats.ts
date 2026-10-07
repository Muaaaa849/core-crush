// M0の計測表示（docs/progress.md M0-5）。
import type { WebGPURenderer } from 'three/webgpu';
import { backendName } from './gpu';

export interface FrameSummary {
  p50: number;
  p95: number;
  p99: number;
  fps: number;
}

export function summarizeFrameTimes(samples: readonly number[]): FrameSummary | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.ceil((p / 100) * sorted.length) - 1];
  const average = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;
  return { p50: rank(50), p95: rank(95), p99: rank(99), fps: 1000 / average };
}

const WINDOW = 600; // 直近600フレーム

export class StatsOverlay {
  readonly loads: Record<string, number> = {};
  private readonly frames: number[] = [];
  private readonly el = document.createElement('pre');
  private lastUpdate = 0;

  constructor(private readonly renderer: WebGPURenderer, private readonly gpu: string, visible: boolean) {
    this.el.className = 'stats';
    this.el.hidden = !visible;
    document.body.append(this.el);
  }

  frame(deltaMs: number, now: number): void {
    this.frames.push(deltaMs);
    if (this.frames.length > WINDOW) this.frames.shift();
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;
    const report = this.report();
    (window as unknown as { __corecrushStats: unknown }).__corecrushStats = report;
    if (!this.el.hidden) this.el.textContent = JSON.stringify(report, null, 1);
  }

  report(samples: readonly number[] = this.frames) {
    const { drawCalls, triangles } = this.renderer.info.render;
    const summary = summarizeFrameTimes(samples);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      backend: backendName(this.renderer),
      gpu: this.gpu,
      size: `${this.renderer.domElement.width}x${this.renderer.domElement.height}`,
      frames: samples.length,
      frameMs: summary && { p50: round(summary.p50), p95: round(summary.p95), p99: round(summary.p99) },
      fps: summary && round(summary.fps),
      drawCalls,
      triangles,
      loadMs: this.loads,
    };
  }
}
