# vfx 生成記録

生成日は2026-10-08、生成器は内蔵GPT Image（image_gen）である。原本PNGはsourceに記録し、納品はWebP品質90である。画像内の文字は実装で通常のフォントへ置き換える。参照は生成時に渡した順で示す。可搬参照は対応するリポジトリ内WebPであり、元のPNGと圧縮状態は異なる。

<a id="vfx-contact-sheet"></a>

## vfx-contact-sheet

- ファイル：[contact-sheet.webp](contact-sheet.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用（修正版の形）。7種類を区別でき、球の中心・外縁を空け、爆発中心を空にし、フェンス波紋を垂直面へ修正した。枝火花・小破片の総数は画像から数えず仕様の本数上限を使う。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-2b29f243-e689-444f-963d-4c17ecce142e.png`
- 形式：1536×1024、229916 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-408a6fc7-4dd8-44df-aac2-15b8de97fb86.png`

可搬参照：

1. [contact-sheet-01.webp](rejected/contact-sheet-01.webp)

プロンプト全文：

```text
Use case: precise-object-edit. Preserve this CORE-CRUSH seven-effect concept sheet, its layout and cells 1 through 6. Correct cell 7 FENCE only: remove the horizontal Saturn-like rings that touch the sphere. Replace with ONE circular expanding segmented cyan ripple lying in the VERTICAL fence plane, behind and OUTSIDE the core silhouette, with a clearly empty dark gap all around the core edge; radius about 1.35 times ball radius. No line crosses or touches sphere. Dim hex mesh directly behind sphere. In timing legend change white FLASH star to AMBER #FFA040 and label LOCAL FLASH 80 ms. No full-screen white flash, no white filled disk. Keep the explosion center dark and empty. Concept board, no other redesign.
```

<a id="vfx-contact-sheet-rejected-01"></a>

## vfx-contact-sheet-rejected-01

- ファイル：[contact-sheet-01.webp](rejected/contact-sheet-01.webp)
- 日付：2026-10-08
- 採否：不採用
- 理由：フェンス波紋が水平で球外縁に接触し、閃光凡例が白のため修正する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-408a6fc7-4dd8-44df-aac2-15b8de97fb86.png`
- 形式：1536×1024、235436 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/T3test/core_ball/output/renders/state_0_calm.png`

可搬参照：

1. [state_0_calm.png](D:/T3test/core_ball/output/renders/state_0_calm.png)

プロンプト全文：

```text
Use case: stylized-concept. CORE-CRUSH game VFX art direction sheet, landscape wide 2 rows x 4 columns on dark graphite #0B1016. Exactly seven numbered/labeled effect cells and one timing legend cell. Core reference image defines metallic hazard shell and LCD; repeated spheres are separate diagrams not simultaneous gameplay. Each core must have CLEAR FACE, CLEAR SPHERICAL EDGE, and a completely empty dark annular gap of about 15% ball radius before any VFX starts. All effects OUTSIDE ball silhouette, no glow veil or full-screen flash. Top row: SO-SO: three short pale blue #7FC8FF outward sparks plus faint thin open ring; GOOD: five bright cyan #19E6FF sparks plus thin open ring; JUST: eight short white #FFFFFF sparks with cyan halo confined to spark tips and two broken arcs, no white fill; CATCH: gold #FFD84A segmented ring contracting toward but stopping outside core edge. Bottom row: HIT: four red-orange #FF5533 angular splinters on outer side, core unobscured; EXPLOSION: core disappears, empty DARK center surrounded by twelve amber #FF7A2A shell chips and a thin expanding broken ring, small amber local rim glow only, no fireball; FENCE: transparent vertical faint hex mesh with cyan #19E6FF localized expanding ripple around a passing core, core and edge clear; final cell simple timeline legend sparks 120ms / ring 160ms / flash 80ms / debris 220ms / ripple 180ms. Sober production concept board, large effect shapes, tidy labels outside cells. No white screen, no dense fog, no lens flare over sphere. Single sheet.
```

