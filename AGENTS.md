# CORE-CRUSH — エージェント作業ルール

## 正本

- 現行仕様：`docs/design/README.md` から各章へ。`docs/design/archive/` は履歴資料で、実装の根拠にしない。
- 現在地：`docs/progress.md`。判断の記録：`docs/decisions/`。素材：`docs/assets.md`。
- 3D素材の原本は `D:/T3test`。このリポジトリからは変更しない。

## 守る体験

品質の優先順位：入力と判定の納得感 → 球の読みやすさ → 打撃の爽快感 → キャラクター性 → 背景の豪華さ。

## 作業の流れ

1. 開始時に `docs/progress.md`、該当章、直近の決定を読み、リポジトリの現状を確認する。
2. 挙動を変える作業は「資料更新 → 受け入れテストを実行してRed確認 → 最小実装 → Green → 整理後に関連検証」。
3. 仕様（要件）を変える場合は企画変更として `docs/design/README.md` の変更履歴と `docs/decisions/` に記録する。
4. 終了時に `docs/progress.md` へ「変えたこと／実行した検証と証拠／未検証／次の一手」を書く。実行していない検証を成功と書かない。

## 構成

- `src/` ゲーム本体（TypeScript + three.js）。ルールは描画・DOMに依存させない。
- `tests/` Vitest。
- `scripts/assets/` 原本から `public/assets/` の派生物を作るスクリプト。
- `art/` リポジトリに同梱する原本素材（CC0の仮キャラ）。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run check` | 型検査 |
| `npm test` | テスト |
| `npm run build` | 配信用ビルド（`dist/`） |
| `npm run assets` | 派生素材の再生成（`D:/T3test` と Blender 5.2 が必要） |

## 禁止

- 旧仕様・旧形式のための互換レイヤーやフォールバックを追加しない。
- 25MiBを超える単一ファイル、Git LFSのファイルを `public/` に入れない（GitHub Pagesで配信できない）。
- 公開・push・課金を伴う操作は、ユーザーの指示なしに行わない。
