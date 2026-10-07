// 配信素材（public/assets/*.glb）の内容ハッシュ。URLに付けて、更新時だけキャッシュを無効にする。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function assetVersions(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.glb'))
      .map((file) => [file.slice(0, -'.glb'.length), createHash('sha256').update(readFileSync(join(dir, file))).digest('hex').slice(0, 12)]),
  );
}
