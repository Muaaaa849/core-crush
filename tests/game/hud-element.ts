/** HUDのDOM更新を検証する最小の要素。描画・配置はブラウザで検証する。 */
export function hudElement(): HTMLElement {
  let nodes: HTMLElement[] = [];
  return {
    set innerHTML(value: string) {
      nodes = [...value.matchAll(/data-hud="([^"]+)"/g)].map(match => ({
        dataset: { hud: match[1] }, style: { width: '' }, textContent: '', hidden: false,
      } as unknown as HTMLElement));
    },
    querySelectorAll: () => nodes,
    querySelector: (selector: string) => nodes.find(node => selector.includes(`"${node.dataset.hud}"`)),
    get textContent() { return nodes.filter(node => !node.hidden).map(node => node.textContent).join('\n'); },
  } as unknown as HTMLElement;
}
