# 現在地

## 今の工程：M0 検証環境（ほぼ完了）→ M1 準備

v2.0のM0（rules.md「開発順序と受け入れID」）のうち、今回の範囲は「既存素材の表示、仮キャラ、入力、配信の土台、性能計測、通信の小実証（同一端末内）」。

### M0 受け入れ条件

| ID | 期待する状態 | 証拠 |
|---|---|---|
| M0-1 | `npm run assets` で原本から `public/assets/` の stage / core_ball / character を生成でき、各25MiB以下 | `tests/assets.test.ts` |
| M0-2 | core_ball.glb に液晶材質 `M_LCD`、character.glb にアニメーション idle / run / jump、stage.glb にライトがあり、競技エリア内に展示用コアがない | `tests/assets.test.ts` |
| M0-3 | `npm run check`（型検査）・`npm test`・`npm run build` が成功 | コマンド結果 |
| M0-4 | ブラウザでステージ・試合球・仮キャラが表示され、「プレイ開始」でマウス捕捉、WASD移動と視点操作ができる | 画面の確認と画像 |
| M0-5 | `?backend=webgpu` / `?backend=webgl` で描画を切り替え、計測表示（読み込み時間、フレーム時間p50/p95/p99、描画呼び出し数、三角形数、GPU名）を出せる。結果を `docs/benchmarks/m0.md` に記録 | 計測表示と記録 |
| M0-6 | GitHub Pages用のActionsワークフローがあり、相対パスで動くビルドになっている | ワークフローとビルド結果。公開は未実施なら未実施と書く |

## M0の結果（2026-10-07）

| ID | 状態 | 証拠・備考 |
|---|---|---|
| M0-1 | 達成 | `npm run assets` で生成。stage 20.60 MiB、core_ball 0.55 MiB、character 0.15 MiB。`tests/assets.test.ts` |
| M0-2 | 達成 | `tests/assets.test.ts`（LCD材質、アニメーション3種が実際の動作であること、キャラ材質が不透明で肌テクスチャ付き、ステージのライト、展示用コアの除去） |
| M0-3 | 達成 | `npm run check`、`npm test`（18件）、`npm run build` 成功 |
| M0-4 | 一部 | 表示（ステージ・試合球・仮キャラの待機アニメーション）はプレビューの画像で確認。**マウス捕捉・WASD移動・視点操作は未確認**（プレビュー内の自動クリックでは捕捉が拒否される）。失敗時の再試行案内は表示を確認 |
| M0-5 | 達成（自動計測のみ） | `docs/benchmarks/m0.md`。1080pでWebGPU p95 7.1ms／WebGL2 p95 5.7ms（GPU完了待ちの逐次描画）。実表示のフレーム時間は未計測 |
| M0-6 | 達成 | `.github/workflows/pages.yml` が成功し公開済み：https://muaaaa849.github.io/core-crush/ （リポジトリ Muaaaa849/core-crush）。公開版でステージ・試合球・仮キャラの表示を確認、ステージ読み込み1.5秒（この端末・この回線） |
| 通信の小実証 | 達成（同一端末内） | `net.html`、`docs/benchmarks/net-m0.md`。DataChannel state/event とも p50 0.20ms。インターネット越しは未検証 |

## 分担の記録

- GPT-6 Astra：M1のsim設計（`docs/decisions/0004-m1-sim-architecture.md`）
- GPT-6.1 Sol：Pagesワークフローと通信の小実証（`.github/workflows/pages.yml`、`net.html`、`src/net/`、`tests/net.test.ts`）
- 親（Claude Opus 5.5）：資料、素材パイプライン、描画、計測、統合

## 未検証・残作業

- ユーザーの実ブラウザでのマウス捕捉・移動・視点、実表示のフレーム時間

## 次の一手

1. M1：`tests/sim/danger.test.ts`（R01/R02）からRed-firstで始める（rules.md「M1細則」と0004に従う）。
