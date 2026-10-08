export type Screen = 'title' | 'menu' | 'local' | 'online' | 'settings' | 'pause';
export const backScreen = (screen: Screen, settingsEntry: Screen): Screen =>
  screen === 'settings' ? settingsEntry : screen === 'menu' ? 'title' : 'menu';

/** 画面の表示だけを切り替える。試合・部屋・設定の状態は呼び出し元が持つ。 */
export class Screens {
  private current: Screen = 'title';
  private settingsEntry: Screen = 'menu';
  constructor(private readonly root: HTMLElement, private readonly closeSettings: () => void,
    private readonly release: () => void) {
    root.querySelector('#title-enter')!.addEventListener('click', () => this.show('menu'));
    root.querySelectorAll<HTMLElement>('[data-open-screen]').forEach(button =>
      button.addEventListener('click', () => this.show(button.dataset.openScreen as Screen)));
    root.querySelector('#screen-back')!.addEventListener('click', () => this.back());
    root.querySelector('#settings-cancel')!.addEventListener('click', () => this.back());
    this.show('title');
  }
  back(): void { this.show(backScreen(this.current, this.settingsEntry)); }
  show(screen: Screen): void {
    this.release();
    if (screen === 'settings' && this.current !== 'settings') this.settingsEntry = this.current;
    if (this.current === 'settings' && screen !== 'settings') this.closeSettings();
    this.current = screen; this.root.dataset.screen = screen;
    this.root.scrollTop = 0;
    this.root.querySelectorAll<HTMLElement>('[data-screen-panel]').forEach(panel => {
      panel.hidden = panel.dataset.screenPanel !== screen;
    });
    const back = this.root.querySelector<HTMLButtonElement>('#screen-back')!;
    back.hidden = screen === 'title' || screen === 'pause';
    const settings = this.root.querySelector<HTMLDetailsElement>('#settings')!;
    settings.open = screen === 'settings';
    const picker = this.root.querySelector('#character')!;
    if (screen === 'local' || screen === 'online') this.root.querySelector(`[data-screen-panel="${screen}"] [data-character-host]`)!.append(picker);
    const actions = this.root.querySelector<HTMLElement>('#play-actions')!;
    actions.hidden = !['local', 'online', 'pause'].includes(screen);
    if (!actions.hidden) this.root.querySelector(screen === 'pause' ? '#resume-host' : `[data-screen-panel="${screen}"]`)!.append(actions);
    this.root.hidden = false;
    const heading = this.root.querySelector<HTMLElement>(`[data-screen-panel="${screen}"] h1, [data-screen-panel="${screen}"] h2`);
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
}
