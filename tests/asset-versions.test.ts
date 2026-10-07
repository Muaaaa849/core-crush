// 配信素材のURLに内容のハッシュを付け、更新後に古いキャッシュ（Pagesは10分）を使わないようにする。
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetVersions } from '../scripts/asset-versions';

describe('assetVersions', () => {
  it('maps each glb and webp to a short content hash that changes only when the content changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assets-'));
    writeFileSync(join(dir, 'stage.glb'), 'A');
    writeFileSync(join(dir, 'core_ball.glb'), 'B');
    writeFileSync(join(dir, 'lcd_2_rage_mask.webp'), 'C');
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    const first = assetVersions(dir);
    expect(Object.keys(first).sort()).toEqual(['core_ball', 'lcd_2_rage_mask', 'stage']);
    expect(first.stage).toMatch(/^[0-9a-f]{12}$/);
    expect(assetVersions(dir)).toEqual(first);
    writeFileSync(join(dir, 'stage.glb'), 'A2');
    const second = assetVersions(dir);
    expect(second.stage).not.toBe(first.stage);
    expect(second.core_ball).toBe(first.core_ball);
    expect(second.lcd_2_rage_mask).toBe(first.lcd_2_rage_mask);
    writeFileSync(join(dir, 'lcd_2_rage_mask.webp'), 'C2');
    const third = assetVersions(dir);
    expect(third.lcd_2_rage_mask).not.toBe(second.lcd_2_rage_mask);
    expect(third.stage).toBe(second.stage);
  });
});
