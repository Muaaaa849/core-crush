# CORE-CRUSH アートディレクション

作成日：2026-10-08。画像は見た目の提案であり、実装・性能・操作感の検証結果ではない。採用はアート案としての採用を意味する。

## テーマ

違法電脳都市のジャンク街で、改造選手が暴走コアを投げ合う裏スポーツである。
濡れた金属、金網、補修された競技服、局所的なホログラムで危険な見世物を表す。
主役は一つのコアと、8秒を相手へ押し付ける攻防である。
品質は入力と判定の納得感、球の読みやすさ、打撃の爽快感、キャラクター性、背景の豪華さの順とする。

## 制作範囲と受け入れ条件

- UIは16:9。タイトル、メニュー、形式・キャラ選択、部屋・ロビー、TPS、FPS保持、ラウンド結果、試合結果、設定を別画像で作る。
- キャラは共通体型の4色展開。各キャラの正面を確定後、その画像を参照して左・背面・右を一方向一枚で作る。
- 四面図は全身、ニュートラルAポーズ、明灰色無地、正射影に近いカメラ。文字・ロゴ・武器・浮遊物を置かない。
- VFXは成功3段階、キャッチ、被弾、爆発、フェンス通過を比較する。球の中心・外縁を塞がない。白い全画面フラッシュを使わない。
- 文字は画像のまま使わず、実装では通常のフォントで再現する。
- 生成後に寸法・サイズ・目視品質を確認する。リポジトリへは1枚3MB以下の画像を保存する。
- コード、既存素材、README、進捗資料は編集しない。コミットと再委譲は行わない。

## 正本と読み取り確認

[feel.md](feel.md)、[characters.md](characters.md)、[rules.md](rules.md)、[README](../../README.md)、[0013](../decisions/0013-m3-roster-and-settings.md)を根拠とする。
`src/game/characters.ts`の能力・色・固有2枠と、`src/game/vfx.ts`の色・寿命を読み取った。
既存ステージ、コアのレンダー、calm・panic・rageの液晶顔は読み取り専用の参照である。
前回の記録では開始画面をローカルViteとT3プレビューで確認し、人数・4キャラ・能力・未実装スキル・演出設定があった。その時点のローカル環境ではオンライン未設定と表示された。今回は開発サーバーを起動せず、資料とファイルだけを確認した。この記録から現在の公開版の接続可否は判断しない。
再開時に読み取った`src/game/characters.ts`では固有スキルはすべて未実装表記であった。並行実装中の機能を含むため、生成案を機能の実装済み証拠に使わない。

## 再開時の制作計画（2026-10-08、生成・検証前）

既存のVOLT正面を共通体型・衣服構造の基準とする。他3体は正面を先に作り、各正面を参照して側面と背面を生成する。leftはキャラクター自身の左側を観察する像（鼻が画像左を向く）、rightは自身の右側（鼻が画像右を向く）とする。側面でAポーズの遠側の腕が隠れることは許容し、見せるために姿勢を変えない。

再開時には残りのUI5画面とVFX比較シートを制作し、余裕があれば正式ロスターの固有8種（蓄勢を含む）のアイコンを作る計画とした。資料と画像だけの作業であり、実行可能な挙動を変えないためRed/Greenのコードテストは作らない。画像の目視、ファイル容量・寸法、参照の存在、LFを検証する。コード側には並行作業の未コミット変更があるため、その変更を触らない。

## パレットと質感

| 用途 | HEX | 使い分け |
|---|---|---|
| 背景／パネル | `#0B1016` / `#151D27` | 青みのある炭色。床の反射は背景だけに置く |
| 本文／補助文字／境界線 | `#E8F0F2` / `#A9BBC8` / `#405463` | 文字面の汚しは禁止。選択は白い2px枠と文言を併用する |
| Aチーム | `#57C7FF` | 正立した四角の中にA。名札・勝ち数・参加枠に使う |
| Bチーム | `#FF718A` | 上向き三角の中にB。Aと同じサイズで使う |
| VOLT | `#D8A52A` / `#FFE27A` | 黄土色の布／淡い金の発光。斜めの小装飾 |
| ECHO | `#8067B5` / `#CBB4FF` | 紫の布／薄紫の発光。手首の同心円 |
| ANCHOR | `#68856F` / `#B4D6A0` | セージ色の布／淡緑の発光。小さい角形パネル |
| SWITCH | `#BB7657` / `#FFD0A0` | 銅色の布／淡桃の発光。ずらした小パネル |
| 危険段階 | `#57C7FF` / `#FFD84A` / `#FF5533` | calm／panic／rage。チームではなく顔・残り秒とセットで示す |

HEXは実装用の指定値である。生成画像の陰影を含む画素がこの値と一致するという意味ではない。キャラ色でチーム色や球種色を上書きしない。キャラ画像にはチームバッジを焼き込まず、実装で同じ胸・足首の帯と名札へ合成する。

UIは薄い金属の角枠、補修痕、局所的なシアン／ピンクの光を使う。全パネルへネオンを広げず、操作対象と状態に限定する。角丸は0〜4px、通常境界1px、フォーカス2px、影は短くする。文字の背面はほぼ不透明な炭色を確保する。タイトルの大きい傷模様はタイトル画像に限定する。

書体は見出しに幅の狭い太いサンセリフ、本文に癖の少ない日本語ゴシックを使う方向である。日本語の長体変形は行わない。数字は等幅幅取り（`font-variant-numeric: tabular-nums`）とし、時計の桁変化で幅を動かさない。1600×900で本文18〜22px、補助16px以上、HUD数字24〜36px、見出し32〜48pxを初期案とする。特定フォントの導入・ライセンス確認は本作業の対象外である。

## HTML/CSSでの再現

生成画像は構図・質感の参考であり、画面全体を背景画像として貼って操作領域を重ねる実装にはしない。文字、ボタン、能力値、進捗、バッジはDOMで作る。画像内の文字は、誤字の有無にかかわらず通常のフォントへ置き換える。

基準は1600×900、外側余白32〜48px、8px刻みの間隔である。CSS Gridで大きな領域、Flexで行を作る。細いハザード模様は疑似要素や小さな反復背景に限定する。絵の複雑な輪郭や擦り傷を全要素へ複製しない。狭い画面ではカードを2列にし、設定の2カラムを縦積みにする。HUDは情報の優先順位を維持し、文字サイズを無制限に縮めない。キーボードのフォーカスは色だけでなく枠を出す。

| 画面 | 再現の要点／画像からの補正 |
|---|---|
| タイトル | 左に見出しと開始、右に既存コア。背景は文字側を暗くする。開始は実ボタンとする |
| メニュー | 同じ幅の3ボタン。画像の四角A・三角Bをメニューアイコンとして使わず、ローカル／オンラインの意味を持つ中立アイコンへ置換する |
| 形式・キャラ選択 | `repeat(4,minmax(0,1fr))`で4カード、各カードは画像・名前・3値・2枠。能力バーは数値から生成する。ANCHORの蓄勢は「常時」、キーを出さない。チームBは上向き三角＋Bに統一する |
| 部屋・ロビー | 左が作成・参加、右が参加者状態。仮ロボット顔を採用したキャラ画像へ置換する。選択形式とロビー見出しを同じ状態へ結び付ける。招待コードの桁区切りは表示仕様に従い、生成画像の内部形式の説明は製品UIへ出さない |
| 設定 | 左に主副割当、右に感度・FOV・レティクル・演出。競合があるときだけ警告を出し適用を無効にする。画像のように警告と有効な適用を同時に見せない。値は実際の保存状態から表示する |
| TPS HUD | 自キャラは左下、球と相手への中央通路を空ける。画像の強いフェンス発光・背景看板を実装では抑える。レティクルは画像より小さくする |
| FPS保持HUD | 手と保持球は右下のプレイ領域に収め、下端の資源列と分離する。球の外縁もレティクルも切らない。時計位置はTPSと同じにする |
| ラウンド結果 | 3秒の自動遷移を小さな中央パネルで知らせる。操作ボタンは置かない。引き分けは得点を増やさず「再試合」とする |
| 試合結果 | 2勝先取の勝敗、5項目の振り返り、再戦・チーム交替・ロビー。例示した統計値はダミーである。収集していない指標を実測値として表示しない |

スキルの実装状態は読み取り時点の定義に従って画像に「未実装」を出している。並行開発で状態が変わるため、この文字を固定仕様にしない。各能力・スキルは`src/game/characters.ts`の現在の定義から表示する。画像にボタンが存在することは、機能の実装済み証拠ではない。

## HUDの配置と時計

上端の中央にラウンド・A/B勝ち数・試合残り時間、右上に危険時計を置く。勝ち数を小印で併記する場合は各チーム2枠だけとし、数値と一致させる。試合は180秒、2ラウンド先取であり、生成画像の装飾の個数を仕様にしない。

中央の固定レティクルは12〜20pxを初期案とする。ロック名はその下へ小さく置く。判定文字JUST／GOOD／SO-SOは同時に列挙せず、発生した結果ひとつだけを出す。画像では比較しやすいよう中央左に描かれているが、実装は0012のレティクル下の固定枠を維持する。球へ追尾させない。450ms・1枠、本人優先、同優先なら最新とし、行動と他者の人物IDも付ける。下端はHP、コスト5セル、ステップ2セルと回復進捗、固有2枠の順である。コストは0.25刻みの充填率を数値と一致させる。VOLTの通常最大HPは94であり、100固定ではない。1v2の開始時補正も実stateから表示する。

画面幅の概ね30〜70%、高さ20〜75%をパネルのない領域とする。ただし球は領域外にも移動するため、この固定余白だけで非遮蔽を保証しない。FPSの保持球は概ねx=74〜83%、y=61〜72%を目安にし、最下部14%のHUDと離す。最終位置はFOV・手のモーションで試遊確認する。新しい画面空間マスクや動的文字移動は追加せず、0012の固定枠と細い形を維持して評価する。

| 経過時間（ルール） | HUDの残り時間 | コアの顔 |
|---|---|---|
| 0以上3秒未満 | 8から5秒より大きい値 | calm、スマイル |
| 3以上5秒未満 | 5から3秒より大きい値 | panic、焦り |
| 5以上7秒未満 | 3から1秒より大きい値 | rage、激怒 |
| 7以上8秒未満 | 1.0から0より大きい値 | rage＋亀裂、残りは小数1桁 |
| 8秒 | 爆発状態 | 旧球は消える |

最終1秒の表示で丸めにより長く0.0を出さない。端数処理は実装とテストで確定する。投げ始め、保持、キャッチ、召喚で時計を戻さない。中央通過で受け側に8秒が与えられる。危険色は画面全面に塗らず、秒数・顔・小さい枠だけへ加える。

## キャラクターとTripoへの受け渡し

各フォルダの`front.webp`、`left.webp`、`back.webp`、`right.webp`と`prompt.md`を使う。VOLT正面を共通体型の優先基準とする。leftは鼻が画像左、rightは画像右を向く。四面を一枚に連結して入力しない。正面が最優先、左右は厚み、背面はフード・ベスト・膝裏の補足である。

生成された四面は数学的に同一メッシュを回転したレンダーではない。指の重なり、縫い目、バックル、フードの折り返し、背面のパネル割りには微差がある。骨格とシルエットはVOLTを基準に一つへ統合し、小装飾・発光線は材質や薄い部品として扱う。側面は投影により腕が胴体と重なるため、腕を下げた姿勢と誤解せず正面のAポーズを優先する。Tripoの出力・トポロジー・リグ・可動域は本作業では検証していない。

同一骨格を確実に維持するには、まずVOLTから共通モデルを確定し、他3体の配色と装飾をそのモデルへ適用する。4体を独立生成する場合も、身長、肩幅、股関節、肘・膝・手首、足底を共通骨格へ合わせる工程が必要である。生成画像から自動的に共通骨格が保証されるわけではない。マットな布、暗い樹脂、控えめな金属、細い発光を別材質にする。発光の色を拡散色へ焼き込み過ぎない。

## VFXの再現仕様と現行との差

ここでの時間は演出の設計値であり、動画から計測した値ではない。現行`src/game/vfx.ts`は線分と16分割の輪を生成し、強度を寿命内で線形に1から0へ下げる。球半径＋0.1mを輪・火花・破片の開始位置にしている。火花4、輪4、閃光1、破片1、波紋2の同時上限を維持し、最古を置き換える。球の移動や判定時間は変更しない。

| 効果 | 色・本数・時間（現行を維持） | 形の採用方向と現行との差 |
|---|---|---|
| SO-SO | `#7FC8FF`、3本120ms＋輪160ms | 短い火花と弱い細輪。現行の完全な輪から一部を欠いた弧にする案 |
| GOOD | `#19E6FF`、5本120ms＋輪160ms | 明瞭な細輪と放射線。球面の発光を増やして輪郭を溶かさない |
| JUST | `#FFFFFF`、8本120ms＋輪160ms | 白は火花の細い芯だけ。シアンの小さい縁と分割弧を加える案。白い円盤にはしない |
| キャッチ | `#FFD84A`、収束輪160ms | 分割した金の弧が収束し、球外縁＋0.1mで止まる。内向き矢印が球を貫かない |
| 被弾 | `#FF5533`、4本120ms | 外向きの短い角片。成功輪と異なる破砕形。HUDの外周強調を足す場合も中央を染めない |
| コア爆発 | 閃光`#FFA040` 80ms、破片`#FF7A2A` 12本220ms、輪160ms | 現行の線状破片を小さい外殻片の形へ置換する案。中心は空にし、旧球を残さない。閃光OFFでも輪と破片は残る |
| 中央フェンス通過 | `#19E6FF`、180ms、最大半径1.2m | z一定の中央面に局所波紋。現行1本の輪を減衰した弧と薄い六角セルへ置換する案。フェンス全面発光は禁止 |

現行の半径上の余白は3D距離であり、奥行き方向の火花が画面上では球と重なる可能性がある。0012の判断どおり、画面空間の保護範囲や線分の交差判定は本提案では追加しない。短い線、塗らない輪、球半径＋0.1mの余白、深度書き込みなしを維持し、2v2の実画面で中心・外縁が読めるか確認する。隠れる場面が確認されたら、その証拠をもとに追加規則を決める。HUDの時計はVFXより前のDOM層に置く。白い全画面フラッシュ、濃い煙、球を別の大球に見せる巨大な光球は採用しない。爆発だけは旧球が消えた後に局所輪・破片を出すため、中心に球の参考図を残さない。

新しい形は既存の線・輪描画で再現できる範囲から始める。Effekseerの追加や大量の粒子を前提にしない。発生0msで立ち上げ、前半で形を読ませ、後半は薄くする。静止画の光量を長時間維持しない。2v2・雨・ネオン・複数確定イベントでの視認性とGPU時間は、実装後に別途測定する。

### 実装結果（2026-10-08）

上表の「案」は採用して実装した（`src/game/vfx.ts`・`vfxview.ts`、`tests/game/vfx.test.ts`）。SO-SOは火花3本＋欠けた弧3つ、GOODは放射線5本＋閉じた細輪、JUSTは白い芯8本＋シアンの縁・分割弧8つ、キャッチは金の収束弧6つ＋内向きの小矢印6つ、被弾は外向き角片4つ、爆発は四角い外殻片12個（中心は空）、フェンスは中央面の弧4つ＋六角セル6個。寿命・同時上限・球半径＋0.1mは維持し、線分の容量は最大408本。保護距離は線分全体で検証している。線は1pxで、光の広がりは画面全体のブルームに任せる。2v2の実戦での見え方とGPU時間は未検証。

## 固有スキルアイコン8種

`art/concepts/icons/skill-icons-sheet.webp`は4列×2段の比較シートである。上段はオーバーチャージ、ブリンク、ファントム、ブーストリング。下段はチェーン、蓄勢、トラップ、エナジーボルトである。正式ロスターの8種を対象にし、試験用の省エネとバックライン封鎖は含めない。

白に近い主形状＋キャラの淡い発光色で統一し、キーや文字を焼き込まない。シート全体を128×64へ縮小し、1セル32px相当で目視した。球と雷、二人の移動、残像、リング、鎖、蓄積、床罠、尖った射出の大形状は区別できた。鎖の指先、罠の小破片、ブリンクの短線は小さくなるため、実装用に線数を減らす余地がある。32pxでのゲーム内識別試験は未実施である。

本成果物は不透明背景の比較シートであり、透過済みの個別アイコン8ファイルではない。採用形を通常のSVGまたは透過ビットマップへ仕上げる工程を残す。状態は画像を差し替えるだけで表さず、常時／予約中／CT秒／不可理由をDOMで添える。パッシブの蓄勢にE/Rを表示しない。

## 生成画像一覧

生成器は内蔵GPT Imageである。全プロンプト・生成時の参照・原本パス・容量・目視採否は[生成ログ](../../art/concepts/generation-log.json)に収録した。下表のプロンプトリンクは全文と参照の記録へ進む。全32枚のうち採用27枚、不採用5枚である。

| ファイル | 用途 | プロンプト | 生成日 | 採否と理由 |
|---|---|---|---|---|
| [ui/title.webp](../../art/concepts/ui/title.webp) | UI：title | [title](../../art/concepts/ui/prompt.md#title) | 2026-10-08 | 採用：既存コアの金属外殻と液晶顔を維持し、入口の階層が明確である。 |
| [ui/main-menu.webp](../../art/concepts/ui/main-menu.webp) | UI：menu | [menu](../../art/concepts/ui/prompt.md#menu) | 2026-10-08 | 採用：採用（配置・質感）。3ボタンの階層が明確である。メニュー内のA/Bバッジはチーム識別と混同するため中立アイコンへ置換する。 |
| [characters/volt/front.webp](../../art/concepts/characters/volt/front.webp) | VOLT front | [volt-front](../../art/concepts/characters/volt/prompt.md#volt-front) | 2026-10-08 | 採用：採用。全身・Aポーズ・明灰色背景であり、4体共通の体型と衣服の基準とする。 |
| [ui/room-lobby.webp](../../art/concepts/ui/room-lobby.webp) | UI：lobby | [lobby](../../art/concepts/ui/prompt.md#lobby) | 2026-10-08 | 採用：採用（配置・質感）。参加者と接続状態が読める。仮ロボット顔、形式の不一致、内部コード形式の説明は実装時に置換する。 |
| [ui/settings.webp](../../art/concepts/ui/settings.webp) | UI：settings | [settings](../../art/concepts/ui/prompt.md#settings) | 2026-10-08 | 採用：採用（配置・質感）。割当表と演出設定を分離できる。競合警告が出ているときは適用を無効にする。 |
| [characters/echo/front.webp](../../art/concepts/characters/echo/front.webp) | ECHO front | [echo-front](../../art/concepts/characters/echo/prompt.md#echo-front) | 2026-10-08 | 採用：正面一体、全身、Aポーズ、無地背景を確認した。VOLT基準の配色・小装飾案として採用する。 |
| [characters/anchor/front.webp](../../art/concepts/characters/anchor/front.webp) | ANCHOR front | [anchor-front](../../art/concepts/characters/anchor/prompt.md#anchor-front) | 2026-10-08 | 採用：正面一体、全身、Aポーズ、無地背景を確認した。VOLT基準の配色・小装飾案として採用する。 |
| [characters/switch/front.webp](../../art/concepts/characters/switch/front.webp) | SWITCH front | [switch-front](../../art/concepts/characters/switch/prompt.md#switch-front) | 2026-10-08 | 採用：正面一体、全身、Aポーズ、無地背景を確認した。VOLT基準の配色・小装飾案として採用する。 |
| [characters/volt/left.webp](../../art/concepts/characters/volt/left.webp) | VOLT left | [volt-left](../../art/concepts/characters/volt/prompt.md#volt-left) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/volt/right.webp](../../art/concepts/characters/volt/right.webp) | VOLT right | [volt-right](../../art/concepts/characters/volt/prompt.md#volt-right) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/volt/back.webp](../../art/concepts/characters/volt/back.webp) | VOLT back | [volt-back](../../art/concepts/characters/volt/prompt.md#volt-back) | 2026-10-08 | 採用：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。 |
| [characters/echo/left.webp](../../art/concepts/characters/echo/left.webp) | ECHO left | [echo-left](../../art/concepts/characters/echo/prompt.md#echo-left) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/echo/right.webp](../../art/concepts/characters/echo/right.webp) | ECHO right | [echo-right](../../art/concepts/characters/echo/prompt.md#echo-right) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/echo/back.webp](../../art/concepts/characters/echo/back.webp) | ECHO back | [echo-back](../../art/concepts/characters/echo/prompt.md#echo-back) | 2026-10-08 | 採用：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。 |
| [characters/anchor/left.webp](../../art/concepts/characters/anchor/left.webp) | ANCHOR left | [anchor-left](../../art/concepts/characters/anchor/prompt.md#anchor-left) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/anchor/back.webp](../../art/concepts/characters/anchor/back.webp) | ANCHOR back | [anchor-back](../../art/concepts/characters/anchor/prompt.md#anchor-back) | 2026-10-08 | 採用：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。 |
| [characters/anchor/right.webp](../../art/concepts/characters/anchor/right.webp) | ANCHOR right | [anchor-right](../../art/concepts/characters/anchor/prompt.md#anchor-right) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/switch/left.webp](../../art/concepts/characters/switch/left.webp) | SWITCH left | [switch-left](../../art/concepts/characters/switch/prompt.md#switch-left) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [characters/switch/back.webp](../../art/concepts/characters/switch/back.webp) | SWITCH back | [switch-back](../../art/concepts/characters/switch/prompt.md#switch-back) | 2026-10-08 | 採用：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。 |
| [characters/switch/right.webp](../../art/concepts/characters/switch/right.webp) | SWITCH right | [switch-right](../../art/concepts/characters/switch/prompt.md#switch-right) | 2026-10-08 | 採用：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。 |
| [ui/character-select.webp](../../art/concepts/ui/character-select.webp) | UI：character-select | [character-select](../../art/concepts/ui/prompt.md#character-select) | 2026-10-08 | 採用：採用（配置・質感）。4カード、能力3値、固有2枠を確認した。能力バーは数値から再描画し、Bバッジの向きとB文字、スキルの表記を統一する。 |
| [ui/hud-tps.webp](../../art/concepts/ui/hud-tps.webp) | UI：hud-tps | [hud-tps](../../art/concepts/ui/prompt.md#hud-tps) | 2026-10-08 | 採用：採用（修正版の配置）。勝利印を除き数値へ統一し、球・時計・資源を分離した。コストの部分充填と危険文字色は定義から再描画し、判定文字は0012の固定枠へ移す。敵の仮姿は正式ECHOへ置換する。 |
| [ui/hud-fps-holding.webp](../../art/concepts/ui/hud-fps-holding.webp) | UI：hud-fps | [hud-fps](../../art/concepts/ui/prompt.md#hud-fps) | 2026-10-08 | 採用：採用（修正版の配置）。保持球の全周とHUDの間に余白を確保し、残り0.8秒とrage顔を分離表示した。ステップ回復進捗を追加し、判定文字と敵の仮姿を現行仕様へ揃える。 |
| [ui/round-result.webp](../../art/concepts/ui/round-result.webp) | UI：round-result | [round-result](../../art/concepts/ui/prompt.md#round-result) | 2026-10-08 | 採用：採用。1-0のラウンド勝利と3秒の自動遷移が読め、継続ボタンがない。球供給側と統計は実状態から表示する。 |
| [ui/match-result.webp](../../art/concepts/ui/match-result.webp) | UI：match-result | [match-result](../../art/concepts/ui/prompt.md#match-result) | 2026-10-08 | 採用：採用。2-1の試合結果、参加者、振り返り5項目と3操作が分離されている。数値はダミーであり実装済み集計ではない。 |
| [vfx/contact-sheet.webp](../../art/concepts/vfx/contact-sheet.webp) | 7効果の比較シート | [vfx-contact-sheet](../../art/concepts/vfx/prompt.md#vfx-contact-sheet) | 2026-10-08 | 採用：採用（修正版の形）。7種類を区別でき、球の中心・外縁を空け、爆発中心を空にし、フェンス波紋を垂直面へ修正した。枝火花・小破片の総数は画像から数えず仕様の本数上限を使う。 |
| [icons/skill-icons-sheet.webp](../../art/concepts/icons/skill-icons-sheet.webp) | 固有8種の形状シート | [skill-icons-sheet](../../art/concepts/icons/prompt.md#skill-icons-sheet) | 2026-10-08 | 採用：採用（形のコンセプト）。正式ロスター8種が文字なしで区別できる。背景は不透明であり配信用透過アイコンではない。32px検証と必要な単純化は別記する。 |
| [characters/volt/rejected/back-01.webp](../../art/concepts/characters/volt/rejected/back-01.webp) | VOLT 不採用比較 | [volt-back-rejected-01](../../art/concepts/characters/volt/prompt.md#volt-back-rejected-01) | 2026-10-08 | 不採用：正面と背面の二体があり、一枚一方向の条件を満たさない。 |
| [characters/echo/rejected/back-01.webp](../../art/concepts/characters/echo/rejected/back-01.webp) | ECHO 不採用比較 | [echo-back-rejected-01](../../art/concepts/characters/echo/prompt.md#echo-back-rejected-01) | 2026-10-08 | 不採用：正面と背面の二体があり、一枚一方向の条件を満たさない。 |
| [ui/rejected/hud-fps-holding-01.webp](../../art/concepts/ui/rejected/hud-fps-holding-01.webp) | UI：hud-fps-rejected-01 | [hud-fps-rejected-01](../../art/concepts/ui/prompt.md#hud-fps-rejected-01) | 2026-10-08 | 不採用：保持球の下端がHUDに隠れ、経過秒が危険時計へ混在したため修正する。 |
| [ui/rejected/hud-tps-01.webp](../../art/concepts/ui/rejected/hud-tps-01.webp) | UI：hud-tps-rejected-01 | [hud-tps-rejected-01](../../art/concepts/ui/prompt.md#hud-tps-rejected-01) | 2026-10-08 | 不採用：勝利印・HP・コストの塗りが数値と不一致であり、フェンスの発光も強いため修正する。 |
| [vfx/rejected/contact-sheet-01.webp](../../art/concepts/vfx/rejected/contact-sheet-01.webp) | 7効果の比較シート | [vfx-contact-sheet-rejected-01](../../art/concepts/vfx/prompt.md#vfx-contact-sheet-rejected-01) | 2026-10-08 | 不採用：フェンス波紋が水平で球外縁に接触し、閃光凡例が白のため修正する。 |
