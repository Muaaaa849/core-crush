import { defineConfig } from 'vitest/config';

// 90条件は通常のテスト収集から分ける。依存追加なしで同じTS実行環境を使う。
export default defineConfig({ test: { include: ['tests/net/netbench.ts'], testTimeout: 600_000 } });
