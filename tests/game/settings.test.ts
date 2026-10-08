// M3-6（0013 S13）：設定の検査・競合・保存読込と、割当どおりの入力変換。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../../src/game/controls';
import { localRoster, rosterMatch } from '../../src/game/match';
import { SimRunner } from '../../src/game/runner';
import {
  DEFAULT_SETTINGS, SETTINGS_KEY, conflicts, inputStatus, loadSettings, saveSettings, unassigned, validateSettings, type Settings,
} from '../../src/game/settings';
import { createInitialState } from '../../src/sim/sim';

const copy = (edit: (s: Settings) => void = () => {}): Settings => { const s = structuredClone(DEFAULT_SETTINGS); edit(s); return s; };
const memory = (value: string | null, failSet = false) => {
  const data = new Map<string, string>(); if (value !== null) data.set(SETTINGS_KEY, value);
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (failSet) throw Error('quota'); data.set(k, v); } };
};

describe('S13 settings validation and storage', () => {
  it('S13-5: shared inputs are legal only between held-only and free-only actions; overlaps are reported', () => {
    expect(conflicts(DEFAULT_SETTINGS.bindings)).toEqual([]);
    const s = copy(x => { x.bindings.feint[0] = 'Mouse0'; x.bindings.step[1] = 'KeyW'; x.bindings.skill1[1] = 'KeyQ'; });
    expect(conflicts(s.bindings).map(c => `${c.a}/${c.b}:${c.input}`).sort()).toEqual(['cycle-target/skill1:KeyQ', 'forward/step:KeyW', 'throw/feint:Mouse0']);
    const same = copy(x => { x.bindings.step[1] = 'ShiftLeft'; });
    expect(conflicts(same.bindings)).toEqual([{ a: 'step', b: 'step', input: 'ShiftLeft' }]);
    const empty = copy(x => { x.bindings.skill2 = [null, null]; });
    expect(unassigned(empty.bindings)).toEqual(['skill2']);
  });

  it('S13-6: Esc, function keys and unknown codes cannot be bound; ShiftLeft and mouse 0-4 can', () => {
    expect(inputStatus('Escape')).toBe('reserved'); expect(inputStatus('F5')).toBe('reserved'); expect(inputStatus('ControlLeft')).toBe('reserved');
    expect(inputStatus('AudioVolumeUp')).toBe('unsupported'); expect(inputStatus('Mouse5')).toBe('unsupported');
    for (const code of ['ShiftLeft', 'KeyI', 'Digit3', 'Mouse4', 'Numpad0', 'Space']) expect(inputStatus(code)).toBe('ok');
  });

  it('S13-12: a fully changed setting survives save and reload unchanged', () => {
    const s = copy(x => {
      x.bindings.forward = ['KeyI', 'ArrowUp']; x.bindings.back = ['KeyK', null]; x.bindings.left = ['KeyJ', null]; x.bindings.right = ['KeyL', null];
      x.sensitivity = { fps: 2, tps: 1, ads: 0.5, x: 1.5, y: 0.5 }; x.invertY = true; x.adsMode = 'toggle'; x.fov = 100;
      x.reticle = { shape: 'dot', size: 8, color: '#FF00AA' }; x.effects = { volume: 0.3, muted: true, shake: 0, flash: 0.5 };
    });
    const storage = memory(null);
    expect(saveSettings(storage, s)).toBe(true);
    expect(loadSettings(storage)).toEqual({ settings: s, message: '' });
    expect(Object.keys(JSON.parse(storage.data.get(SETTINGS_KEY)!)).sort()).toEqual(['adsMode', 'bindings', 'effects', 'fov', 'invertY', 'reticle', 'sensitivity', 'version']);
  });

  it('S13-13: broken, outdated, partial, out-of-range or conflicting saves fall back to defaults without deleting them', () => {
    const bad = [
      '{', JSON.stringify({ ...DEFAULT_SETTINGS, version: 2 }), JSON.stringify({ ...DEFAULT_SETTINGS, fov: undefined }),
      JSON.stringify({ ...DEFAULT_SETTINGS, extra: 1 }), JSON.stringify({ ...DEFAULT_SETTINGS, fov: '90' }), JSON.stringify({ ...DEFAULT_SETTINGS, fov: 200 }),
      JSON.stringify({ ...DEFAULT_SETTINGS, sensitivity: { ...DEFAULT_SETTINGS.sensitivity, x: Number.NaN } }),
      JSON.stringify(copy(x => { x.bindings.step[0] = 'KeyW'; })), JSON.stringify(copy(x => { x.bindings.catch = [null, null]; })),
      JSON.stringify(copy(x => { x.bindings.feint[0] = 'Escape'; })), JSON.stringify(copy(x => { x.reticle.color = 'red'; })),
    ];
    for (const value of bad) {
      const storage = memory(value);
      expect(loadSettings(storage)).toEqual({ settings: DEFAULT_SETTINGS, message: '保存設定を読み込めないため既定値を使用' });
      expect(storage.data.get(SETTINGS_KEY)).toBe(value);
    }
    expect(loadSettings(memory(null))).toEqual({ settings: DEFAULT_SETTINGS, message: '' });
    expect(validateSettings(DEFAULT_SETTINGS)).toBe(true);
  });

  it('S13-14: unavailable storage still starts, and a failed save keeps the old value', () => {
    expect(loadSettings(undefined).settings).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => { throw Error('denied'); } }).message).toContain('保存機能');
    const old = JSON.stringify(DEFAULT_SETTINGS), storage = memory(old, true);
    expect(saveSettings(storage, copy(x => { x.fov = 80; }))).toBe(false);
    expect(storage.data.get(SETTINGS_KEY)).toBe(old);
  });
});

describe('S13 controls follow the bindings', () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup(settings = DEFAULT_SETTINGS) {
    const canvas = {} as HTMLCanvasElement;
    const listeners = new Map<string, (e: Record<string, unknown>) => void>();
    vi.stubGlobal('document', { pointerLockElement: canvas, addEventListener: (type: string, listener: (e: Record<string, unknown>) => void) => listeners.set(type, listener) });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const runner = new SimRunner(createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'a')));
    const controls = new Controls(canvas, runner, 'p1'); controls.settings = settings;
    const key = (code: string, down = true, extra = {}) => listeners.get(down ? 'keydown' : 'keyup')!({ code, repeat: false, ...extra });
    const mouse = (button: number, down = true) => listeners.get(down ? 'mousedown' : 'mouseup')!({ button });
    const sent = (kind: string) => runner.pending.filter(c => c.kind === kind);
    const hold = (held: boolean) => { runner.state.ball = held ? { mode: 'held', owner: 'p1' } : { mode: 'absent', side: 'a', appearsAt: 1e9 }; };
    return { controls, runner, key, mouse, sent, hold, listeners };
  }

  it('S13-1: primary and secondary inputs give the same command once; overlapping presses do not repeat', () => {
    const t = setup(copy(x => { x.bindings.step = ['KeyV', 'KeyB']; }));
    t.key('KeyV'); t.key('KeyB'); t.key('KeyV', false); t.key('KeyB', false); t.key('KeyB');
    expect(t.sent('step')).toHaveLength(2);
    t.key('ShiftLeft'); expect(t.sent('step')).toHaveLength(2);
  });

  it('S13-2/S13-3: remapped movement drives move and shot keys, sent before an action in the same frame', () => {
    const t = setup(copy(x => { x.bindings.forward = ['KeyI', null]; x.bindings.back = ['KeyK', null]; x.bindings.left = ['KeyJ', null]; x.bindings.right = ['KeyL', null]; }));
    t.hold(true);
    t.key('KeyK'); t.key('KeyJ'); t.mouse(0);
    const order = t.runner.pending.map(c => c.kind);
    expect(order.indexOf('keys')).toBeLessThan(order.indexOf('primary'));
    expect(t.sent('keys').at(-1)).toMatchObject({ forward: -1, right: -1 });
    t.key('KeyW'); t.controls.update();
    expect(t.sent('keys').at(-1)).toMatchObject({ forward: -1, right: -1 });
  });

  it('S13-4: a shared input acts by held state, and holding it across a state change does not fire', () => {
    const t = setup();
    t.mouse(2); expect(t.sent('secondary')).toHaveLength(1);
    t.hold(true); t.controls.update(); expect(t.controls.ads).toBe(false);
    t.mouse(2, false); t.mouse(2); expect(t.controls.ads).toBe(true); expect(t.sent('secondary')).toHaveLength(1);
    t.mouse(0); expect(t.sent('primary').at(-1)).toMatchObject({ aim: true });
    t.mouse(2, false); expect(t.controls.ads).toBe(false);
  });

  it('S13-9: toggle ADS flips on each press and clears when the ball is lost', () => {
    const t = setup(copy(x => { x.adsMode = 'toggle'; }));
    t.hold(true);
    t.mouse(2); t.mouse(2, false); expect(t.controls.ads).toBe(true);
    t.mouse(2); t.mouse(2, false); expect(t.controls.ads).toBe(false);
    t.mouse(2); t.mouse(2, false); t.hold(false); t.controls.update(); expect(t.controls.ads).toBe(false);
  });

  it('S13-6: inputs with Ctrl/Alt/Meta never become actions', () => {
    const t = setup();
    t.key('KeyQ', true, { ctrlKey: true }); t.key('KeyC', true, { metaKey: true });
    expect(t.runner.pending).toEqual([]);
  });

  it('S13-8: sensitivity uses one mode multiplier with x/y axes and invertY flips only pitch', () => {
    const t = setup(copy(x => { x.sensitivity = { fps: 2, tps: 1, ads: 0.5, x: 1, y: 1 }; x.invertY = true; }));
    const rad = (deg: number) => deg * Math.PI / 180;
    for (const [mode, factor] of [['tps', 1], ['fps', 2]] as const) {
      t.controls.yaw = 0; t.controls.viewMode = mode;
      t.listeners.get('mousemove')!({ movementX: -100, movementY: 0 });
      expect(t.controls.yaw).toBeCloseTo(rad(4.4) * factor);
    }
    t.controls.viewMode = 'tps';
    t.listeners.get('mousemove')!({ movementX: 0, movementY: 10 });
    expect(t.controls.pitchAngle).toBeCloseTo(rad(0.44));
  });
});
