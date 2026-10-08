import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../../src/game/controls';
import { localRoster, rosterMatch } from '../../src/game/match';
import { SimRunner } from '../../src/game/runner';
import { createInitialState } from '../../src/sim/sim';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/game/settings';
import { aimPitchLimit } from '../../src/sim/config';

afterEach(() => vi.unstubAllGlobals());
describe('vertical aim input', () => {
  function setup() {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    vi.stubGlobal('document', { pointerLockElement: canvas,
      addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => listeners.set(type, fn) });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const runner = new SimRunner(createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'a')));
    const controls = new Controls(canvas, runner, 'p1');
    const mouse = (y: number) => listeners.get('mousemove')!({ movementX: 0, movementY: y });
    return { controls, runner, mouse, listeners };
  }
  it('V15-3: sends pitch only when changed; looking alone does not trigger an action', () => {
    const { controls, runner, mouse } = setup();
    controls.update(); runner.pending.length = 0;
    mouse(-100); controls.update(); controls.update();
    expect(runner.pending).toEqual([expect.objectContaining({ kind: 'pitch', pitch: controls.pitchAngle })]);
    expect(controls.pitchAngle).toBeGreaterThan(0);
    runner.advance(20);
    expect(runner.state.players[0].pitch).toBe(controls.pitchAngle);
    expect(runner.state.players[0].action).toBeNull();
  });
  it('V15-3: clamps to the same sim limit and does not resend the unchanged endpoint', () => {
    const { controls, runner, mouse } = setup();
    mouse(-100000); controls.update(); mouse(-100000); controls.update();
    mouse(100000); controls.update();
    expect(runner.pending.filter(c => c.kind === 'pitch').map(c => c.pitch)).toEqual([aimPitchLimit, -aimPitchLimit]);
  });
  it('V15-20: sync restores confirmed yaw/pitch and invalidates both sent values', () => {
    const { controls, runner, mouse } = setup();
    mouse(-100); controls.update(); runner.pending.length = 0;
    runner.state.players[0].yaw = 0.7; runner.state.players[0].pitch = -0.4;
    controls.sync();
    expect(controls.yaw).toBe(0.7); expect(controls.pitchAngle).toBe(-0.4);
    controls.update(); runner.pending.length = 0;
    controls.sync(); controls.update();
    expect(runner.pending).toContainEqual(expect.objectContaining({ kind: 'yaw', yaw: 0.7 }));
    expect(runner.pending).toContainEqual(expect.objectContaining({ kind: 'pitch', pitch: -0.4 }));
    runner.pending.length = 0;
    runner.state.match.roundStartsAt += 240000; runner.state.players[0].pitch = 0;
    controls.update(); expect(controls.pitchAngle).toBe(0);
    expect(runner.pending).toContainEqual(expect.objectContaining({ kind: 'pitch', pitch: 0 }));
  });
  it('V15-19: sends current axes, yaw and pitch before an action in the same frame', () => {
    const { controls, runner, mouse, listeners } = setup();
    controls.update(); runner.pending.length = 0;
    listeners.get('keydown')!({ code: 'KeyW' });
    controls.yaw = 0.3; mouse(100);
    listeners.get('mousedown')!({ button: 0 });
    const action = runner.pending.findIndex(c => c.kind === 'primary');
    expect(action).toBeGreaterThan(0);
    expect(runner.pending.slice(0, action)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'keys', forward: 1 }),
      expect.objectContaining({ kind: 'move' }),
      expect.objectContaining({ kind: 'yaw', yaw: 0.3 }),
      expect.objectContaining({ kind: 'pitch', pitch: controls.pitchAngle }),
    ]));
  });
});
describe('K14-2 skill input', () => {
  function setup() {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    const windowListeners = new Map<string, () => void>();
    const doc = { pointerLockElement: canvas as HTMLCanvasElement | null,
      addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => listeners.set(type, fn) };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { addEventListener: (type: string, fn: () => void) => windowListeners.set(type, fn) });
    const runner = new SimRunner(createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'a')));
    const controls = new Controls(canvas, runner, 'p1');
    const key = (code: string, down = true, repeat = false) => listeners.get(down ? 'keydown' : 'keyup')!({ code, repeat });
    const slots = () => runner.pending.filter(c => c.kind === 'skill').map(c => c.slot);
    return { controls, runner, key, slots, doc, canvas, windowListeners };
  }
  it('K14-2: E/R each send their slot after the latest yaw and keys', () => {
    const t = setup(); t.controls.yaw = 1.2; t.key('KeyW'); t.key('KeyE'); t.key('KeyR');
    expect(t.slots()).toEqual([1, 2]);
    const index = t.runner.pending.findIndex(c => c.kind === 'skill');
    expect(t.runner.pending.slice(0, index)).toContainEqual(expect.objectContaining({ kind: 'yaw', yaw: 1.2 }));
    expect(t.runner.pending.slice(0, index)).toContainEqual(expect.objectContaining({ kind: 'keys', forward: 1, right: 0 }));
  });
  it('K14-2: saved primary/secondary bindings OR their presses and ignore repeat', () => {
    const t = setup(), settings = structuredClone(DEFAULT_SETTINGS);
    settings.bindings.skill1 = ['KeyG', 'KeyH']; settings.bindings.skill2 = ['KeyJ', 'KeyK'];
    let saved: string | null = null;
    saveSettings({ setItem: (_key, value) => { saved = value; } }, settings);
    t.controls.settings = loadSettings({ getItem: () => saved }).settings;
    for (const [primary, secondary] of [['KeyG', 'KeyH'], ['KeyJ', 'KeyK']]) {
      t.key(primary); t.key(secondary); t.key(primary, true, true);
      t.key(primary, false); t.key(secondary, false); t.key(secondary);
      t.key(secondary, false);
    }
    expect(t.slots()).toEqual([1, 1, 2, 2]); t.key('KeyE'); t.key('KeyR'); expect(t.slots()).toHaveLength(4);
  });
  it('K14-2: blur/menu/interruption discard held input; resume does not replay it', () => {
    const t = setup(); t.key('KeyE'); t.windowListeners.get('blur')!(); t.controls.update();
    expect(t.slots()).toEqual([1]);
    t.doc.pointerLockElement = null; t.controls.releaseAll(); t.key('KeyR');
    t.doc.pointerLockElement = t.canvas; t.controls.update(); expect(t.slots()).toEqual([1]);
    t.key('KeyR', false); t.key('KeyR'); expect(t.slots()).toEqual([1, 2]);
    t.controls.enabled = false; t.controls.releaseAll(); t.key('KeyE');
    t.controls.enabled = true; t.controls.update(); t.key('KeyE', true, true); expect(t.slots()).toEqual([1, 2]);
  });
});
describe('local spectator controls', () => {
  it('T10-29 normalizes diagonal movement before network delivery', () => {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    vi.stubGlobal('document', { pointerLockElement: canvas, addEventListener: (type: string, listener: (e: Record<string, unknown>) => void) => listeners.set(type, listener) });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const runner = new SimRunner(createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'a')));
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
    const runner = new SimRunner(createInitialState(rosterMatch(localRoster('2v2', 'volt'), 'a')));
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
    const runner = new SimRunner(createInitialState(rosterMatch(localRoster('2v2', 'volt'), 'a')));
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
