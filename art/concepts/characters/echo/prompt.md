# echo 生成記録

生成日は2026-10-08、生成器は内蔵GPT Image（image_gen）である。原本PNGはsourceに記録し、納品はWebP品質90である。画像内の文字は実装で通常のフォントへ置き換える。参照は生成時に渡した順で示す。可搬参照は対応するリポジトリ内WebPであり、元のPNGと圧縮状態は異なる。

## Tripo向けの注意

- front → left／back／rightの順で生成した。各側面・背面はそのキャラの正面を直接参照した。VOLT正面が共通体型の優先基準である。
- 1枚1方向で入力する。leftは鼻が画像左、rightは画像右を向く。背景は明灰色、全身、ニュートラルAポーズである。側面で腕が重なる場合は正面のAポーズを優先する。
- 同一メッシュの回転画像ではないため、縫い目・バックル・指・フードの微差がある。VOLTから共通モデルを確定し、他3体の配色・小装飾を適用する。4体を別々に生成しても共通骨格が自動で保証されるわけではない。
- 発光を形状として膨らませず、布・金属・発光を材質で分ける。肩、肘、膝、手首、足底とゲーム内の持ち球位置を合わせる。
- Tripoでの生成、リグ、トポロジー、可動域は未検証である。rejectedの画像を入力に使わない。

<a id="echo-front"></a>

## echo-front

- ファイル：[front.webp](front.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：正面一体、全身、Aポーズ、無地背景を確認した。VOLT基準の配色・小装飾案として採用する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-7e5e3cff-8b64-49d9-a0b2-69b9d6bbadc0.png`
- 形式：1024×1536、114120 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [front.webp](../volt/front.webp)

プロンプト全文：

```text
Use case: stylized-concept. CORE-CRUSH Tripo AI 3D reconstruction reference. ONE full-body adult character, ONE view only. Reference image 1 is the exact approved master VOLT front: preserve the same face, hair, body proportions, height, limb lengths, shoulder width, sleeveless hooded vest, fitted dark inner top, cargo trousers, forearm guards, fingerless gloves, knee pads and trainers. Preserve anatomy and outfit construction. Neutral A-pose, arms 30 degrees out from torso, straight relaxed elbows, relaxed fingers, feet shoulder width. Near orthographic camera at mid-body level, no perspective distortion. Entire hair and both soles visible with comfortable 6 percent margins. Flat light gray #DDE0E2 seamless background, even studio light, faint contact shadow. No letters, numbers, logos, text, labels, weapons, balls, floating objects, team badges, dramatic effects or environment. Keep all team marking strips neutral charcoal. One figure, no inset or multi-view. Create ECHO FRONT VIEW, directly facing viewer. Change mustard cloth and yellow trim only to muted purple #8067B5 and subtle lavender light #CBB4FF. Small concentric seam detail on wrist plates instead of angled bevel motif, but no change to silhouette or equipment size. Same person, same body, same pose, same outfit as VOLT; a material variant.
```

<a id="echo-left"></a>

## echo-left

- ファイル：[left.webp](left.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-e85afbae-09c7-4104-959c-ed95182d30e0.png`
- 形式：1024×1536、74332 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/echo/front.webp`
2. `D:/corecrush/art/concepts/characters/volt/left.webp`

可搬参照：

1. [front.webp](front.webp)
2. [left.webp](../volt/left.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. ECHO palette #8067B5 / #CBB4FF. Strict 90 degree LEFT SIDE PROFILE, nose and both shoes point toward IMAGE LEFT. Show character's anatomical left side. Torso, pelvis and head all side-on, no three-quarter. Far arm can be occluded. Camera rotation only, no pose change.
```

<a id="echo-right"></a>

## echo-right

- ファイル：[right.webp](right.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-fc8a8a29-eb40-4503-885f-3e4b7b121d4c.png`
- 形式：1024×1536、71194 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/echo/front.webp`
2. `D:/corecrush/art/concepts/characters/volt/left.webp`

可搬参照：

1. [front.webp](front.webp)
2. [left.webp](../volt/left.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. ECHO palette #8067B5 / #CBB4FF. Strict 90 degree RIGHT SIDE PROFILE, nose and both shoes point toward IMAGE RIGHT. Show character's anatomical right side. Torso, pelvis and head all side-on, no three-quarter. Far arm can be occluded. Camera rotation only, no pose change.
```

<a id="echo-back"></a>

## echo-back

- ファイル：[back.webp](back.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-904cd33f-8af4-409a-9c37-a3826fbbd4a4.png`
- 形式：1024×1536、102636 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-e803f980-73b1-461a-ad59-f120bff34bb5.png`
2. `D:/corecrush/art/concepts/characters/echo/front.webp`

可搬参照：

1. [back-01.webp](rejected/back-01.webp)
2. [front.webp](front.webp)

プロンプト全文：

```text
Use case: precise-object-edit. Image 1 is an incorrect two-person sheet. DELETE the left figure completely. Keep ONLY the rear-facing figure from the right, enlarge and center this single figure on a portrait light gray #DDE0E2 canvas. Image 2 is identity and garment material reference only, do not copy its front-facing pose. Final output: exactly ONE person seen from BEHIND, one view, no inset, no second person, no text. Neutral A-pose, same proportions and outfit, full hair to soles with 6% margin, near orthographic camera. Do not redesign the surviving figure. Output a single centered BACK view only.
```

<a id="echo-back-rejected-01"></a>

## echo-back-rejected-01

- ファイル：[back-01.webp](rejected/back-01.webp)
- 日付：2026-10-08
- 採否：不採用
- 理由：正面と背面の二体があり、一枚一方向の条件を満たさない。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-e803f980-73b1-461a-ad59-f120bff34bb5.png`
- 形式：1024×1536、164080 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/echo/front.webp`

可搬参照：

1. [front.webp](front.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. ECHO palette #8067B5 / #CBB4FF. BACK VIEW: exactly 180 degrees from front, back of head and clothing, no face visible. Same symmetrical A-pose, show back seam construction and folded hood, no backpack.
```

