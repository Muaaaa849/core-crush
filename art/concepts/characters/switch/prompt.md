# switch 生成記録

生成日は2026-10-08、生成器は内蔵GPT Image（image_gen）である。原本PNGはsourceに記録し、納品はWebP品質90である。画像内の文字は実装で通常のフォントへ置き換える。参照は生成時に渡した順で示す。可搬参照は対応するリポジトリ内WebPであり、元のPNGと圧縮状態は異なる。

## Tripo向けの注意

- front → left／back／rightの順で生成した。各側面・背面はそのキャラの正面を直接参照した。VOLT正面が共通体型の優先基準である。
- 1枚1方向で入力する。leftは鼻が画像左、rightは画像右を向く。背景は明灰色、全身、ニュートラルAポーズである。側面で腕が重なる場合は正面のAポーズを優先する。
- 同一メッシュの回転画像ではないため、縫い目・バックル・指・フードの微差がある。VOLTから共通モデルを確定し、他3体の配色・小装飾を適用する。4体を別々に生成しても共通骨格が自動で保証されるわけではない。
- 発光を形状として膨らませず、布・金属・発光を材質で分ける。肩、肘、膝、手首、足底とゲーム内の持ち球位置を合わせる。
- Tripoでの生成、リグ、トポロジー、可動域は未検証である。rejectedの画像を入力に使わない。

<a id="switch-front"></a>

## switch-front

- ファイル：[front.webp](front.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：正面一体、全身、Aポーズ、無地背景を確認した。VOLT基準の配色・小装飾案として採用する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-68ae59de-8599-477f-a488-b958c2322fda.png`
- 形式：1024×1536、115134 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/volt/front.webp`

可搬参照：

1. [front.webp](../volt/front.webp)

プロンプト全文：

```text
Use case: stylized-concept. CORE-CRUSH Tripo AI 3D reconstruction reference. ONE full-body adult character, ONE view only. Reference image 1 is the exact approved master VOLT front: preserve the same face, hair, body proportions, height, limb lengths, shoulder width, sleeveless hooded vest, fitted dark inner top, cargo trousers, forearm guards, fingerless gloves, knee pads and trainers. Preserve anatomy and outfit construction. Neutral A-pose, arms 30 degrees out from torso, straight relaxed elbows, relaxed fingers, feet shoulder width. Near orthographic camera at mid-body level, no perspective distortion. Entire hair and both soles visible with comfortable 6 percent margins. Flat light gray #DDE0E2 seamless background, even studio light, faint contact shadow. No letters, numbers, logos, text, labels, weapons, balls, floating objects, team badges, dramatic effects or environment. Keep all team marking strips neutral charcoal. One figure, no inset or multi-view. Create SWITCH FRONT VIEW, straight toward viewer. Change mustard cloth and yellow trims only to muted copper #BB7657 and subtle pale peach light #FFD0A0. Small two offset rectangular engravings on wrist plates, no silhouette or equipment-size change. Same person/body/pose/outfit, material variant.
```

<a id="switch-left"></a>

## switch-left

- ファイル：[left.webp](left.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-762c709d-276c-41d0-a8c3-35bb280956eb.png`
- 形式：1024×1536、70120 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/switch/front.webp`
2. `D:/corecrush/art/concepts/characters/volt/left.webp`

可搬参照：

1. [front.webp](front.webp)
2. [left.webp](../volt/left.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. SWITCH palette #BB7657 / #FFD0A0. Strict 90 degree LEFT SIDE PROFILE, nose and both shoes point toward IMAGE LEFT. Show character's anatomical left side. Torso, pelvis and head all side-on, no three-quarter. Far arm can be occluded. Camera rotation only, no pose change.
```

<a id="switch-back"></a>

## switch-back

- ファイル：[back.webp](back.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：背面一体、全身、Aポーズ、無地背景を確認した。フードと装具の背面参考として採用する。縫い目・パネル割りの微差は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-72185dba-b1ec-4a59-93b7-ff58e45bade4.png`
- 形式：1024×1536、111180 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/switch/front.webp`

可搬参照：

1. [front.webp](front.webp)

プロンプト全文：

```text
Use case: identity-preserve. Rotate the SOLE existing figure in image 1 in place to face directly AWAY from viewer. Output only one person from behind, no comparison, no inset, no front figure. Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. SWITCH palette #BB7657 / #FFD0A0. BACK VIEW: exactly 180 degrees from front, back of head and clothing, no face visible. Same symmetrical A-pose, show back seam construction and folded hood, no backpack. FINAL CHECK: exactly ONE centered figure, only BACK of head visible.
```

<a id="switch-right"></a>

## switch-right

- ファイル：[right.webp](right.webp)
- 日付：2026-10-08
- 採否：採用
- 理由：側面一体、全身、指定方向、無地背景を確認した。遠側の手足の重なりは正面Aポーズと併用し、細部は共通モデルへ統合する。
- 原本：`C:/Users/phant/.codex/generated_images/01a118f3-d970-7cf0-86f9-8aac5605cd3e/exec-acca5c85-a8aa-407c-b149-5dbf9591634b.png`
- 形式：1024×1536、72180 bytes
- 加工：手描き修正なし。GPT Imageで生成・修正し、sharpでWebP品質90へ変換。UIのみ余白保持で1600×900へ整形。

参照（生成時）：

1. `D:/corecrush/art/concepts/characters/switch/front.webp`
2. `D:/corecrush/art/concepts/characters/volt/left.webp`

可搬参照：

1. [front.webp](front.webp)
2. [left.webp](../volt/left.webp)

プロンプト全文：

```text
Use case: stylized-concept. ONE full-body character, ONE direction only, Tripo modeling reference. Image 1 is this character's approved front and identity/material master. Any additional image is the common outfit geometry reference only. Preserve EXACT same adult face, short hair, lean body, limb proportions, hooded sleeveless vest, inner top, cargo pockets, forearm plates, gloves, knee guards and trainers. A-pose in 3D with arms 30 degrees away from torso, straight relaxed elbows, feet shoulder width; do not change pose to expose hidden limbs. Camera nearly orthographic at mid-body level. Entire hair and soles inside frame, 6% clear margin. Uniform light gray #DDE0E2 background, soft even studio light, faint contact shadow. No text, logo, symbols resembling letters, weapons, ball, props, backpack or floating objects. Team strips charcoal. SWITCH palette #BB7657 / #FFD0A0. Strict 90 degree RIGHT SIDE PROFILE, nose and both shoes point toward IMAGE RIGHT. Show character's anatomical right side. Torso, pelvis and head all side-on, no three-quarter. Far arm can be occluded. Camera rotation only, no pose change.
```

