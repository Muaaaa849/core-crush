# 現在地

## 今の工程：M1 一往復の芯

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
| M0-4 | 達成 | 表示はプレビューの画像で確認。マウス捕捉・WASD移動・視点操作はユーザーが実ブラウザで確認（2026-10-07、スクリーンショット受領） |
| M0-5 | 達成（自動計測のみ） | `docs/benchmarks/m0.md`。1080pでWebGPU p95 7.1ms／WebGL2 p95 5.7ms（GPU完了待ちの逐次描画）。実表示のフレーム時間は未計測 |
| M0-6 | 達成 | `.github/workflows/pages.yml` が成功し公開済み：https://muaaaa849.github.io/core-crush/ （リポジトリ Muaaaa849/core-crush）。公開版でステージ・試合球・仮キャラの表示を確認、ステージ読み込み1.5秒（この端末・この回線） |
| 通信の小実証 | 達成（同一端末内） | `net.html`、`docs/benchmarks/net-m0.md`。DataChannel state/event とも p50 0.20ms。インターネット越しは未検証 |

## 分担の記録

- GPT-6 Astra：M1のsim設計（`docs/decisions/0004-m1-sim-architecture.md`）
- GPT-6.1 Sol：Pagesワークフローと通信の小実証（`.github/workflows/pages.yml`、`net.html`、`src/net/`、`tests/net.test.ts`）
- 親（Claude Opus 5.5）：資料、素材パイプライン、描画、計測、統合

## 未検証・残作業

- 実表示のフレーム時間
- カメラを遮る物体の半透明化：自動確認ではカメラがケージ外（z=15.3m）のとき12物体が半透明になることを確認。見た目はユーザー確認待ち

## 次の一手

1. M1スライス3：追尾3球種・接触判定・ステップによる追尾解除（R03/R04、決定0005）。
2. 以後：防御 R05 → ジェスチャー → フリ R06 → カメラ R07 → 再実行、描画への接続。

## M1の進捗

| スライス | 状態 | 証拠 |
|---|---|---|
| 1 sim土台と危険時計（R01/R02の時計部分） | 達成 | `src/sim/`、`tests/sim/danger.test.ts`（15件）。初期球・保持・7.8秒投擲の自陣爆発・7.999秒通過・同時刻は爆発優先・tick内の通過時刻・新球の計2秒・30/60/144fps相当の入力まとめ方で一致。実装はGPT-6.1 Sol、親がレビューし通過時刻の整数丸めを修正 |
| 2 ステップ・資源・球召喚（R08、R01の召喚） | 達成 | `tests/sim/resources.test.ts`（41件）。能力値からのHP・歩行・回復秒、ステップ2.8m/12F・全体18F・方向分類（同値は前後、P2は鏡映）、壁で動けなければ消費なし、相手陣滞在中だけ回復・1点ずつ・満タン時の余剰なし・通過時刻で切替、召喚は自陣の非攻撃球のみで時計不変、同時刻の行動優先順。実装はSol、親がプレイエリア拡大に合わせて範囲を変更 |
| 描画への接続 | 未着手 | M0の `src/player.ts` はsim接続時に置き換える |
