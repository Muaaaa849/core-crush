# volt 生成記録

生成日は2026-10-08、生成器は内蔵GPT Image（image_gen）である。原本PNGはsourceに記録し、納品はWebP品質90である。画像内の文字は実装で通常のフォントへ置き換える。参照は生成時に渡した順で示す。可搬参照は対応するリポジトリ内WebPであり、元のPNGと圧縮状態は異なる。

## Tripo向けの注意

- front → left／back／rightの順で生成した。各側面・背面はそのキャラの正面を直接参照した。VOLT正面が共通体型の優先基準である。
- 1枚1方向で入力する。leftは鼻が画像左、rightは画像右を向く。背景は明灰色、全身、ニュートラルAポーズである。側面で腕が重なる場合は正面のAポーズを優先する。
- 同一メッシュの回転画像ではないため、縫い目・バックル・指・フードの微差がある。VOLTから共通モデルを確定し、他3体の配色・小装飾を適用する。4体を別々に生成しても共通骨格が自動で保証されるわけではない。
- 発光を形状として膨らませず、布・金属・発光を材質で分ける。肩、肘、膝、手首、足底とゲーム内の持ち球位置を合わせる。
- Tripoでの生成、リグ、トポロジー、可動域は未検証である。rejectedの画像を入力に使わない。

<a id="volt-front"></a>

## volt-front

- ファイル：[front.webp](front.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：採用。全身・Aポーズ・明灰色背景であり、4体共通の体型と衣服の基準とする。
- 原本：`C:/Users/phant/.codex/generated_images/01a118ea-8981-7951-b37e-20e81aacf3e5/exec-479b6e0e-91e4-4acc-a268-e8d91434ba9d.png`
- 形式：1024×1536、131470 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/T3test/arena/_preview/stage_wide.png`
2. `D:/T3test/core_ball/output/renders/state_0_calm.png`

可搬参照：

1. [stage_wide.png](D:/T3test/arena/_preview/stage_wide.png)
2. [state_0_calm.png](D:/T3test/core_ball/output/renders/state_0_calm.png)

プロンプト全文：

```text
Use case: stylized-concept. Tripo AI reconstruction reference for CORE-CRUSH. ONE character, ONE direction per image, no multi-view sheet. Full body from head to soles with 8% margin, centered, neutral anatomical A-pose with arms 30 degrees away from torso, elbows straight, palms readable and five separated relaxed fingers, feet shoulder width, identical proportions to all other roster variants. Near-orthographic camera at mid-body height, no foreshortening or dramatic lens. Plain light gray #DDE0E2 background, even neutral studio lighting, minimal contact shadow, no ground environment. Adult androgynous lean athletic cyborg street-sport contestant with short dark hair, exposed face, accessible shoulders, fingerless sport gloves, patched sleeveless technical jacket over close-fitting charcoal sport base layer, articulated knee guards and sturdy trainers. Junk-city repaired sporting wear, restrained metal plating and tiny luminous seams, clean readable forms suitable for game modeling. All variants use SAME body and SAME skeletal proportions and same outfit construction. Distinction is color and small trim modules, not muscular size, sex, or giant equipment. Team marking strip on upper chest and ankles stays neutral charcoal for later A/B overlay. No blue/pink team coloring, weapons, balls, floating objects, capes, text, letters, numbers, logos, labels, border, or watermark. References show game material language ONLY, do not put the arena or core into the image. VOLT base mustard #D8A52A, tiny pale gold luminous trim #FFE27A. Small angular bevel pattern at wrists and calf cuffs. FRONT VIEW, perfectly straight toward camera, symmetric neutral pose, one figure only. This is the master design for the shared body and clothing.
```

<a id="volt-left"></a>

## volt-left

- ファイル：[left.webp](left.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-49852319-499e-4fd1-815e-e53eb66f42d7.png`
- 形式：1024×1536、84362 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [front.webp](front.webp)

プロンプト全文：

```text
Use case: stylized-concept. CORE-CRUSH Tripo AI 3D reconstruction reference. ONE full-body adult character, ONE view only. Reference image 1 is the exact approved master VOLT front: preserve the same face, hair, body proportions, height, limb lengths, shoulder width, sleeveless hooded vest, fitted dark inner top, cargo trousers, forearm guards, fingerless gloves, knee pads and trainers. Preserve anatomy and outfit construction. Neutral A-pose, arms 30 degrees out from torso, straight relaxed elbows, relaxed fingers, feet shoulder width. Near orthographic camera at mid-body level, no perspective distortion. Entire hair and both soles visible with comfortable 6 percent margins. Flat light gray #DDE0E2 seamless background, even studio light, faint contact shadow. No letters, numbers, logos, text, labels, weapons, balls, floating objects, team badges, dramatic effects or environment. Keep all team marking strips neutral charcoal. One figure, no inset or multi-view. VOLT exact same design and mustard #D8A52A / pale gold #FFE27A. Rotate CAMERA to see character's anatomical LEFT SIDE, pure 90-degree side profile, nose and shoes point toward IMAGE LEFT. Torso/hips/head all strictly side-on; no three-quarter view. Keep the SAME A-pose in 3D; do not rotate arms to face camera. Far arm may naturally be occluded. Preserve outfit thickness, hip pockets, low folded hood, knee pads, limb proportions. No backpack. Do not mirror the front design.
```

<a id="volt-right"></a>

## volt-right

- ファイル：[right.webp](right.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-c97c1775-838e-4108-b593-8584ae1f52a3.png`
- 形式：1024×1536、76256 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [front.webp](front.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. VOLT palette #D8A52A / #FFE27A. Strict 90 degree RIGHT SIDE PROFILE, nose and both shoes point toward IMAGE RIGHT. Show character's anatomical right side. Torso, pelvis and head all side-on, no three-quarter. Far arm can be occluded. Camera rotation only, no pose change.
```

<a id="volt-back"></a>

## volt-back

- ファイル：[back.webp](back.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-8989c6df-b002-499f-b55c-88c43f594dd8.png`
- 形式：1024×1536、117170 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-896a2b28-31fb-4012-8e35-044323806dcb.png`
2. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [back-01.webp](rejected/back-01.webp)
2. [front.webp](front.webp)

プロンプト全文：

```text
Use case: precise-object-edit. Image 1 is an incorrect two-person sheet. DELETE the left figure completely. Keep ONLY the rear-facing figure from the right, enlarge and center this single figure on a portrait light gray #DDE0E2 canvas. Image 2 is identity and garment material reference only, do not copy its front-facing pose. Final output: exactly ONE person seen from BEHIND, one view, no inset, no second person, no text. Neutral A-pose, same proportions and outfit, full hair to soles with 6% margin, near orthographic camera. Do not redesign the surviving figure. Output a single centered BACK view only.
```

<a id="volt-back-rejected-01"></a>

## volt-back-rejected-01

- ファイル：[back-01.webp](rejected/back-01.webp)
- 日付：2026-10-08
- 採否：不採用
- 理由：正面と背面の二体があり、一枚一方向の条件を満たさない。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-896a2b28-31fb-4012-8e35-044323806dcb.png`
- 形式：1024×1536、195868 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [front.webp](front.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. VOLT palette #D8A52A / #FFE27A. BACK VIEW: exactly 180 degrees from front, back of head and clothing, no face visible. Same symmetrical A-pose, show back seam construction and folded hood, no backpack.
```

