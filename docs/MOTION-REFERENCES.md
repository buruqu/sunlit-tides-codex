# 动态壁纸制作参考

2026-10-25，按用户要求研究并用于 1.2.5 的运动设计。

## 已核对的来源

- [Vell：Wallpaper engine - Basics of animating hair](https://www.youtube.com/watch?v=mEqdqv06U2Y)：作者说明使用 Water Waves 与 Shake，章节包括方向、尺度、融合、Flow phase 和随机变化。本次取得作者说明与章节，视频完整播放受访问限制；不把未观看片段当作视觉验收。
- [Live2D：How to Set Up Physics](https://docs.live2d.com/en/cubism-editor-manual/physical-operation-setting/)：多段摆锤、输入动作与输出发丝参数关联。
- [Wallpaper Engine：Foliage Sway](https://docs.wallpaperengine.io/en/scene/effects/effect/sway.html)：用局部遮罩限制植被范围，按方向、强度、尺度及相位形成有层次的风吹运动。
- [Wallpaper Engine：Shake Effect](https://docs.wallpaperengine.io/en/scene/effects/effect/shake.html)：方向遮罩、时间偏移与有限随机变化；多人呼吸或多个物体完全同步会显得不自然。

## 对本主题的设计取舍

参考重点是动作关联和时间差。现有原图、原始像素所有权及固定接触点继续作为约束，不复制作者壁纸资产，也不将主题描述为完整 Live2D 骨骼模型。

发束和衣角通过同一环境风产生关联，细部沿根部到末梢增加延迟；卷发保留轮廓，末梢有轻微回摆。叶片跟随同一环境变化，并保留各自节奏。两人衣料可以有不同的缓慢起伏节律，不通过整脸、躯干或肩膀缩放来模拟呼吸。

动态图像按真实时间确定，暂停恢复和 60 / 90 / 120Hz 切换不改变动作速度。最终是否自然以实际渲染、原有固定区检查与自然时钟预览为准，文档推断本身不作为验收通过证据。
