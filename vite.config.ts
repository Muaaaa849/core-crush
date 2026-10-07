import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { assetVersions } from './scripts/asset-versions';

// GitHub Pages はリポジトリ名のサブパスで配信されるため、相対パスでビルドする。
export default defineConfig({
  base: './',
  // 素材のURLに内容ハッシュを付ける（Pagesのキャッシュで旧ステージが残らないように）。
  define: { __ASSET_VERSIONS__: JSON.stringify(assetVersions(fileURLToPath(new URL('./public/assets', import.meta.url)))) },
  build: {
    target: 'es2022',
    rolldownOptions: { input: { main: 'index.html', net: 'net.html' } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
