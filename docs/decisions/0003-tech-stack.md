# 0003 技術構成

- 日付：2026-10-07
- 状態：採用。描画バックエンド（WebGPU／WebGL2）の既定値はM0の計測後に決める

## 決定

| 用途 | 採用 |
|---|---|
| 言語・ビルド | TypeScript + Vite |
| 描画 | three.js（`three/webgpu` の WebGPURenderer。`?backend=webgl` でWebGL2バックエンドへ切り替えて比較） |
| テスト | Vitest |
| 素材の派生物生成 | glTF Transform（重複除去・未使用削除・WebP化・meshopt圧縮）、仮キャラのFBX→GLBはBlender 5.2 |
| 配信 | GitHub Pages + GitHub Actions |

## 理由

- 配信先がWeb（0001）。three.jsは既存素材のglTFとKHR_lights_punctualをそのまま読める（D:/T3test/arena/README.md）。
- WebGPURendererは一つのコードでWebGPUとWebGL2の両方を試せる。比較のために別々の描画コードを持たない。
- テクスチャはWebP（EXT_texture_webp）。KTX2はGPUメモリ面で有利だが、エンコーダ（toktx）が未導入。M0の計測でVRAMやロードが問題になったらKTX2を比較する。

## 構造の方針

- ルール（時計・球・判定）は描画・DOMに依存しない固定60Hzのコードに分け、Vitestで直接検証する（rules.md 受け入れID、process.md）。M1開始前に詳細を設計する。
- 数値はコードに散らさず、ルール用の定義データへ集約する。

## 覆す条件

- M0計測で両バックエンドとも品質目標（feel.md「品質基準」）を満たせない場合、WebGLRendererと既存ポストプロセス、またはPC版を比較する。
