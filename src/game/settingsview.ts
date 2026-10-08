// 設定の下書きと画面（0013 M3-6）。適用するまで実行時設定・保存値を変更しない。
import {
  ACTIONS, ADS_FOV_RATIO, DEFAULT_SETTINGS, conflicts, inputStatus, saveSettings, unassigned, validateSettings,
  type ActionId, type Binding, type Settings,
} from './settings';

const STATE = { both: '両方', held: '所持', free: '非所持' };
const SLOT = ['主', '副'];

export function assignBinding(draft: Settings, action: ActionId, slot: 0 | 1, input: Binding): Settings {
  const next = structuredClone(draft); next.bindings[action][slot] = input; return next;
}

export function captureInput(input: { code?: string; button?: number; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean; isComposing?: boolean }):
  { kind: 'accept' | 'cancel' | 'reject'; input?: string; message: string } {
  if (input.code === 'Escape') return { kind: 'cancel', message: '割当の捕捉を取り消しました' };
  if (input.isComposing) return { kind: 'reject', message: 'IME入力中は割り当てできません' };
  const code = input.code ?? `Mouse${input.button}`;
  const status = input.ctrlKey || input.altKey || input.metaKey ? 'reserved' : inputStatus(code);
  if (status === 'reserved') return { kind: 'reject', message: `${code} は予約入力です（Escはメニュー、Ctrl・Alt・MetaとF1〜F12はブラウザ／OS用）` };
  if (status === 'unsupported') return { kind: 'reject', message: `${code} は未対応の入力です` };
  return { kind: 'accept', input: code, message: `${code} を割り当てました` };
}

export function bindingSummary(bindings: Settings['bindings']): { errors: string[]; shared: string[] } {
  const fields = (id: ActionId, input: string) => {
    const action = ACTIONS.find(a => a.id === id)!;
    return bindings[id].flatMap((value, slot) => value === input ? [`${action.label} ${SLOT[slot]}（${STATE[action.state]}）`] : []);
  };
  const errors = conflicts(bindings).map(c => `競合：${(c.a === c.b ? fields(c.a, c.input) : [...fields(c.a, c.input), ...fields(c.b, c.input)]).join(' / ')}：${c.input}`);
  errors.push(...unassigned(bindings).map(id => `未割当：${ACTIONS.find(a => a.id === id)!.label}（主・副とも解除）`));
  const shared: string[] = [];
  for (const a of ACTIONS.filter(a => a.state === 'held')) {
    for (const b of ACTIONS.filter(a => a.state === 'free')) {
      for (const input of new Set(bindings[a.id])) {
        if (input !== null && bindings[b.id].includes(input)) shared.push(`所持／非所持で共用：${[...fields(a.id, input), ...fields(b.id, input)].join(' / ')}：${input}`);
      }
    }
  }
  return { errors, shared };
}

export function draftStatus(draft: Settings): { canApply: boolean; message: string } {
  const { errors } = bindingSummary(draft.bindings);
  if (errors.length) return { canApply: false, message: errors.join('\n') };
  if (!validateSettings(draft)) return { canApply: false, message: '設定値が範囲外または形式不正です' };
  return { canApply: true, message: '適用できます' };
}

export function applyDraft(draft: Settings, apply: (settings: Settings) => void, storage: Pick<Storage, 'setItem'> | undefined): { applied: boolean; message: string } {
  const status = draftStatus(draft);
  if (!status.canApply) return { applied: false, message: status.message };
  const settings = structuredClone(draft); apply(settings);
  return { applied: true, message: saveSettings(storage, settings) ? '適用しました。保存済み' : 'このセッションのみ適用。保存失敗' };
}

export function directionPreview(bindings: Settings['bindings'], pressed: ReadonlySet<string>): { directions: string; forward: number; right: number; shot: string } {
  const down = (id: ActionId) => bindings[id].some(input => input !== null && pressed.has(input));
  const forward = Number(down('forward')) - Number(down('back')), right = Number(down('right')) - Number(down('left'));
  const directions = ACTIONS.slice(0, 4).filter(a => down(a.id)).map(a => a.label).join('・') || 'なし';
  const shot = forward < 0 ? '上カーブ' : right < 0 ? '左カーブ' : right > 0 ? '右カーブ' : 'ストレート';
  return { directions, forward, right, shot };
}

export function reticleStyle(reticle: Settings['reticle']): Record<string, string> {
  return {
    '--reticle-size': `${reticle.size}px`, '--reticle-color': reticle.color,
    '--reticle-bar': reticle.shape === 'cross' ? '2px' : '100%',
    '--reticle-radius': reticle.shape === 'cross' ? '0' : '50%', '--reticle-vertical': reticle.shape === 'cross' ? 'block' : 'none',
  };
}
export const effectiveVolume = (effects: Settings['effects']): number => effects.muted ? 0 : effects.volume;
export const scaleShake = (shake: { x: number; y: number }, scale: number): { x: number; y: number } =>
  ({ x: scale === 0 ? 0 : shake.x * scale, y: scale === 0 ? 0 : shake.y * scale });
export const hitEdgeOpacity = (ageMs: number, lifeMs: number, flashScale: number): number =>
  0.25 * Math.max(0, 1 - ageMs / lifeMs) * flashScale;
export function viewFov(fov: number, ads: boolean): number { return fov * (ads ? ADS_FOV_RATIO : 1); }
export function settingsStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export class SettingsView {
  private draft: Settings;
  private capture: { action: ActionId; slot: 0 | 1 } | undefined;
  private readonly pressed = new Set<string>();
  private suppressClick = false;
  private readonly form: HTMLFormElement;
  private readonly applyButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly captureStatus: HTMLElement;
  private readonly shared: HTMLElement;
  private readonly directions: HTMLElement;

  constructor(
    private readonly panel: HTMLDetailsElement,
    private readonly current: () => Settings,
    private readonly apply: (settings: Settings) => void,
    private readonly storage: () => Storage | undefined,
    private readonly release: () => void,
    private readonly message: HTMLElement,
  ) {
    this.draft = structuredClone(current());
    this.form = panel.querySelector('form')!;
    this.applyButton = panel.querySelector('#settings-apply')!;
    this.status = panel.querySelector('#settings-validation')!;
    this.captureStatus = panel.querySelector('#settings-capture')!;
    this.shared = panel.querySelector('#settings-shared')!;
    this.directions = panel.querySelector('#settings-directions')!;
    const rows = panel.querySelector('#settings-bindings')!;
    for (const action of ACTIONS) {
      const row = document.createElement('tr');
      row.innerHTML = `<th scope="row">${action.label}<small>${STATE[action.state]}</small></th>`;
      for (const slot of [0, 1] as const) {
        const cell = document.createElement('td'), bind = document.createElement('button'); bind.type = 'button';
        bind.dataset.action = action.id; bind.dataset.slot = String(slot);
        bind.setAttribute('aria-label', `${action.label} ${SLOT[slot]}の割当`);
        bind.addEventListener('click', () => {
          this.pressed.clear(); this.capture = { action: action.id, slot };
          this.captureStatus.textContent = `${action.label} ${SLOT[slot]}：次のキーかマウスボタンを押してください（Escで取消）`;
          this.refresh();
        });
        const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '解除';
        clear.setAttribute('aria-label', `${action.label} ${SLOT[slot]}を解除`);
        clear.addEventListener('click', () => { this.capture = undefined; this.draft = assignBinding(this.draft, action.id, slot, null); this.refresh(); });
        cell.append(bind, clear); row.append(cell);
      }
      rows.append(row);
      if (action.id === 'right') {
        const previewRow = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 3;
        cell.append(this.directions); previewRow.append(cell); rows.append(previewRow);
      }
    }
    panel.addEventListener('toggle', () => {
      this.release(); this.capture = undefined; this.pressed.clear(); this.suppressClick = false;
      this.draft = structuredClone(current()); this.captureStatus.textContent = ''; this.fill();
    });
    this.form.addEventListener('input', () => { this.read(); this.refresh(); });
    this.form.addEventListener('submit', e => {
      e.preventDefault(); this.capture = undefined; this.pressed.clear(); this.read();
      const result = applyDraft(this.draft, this.apply, this.storage());
      this.message.textContent = result.message; this.captureStatus.textContent = result.message; this.refresh();
    });
    panel.querySelector('#settings-cancel')!.addEventListener('click', () => this.close());
    panel.querySelector('#settings-defaults')!.addEventListener('click', () => {
      this.capture = undefined; this.pressed.clear(); this.draft = structuredClone(DEFAULT_SETTINGS);
      this.captureStatus.textContent = '下書きを既定値に戻しました（適用するまで保存しません）'; this.fill();
    });
    document.addEventListener('keydown', e => {
      if (!panel.open || e.repeat) return;
      if (this.capture) {
        const result = captureInput(e);
        if (result.kind !== 'reject' || !(e.ctrlKey || e.altKey || e.metaKey || inputStatus(e.code) === 'reserved')) e.preventDefault();
        e.stopImmediatePropagation(); this.accept(result); return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.pressed.add(e.code); this.preview();
      if (e.target === this.directions && Object.values(this.draft.bindings).some(pair => pair.includes(e.code))) e.preventDefault();
    }, true);
    document.addEventListener('keyup', e => { this.pressed.delete(e.code); this.preview(); });
    document.addEventListener('mousedown', e => {
      if (!panel.open) return;
      if (this.capture) {
        e.preventDefault(); e.stopImmediatePropagation(); this.suppressClick = e.button === 0; this.accept(captureInput(e));
      } else if (e.target === this.directions) { this.directions.focus(); this.pressed.add(`Mouse${e.button}`); this.preview(); e.preventDefault(); }
    }, true);
    document.addEventListener('mouseup', e => { this.pressed.delete(`Mouse${e.button}`); this.preview(); });
    document.addEventListener('click', e => {
      if (!this.suppressClick) return;
      this.suppressClick = false; e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    panel.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { this.capture = undefined; this.pressed.clear(); this.captureStatus.textContent = ''; this.refresh(); });
    this.fill();
  }

  close(): void {
    this.panel.open = false; this.capture = undefined; this.pressed.clear(); this.suppressClick = false;
    this.draft = structuredClone(this.current()); this.fill();
  }

  private accept(result: ReturnType<typeof captureInput>): void {
    if (result.kind === 'accept' && this.capture) this.draft = assignBinding(this.draft, this.capture.action, this.capture.slot, result.input!);
    if (result.kind !== 'reject') this.capture = undefined;
    this.captureStatus.textContent = result.message; this.refresh();
  }

  private input(id: string): HTMLInputElement { return this.panel.querySelector<HTMLInputElement>(`#settings-${id}`)!; }
  private select(id: string): HTMLSelectElement { return this.panel.querySelector<HTMLSelectElement>(`#settings-${id}`)!; }

  private fill(): void {
    const s = this.draft;
    for (const key of ['fps', 'tps', 'ads', 'x', 'y'] as const) this.input(key).value = String(s.sensitivity[key]);
    this.input('invert-y').checked = s.invertY; this.select('ads-mode').value = s.adsMode; this.input('fov').value = String(s.fov);
    this.select('reticle-shape').value = s.reticle.shape; this.input('reticle-size').value = String(s.reticle.size); this.input('reticle-color').value = s.reticle.color;
    for (const key of ['volume', 'shake', 'flash'] as const) this.input(key).value = String(s.effects[key]);
    this.input('muted').checked = s.effects.muted; this.refresh();
  }

  private read(): void {
    const s = this.draft;
    for (const key of ['fps', 'tps', 'ads', 'x', 'y'] as const) s.sensitivity[key] = this.input(key).valueAsNumber;
    s.invertY = this.input('invert-y').checked; s.adsMode = this.select('ads-mode').value as Settings['adsMode']; s.fov = this.input('fov').valueAsNumber;
    s.reticle = { shape: this.select('reticle-shape').value as Settings['reticle']['shape'], size: this.input('reticle-size').valueAsNumber, color: this.input('reticle-color').value };
    for (const key of ['volume', 'shake', 'flash'] as const) s.effects[key] = this.input(key).valueAsNumber;
    s.effects.muted = this.input('muted').checked;
  }

  private refresh(): void {
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
      const action = button.dataset.action as ActionId, slot = Number(button.dataset.slot) as 0 | 1;
      button.textContent = this.draft.bindings[action][slot] ?? '未割当';
      button.setAttribute('aria-pressed', String(this.capture?.action === action && this.capture.slot === slot));
    }
    const status = draftStatus(this.draft);
    this.applyButton.disabled = !status.canApply || !!this.capture;
    this.status.textContent = status.message; this.shared.textContent = bindingSummary(this.draft.bindings).shared.join('\n'); this.preview();
  }

  private preview(): void {
    const p = directionPreview(this.draft.bindings, this.pressed);
    this.directions.textContent = `球種確認：押下 ${p.directions} → ${p.shot}（前後 ${p.forward}／左右 ${p.right}）\nここをクリックして方向入力を確認。試合には送信しません。`;
  }
}
