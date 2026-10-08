import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY } from '../../src/game/settings';
import {
  applyDraft, assignBinding, bindingSummary, captureInput, directionPreview, draftStatus,
  effectiveVolume, hitEdgeOpacity, reticleStyle, scaleShake, settingsStorage, viewFov,
} from '../../src/game/settingsview';
import { effectsFor, judgement } from '../../src/game/vfx';
import { VfxView } from '../../src/game/vfxview';

const draft = () => structuredClone(DEFAULT_SETTINGS);

describe('settings draft and capture', () => {
  it('S13-14: obtaining localStorage can throw without preventing startup or a later retry', () => {
    const storage = { getItem: () => null } as unknown as Storage;
    let denied = true;
    vi.stubGlobal('window', { get localStorage() { if (denied) throw Error('denied'); return storage; } });
    try {
      expect(settingsStorage()).toBeUndefined();
      expect(loadSettings(settingsStorage())).toEqual({ settings: DEFAULT_SETTINGS, message: '設定の保存機能を利用できません（既定値を使用）' });
      denied = false; expect(settingsStorage()).toBe(storage);
    } finally { vi.unstubAllGlobals(); }
  });
  it('S13-1/12/15: changing either slot leaves runtime settings and other rows unchanged', () => {
    const original = draft();
    const next = assignBinding(original, 'skill1', 1, 'Mouse4');
    expect(next.bindings.skill1).toEqual(['KeyE', 'Mouse4']);
    expect(original).toEqual(DEFAULT_SETTINGS);
    next.effects.volume = 0.2;
    expect(original.effects.volume).toBe(1);
  });

  it('S13-5: conflicts include action names, slots, states and physical input', () => {
    const s = draft();
    s.bindings.feint[1] = 'Mouse0'; s.bindings.step[1] = 'KeyW'; s.bindings.skill1[1] = 'KeyQ';
    const { errors, shared } = bindingSummary(s.bindings);
    expect(errors.join('\n')).toContain('投球 主（所持） / 投げるフリ 副（所持）：Mouse0');
    expect(errors.join('\n')).toContain('前 主（両方） / ステップ 副（両方）：KeyW');
    expect(errors.join('\n')).toContain('ロック切替 主（両方） / 固有枠1 副（両方）：KeyQ');
    expect(shared.join('\n')).toContain('所持／非所持で共用');
    expect(shared.join('\n')).toContain('ADS 主（所持） / キャッチ 主（非所持）：Mouse2');
    expect(draftStatus(s).canApply).toBe(false);
  });

  it('S13-5: same action primary/secondary duplicates and empty actions prevent apply', () => {
    let s = assignBinding(draft(), 'forward', 1, 'KeyW');
    expect(bindingSummary(s.bindings).errors.join('\n')).toContain('前 主（両方） / 前 副（両方）：KeyW');
    s = assignBinding(s, 'forward', 1, null);
    s = assignBinding(s, 'forward', 0, null);
    expect(draftStatus(s)).toEqual({ canApply: false, message: '未割当：前（主・副とも解除）' });
    expect(draftStatus(draft())).toEqual({ canApply: true, message: '適用できます' });
  });

  it('S13-6: Escape cancels and reserved/unsupported/composing inputs explain rejection', () => {
    expect(captureInput({ code: 'Escape' })).toEqual({ kind: 'cancel', message: '割当の捕捉を取り消しました' });
    for (const code of ['F1', 'F12', 'ControlLeft', 'AltRight', 'MetaLeft']) {
      expect(captureInput({ code }).message).toContain('予約');
      expect(captureInput({ code }).kind).toBe('reject');
    }
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
      expect(captureInput({ code: 'KeyR', [modifier]: true }).message).toContain('予約');
      expect(captureInput({ button: 0, [modifier]: true }).kind).toBe('reject');
    }
    expect(captureInput({ code: 'AudioVolumeUp' }).message).toContain('未対応');
    expect(captureInput({ code: 'KeyI', isComposing: true }).message).toContain('IME');
    expect(captureInput({ code: 'ShiftLeft' })).toEqual({ kind: 'accept', input: 'ShiftLeft', message: 'ShiftLeft を割り当てました' });
    expect(captureInput({ code: 'KeyI', shiftKey: true }).kind).toBe('accept');
  });

  it('S13-7: mouse buttons 0-4 can be captured; other buttons cannot', () => {
    for (let button = 0; button <= 4; button++) expect(captureInput({ button })).toMatchObject({ kind: 'accept', input: `Mouse${button}` });
    expect(captureInput({ button: 5 }).kind).toBe('reject');
  });

  it('S13-5/13: invalid drafts never change runtime settings or storage', () => {
    const apply = vi.fn(), storage = { setItem: vi.fn() };
    const s = assignBinding(draft(), 'step', 0, 'KeyW');
    expect(applyDraft(s, apply, storage)).toMatchObject({ applied: false });
    s.bindings.step[0] = 'ShiftLeft'; s.fov = 111;
    expect(applyDraft(s, apply, storage)).toEqual({ applied: false, message: '設定値が範囲外または形式不正です' });
    expect(apply).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('S13-12/14: apply before saving, session-only failure, retry and exact reload', () => {
    const s = draft(); s.fov = 110; s.effects.flash = 0; s.bindings.skill2[1] = 'Mouse3';
    let runtime = draft(), saved = JSON.stringify(runtime), fail = true;
    const storage = {
      getItem: () => saved,
      setItem: (key: string, text: string) => {
        expect(key).toBe(SETTINGS_KEY); expect(runtime).toEqual(s);
        if (fail) throw Error('quota'); saved = text;
      },
    };
    const apply = (value: typeof s) => { runtime = value; };
    expect(applyDraft(s, apply, storage)).toEqual({ applied: true, message: 'このセッションのみ適用。保存失敗' });
    expect(runtime).toEqual(s); expect(loadSettings(storage).settings).toEqual(DEFAULT_SETTINGS);
    fail = false;
    expect(applyDraft(s, apply, storage)).toEqual({ applied: true, message: '適用しました。保存済み' });
    expect(loadSettings(storage).settings).toEqual(s);
    s.fov = 70; expect(runtime.fov).toBe(110);
    expect(applyDraft(s, apply, undefined).message).toBe('このセッションのみ適用。保存失敗');
  });

  it('S13-2: remapped direction preview cancels opposing keys and ignores old WASD', () => {
    const s = draft();
    s.bindings.forward = ['KeyI', 'ArrowUp']; s.bindings.back = ['KeyK', null];
    s.bindings.left = ['KeyJ', null]; s.bindings.right = ['KeyL', null];
    const preview = (...keys: string[]) => directionPreview(s.bindings, new Set(keys));
    expect(preview('KeyK', 'KeyJ')).toEqual({ directions: '後・左', forward: -1, right: -1, shot: '上カーブ' });
    expect(preview('KeyI', 'KeyK', 'KeyJ')).toMatchObject({ forward: 0, right: -1, shot: '左カーブ' });
    expect(preview('KeyJ', 'KeyL')).toMatchObject({ forward: 0, right: 0, shot: 'ストレート' });
    expect(preview('KeyI', 'ArrowUp')).toMatchObject({ forward: 1 });
    expect(preview('KeyW', 'KeyS', 'KeyA', 'KeyD')).toMatchObject({ directions: 'なし', forward: 0, right: 0 });
  });
});

describe('display and effects settings', () => {
  it('S13-11: hit edge opacity changes for a residual hit and vanishes at zero or expiry', () => {
    expect(hitEdgeOpacity(0, 120, 1)).toBe(0.25);
    expect(hitEdgeOpacity(60, 120, 0.5)).toBe(0.0625);
    expect(hitEdgeOpacity(60, 120, 0)).toBe(0);
    expect(hitEdgeOpacity(120, 120, 1)).toBe(0);
    expect(hitEdgeOpacity(180, 120, 1)).toBe(0);
  });
  it('S13-10: FOV keeps the configured value in both camera modes and applies the ADS ratio', () => {
    for (const fov of [70, 90, 110]) {
      expect(viewFov(fov, false)).toBe(fov);
      expect(viewFov(fov, true)).toBeCloseTo(fov * 75 / 90);
    }
  });

  it('S13-10: reticle CSS restores cross/dot, full size and color', () => {
    expect(reticleStyle({ shape: 'cross', size: 24, color: '#12AB34' })).toEqual({
      '--reticle-size': '24px', '--reticle-color': '#12AB34', '--reticle-bar': '2px',
      '--reticle-radius': '0', '--reticle-vertical': 'block',
    });
    expect(reticleStyle({ shape: 'dot', size: 4, color: '#FFFFFF' })).toMatchObject({
      '--reticle-size': '4px', '--reticle-bar': '100%', '--reticle-radius': '50%', '--reticle-vertical': 'none',
    });
  });

  it('S13-11: zero volume and mute yield zero, unmute restores volume, shake scales only displacement', () => {
    const e = { volume: 0.35, muted: false, shake: 0, flash: 0 };
    expect(effectiveVolume(e)).toBe(0.35);
    e.muted = true; expect(effectiveVolume(e)).toBe(0);
    e.muted = false; e.volume = 0; expect(effectiveVolume(e)).toBe(0);
    expect(scaleShake({ x: 0.8, y: -0.4 }, 0)).toEqual({ x: 0, y: 0 });
    expect(scaleShake({ x: 0.8, y: -0.4 }, 0.5)).toEqual({ x: 0.4, y: -0.2 });
  });

  it('S13-11: turning off flash removes residual brightness but keeps rings and judgement', () => {
    const scene = new THREE.Scene(), view = new VfxView(scene, 0.3), camera = new THREE.PerspectiveCamera();
    const event = { kind: 'explosion' as const, at: 0, side: 'a' as const, position: { x: 0, y: 1, z: 0 } };
    const effects = effectsFor(event, 0, true);
    view.update(effects, 20, camera, 1);
    const flash = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    expect(flash.visible).toBe(true);
    const brightness = flash.material.color.r;
    view.update(effects, 20, camera, 0.5); expect(flash.material.color.r).toBeCloseTo(brightness * 0.5);
    view.update(effects, 20, camera, 0); expect(flash.visible).toBe(false); expect(flash.material.color.r).toBe(0);
    expect(scene.children.find(child => child instanceof THREE.LineSegments)?.visible).toBe(true);
    expect(effectsFor(event, 0, false).map(e => e.kind)).toEqual(['debris', 'ring']);
    const parry = { kind: 'parry' as const, at: 0, rallySpeed: 1, player: 'p1' as const, grade: 'good' as const, position: event.position };
    expect(judgement(parry, 'p1', [{ id: 'p1', side: 'a' }])?.text).toBe('GOOD 跳ね返し');
    view.update(effects, 100, camera, 1); expect(flash.visible).toBe(false);
  });
});
