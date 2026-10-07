# 出典

> 出典：`archive/v2.0/CORE-CRUSH_企画設計書.md`（v2.0）。本ファイルが現行仕様。変更は `README.md` の変更履歴に記録する。

## 出典と確認範囲 1

本書の外部情報は2026-10-06に確認。ルールの数値と採用判断は本書の初期案であり、引用先が本作の性能や面白さを保証するものではない。

### 配信・通信
[S1a] Cloudflare Pages公式 / Limits。25MiB・ファイル数と大容量アセットの案内。
https://developers.cloudflare.com/pages/platform/limits/

[S1b] GitHub Docs / GitHub Pages limits。公開サイト1GB・帯域ソフト上限。
https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

[S2] WebRTC公式 / Peer connections、Data channels。接続情報交換とデータ送信の役割。
https://webrtc.org/getting-started/peer-connections
https://webrtc.org/getting-started/data-channels

[S3] WebRTC公式 / TURN server。直接接続できないネットワークでの中継。
https://webrtc.org/getting-started/turn-server

[S8] Cloudflare Durable Objects公式 / WebSocket server例。シグナリング用部屋サーバーの実装候補を選ぶ参考。
https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/

### 素材・操作
[S4] Kenney公式 / Animated Characters Protagonists。CC0表記と公式ZIP。同梱License.txtも確認。
https://kenney.nl/assets/animated-characters-protagonists

[S5] Adobe公式 / Mixamo FAQ。ゲームを含む利用案内。採用時はその時点の条件を確認。
https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

[S9] MDN / Pointer Lock API。マウス捕捉、利用開始操作、対応状況の確認先。
https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API

## 出典と確認範囲 2

### 制作スキル・エフェクト
[S6] Muaaaa849/hernes。確認コミット：bb21dfa64d8b0848a15158de42290777e10a1a44。
https://github.com/Muaaaa849/hernes/tree/bb21dfa64d8b0848a15158de42290777e10a1a44

静的確認した主なファイル：.claude/skills/harness-forge/SKILL.md、scripts/bin/内のharnessctl.py・hlib.py・stop_gate.py・guard.py・session_context.py・trace_tool.py・run_loop.sh、templates/verify.sh、.agents/skills/harness-forge/SKILL.md。今回のPCでのフック実行検証・headless実行検証は行っていない。

[S7] Effekseer公式 / EffekseerForWeb PackageData README。WebGL・WebGPUの配布物と再生例。採用版の固定と本作での実機検証は今後の工程。
https://github.com/effekseer/EffekseerForWeb/blob/main/PackageData/README_en.md

### 参考作品
[S10] Velan StudiosによるKnockout City紹介 / PlayStation Blog。フェイント・カーブ・ロブの参考。
https://blog.playstation.com/?p=346625

[S11] 集英社ゲームズ公式 / BAKUDO。球技を使うボスラッシュアクションの作品紹介。
https://shueisha-games.com/games/bakudo/

[S12] Slappyball公式ストアページ / Steam。叩き返す球技という参考作品の確認先。
https://store.steampowered.com/app/1482620/Slappyball/

### ローカル資料と添付資産
[L1] D:/T3test/GDD.md、arena/README.md、arena/scripts/build_arena_stage.py、arena/export/arena_stage.glb、arena/_preview/。元GDDの1v1限定・キー割当・受付の不一致は今回の依頼を優先して再設計した。
[L2] D:/T3test/core_ball/output/core_ball.glb、faces/、renders/。表紙以外の既存ステージ・コア画像はこれらの素材から引用した。

Kenney取得ZIP SHA-256：EC3787DE70FA2200256848D74201B10F6B6C3126594E9857BF989753312C2B84。取得元・ファイル一覧・ライセンスは同梱assets/kenney-protagonists/に保持。仮素材のゲーム組み込みは未実施。
