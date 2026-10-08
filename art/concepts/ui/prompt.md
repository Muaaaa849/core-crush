# ui 生成記録

生成日は2026-10-08、生成器は内蔵GPT Image（image_gen）である。原本PNGはsourceに記録し、納品はWebP品質90である。画像内の文字は実装で通常のフォントへ置き換える。参照は生成時に渡した順で示す。可搬参照は対応するリポジトリ内WebPであり、元のPNGと圧縮状態は異なる。

<a id="title"></a>

## title

- ファイル：[title.webp](title.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：既存コアの金属外殻と液晶顔を維持し、入口の階層が明確である。
- 原本：`C:\Users\phant\.codex\generated_images\01a118ea-8981-7951-b37e-20e81aacf3e5\exec-1e4481aa-f3d0-4be8-a876-61c2d32f1ab8.png`
- 形式：1600×900、322868 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/T3test/arena/_preview/stage_wide.png`
2. `D:/T3test/core_ball/output/renders/state_0_calm.png`

可搬参照：

1. [stage_wide.png](D:/T3test/arena/_preview/stage_wide.png)
2. [state_0_calm.png](D:/T3test/core_ball/output/renders/state_0_calm.png)

プロンプト全文：

```text
Use case: ui-mockup. Create ONE 16:9 landscape title screen concept for Japanese PC game CORE-CRUSH. Reference image 1 is the existing arena mood and architecture; image 2 is the existing spherical core design, do not redesign it. Illegal cyber cage fighting in a junk city at night, wet dark metal floor, wire cage, restrained cyan and pink holographic signage. Production-friendly FLAT screen layout, no perspective panel mockup. Large condensed CORE-CRUSH title left upper third, a short Japanese subtitle 違法サイバー・ケージファイト, one rectangular 開始 button left lower third. Right third: the metal spherical core with yellow-black hazard plates and its cyan smiling LCD, rendered crisply, no extra balls. Dark graphite #0B1016 and #151D27, off-white #E8F0F2 typography, cyan #57C7FF and pink #FF718A as sparse accents. Lots of clean space, readable hierarchy, minimal panel ornament. This is a title screen not gameplay; no fake gameplay HUD, no betting interaction. Retain existing arena atmosphere but dim background detail beneath text. No watermark. Image text will be replaced by normal fonts in implementation.
```

<a id="menu"></a>

## menu

- ファイル：[main-menu.webp](main-menu.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（配置・質感）。3ボタンの階層が明確である。メニュー内のA/Bバッジはチーム識別と混同するため中立アイコンへ置換する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118ea-8981-7951-b37e-20e81aacf3e5/exec-fec27cc4-341e-4e7f-9565-7921c0446dff.png`
- 形式：1600×900、259448 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:\Users\phant\.codex\generated_images\01a118ea-8981-7951-b37e-20e81aacf3e5\exec-1e4481aa-f3d0-4be8-a876-61c2d32f1ab8.png`

可搬参照：

1. [title.webp](title.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE flat 16:9 Japanese PC game screen, CORE-CRUSH illegal cyber cage fighting. Crisp rectangular panels, disciplined alignment and generous negative space, easy to reproduce with HTML/CSS. Dark graphite #0B1016 background, #151D27 panels, off-white #E8F0F2 plain sans-serif text. Sparse cyan #57C7FF and pink #FF718A edges. Wet metal and distant neon cage in background only, dim behind text. Do not obscure game objects. Team A uses cyan plus square A badge; Team B uses pink plus triangle B badge. Character color is separate. No ornate sci-fi cockpit framing, no illegible microscopic decoration, no watermark. Japanese text will be replaced in implementation. Reference 1 supplies the approved title aesthetic. Main menu: small CORE-CRUSH title upper left; left 40% a vertical stack of exactly three large equal-width buttons ローカル試遊 / オンライン / 設定. Local selected with clear pale border, not just color. Right 50% unobtrusive side view of the existing arena and the core, no additional competing focal point. Bottom note 中央通過から8秒。投げただけでは戻らない. Flat readable menu, restrained glow, ample margins.
```

<a id="lobby"></a>

## lobby

- ファイル：[room-lobby.webp](room-lobby.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（配置・質感）。参加者と接続状態が読める。仮ロボット顔、形式の不一致、内部コード形式の説明は実装時に置換する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118ea-8981-7951-b37e-20e81aacf3e5/exec-f597e16d-0ff2-46cf-821f-a7ecbac2661a.png`
- 形式：1600×900、192186 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:\Users\phant\.codex\generated_images\01a118ea-8981-7951-b37e-20e81aacf3e5\exec-1e4481aa-f3d0-4be8-a876-61c2d32f1ab8.png`

可搬参照：

1. [title.webp](title.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE flat 16:9 Japanese PC game screen, CORE-CRUSH illegal cyber cage fighting. Crisp rectangular panels, disciplined alignment and generous negative space, easy to reproduce with HTML/CSS. Dark graphite #0B1016 background, #151D27 panels, off-white #E8F0F2 plain sans-serif text. Sparse cyan #57C7FF and pink #FF718A edges. Wet metal and distant neon cage in background only, dim behind text. Do not obscure game objects. Team A uses cyan plus square A badge; Team B uses pink plus triangle B badge. Character color is separate. No ornate sci-fi cockpit framing, no illegible microscopic decoration, no watermark. Japanese text will be replaced in implementation. Room creation and lobby screen. Top breadcrumb オンライン / 部屋. Left narrow column contains form 対戦形式 with 1v1・1v2・2v2 segmented selector, 部屋を作る button and 招待コードで参加 input with 参加 button. Main center-right panel ロビー 2v2. A wide invite code field with 32 hex characters as four groups, example 01234567 89abcdef 01234567 89abcdef, adjacent コピー button, label 表示は4桁区切りでも内部は32桁. Four participant rows: P1 A VOLT ホスト ロード完了; P2 A ECHO 接続中; P3 B ANCHOR ロード完了; P4 B SWITCH 読込中. A square/cyan and B triangle/pink symbols. Bottom of main panel host button 全員で開始 visually disabled until ready; explanatory status 全員の接続を待っています. A small separate state preview strip shows 接続中 → 全員ロード完了 → 開始まで3 → 2 → 1. No matchmaking, chat, store, or betting controls. All figures and codes are dummy data.
```

<a id="settings"></a>

## settings

- ファイル：[settings.webp](settings.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（配置・質感）。割当表と演出設定を分離できる。競合警告が出ているときは適用を無効にする。
- 原本：`C:/Users/phant/.codex/generated_images/01a118ea-8981-7951-b37e-20e81aacf3e5/exec-f7fa0a01-a877-4d67-b48e-87bb2c34151d.png`
- 形式：1600×900、166726 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:\Users\phant\.codex\generated_images\01a118ea-8981-7951-b37e-20e81aacf3e5\exec-1e4481aa-f3d0-4be8-a876-61c2d32f1ab8.png`

可搬参照：

1. [title.webp](title.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE flat 16:9 Japanese PC game screen, CORE-CRUSH illegal cyber cage fighting. Crisp rectangular panels, disciplined alignment and generous negative space, easy to reproduce with HTML/CSS. Dark graphite #0B1016 background, #151D27 panels, off-white #E8F0F2 plain sans-serif text. Sparse cyan #57C7FF and pink #FF718A edges. Wet metal and distant neon cage in background only, dim behind text. Do not obscure game objects. Team A uses cyan plus square A badge; Team B uses pink plus triangle B badge. Character color is separate. No ornate sci-fi cockpit framing, no illegible microscopic decoration, no watermark. Japanese text will be replaced in implementation. Settings screen. Title 設定. Left 52% table 行動 / 主 / 副: 移動 前 W, 後 S, 左 A, 右 D; 投球・跳ね返し 左クリック; ADS・キャッチ 右クリック; ステップ Shift; ロック切替 Q; フリ F; 球召喚 C; 固有1 E; 固有2 R. Spare binding column shows 未設定. Right 42% grouped controls: 感度 FPS/TPS/ADS numeric sliders, 縦横倍率, Y反転; FOV slider 90; レティクル simple cross/dot preview with size/color; 演出 音量/ミュート/揺れ/閃光. Footer prominent 適用 and キャンセル and 既定値 buttons. Small warning row 競合を解消すると適用できる, no swap button. Footer オンライン試合は停止しない. Large readable labels, sparse clean separators, no huge visual ornaments.
```

<a id="character-select"></a>

## character-select

- ファイル：[character-select.webp](character-select.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（配置・質感）。4カード、能力3値、固有2枠を確認した。能力バーは数値から再描画し、Bバッジの向きとB文字、スキルの表記を統一する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-2ab927e3-c6ba-423e-a041-19890e84d25d.png`
- 形式：1600×900、364900 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/ui/title.webp`
2. `D:/corecrush/art/concepts/characters/volt/front.webp`
3. `D:/corecrush/art/concepts/characters/echo/front.webp`
4. `D:/corecrush/art/concepts/characters/anchor/front.webp`
5. `D:/corecrush/art/concepts/characters/switch/front.webp`

可搬参照：

1. [title.webp](title.webp)
2. [front.webp](../characters/volt/front.webp)
3. [front.webp](../characters/echo/front.webp)
4. [front.webp](../characters/anchor/front.webp)
5. [front.webp](../characters/switch/front.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE polished flat 16:9 Japanese PC game CORE-CRUSH screen, not an angled physical monitor. Use approved title image for visual language: illegal junk-city cyber cage sport, wet steel, distant neon cyan/pink, restrained grime, readable industrial typography. HTML/CSS reproducible rectangular panels #151D27 on #0B1016, text #E8F0F2, secondary #A9BBC8, selected border 2px. Keep decoration behind text, no cockpit clutter. Team A cyan #57C7FF with SQUARE A badge, Team B pink #FF718A with TRIANGLE B badge. Never use team badges as unrelated menu icons. One screen only, no explanatory collage. Image lettering will be replaced with normal fonts in implementation. Format and character selection. Header 対戦準備, format selector 1v1 / 1v2 / 2v2 with 2v2 selected by outline and check. Four equally sized cards in a single row, portraits EXACTLY matching supplied shared-body material variants (no helmets). VOLT mustard, ECHO purple, ANCHOR sage, SWITCH copper. Each card has three clearly named stats 攻撃 / 防御 / 敏捷: VOLT 7/4/4, ECHO 4/6/5, ANCHOR 4/7/4, SWITCH 5/4/6. Exactly two skill rows each: VOLT オーバーチャージ / ブリンク; ECHO ファントム / ブーストリング; ANCHOR チェーン / 蓄勢（常時）; SWITCH トラップ / エナジーボルト. Small common notice 固有スキルは未実装. VOLT selected with white border and 選択中 label. Bottom strip P1 square A VOLT; P2 square A ECHO; P3 triangle B ANCHOR; P4 triangle B SWITCH, then 戻る and 準備完了 buttons. No extra card, no stats omitted.
```

<a id="hud-tps"></a>

## hud-tps

- ファイル：[hud-tps.webp](hud-tps.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（修正版の配置）。勝利印を除き数値へ統一し、球・時計・資源を分離した。コストの部分充填と危険文字色は定義から再描画し、判定文字は0012の固定枠へ移す。敵の仮姿は正式ECHOへ置換する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-c1d7ff05-e4b9-46c7-8961-85cd59afc406.png`
- 形式：1600×900、348570 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-fd8ec974-e74d-4ae3-b41e-ac492717e18c.png`

可搬参照：

1. [hud-tps-01.webp](rejected/hud-tps-01.webp)

プロンプト全文：

```text
Use case: precise-object-edit. Refine this existing CORE-CRUSH TPS HUD concept. Preserve composition, ball location and all necessary HUD labels. Correct top score by removing ALL tiny square win pips on both sides; display just square A 1, ROUND 2, 02:14, 0 triangle B. COST is 3.25/5: draw exactly five boxes, three completely filled, fourth one-quarter filled, fifth empty. HP 76/94 bar filled to 81 percent. Danger clock remains 爆発まで 4秒 with amber worried face. Make danger panel border amber instead of red. Reduce fence electric lines and background sign brightness by 65% so opponent is clear beyond transparent fence. Reticle half current size. Keep one core with visible center and edge, no lens flare. Flat 16:9.
```

<a id="hud-fps"></a>

## hud-fps

- ファイル：[hud-fps-holding.webp](hud-fps-holding.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（修正版の配置）。保持球の全周とHUDの間に余白を確保し、残り0.8秒とrage顔を分離表示した。ステップ回復進捗を追加し、判定文字と敵の仮姿を現行仕様へ揃える。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-6eece9d3-1f64-423e-b533-6459d6993e8f.png`
- 形式：1600×900、351860 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-f42ec18c-44c0-4138-b97b-ffcfd2efa02e.png`

可搬参照：

1. [hud-fps-holding-01.webp](rejected/hud-fps-holding-01.webp)

プロンプト全文：

```text
Use case: precise-object-edit. Refine this existing CORE-CRUSH FPS HUD concept, preserve overall design and all UI. Change these items only: shrink the held core AND both hands to 65% of current size and move them up/right so ENTIRE sphere including its bottom edge is visible with at least 40 pixels of clear space above bottom HUD. Place core center near x80% y63%, do not cover center target or reticle. Keep one sphere only. Remove the text RAGE 7.2 from danger clock; retain red angry face and 爆発まで 0.8秒 only. Remove large decorative CORE-CRUSH logo at top-left during gameplay. Reduce electric fence and background sign brightness by 60%, keep frame bars and visible opponent. Reduce JUST callout to half current size, no sparks around text. Keep typography crisp and bottom values unchanged. Flat 16:9.
```

<a id="round-result"></a>

## round-result

- ファイル：[round-result.webp](round-result.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用。1-0のラウンド勝利と3秒の自動遷移が読め、継続ボタンがない。球供給側と統計は実状態から表示する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-a1bf8c61-510f-44c8-a15b-9128d021fc58.png`
- 形式：1600×900、339634 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/ui/title.webp`

可搬参照：

1. [title.webp](title.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE polished flat 16:9 Japanese PC game CORE-CRUSH screen, not an angled physical monitor. Use approved title image for visual language: illegal junk-city cyber cage sport, wet steel, distant neon cyan/pink, restrained grime, readable industrial typography. HTML/CSS reproducible rectangular panels #151D27 on #0B1016, text #E8F0F2, secondary #A9BBC8, selected border 2px. Keep decoration behind text, no cockpit clutter. Team A cyan #57C7FF with SQUARE A badge, Team B pink #FF718A with TRIANGLE B badge. Never use team badges as unrelated menu icons. One screen only, no explanatory collage. Image lettering will be replaced with normal fonts in implementation. ROUND RESULT overlay on dim frozen arena. Header ROUND 1 COMPLETE, main small-medium center panel square A ラウンド勝利, score A 1 — 0 B. Three concise lines 決着 相手全員KO; 最高ラリー 12; JUST 4. Below 次ラウンドまで 3, subdued note 次の球はB陣から. This is a timed 3-second pause, no continue or restart buttons, no match victory trophy. Court visible around panel.
```

<a id="match-result"></a>

## match-result

- ファイル：[match-result.webp](match-result.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用。2-1の試合結果、参加者、振り返り5項目と3操作が分離されている。数値はダミーであり実装済み集計ではない。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-b6071b12-e533-43c4-bbf3-9901692eb080.png`
- 形式：1600×900、286498 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/ui/title.webp`

可搬参照：

1. [title.webp](title.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE polished flat 16:9 Japanese PC game CORE-CRUSH screen, not an angled physical monitor. Use approved title image for visual language: illegal junk-city cyber cage sport, wet steel, distant neon cyan/pink, restrained grime, readable industrial typography. HTML/CSS reproducible rectangular panels #151D27 on #0B1016, text #E8F0F2, secondary #A9BBC8, selected border 2px. Keep decoration behind text, no cockpit clutter. Team A cyan #57C7FF with SQUARE A badge, Team B pink #FF718A with TRIANGLE B badge. Never use team badges as unrelated menu icons. One screen only, no explanatory collage. Image lettering will be replaced with normal fonts in implementation. MATCH RESULT full screen. Headline 試合結果, square A 勝利, score A 2 — 1 B (first to 2). 2v2 team summary and a compact table of five metrics with clearly dummy example values: 最高ラリー 18; JUST 9; フェイント成立 3; 危険時計による失点 1; 受け方向ミス 2. Two team panels show P1 VOLT / P2 ECHO and P3 ANCHOR / P4 SWITCH as names only, no unrelated robot portraits. Footer large 再戦, チーム交替, ロビーへ buttons. Restrained victory glow, no fireworks obscuring data, no ranking points, currency or loot.
```

<a id="hud-fps-rejected-01"></a>

## hud-fps-rejected-01

- ファイル：[hud-fps-holding-01.webp](rejected/hud-fps-holding-01.webp)
- 日付：2026-10-08
- 採否：不採用
- 理由：保持球の下端がHUDに隠れ、経過秒が危険時計へ混在したため修正する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-f42ec18c-44c0-4138-b97b-ffcfd2efa02e.png`
- 形式：1600×900、407532 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/ui/title.webp`
2. `D:/T3test/arena/_preview/stage_tps_south.png`
3. `D:/T3test/core_ball/output/renders/state_2_rage.png`
4. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [title.webp](title.webp)
2. [stage_tps_south.png](D:/T3test/arena/_preview/stage_tps_south.png)
3. [state_2_rage.png](D:/T3test/core_ball/output/renders/state_2_rage.png)
4. [front.webp](../characters/volt/front.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE polished flat 16:9 Japanese PC game CORE-CRUSH screen, not an angled physical monitor. Use approved title image for visual language: illegal junk-city cyber cage sport, wet steel, distant neon cyan/pink, restrained grime, readable industrial typography. HTML/CSS reproducible rectangular panels #151D27 on #0B1016, text #E8F0F2, secondary #A9BBC8, selected border 2px. Keep decoration behind text, no cockpit clutter. Team A cyan #57C7FF with SQUARE A badge, Team B pink #FF718A with TRIANGLE B badge. Never use team badges as unrelated menu icons. One screen only, no explanatory collage. Image lettering will be replaced with normal fonts in implementation. Gameplay HUD: small top-center strip ROUND 2, square A wins 1 vs triangle B wins 0, match remaining time 02:14. Separate top-right danger clock clearly labeled 爆発まで and remaining seconds plus existing core LCD face stage. Bottom-left HP numeric and bar 76 / 94 for VOLT. Bottom middle-left COST 3.25 / 5 as exactly five segmented cells including quarter fill, STEP 1 / 2 as exactly two cells with refill-progress line. Bottom center-right two compact skill slots E オーバーチャージ and R ブリンク, visually marked 未実装 for current concept integration. Central fine cross reticle, lock name 敵 P2 ECHO slightly below. A small transient judgement placed left of reticle, never over ball. Large center clear of panels. Do not add minimap, weapons, ammo, chat or duplicate cores. Gameplay is 1v1. FIRST PERSON holding exactly one existing metallic core in gloved VOLT hands at lower-right x77% y68%. Preserve complete spherical silhouette, angry red LCD face, yellow hazard shell. Core does not overlap bottom panels or center reticle. No player torso, no weapon. Opposing purple ECHO visible beyond transparent fence. Danger clock 爆発まで 0.8秒 and red RAGE/cracked face (elapsed 7.2 sec). Small transient JUST left of center fading after catch. A short low-left hint 保持しても時計は進む. Keep large clear aiming corridor from center to target.
```

<a id="hud-tps-rejected-01"></a>

## hud-tps-rejected-01

- ファイル：[hud-tps-01.webp](rejected/hud-tps-01.webp)
- 日付：2026-10-08
- 採否：不採用
- 理由：勝利印・HP・コストの塗りが数値と不一致であり、フェンスの発光も強いため修正する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-fd8ec974-e74d-4ae3-b41e-ac492717e18c.png`
- 形式：1600×900、401052 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/ui/title.webp`
2. `D:/T3test/arena/_preview/stage_tps_south.png`
3. `D:/T3test/core_ball/output/renders/state_1_panic.png`
4. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [title.webp](title.webp)
2. [stage_tps_south.png](D:/T3test/arena/_preview/stage_tps_south.png)
3. [state_1_panic.png](D:/T3test/core_ball/output/renders/state_1_panic.png)
4. [front.webp](../characters/volt/front.webp)

プロンプト全文：

```text
Use case: ui-mockup. ONE polished flat 16:9 Japanese PC game CORE-CRUSH screen, not an angled physical monitor. Use approved title image for visual language: illegal junk-city cyber cage sport, wet steel, distant neon cyan/pink, restrained grime, readable industrial typography. HTML/CSS reproducible rectangular panels #151D27 on #0B1016, text #E8F0F2, secondary #A9BBC8, selected border 2px. Keep decoration behind text, no cockpit clutter. Team A cyan #57C7FF with SQUARE A badge, Team B pink #FF718A with TRIANGLE B badge. Never use team badges as unrelated menu icons. One screen only, no explanatory collage. Image lettering will be replaced with normal fonts in implementation. Gameplay HUD: small top-center strip ROUND 2, square A wins 1 vs triangle B wins 0, match remaining time 02:14. Separate top-right danger clock clearly labeled 爆発まで and remaining seconds plus existing core LCD face stage. Bottom-left HP numeric and bar 76 / 94 for VOLT. Bottom middle-left COST 3.25 / 5 as exactly five segmented cells including quarter fill, STEP 1 / 2 as exactly two cells with refill-progress line. Bottom center-right two compact skill slots E オーバーチャージ and R ブリンク, visually marked 未実装 for current concept integration. Central fine cross reticle, lock name 敵 P2 ECHO slightly below. A small transient judgement placed left of reticle, never over ball. Large center clear of panels. Do not add minimap, weapons, ammo, chat or duplicate cores. Gameplay is 1v1. Third-person over shoulder gameplay. VOLT at lower-left (back visible) receiving one small incoming metal core near x60% y46%; ball completely visible against dark court with no glare over face. Opposing purple ECHO beyond central semi-transparent plasma fence. Danger clock 爆発まで 4秒, worried PANIC face (elapsed four seconds). Judgement GOOD left of center. Transparent fence and subdued background. UI remains in top 12% and bottom 14%, central 70% free. Wide arena eye-height camera, not aerial.
```

