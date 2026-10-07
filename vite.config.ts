import { defineConfig } from 'vitest/config';

// GitHub Pages はリポジトリ名のサブパスで配信されるため、相対パスでビルドする。
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: { input: { main: 'index.html', net: 'net.html' } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
