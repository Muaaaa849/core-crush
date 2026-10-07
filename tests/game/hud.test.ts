// HUD（progress.md I4）：跳ね返しの方向ミスで、必要だった方向と入力した方向を出す。
import { describe, expect, it } from 'vitest';
import { Hud } from '../../src/game/hud';
import { defaultConfig as config } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';

describe('Hud', () => {
  it('I4: shows the required and actual gesture on a parry-direction miss', () => {
    const el = { textContent: '' } as HTMLElement;
    const hud = new Hud(el, config, 'p1');
    hud.update(createInitialState('p1'), [
      { kind: 'hit', at: 0, player: 'p1', damage: 10, position: { x: 0, y: 1, z: 0 }, required: 'right', actual: 'neutral' },
    ], 0);
    expect(el.textContent).toContain('方向ミス（必要：右へ振る／入力：振らない）');
  });

  it('I4: a plain hit has no direction message', () => {
    const el = { textContent: '' } as HTMLElement;
    new Hud(el, config, 'p1').update(createInitialState('p1'), [
      { kind: 'hit', at: 0, player: 'p1', damage: 10, position: { x: 0, y: 1, z: 0 } },
    ], 0);
    expect(el.textContent).not.toContain('方向ミス');
  });
});
