# 素材の所在・ライセンス・再生成手順

## 原則

- 3D素材の原本は `D:/T3test` に置き、このリポジトリからは変更しない。
- リポジトリにはWeb配信用の派生物（`public/assets/`）と、それを作るスクリプトだけを入れる。
- 派生物は `npm run assets` で原本から再生成できる。原本の場所は環境変数 `CORECRUSH_ASSET_SRC`（既定 `D:/T3test`）で変える。

## 原本（確認済 2026-10-06〜07）

| 原本 | 内容 | 備考 |
|---|---|---|
| `D:/T3test/arena/export/arena_stage.glb` | 組立済みステージ。275,461,096 bytes（262.70MiB）。109画像（約257MiB）、72 meshes、KHR_lights_punctual 28灯、発射装置・ドローンのアニメーション | 画像がファイルの約98% |
| `D:/T3test/arena/manifest.json` | アセットごとの三角形数など。ステージ 228,404 tris | `arena/README.md` の数値（151,068 tris 等）は古く、manifest と一致しない |
| `D:/T3test/arena/README.md` | 単位・軸・材質命名（`MB_`/`MT_`/`MFX_`）・コート配置 | コート：片側10×12m、y<0がP1側、y>0がP2側、プラズマフェンスはy=0 |
| `D:/T3test/core_ball/output/core_ball.glb` | **試合球の第一候補**。2.84MiB、液晶材質 `M_LCD` | 表情 calm／panic／rage のマスクは `core_ball/output/faces/` |
| `D:/T3test/arena/export/core_ball.glb` | 展示用コア（`MB_core_ball`、`MFX_core_lcd`）。約17MiB | 試合球と二重に置かない |
| `art/kenney-protagonists/` | 仮キャラ。Kenney Animated Characters Protagonists（CC0）。`characterMedium.fbx`、idle/run/jump、スキン4種 | 本リポジトリに同梱。来歴は同フォルダの `SOURCE.md`。ZIP SHA-256 `EC3787DE70FA2200256848D74201B10F6B6C3126594E9857BF989753312C2B84` |

ステージ内の展示用コアの扱い：試合球は `core_ball/output/core_ball.glb` だけにし、ステージ内のコア配置は競技エリアに出さない（v2.0「既存素材の確認結果」）。

## 派生物（`public/assets/`）

| 派生物 | 元 | 処理 |
|---|---|---|
| `stage.glb` | 原本の部材GLB＋複製した生成スクリプト（`scripts/assets/arena/`）で床・中央フェンス・トラスを拡大寸法で再生成し、Blenderで再組立（`.cache/arena/`、決定0006） | 競技エリア内の展示用コアを除去 → 重複除去・未使用削除 → テクスチャをWebP化 → meshopt圧縮 |
| `core_ball.glb` | `core_ball/output/core_ball.glb` | テクスチャをWebP化 → meshopt圧縮 |
| `lcd_0_calm_mask.webp` / `lcd_1_panic_mask.webp` / `lcd_2_rage_mask.webp` | `core_ball/output/faces/` の同名PNG | 48×30のR（顔）・G（亀裂）を保持するlossless WebP化 |
| `portrait_<id>.webp`（volt / echo / anchor / switch） | `art/concepts/characters/<id>/front.webp` | sharpで高さ512px・品質82。`node scripts/assets/build.mjs --portraits`で単独生成。ハッシュ付きURLで配信 |
| `character.glb` | `art/kenney-protagonists`（characterMedium.fbx + cyborgFemaleA.png + idle/run/jump） | Blender 5.2でGLB化（アニメーション名 idle / run / jump） |

### 取り込み時の注意（確認済）

- `M_LCD` は `CORE_LCD` のUV 0〜1を使う。GLBの発光画像はcalmのマスクだけで、Blenderの表情切り替え・色合成は残っていない。原本マスクのRが顔、Gが亀裂（rageのみ）、Bは0。色の参考は原本の `*_preview.png`。
- 顔表示：危険時計の経過を `dangerDuration - (danger.expiresAt - now)` で求め、0〜3秒未満はcalm（水色）、3〜5秒未満はpanic（オレンジ）、5秒以降はrage（赤）。7秒以降だけGの亀裂を白く発光させる。3枚を事前に読み、表情・亀裂が変わったときだけ材質の値を更新する。開始前・危険時計なし・球なし・結果表示はcalmとし、球なしの非表示は既存処理に従う。simと警告音は変更しない。
- 確認済（2026-10-08）：`npm run assets` で3枚のlossless WebP（92／148／176 bytes）を生成。境界・停止・リセットの純粋関数テスト10件と派生マスク検証3件を含む全644テスト、型検査、ビルドが成功。WebGPUのローカルプレビューで時刻を固定し、3表情・6.999秒で亀裂なし・7秒で亀裂あり・時計停止時のcalm復帰を接写画像で確認。WebGLでもrageと亀裂の描画、ハッシュ付きマスクURLを確認。通常の対戦距離での読みやすさは人間の試遊で未確認。
- ステージのライト（KHR_lights_punctual）はBlenderの書き出しでW×683に換算されている。three.jsでは読み込み時に1/683倍してBlenderと同じ明るさにする（`src/main.ts`）。
- Kenneyのモデル（characterMedium.fbx）の材質は画像ノードを持たず、Alpha=0で読み込まれる。ビルド時にスキン画像を接続し、不透明にする。
- Kenneyの動作FBXはそれぞれ「Targeting Pose」（2フレームの照準姿勢）と本来の動作の2テイクを持つ。また動作側の骨格は基準姿勢がモデル（Tポーズ）と異なるため、回転値をそのまま移さず、ワールド空間で追従させて焼き込む（`scripts/assets/build_character.py`）。
- 試合球は直径約0.22m。TPSの標準距離では画面上で非常に小さく、背景のプラズマフェンスに紛れる。見せ方はM1で決める（progress.mdの論点）。

配信時のGLB・WebPのURLには内容ハッシュ（`?v=…`、`scripts/asset-versions.ts`）を付ける。GitHub Pagesは10分キャッシュするため、付けないと更新直後に旧素材と新しいプログラムが組み合わさる（2026-10-07、旧ステージの金網を通り抜けて見えた不具合）。

上限：1ファイル25MiB以下（`tests/assets.test.ts` で検証）。実サイズは `docs/benchmarks/m0.md` に記録する。

## 再生成

```
npm run assets
```

Blenderの場所は `BLENDER`（既定 `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`）で変える。

## クレジット

Characters by Kenney (CC0)。

## DOM画面とHUDの受け入れ条件（2026-10-08）

タイトル→メニュー→ローカル準備／オンライン／設定を戻る操作付きで分ける。3D背景と既存の試合・通信・設定の挙動を維持する。試合中は再開・設定を表示し、オンラインの結果確認・退出は既存の部屋画面を使う。カードは立ち絵・名前・3能力バー・定義から固有2枠、ロビーはP1〜P4・チーム形状・立ち絵・ホスト・ロード状態を表示する。

HUDは上中央のラウンド・A/B勝ち数・時間、右上の危険秒とcalm/panic/rage、下端のHP・コスト5セル・ステップ2セルと回復・固有2枠へ分ける。中央30〜70%×20〜75%に通常HUDパネルを置かず、ロック名は小文字、判定は#judgementを維持する。HPは生存時0に丸めず、コストは0.25刻み、危険時計は最終1秒を切り捨て小数1桁。結果だけ中央の小パネルで3秒の遷移／5秒の再戦／オンライン確認を示し、未集計統計は出さない。表示モデルと素材を先にRed確認し、Vite 5183で各画面を確認する。

### 確認済みと未確認（2026-10-08）

4枚の立ち絵を生成し、高さ512px・100KiB未満・WebP・内容ハッシュを検証した。表示モデル6件、戻る操作1件、素材4件は実装前に未実装／素材なしでRedを確認。Vite 5183のWebGLプレビューでタイトル、メニュー、形式・キャラ選択、オンライン入口、P1〜P4ロビー、設定と割当競合、試合中メニュー、TPS、FPS保持、危険時計calm/panic、ラウンド結果、試合結果を画像保存した（`.cache/ui/report.md`）。HUD・結果は`__debug.step`で状態とフレームを固定して確認し、架空の統計は表示していない。ローカルWorkerで部屋作成・別タブ参加・キャラ申告・退出を確認した。4人ロビー画像の追加枠はHTTPで参加させた検証用の席。

関連7ファイル63テスト、全体68ファイル1,214テスト、型検査、ビルド、差分の空白検査が成功。入力の実際のマウス捕捉／Esc解除はプレビューが捕捉を拒否するため未確認で、再開ボタンと設定からの戻り、捕捉失敗の案内を確認した。全参加者でのオンライン開始〜結果確認、狭い端末での手動操作は未確認。FPS保持球は既存の3D配置を維持し、下端のクリップとHUDとの重なりが残る。
