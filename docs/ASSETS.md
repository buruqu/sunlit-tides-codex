# 素材与分层记录

运行时只提供两套壁纸；其余图片作为侧栏、立绘、消息头像及首页明信片使用，不提供另一个相册选择面板。

| 用途 | 源文件（相对 theme/assets） | 来源 |
| --- | --- | --- |
| 果园午后 | duo-orchard.jpg | 用户提供的 1280×1280 插画，原文件保留 |
| 昭日遇见暗潮 | duo-night.png | 内置 imagegen 参考角色素材创作 |
| 西西立绘 | sigrika-cutout.png | 用户原图经内置 imagegen 透明底处理 |
| 娅娅明暗立绘 | dsh/denia_character_right*.webp | DSH 上游原始素材 |
| 娅娅明暗 Q 版 | dsh/denia_chibi*.gif | DSH 上游原始素材 |
| 西西吃饭表情 | sigrika-emote.gif | 用户提供，原字节 GIF，仅修正附件后缀 |
| 消息团子 | xixi-dumpling.jpg、yaya-dumpling.jpg | 用户提供 |
| 导航与明信片 | sigrika-breeze.jpg、sigrika-dream.jpg、sigrika-train.jpg、duo-heart.jpg、duo-story.jpg、duo-evening.jpg | 用户提供 |
| 果园图层 | layered/*.png | 原图 RGB + 手工贝塞尔透明遮罩 |
| 果园补底 | orchard-layer-underpaint.png | imagegen 补底及局部邻近原纹理延伸 |
| 闭眼帧 | orchard-blink.png | imagegen 编辑，仅保留两个眼区 |

源码已经包含运行用图层和补底，普通构建不需要调用图像生成服务。手工坐标规格位于 `theme/design/orchard-layer-spec.json`，分层方法和微动限制见 [ORCHARD-LAYERS.md](ORCHARD-LAYERS.md)。

## 生成记录

双人夜景使用的提示词：

> Create a polished delicate anime game illustration, wide 16:9 desktop background, using the exact two character identities. Sigrika has orange braids, mint green eyes, white/lavender/black outfit, silver ornaments and gold details. Denia is in her DARK FORM: pale pink hair fading to lavender/blue, violet eyes, navy/black dress with white bow and gold chains, starry cobalt gloves, floating dark blue stellar ring. Do not use her light white outfit or red gloves. Scene: Sunlight meeting the dark tide. A quiet moonlit glass conservatory beside a still lake. Sigrika offers a tiny warm golden light in her open hand with gentle concern. Denia looks back with reserved, wistful, guarded tenderness, her fingertips hovering toward the light with a small gap. Quiet uncertainty, care and tentative trust. Faint bubbles and distant stars. Place the characters on the right 55%, with faces in the upper right third and three-quarter bodies. Leave the left 40% as uninterrupted dark indigo negative space for UI. Deep plum and indigo, muted teal moonlight and warm amber around Sigrika. Accurate faces and hands. No text, UI, logos or watermarks.

西西透明底处理：只移除纯黑背景，输出透明底，保留完整身体、橙色长辫、头饰、原有服装、姿势和脸部身份，四肢与发梢不裁切；不添加背景、文字或装饰。AI 编辑仍可能改变少量细节，不标为原像素抠图。

闭眼帧：

> Edit the supplied square orchard illustration ONLY at both eyes of the pink-haired woman under the straw hat. Gently close both eyes with natural relaxed eyelid lines and eyelashes, no iris. Preserve exact facial position, size, head tilt, smile, all hair, shading, colors, clothes, apples and background. Orange-haired woman's already closed eyes stay unchanged. At 1280 square, eye centers approximately (806,315) and (750,374). Same framing, no beautification or new elements; this is an aligned blink keyframe.

补底提示词保留在 ORCHARD-LAYERS.md。角色及插画权利不因分层或 AI 编辑转为本项目原创；参见根目录 NOTICE.md。
