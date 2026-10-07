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
| `character.glb` | `art/kenney-protagonists`（characterMedium.fbx + cyborgFemaleA.png + idle/run/jump） | Blender 5.2でGLB化（アニメーション名 idle / run / jump） |

### 取り込み時の注意（確認済）

- ステージのライト（KHR_lights_punctual）はBlenderの書き出しでW×683に換算されている。three.jsでは読み込み時に1/683倍してBlenderと同じ明るさにする（`src/main.ts`）。
- Kenneyのモデル（characterMedium.fbx）の材質は画像ノードを持たず、Alpha=0で読み込まれる。ビルド時にスキン画像を接続し、不透明にする。
- Kenneyの動作FBXはそれぞれ「Targeting Pose」（2フレームの照準姿勢）と本来の動作の2テイクを持つ。また動作側の骨格は基準姿勢がモデル（Tポーズ）と異なるため、回転値をそのまま移さず、ワールド空間で追従させて焼き込む（`scripts/assets/build_character.py`）。
- 試合球は直径約0.22m。TPSの標準距離では画面上で非常に小さく、背景のプラズマフェンスに紛れる。見せ方はM1で決める（progress.mdの論点）。

上限：1ファイル25MiB以下（`tests/assets.test.ts` で検証）。実サイズは `docs/benchmarks/m0.md` に記録する。

## 再生成

```
npm run assets
```

Blenderの場所は `BLENDER`（既定 `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`）で変える。

## クレジット

Characters by Kenney (CC0)。
