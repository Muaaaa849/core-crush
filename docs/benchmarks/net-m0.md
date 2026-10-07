# M0 通信の小実証

## 実装する範囲と受け入れ条件

- 同一ページの2つの `RTCPeerConnection` を、ICE候補を含むSDPのページ内交換で接続する。外部シグナリング、STUN、TURNは使わない。
- `state` は `ordered: false, maxRetransmits: 0`、`event` は `ordered: true`（再送回数の制限なし）。
- 各チャンネルでN回（初期値100、1〜1000）のpingを順に送信し、応答のRTTを `performance.now()` で計測する。各pingは1秒でタイムアウトし、未応答件数を別に表示する。
- 応答分のnearest-rank p50/p95（ms）を表示し、応答がなければnullとする。結果と実際のチャンネル設定を `window.__corecrushNet` に公開する。
- 接続待ちは時間制限を設け、成功・失敗のどちらでも接続を閉じる。再計測できる。

## 実行方法

`npm run dev` 後に `/net.html` を開き、回数を入力して「計測開始」を押す。
並行作業時は `npm run dev -- --port 5174 --strictPort` とし、`http://localhost:5174/net.html` を開く。
同一端末内の往復であり、インターネット越しの遅延・損失・TURN経由の性能や対戦同期の証明ではない。これらはM2で扱う。

## Pages 配備（M0-6）

`.github/workflows/pages.yml` はmainへのpushでNode 24を使い、`npm ci` → `npm run check` → `npm test` → `npm run build` → `dist/` のアップロード・配備を行う。
GitHub側のPagesのSourceはGitHub Actionsとする。`public/assets/` の派生物はリポジトリにコミットして使い、CIでは素材を再生成しない。`base: './'` を維持し、ゲームと通信デモの2ページをビルドする。
2026-10-07に公式の利用例でmajorを確認：checkout/setup-nodeは[v7](https://github.com/actions/setup-node)、upload-pages-artifactは[v3](https://github.com/actions/upload-pages-artifact)、deploy-pagesは[v4](https://github.com/actions/deploy-pages)。

## 検証記録

2026-10-07、Windows上のT3 Code内蔵ブラウザ（Chromium 152.0.7977.130 / Electron 44.4.2）で実測。開発サーバーと `npx.cmd vite preview --port 5174 --strictPort` のビルド成果物の両方で、各100回の応答と実際のチャンネル設定、表示と `window.__corecrushNet` の一致を確認した。

ビルド成果物での単発計測（表示用に小数第2位まで丸めて記録）：

| チャンネル | 送信 / 応答 | タイムアウト | RTT p50 (ms) | RTT p95 (ms) |
|---|---|---|---|---|
| state | 100 / 100 | 0 | 0.20 | 0.40 |
| event | 100 / 100 | 0 | 0.20 | 0.40 |

- 開発版で再計測し、検証用にstateの1回を送信せず、2回中1回がタイムアウト・残る1回だけが百分位に入ることを確認。これは実ネットワークの損失測定ではない。
- 接続情報の設定を検証用に失敗させ、エラー表示と再実行ボタンの復帰を確認。成功・失敗の両方で2つの接続が `closed` になることを確認。
- `npx.cmd vitest run tests/net.test.ts` は実装前にモジュール未実装で失敗（Red）、実装後は4テスト成功。
- `npx.cmd tsc --noEmit`、`npx.cmd vitest run`（3ファイル・18テスト）、`npx.cmd vite build` が成功。ビルドは既存ゲームの500kB超チャンク警告あり。`index.html` と `net.html` を生成し、通信ページのスクリプトは `./assets/` への相対参照。
- GitHub Actionsの実行・GitHub Pagesへの公開、別端末間通信、接続待ちの時間切れ、実ネットワークの遅延・損失は未検証。使用した5174のサーバーは終了済み。
