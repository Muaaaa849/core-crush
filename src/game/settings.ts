// 設定（0013 M3-6）：割当・感度・ADS・FOV・レティクル・演出を1つのオブジェクトで持ち、厳密に検査して保存する。
// 不正な保存値は部分補完・移行をせず、全体を既定値にする。

export type ActionId = 'forward' | 'back' | 'left' | 'right' | 'step' | 'summon' | 'cycle-target'
  | 'throw' | 'parry' | 'ads' | 'catch' | 'feint' | 'skill1' | 'skill2';
/** 'held'：自分が球を持つ間だけ、'free'：持たない間だけ、'both'：常に。 */
export type ActionState = 'both' | 'held' | 'free';
/** 物理入力。キーボードは KeyboardEvent.code、マウスは 'Mouse0'〜'Mouse4'。 */
export type Binding = string | null;

export const ACTIONS: readonly { id: ActionId; label: string; state: ActionState }[] = [
  { id: 'forward', label: '前', state: 'both' }, { id: 'back', label: '後', state: 'both' },
  { id: 'left', label: '左', state: 'both' }, { id: 'right', label: '右', state: 'both' },
  { id: 'step', label: 'ステップ', state: 'both' }, { id: 'summon', label: '球召喚', state: 'both' },
  { id: 'cycle-target', label: 'ロック切替', state: 'both' },
  { id: 'throw', label: '投球', state: 'held' }, { id: 'parry', label: '跳ね返し', state: 'free' },
  { id: 'ads', label: 'ADS', state: 'held' }, { id: 'catch', label: 'キャッチ', state: 'free' },
  { id: 'feint', label: '投げるフリ', state: 'held' },
  { id: 'skill1', label: '固有枠1', state: 'both' }, { id: 'skill2', label: '固有枠2', state: 'both' },
];

export interface Settings {
  version: 1;
  bindings: Record<ActionId, [Binding, Binding]>;
  sensitivity: { fps: number; tps: number; ads: number; x: number; y: number };
  invertY: boolean;
  adsMode: 'hold' | 'toggle';
  fov: number;
  reticle: { shape: 'cross' | 'dot'; size: number; color: string };
  effects: { volume: number; muted: boolean; shake: number; flash: number };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  bindings: {
    forward: ['KeyW', null], back: ['KeyS', null], left: ['KeyA', null], right: ['KeyD', null],
    step: ['ShiftLeft', null], summon: ['KeyC', null], 'cycle-target': ['KeyQ', null],
    throw: ['Mouse0', null], parry: ['Mouse0', null], ads: ['Mouse2', null], catch: ['Mouse2', null],
    feint: ['KeyF', null], skill1: ['KeyE', null], skill2: ['KeyR', null],
  },
  sensitivity: { fps: 1, tps: 1, ads: 1, x: 1, y: 1 },
  invertY: false,
  adsMode: 'hold',
  fov: 90,
  reticle: { shape: 'cross', size: 12, color: '#FFFFFF' },
  effects: { volume: 1, muted: false, shake: 1, flash: 1 },
};
export const SETTINGS_KEY = 'corecrush-settings';
export const ADS_FOV_RATIO = 75 / 90;

const SUPPORTED = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `Key${c}`),
  ...'0123456789'.split('').flatMap(d => [`Digit${d}`, `Numpad${d}`]),
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
  'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'IntlBackslash', 'IntlRo', 'IntlYen',
  'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'NumpadEnter',
  'Mouse0', 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4',
]);
/** Esc（メニュー）、F1〜F12、Ctrl・Alt・Meta はブラウザ・OSの操作と衝突するので割り当てない。 */
export function inputStatus(code: string): 'ok' | 'reserved' | 'unsupported' {
  if (code === 'Escape' || /^F([1-9]|1[0-2])$/.test(code) || /^(Control|Alt|Meta)(Left|Right)$/.test(code)) return 'reserved';
  return SUPPORTED.has(code) ? 'ok' : 'unsupported';
}

const overlaps = (a: ActionState, b: ActionState) => a === 'both' || b === 'both' || a === b;
/** 同じ所持状態で同じ入力を持つ行動の組。同じ行動の主副が同じ入力の場合も含む。 */
export function conflicts(bindings: Settings['bindings']): { a: ActionId; b: ActionId; input: string }[] {
  const found: { a: ActionId; b: ActionId; input: string }[] = [];
  ACTIONS.forEach((a, i) => {
    const [p, s] = bindings[a.id];
    if (p !== null && p === s) found.push({ a: a.id, b: a.id, input: p });
    for (const b of ACTIONS.slice(i + 1)) {
      if (!overlaps(a.state, b.state)) continue;
      for (const input of new Set(bindings[a.id].filter(x => x !== null))) {
        if (bindings[b.id].includes(input)) found.push({ a: a.id, b: b.id, input: input! });
      }
    }
  });
  return found;
}
export const unassigned = (bindings: Settings['bindings']): ActionId[] =>
  ACTIONS.filter(a => bindings[a.id][0] === null && bindings[a.id][1] === null).map(a => a.id);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const exactKeys = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
  isObject(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const inRange = (v: unknown, low: number, high: number) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;

/** 現在の形式・範囲・割当（競合と未割当なし）をすべて満たすときだけtrue。 */
export function validateSettings(v: unknown): v is Settings {
  if (!exactKeys(v, Object.keys(DEFAULT_SETTINGS)) || v.version !== 1) return false;
  const b = v.bindings;
  if (!exactKeys(b, ACTIONS.map(a => a.id))) return false;
  for (const pair of Object.values(b)) {
    if (!Array.isArray(pair) || pair.length !== 2) return false;
    if (!pair.every(x => x === null || typeof x === 'string' && inputStatus(x) === 'ok')) return false;
  }
  const bindings = b as Settings['bindings'];
  if (conflicts(bindings).length || unassigned(bindings).length) return false;
  const s = v.sensitivity, r = v.reticle, e = v.effects;
  return exactKeys(s, ['fps', 'tps', 'ads', 'x', 'y'])
    && ['fps', 'tps', 'ads'].every(k => inRange(s[k], 0.1, 5)) && inRange(s.x, 0.1, 3) && inRange(s.y, 0.1, 3)
    && typeof v.invertY === 'boolean' && (v.adsMode === 'hold' || v.adsMode === 'toggle') && inRange(v.fov, 70, 110)
    && exactKeys(r, ['shape', 'size', 'color']) && (r.shape === 'cross' || r.shape === 'dot') && inRange(r.size, 4, 24)
    && typeof r.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r.color)
    && exactKeys(e, ['volume', 'muted', 'shake', 'flash']) && inRange(e.volume, 0, 1) && typeof e.muted === 'boolean'
    && inRange(e.shake, 0, 1) && inRange(e.flash, 0, 1);
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): { settings: Settings; message: string } {
  const fallback = (message: string) => ({ settings: structuredClone(DEFAULT_SETTINGS), message });
  let text: string | null;
  try {
    if (!storage) return fallback('設定の保存機能を利用できません（既定値を使用）');
    text = storage.getItem(SETTINGS_KEY);
  } catch { return fallback('設定の保存機能を利用できません（既定値を使用）'); }
  if (text === null) return fallback('');
  try {
    const value: unknown = JSON.parse(text);
    if (validateSettings(value)) return { settings: value, message: '' };
  } catch { /* 壊れたJSONは下で既定値にする。保存値は消さない。 */ }
  return fallback('保存設定を読み込めないため既定値を使用');
}

/** 保存できたらtrue。失敗しても以前の保存値は消さない。 */
export function saveSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: Settings): boolean {
  try { storage!.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
