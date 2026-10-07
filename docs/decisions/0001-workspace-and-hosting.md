# 0001 作業場所と初期の配信先

- 日付：2026-10-07
- 状態：採用

## 決定

- ゲームのリポジトリは `D:/corecrush`。GitHubへpushできる構成にする。
- 初期の配信先はGitHub Pages。ビルド成果物をGitHub Actionsで公開する。
- 3D素材の原本（.blend、PNG、元のGLB/FBX）は `D:/T3test` に置いたまま変更しない。リポジトリには、原本から再生成できるWeb配信用の派生物だけを入れる。

## 理由

- ユーザー指定。
- `D:/T3test/arena/export/arena_stage.glb` は約263MiBで、GitHubの1ファイル100MB制限を超える。配信用に圧縮した派生物なら制限内に収められる。
- Git LFSのファイルはGitHub Pagesで配信されないため使わない。

## 制約と確認方法

- 派生物の1ファイルは25MiB以下にする（将来Cloudflare Pagesも比較できるように）。
- 公開サイト合計は1GB以下（GitHub Pages）。初回ロードの目標はfeel.md「品質基準」を参照。
- 自動テスト `tests/assets.test.ts` でサイズ上限を検証する。

## 覆す条件

Pagesでロード・画質・帯域の目標を満たせない場合は、platform.md「配信先」の他候補（外部アセット配信、PC版）を比較する。
