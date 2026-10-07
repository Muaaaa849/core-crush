import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../../src/game/controls';
import { localMatch } from '../../src/game/match';
import { SimRunner } from '../../src/game/runner';
import { createInitialState } from '../../src/sim/sim';

afterEach(() => vi.unstubAllGlobals());
describe('local spectator controls', () => {
  it('T10-29 normalizes diagonal movement before network delivery', () => {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    vi.stubGlobal('document', { pointerLockElement: canvas, addEventListener: (type: string, listener: (e: Record<string, unknown>) => void) => listeners.set(type, listener) });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const runner = new SimRunner(createInitialState(localMatch('1v1', 'a')));
    const controls = new Controls(canvas, runner, 'p1');
    listeners.get('keydown')!({ code: 'KeyW' }); listeners.get('keydown')!({ code: 'KeyD' }); controls.update();
    const command = runner.pending.find(c => c.kind === 'move')!;
    expect(command.kind === 'move' && Math.hypot(command.x, command.z)).toBeCloseTo(1);
  });
  it('T10-13: one Q press sends one cycle-target command and key repeat sends none', () => {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    vi.stubGlobal('document', { pointerLockElement: canvas, addEventListener: (type: string, listener: (e: Record<string, unknown>) => void) => listeners.set(type, listener) });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const runner = new SimRunner(createInitialState(localMatch('2v2', 'a')));
    new Controls(canvas, runner, 'p1');
    listeners.get('keydown')!({ code: 'KeyQ', repeat: false });
    listeners.get('keydown')!({ code: 'KeyQ', repeat: true });
    expect(runner.pending.filter(c => c.kind === 'cycle-target')).toHaveLength(1);
  });
  it('T10-11: KO sends no camera or action input to a teammate and revival synchronizes yaw and held keys', () => {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    vi.stubGlobal('document', { pointerLockElement: canvas, addEventListener: (type: string, listener: (e: Record<string, unknown>) => void) => listeners.set(type, listener) });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const runner = new SimRunner(createInitialState(localMatch('2v2', 'a')));
    const controls = new Controls(canvas, runner, 'p1');
    runner.state.players[0].hp = 0; controls.yaw = 2;
    listeners.get('mousemove')!({ movementX: 100, movementY: 20 });
    listeners.get('mousedown')!({ button: 0 }); listeners.get('keydown')!({ code: 'KeyW', repeat: false });
    controls.update(); expect(controls.yaw).toBe(2); expect(runner.pending).toEqual([]);
    runner.state.players[0].hp = 100; runner.state.players[0].yaw = 0;
    runner.state.match.roundStartsAt += 240_000;
    controls.update(); expect(controls.yaw).toBe(0);
    expect(runner.pending.every(command => command.player === 'p1')).toBe(true);
    expect(runner.pending).toContainEqual(expect.objectContaining({ kind: 'move', x: 0, z: -1 }));
  });
});
