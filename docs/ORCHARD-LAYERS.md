# 果园午后 · 原 0.8.5 分层微风（独立版 1.0.0 继承）

这一轮仅处理「果园午后」。静态源图仍是用户提供的 `assets/duo-orchard.jpg`，1280 × 1280。人物没有交给模型重画，也没有全画面 UV 扭曲。

## 素材与运动

原始 RGB 按手工贝塞尔轮廓分成：原背景、西西主体、娅娅主体、西西的两段外侧辫尾、娅娅的三段外侧长发、下方裙摆、前景苹果叶枝与篮子，另外输出六片原像素根部覆盖片。运行时共 16 张透明层叠在补底图之上。

主体只做 0.28 / 0.24 原图像素以内的整体上下微移，周期 5.4 / 7.1 秒。肩膀、腋下与面部内部没有局部拉伸。头发、衣物使用独立透明网格，从根部到末梢渐增 0.22–0.4 度的轻摆；发束、衣物和根部覆盖片继承所属人物的位移。手工轮廓在帽沿草编、细碎飞丝处为近似，当前适合微动，不能直接加大成大幅动作。

背景底图由内置 imagegen 去除人物后补画。只在原人物遮挡处使用生成内容，当前可见背景仍由原图像素覆盖。对发束、布料与人物边界，离线程序向洞内延伸 10px 邻近原纹理，补齐微动露出的细缝；当前所有活动层的保守位移上界小于 3px。根部另保留原图覆盖片。这个补底支持当前微幅动作，不等于补出了完整的隐藏人体或衣物结构。

眨眼仍使用已制作的局部闭眼关键帧，只有眼部遮罩参与混合。调色板「果园分层微风」与「果园轻眨眼」各自独立；关闭分层后回到 0.8.4 的轻眨眼方式。后台、专注和减少动态时回退静态；输入、滚轮与滚动时暂时冻结，最后事件 220ms 后恢复。

## 独立版源码与验证

运行用 PNG 已包含于 theme/assets/layered，坐标规格位于 theme/design/orchard-layer-spec.json，补底为 theme/assets/orchard-layer-underpaint.png。独立版构建直接使用这些成品图层，无需重新生成。原制作阶段的生成源文件和离线制作脚本未纳入这份安装项目。主题集成验证使用 tests/theme-browser.cjs。

## imagegen 记录

使用内置工具，未调用付费视频模型。输入为用户果园原图，原生成源文件保留于先前制作工作区；本项目携带运行用补底 orchard-layer-underpaint.png。

最终提示词：

> Use case: precise-object-edit. Edit the supplied square orchard illustration into a clean background plate for layered animation. Remove BOTH female characters entirely, including all skin, hair, hats, clothes, the blue flowing ribbons, their hands and the held woven basket. Reconstruct the occluded orchard with matching softly focused green foliage, warm dappled afternoon sunlight, subtle branches and distant apples. Preserve the exact original square framing, camera angle, overall colors and the existing visible background. Keep the large foreground red apple and leaves in the upper left and the branches/leaves across the top at their exact positions. There must be no humans, hair, body fragments or character silhouettes remaining. Match the painterly anime rendering of the original. No text. This is an occlusion-repair plate, not a new composition.
