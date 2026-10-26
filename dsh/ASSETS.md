# 素材与分层记录

此文保留 Codex 上游素材制作历史，文中的 `theme/assets/` 在 DSH 版对应本目录的 `assets/`；`theme/manifest.json` 对应 `theme.json`。DSH 的素材路径以 `theme.json` 为准。历史几何与分层说明可在同仓库的 [场景几何文档](https://github.com/buruqu/sunlit-tides-codex/blob/v1.2.10/docs/SCENE-MOTION-GEOMETRY.md) 和 [果园分层文档](https://github.com/buruqu/sunlit-tides-codex/blob/v1.2.10/docs/ORCHARD-LAYERS.md) 查阅，独立 DSH 源码包不另复制这些上游文档。

1.1.4 恢复可选背景相册：两张主线背景为亮色「果园午后」和暗色「夜色相依」，原有 14 张图连同新夜景共 15 张可选。1.2.0 新增夜景动作辅助素材，原图保留；辅助图只在指定小区域采样。

## 1.2.0 夜景动作辅助图

- `night-motion-clean.png`：使用内置 imagegen 从用户夜景原图生成的人物遮挡补底，1537×1023。运行时只在可动末端原位置露出的空隙使用；其他背景和人物继续直接使用原图。
- `night-motion-blink.png`：使用内置 imagegen 生成两人闭眼关键帧，1537×1023。只在四个眼区的软边椭圆内采样，不替换脸部或全图。运行时按原图 1272×847 等比归一。
- 生成输入均为 `duo-night-companion.jpg`；无外部视频服务。保留原水印与原始构图。路径和固定锚点见 `SCENE-MOTION-GEOMETRY.md`，分层蒙版由浏览器 Path2D 从 JSON 规格一次生成。

补底提示要点：只移除两个人物及衣物、发饰、丝带，修复被遮挡的长椅和环境；保持原有视角、立柱、灯光、水印与画幅，不添加新物品。仅用于末端微动后露出的缝隙。

眨眼提示要点：只将四只眼睛改为自然轻闭，保持人物位置、头部角度、表情、发型、服装、背景和水印不变；只采样小眼区。

1.2.1 沿用以上原图与生成资产，没有重新生成图片。夜景扩展为六个可动片，增加长发束与垂落袖口；运行时仅在孔内将相邻静态原图像素延展至多 9 像素，避免大一些的摆幅露出错误地面纹理。原始资产字节不变，动画零位仍重建原图。源码参数见 `night-motion-spec.json` 和 `theme/manifest.json`。

| 用途 | 源文件（相对 theme/assets） | 来源 |
| --- | --- | --- |
| 果园午后 | duo-orchard.jpg | 用户提供的 1280×1280 插画，原文件保留 |
| 夜色相依（暗色默认） | duo-night-companion.jpg | 用户提供的 1272×847 双人截图，保留原文件及署名 |
| 昭日遇见暗潮（保留） | duo-night.png | 内置 imagegen 参考角色素材创作，旧背景保留供换回 |
| 西西立绘 | sigrika-cutout.png | 用户原图经内置 imagegen 透明底处理 |
| 暗面西西立绘 | sigrika-night-cutout.png | 用户夜色睡衣插画经内置 imagegen 移除背景与前景外来手臂，裁成半身透明图 |
| 娅娅亮色立绘 | dsh/denia_character_right.webp | DSH 上游原始素材 |
| 娅娅暗色立绘 | dsh/denia_character_left_dark.webp | DSH 上游原始抬手半身素材，按用户指定放在右侧 |
| 娅娅明暗 Q 版 | dsh/denia_chibi*.gif | DSH 上游原始素材 |
| 西西吃饭表情 | sigrika-emote.gif | 用户提供，原字节 GIF，仅修正附件后缀 |
| 暗面西西表情 | sigrika-night-emote.gif | 用户提供，300×300、27 帧原字节 GIF，仅将错误的 .jpg 后缀改为 .gif |
| 消息团子 | xixi-dumpling.jpg、yaya-dumpling.jpg | 用户提供 |
| 导航与明信片 | sigrika-breeze.jpg、sigrika-dream.jpg、sigrika-train.jpg、duo-heart.jpg、duo-story.jpg、duo-evening.jpg | 用户提供 |
| 恢复的旧相册素材 | sigrika-daydream.jpg、sigrika-paws.jpg、denia-paws.jpg | 旧主题素材库原字节复制，保留既有用户素材归属 |
| 明暗宫殿背景 | dsh/denia_palace_light.webp、dsh/denia_palace_dark.webp | 旧主题 DSH 素材原字节复制，沿用 licenses/DSH-NOTICE.txt 与 DSH-LICENSE.txt |
| 果园图层 | layered/*.png | 原图 RGB + 手工贝塞尔透明遮罩 |
| 果园补底 | orchard-layer-underpaint.png | imagegen 补底及局部邻近原纹理延伸 |
| 闭眼帧 | orchard-blink.png | imagegen 编辑，仅保留两个眼区 |

源码已经包含运行用图层和补底，普通构建不需要调用图像生成服务。手工坐标规格位于 `theme/design/orchard-layer-spec.json`，分层方法和微动限制见 [ORCHARD-LAYERS.md](ORCHARD-LAYERS.md)。

## 1.2.2 左下角水印修复

按用户本次明确要求，暗色主背景「夜色相依」使用 `duo-night-companion-clean.svg`。原始 `duo-night-companion.jpg` 保留，来源与版权归属不变。内置 imagegen 对水印生成修复画面 `night-corner-repair-generated.png`；由于生成的整图存在轻微配准变化，运行时只通过 SVG 局部遮罩采用左下角修复，其他位置仍使用原 JPEG。`scripts/build-night-clean-corner.cjs` 可重建这份组合素材。浏览器解码验证：1272×847，x<300 且 y≥780 之外所有 RGBA 通道差异为零。静态背景、相册缩略图与动态渲染共用同一素材。

工具：内置 `image_gen`，不使用外部 API。实际提示词：

> Use case: precise-object-edit. Edit target: the supplied 1272 by 847 pixel illustration. Remove ONLY the small white watermark/signature lettering and tiny white wing icons in the bottom-left corner, approximately x=14 to 285 and y=792 to 826. Reconstruct the underlying warm terracotta pavement, straight grout lines and bench support seamlessly from the immediately adjacent existing scene. Keep the exact 1272x847 canvas and framing, same perspective and continuous architectural lines. Do not crop or resize the image. Keep ALL other pixels, both women, faces, eyes, hair, fingers, clothes, bench, pillar, background reflections and lighting exactly unchanged and precisely registered; this is a tiny localized corner repair for an existing animation. No new text or logo. Output the full edited illustration.

## 生成记录

双人夜景使用的提示词：

> Create a polished delicate anime game illustration, wide 16:9 desktop background, using the exact two character identities. Sigrika has orange braids, mint green eyes, white/lavender/black outfit, silver ornaments and gold details. Denia is in her DARK FORM: pale pink hair fading to lavender/blue, violet eyes, navy/black dress with white bow and gold chains, starry cobalt gloves, floating dark blue stellar ring. Do not use her light white outfit or red gloves. Scene: Sunlight meeting the dark tide. A quiet moonlit glass conservatory beside a still lake. Sigrika offers a tiny warm golden light in her open hand with gentle concern. Denia looks back with reserved, wistful, guarded tenderness, her fingertips hovering toward the light with a small gap. Quiet uncertainty, care and tentative trust. Faint bubbles and distant stars. Place the characters on the right 55%, with faces in the upper right third and three-quarter bodies. Leave the left 40% as uninterrupted dark indigo negative space for UI. Deep plum and indigo, muted teal moonlight and warm amber around Sigrika. Accurate faces and hands. No text, UI, logos or watermarks.

西西透明底处理：只移除纯黑背景，输出透明底，保留完整身体、橙色长辫、头饰、原有服装、姿势和脸部身份，四肢与发梢不裁切；不添加背景、文字或装饰。AI 编辑仍可能改变少量细节，不标为原像素抠图。

闭眼帧：

> Edit the supplied square orchard illustration ONLY at both eyes of the pink-haired woman under the straw hat. Gently close both eyes with natural relaxed eyelid lines and eyelashes, no iris. Preserve exact facial position, size, head tilt, smile, all hair, shading, colors, clothes, apples and background. Orange-haired woman's already closed eyes stay unchanged. At 1280 square, eye centers approximately (806,315) and (750,374). Same framing, no beautification or new elements; this is an aligned blink keyframe.

补底提示词保留在 ORCHARD-LAYERS.md。角色及插画权利不因分层或 AI 编辑转为本项目原创；参见根目录 NOTICE.md。

## 1.1.1 暗面西西

2026-10-23 用户明确指定两张附件用于暗面左侧立绘与表情。立绘原图为 `codex-clipboard-ed744a22-034b-4e16-95a5-185bfa1d5bca.jpg`，SHA-256 `bfb873320ee6f8507282d386ffee50533904765cdac69878ad5a7afa61797a58`。输出透明 PNG 为 1156×1361，SHA-256 `10c248645f9528d08b36d1551367568009c2a970de2e0d00c351b05513acc15c`。

使用内置 imagegen 编辑，实际提示词：

> Use case: background-extraction. Edit the provided anime illustration into a clean transparent PNG desktop UI character standee. Preserve the orange-haired character's exact face, surprised expression, emerald eyes, braids, hair accessories, cool blue nighttime illumination, blue short-sleeve pajama shirt, pose, her own raised hand on the viewer left and her own hand across her waist. Output a WAIST-UP portrait crop, ending just below her own hand at the lower shirt area, no legs and no lower-body emphasis. Remove the entire bed, room, pillows, background, punctuation mark, and BOTH other-person foreground hands/arms; reconstruct only tiny hair/garment contours where those removed arms occluded the silhouette. Keep a natural clean edge to braids. Do not change the pose into standing, do not redesign clothes, do not add body parts, do not add text/name/border/shadow or any scenery. Maintain original crisp anime line art and blue-violet palette; genuine alpha transparency around isolated character, a tight portrait composition with 4% clear padding and all visible hair and her own raised hand inside frame. This is a nonsexual desktop companion illustration, focused on face and upper torso.

这是 AI 编辑结果，包含少量轮廓重建，不标为原像素抠图。表情原图为 `codex-clipboard-a82fc7eb-7186-4258-89fa-4a075183b425.jpg`，文件签名实际为 GIF89a；字节未重编码，SHA-256 `65c73bee62b4056c984b68ec09b7475d191b005b3e3f86575665f4af146f9008`。1.1.1 曾用 CSS 添加白色贴纸底；1.1.2 已移除该样式，恢复 GIF 自带的透明区域，人物颜色和 27 帧原动画未变。

## 1.1.2 暗面构图

娅娅改用已有 DSH 原素材 `denia_character_left_dark.webp`，SHA-256 `82951cfd1c2ac1b1fdea1ffe96b011211c35de2644d8b1ea06d370606ef39894`，复制到本项目时未重编码、翻转或重绘。

夜景 `duo-night.png` 保持原字节，通过等比缩放与响应式取景让双人向主区中间靠拢。没有对人物施加变形，也没有修改亮色果园图层。

## 1.1.3 夜色相依试用

用户附件 `codex-clipboard-af6f5245-6365-4909-b7b6-1f38d62c0655.jpg` 原字节复制为 `duo-night-companion.jpg`，1272×847，SHA-256 `d990b89d6149a24eb83e4999e6fe778c0385ddd0d61c6c76d57c8485e718a764`。图片及已有署名没有重绘或抹除；仅由主题 CSS 等比取景及暗色遮罩呈现，保留原先双侧立绘和动态表情。

这是本机试用背景。旧 `duo-night.png` 源文件和 1.1.2 安装包仍保留，方便之后比较或换回。`duo-night` 运行时别名在试用版指向新图，固定场景 ID 仍为 `night`，不改变现有亮暗设置键。
