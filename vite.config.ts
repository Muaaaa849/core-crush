import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { assetVersions } from './scripts/asset-versions';

// 改行差ではビルドを分けず、ゲームソースと素材の変更を参加時に検出する。
function buildId(): string {
  const hash = createHash('sha256');
  const scan = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else { hash.update(path.replaceAll('\\', '/')); hash.update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')); }
    }
  };
  scan('src'); hash.update(JSON.stringify(assetVersions(fileURLToPath(new URL('./public/assets', import.meta.url)))));
  return hash.digest('hex');
}
// GitHub Pages はリポジトリ名のサブパスで配信されるため、相対パスでビルドする。
export default defineConfig({
  base: './',
  // 素材のURLに内容ハッシュを付ける（Pagesのキャッシュで旧ステージが残らないように）。
  define: { __ASSET_VERSIONS__: JSON.stringify(assetVersions(fileURLToPath(new URL('./public/assets', import.meta.url)))), __BUILD_ID__: JSON.stringify(buildId()) },
  build: {
    target: 'es2022',
    rolldownOptions: { input: { main: 'index.html', net: 'net.html' } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
