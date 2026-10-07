# オンライン試遊の準備・配備手順

対象は0010の④と最小画面、0011の2026-10-07決定。ゲームはGitHub Pages、部屋はWorkers／SQLite-backed Durable Objects、必要時の中継はCloudflare Realtime TURNを使う。直接接続では相手にIPが伝わりうるため、信頼する身内だけに招待コードを渡す。

## 挙動と受け入れ条件

- 128bitの招待コードで部屋を作り、1v1は2人、1v2は3人、2v2は4人。ホストはp1・a陣、2v2の次枠はp2・a陣、残りはp3/p4・b陣。招待コードは参加権限、参加トークンは各枠の認証に使い、公開しない。
- 部屋とトークンは2時間で期限切れ。全体で同時4部屋、UTC日ごと24作成、TURN発行96回。1部屋の発行は32回、同一枠は60秒に1回。HTTP要求・WebSocket信号にも回数／サイズ制限を付ける。これらは帯域の強制上限ではない。
- ホスト開始→全リンク接続・素材ロード・同一ビルド／初期状態確認→全員のロードACK→3秒カウント。20秒で準備がそろわなければ開始せず部屋へ戻り再試行できる。参加不足・異なるビルドは開始できない。
- DataChannelはホストのスター。input/stateはunordered・再送0、eventはordered・信頼性配送。既存の100ms受付・20Hz完全状態・予測訂正を使い、画面は確定イベントで勝敗を表示する。5秒の自動再戦をせず、全員が結果確認した後に部屋へ戻る。
- TURN長期秘密はWorkerのみ。参加トークンを確認して30分TTLを発行、ブラウザは残り5分で更新しICEを再交渉。秘密なしのローカルではSTUNのみと明示。資格情報発行失敗／relay指定でTURNなし／接続期限切れでは開始しない。
- 切断時は進行停止・無効試合として部屋へ戻す最小対応。⑤の2秒／10秒監視・同一確定状態での再接続は今回の範囲外。④の実回線合格前に⑤を完了扱いにしない。

### APIと最小画面の実装契約

`POST /rooms`（mode/build）、`POST /rooms/{code}/join`（build）、`POST /rooms/{code}/ice`（Bearer参加トークン）、`GET /rooms/{code}/socket` を使う。WebSocketのトークンはURLに入れずサブプロトコルで渡す。Workerは許可Originを検査し、HTTP本文8KiB、信号40KiB、各接続の信号120件/分・合計2,000件、HTTP全体5,000件/UTC日に制限する。部屋の状態と上限はDurable Objectsに保存する。準備中の切断・期限切れ・ロード内容不一致は全員を待機へ戻す。離脱した部屋の枠は保持し、人数変更は新しい部屋で行う。

ロード内容は各端末で同じロスター・config・初期状態・プロトコルから作るSHA-256で照合する。Worker時刻の返信を使ってカウント時刻を合わせ、開始後は既存のping/pongでホストのsim時計に同期する。ホスト自身も同じクライアントの入力受付・予測訂正を使う。オンラインの結果表示は確定stateと確定match-endがそろった時だけ行い、全員の「結果を確認して部屋へ戻る」で次の開始を許可する。ローカル試遊の操作・5秒再戦は維持する。

ビルド識別子はViteビルド時にゲームソース・素材の内容から生成する。異なるビルドの参加は拒否する。`?relay=1` は試験用に全リンクをrelay強制する。資格情報更新は残り5分に1回試み、失敗時は中断する。実TURNの更新・失効と回線経路は別途未検証として扱う。

入力の移動ベクトルは送信前に長さ1へ正規化し、W+Dなどの斜め移動でも既存の通信入力検査を通す。ローカルのsimが既に行う正規化と同じ移動量を保つ。

初回接続・資格情報更新のどちらも、ローカルSDPを先に中継してからその世代のICE候補を送る。SDP確定前にブラウザが候補を生成した場合は一時的に保留し、再交渉で旧remoteDescriptionへ新しい候補を追加しない。

## 1. アカウントなしでローカル確認

PowerShellを2つ開く。どちらも `cd D:/corecrush`、初回は `npm.cmd ci`。

1つ目で `npx.cmd wrangler dev --config worker/wrangler.toml --local`。表示されたURL（通常 `http://localhost:8787`）が部屋サーバー。

2つ目で `$env:VITE_ROOM_URL='http://localhost:8787'; npm.cmd run dev`。表示されたViteのURLを2つ以上のブラウザタブで開き、部屋を作成→コードで参加→ホストが開始。秘密未設定なので「STUNのみ」と表示される。終了は各ターミナルでCtrl+C。`.wrangler`のローカル状態は配備されない。

`VITE_ROOM_URL`を設定しない場合は「オンラインは未設定」と表示し、ローカル試遊を使える。HTTPのローカルURLはlocalhostに限定し、配備先はHTTPSを使う。

## 2. ユーザーが行うこと（初回だけ）

1. [Cloudflare](https://dash.cloudflare.com/sign-up)で無料アカウントを作り、メールを確認する。独自ドメインは不要。支払情報は登録しない。
2. ダッシュボードのWorkers & Pagesを一度開き、Workersのプランが **Free** であることを確認する。PaidへのUpgradeは選ばない。SQLite Durable ObjectsはFree対応で、無料枠を超えると処理が失敗する（課金されない）。[公式料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)
3. `D:/corecrush`のPowerShellで `npx.cmd wrangler login` を実行し、開いたブラウザで許可する。ログイン情報はこのPCに保存される。

ここまで済めば、配備（下の3）は親（Claude）がこのPCで代行できる。

## 3. 配備（ログイン後、親が代行できる）

1. `npx.cmd wrangler deploy --config worker/wrangler.toml`。初回はworkers.devのサブドメイン登録を求められることがある（ダッシュボードのWorkers & Pagesで登録してもよい）。表示される `https://corecrush-rooms.<名前>.workers.dev` を控える。
2. 許可するOrigin（`ALLOWED_ORIGINS`）は `worker/wrangler.toml` に `https://muaaaa849.github.io` とローカル確認用のlocalhostを設定済み。
3. GitHubのActions変数 `VITE_ROOM_URL` にWorkerのURL（末尾パスなし）を設定する：`gh variable set VITE_ROOM_URL --body https://corecrush-rooms.<名前>.workers.dev`。公開URLなのでsecretではない。TURN秘密はここに置かない。
4. Pagesのworkflowを再実行して反映する。Pagesで部屋作成、別端末で参加し、全員ロード後のカウントを確認する。

TURNは既定で無効（`TURN_ENABLED = "false"`）。直接接続できない回線の組み合わせ（携帯回線・一部の企業網など）ではつながらない。その場合は次の4でTURNを有効にする。

## 4. TURN（必要になったらユーザーが行う）

Workers FreeとRealtime TURNの無料枠は別。TURNはSFUとの合算で月1,000GBが無料、超過時は料金が発生しうる。[公式Realtime料金](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)を有効化時に再確認する。**TURNの無料枠超過を自動停止する設定があるとは確認できていない。** 有効化はユーザーが無料範囲と停止方法を確認してから行う。

1. ダッシュボードのRealtime（旧Calls）→TURNでキーを作成する（[公式手順](https://developers.cloudflare.com/realtime/turn/generate-credentials/)）。Global API Keyは使わない。トークンをGitやGitHub変数、チャットに貼らない。
2. 次を1行ずつ実行し、入力を求められた時だけ値を貼る（コマンド行に秘密を含めない）。

```powershell
npx.cmd wrangler secret put TURN_KEY_ID --config worker/wrangler.toml
npx.cmd wrangler secret put TURN_KEY_API_TOKEN --config worker/wrangler.toml
```

3. `worker/wrangler.toml` の `TURN_ENABLED` を `"true"` にして再配備する。直接接続できる時はTURNを使わない。TURN確認は全員のURLに `?relay=1` を付けて全リンクでrelayを強制する。
4. 利用量はRealtimeの利用量画面で確認する。停止時は `TURN_ENABLED = "false"` または `ROOMS_ENABLED = "false"` にして再配備。既発行資格情報は最大30分残る。即時停止は公式手順のcredential revoke／TURNキー停止を使う。

## 検証範囲

自動テストとローカル確認は完了報告を参照。Cloudflare実アカウント、秘密登録、公開配備は実施しない。T10-29〜31のPages／別端末／別回線、relay強制の実接続、getStats候補保存、2v2の10分確定一致、資格情報期限をまたぐ更新・失効、実料金・アカウント側の上限はユーザーと後日確認する。

## 今回の検証記録（2026-10-08）

- 途中のRedを再確認し、追加したオンライン結果表示・斜め移動・SDPより早いICE候補のテストでも失敗を確認してから実装した。
- Vitest 38ファイル・608件が成功。部屋・上限・トークン・TURN発行・配送契約、3形式のオンライン接続、確定結果まで待つ動作を含む。workerを含む型検査、配信用ビルド、差分検査も成功した。
- ローカルの `wrangler dev --local` と `node tests/net/worker-local.mjs` で、作成／参加、Origin・トークン・人数・ビルドの拒否、STUNのみ、発行頻度拒否、SDP送信者の認証、ロード不一致・再試行、3秒カウント、全員の結果確認、20秒alarmを確認した。スクリプトの再実行はテスト用の新しい `--persist-to` ディレクトリを使うか、同時4部屋の期限を待つ。既存の保存データを削除する必要はない。
- 同一端末のプレビュー4タブで2v2を作成し、全3リンク×input/state/eventの9チャンネルがopen、全員ロード後のカウント、8サンプルの時計同期、P3のyaw入力のホスト確定と全員への反映、退出時の中断を確認した。非表示タブの描画停止を補うため、配送のadvanceだけを一時的なブラウザ内タイマーで駆動した。実機のフレーム進行や手触りの証拠にはしない。
- 公開URL未設定のビルドでも「オンラインは未設定」とローカル開始ボタンを確認した。プレビューのスクリーンショット取得はツールエラーのため、画像による見た目の確認・実マウス操作は未検証。
- 初回接続・資格情報更新のSDP先行送信を契約テストで確認した。実TURNでの更新・失効は未検証。
- Cloudflareの公式料金・資格情報発行資料を2026-10-08にも確認。アカウント操作、秘密登録、外部配備、コミットは行っていない。起動したローカルWorker・Vite・previewと確認用タブは終了した。
