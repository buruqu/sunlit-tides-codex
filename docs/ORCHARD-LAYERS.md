# 果园午后 · 原 0.8.5 分层微风（独立版 1.0.0 继承）

本文记录「果园午后」原分层制作与后续运行参数。静态源图仍是用户提供的 `assets/duo-orchard.jpg`，1280 × 1280。人物没有交给模型重画，也没有全画面 UV 扭曲。

## 1.2.4 小辫、螺旋尾、额发与叶片

保留1.2.3的大辫、波浪发和衣摆参数。另从原图一次提取西西两处真实自由发尾、娅娅两处螺旋末端、西西头顶原有小发环、娅娅颊外刘海尖，以及左缘y475/535处的两片青绿虚化叶。额外8层使果园总数为24。它们不是整个人或整棵树的平移：新发尖约2–5.5源像素，叶约3.5源像素，固定面部、眼、白bow、发饰、接触点、苹果与枝条。

新片通过extractFromAsset读取原图RGB，按Path2D硬所有权从cutFromAssets对应人物/背景/前景PNG扣掉相同像素，再在underfillTargetAsset对应孔内延伸原有固定邻像素。叶的底plate也补孔，不能让原静叶留在下面形成重影。colorFamily仅作为白bow/红果等排除的辅助筛选，不能取代正确轮廓；所有边缘仍需用实际GPU极值预览核对。小片使用4px网格和8px固定根；仅18px大小的西西发环使用2px网格和5px根带，以覆盖三角形对角与3×3根检查邻域。发尾用完整自由末梢，避免从连续发束中段截断。

## 1.2.3 更明显的发束弯动与 120Hz 目标

当前发辫为 9.504 / 11.088 度、粉发为 6.336 / 7.128 / 7.92 度、裙摆为 4.752 度，周期 4.8–5.4 秒。`motionTip` 从真实不透明原像素中选取：双端接续的中辫在中部弯动约 13px，其余自由发束与裙摆约 23–34px。身体平移归零，使肩颈、手部和接触点固定；中辫与低辫共享连接缝，两端固定后由中间弯动，避免相邻层摆入连接点。所有自由片相位从零位开始，t0 可逐像素重建原图。

增加幅度时同时修复了原素材的接续约束。原 root PNG 的连通区域提取为固定线段，20px 锁定带内零位移，外侧28px平滑渐增，粉发middle单独用44px防止大幅动作下三角翻折；粉发中段和裙摆的两个切口均固定。原本越过画框的片在画外延伸 48px 网格并复用源边缘采样，防止底部裙摆裁切边被转进画内。网格细化为源空间 12px，不移动整个画面。

原离线孔内延展 10px 已不足以覆盖新动作。运行时补底由24px进一步扩大到40px，使用精确欧氏最近固定像素的可分离距离场，初始化复杂度随源图像素线性增长，避免逐像素遍历半径平方候选。因此初始化时使用六片现有 PNG alpha 确定所有权，从全部动作区域之外的固定原图 RGB 延伸最多 40px 到所属 parent body 的孔内，深处保留原 underpaint。保留原 root 盖片，动态片在静态孔内只出现一次。没有重新生成角色或描画脸部。

Worker 直接绘制 OffscreenCanvas，目标上限 120Hz，实际帧率取决于原生 RAF 和 GPU；不产生伪造高刷帧。`observedRafHz` 与 `measuredFps` 分别报告真实 RAF 供给和绘制速率。输入、滚动和按住拖拽暂停，悬停不中断。局部树叶暖光最大增量约 0.13，仍仅落在树冠和左缘叶片，不做整图明暗呼吸。

下面的 1.2.1 与原版记录为历史制作参数，以当前 manifest 和本节运行参数为准。

## 1.2.1 可见摆动与 60 帧

用户反馈初版动作不易察觉后，运行配置中的辫尾角度提高到 2.4 / 2.8 度，粉色发束为 1.6 / 1.8 / 2.0 度，裙摆为 1.2 度，周期 3.8–4.6 秒。自由端位移约 5–8 原图像素，身体原来的 0.28 / 0.24 像素微移不放大。网格从 64px 细化到 24px，继续使用原有 10px 孔内纹理和根部盖片，动作限制在已有补底支持内。实际运行参数以 `theme/manifest.json` 为准；原坐标规格仍记录制作时的形状。

动画改为 60fps 目标的 RAF 调度，普通鼠标悬停不中断，输入、滚动及按住拖拽仍暂停。下文 0.22–0.4 度和小于 3px 是原版制作记录，不是当前运行幅度。

## 素材与运动

原始 RGB 按手工贝塞尔轮廓分成：原背景、西西主体、娅娅主体、西西的两段外侧辫尾、娅娅的三段外侧长发、下方裙摆、前景苹果叶枝与篮子，另外输出六片原像素根部覆盖片。运行时共 16 张透明层叠在补底图之上。

主体只做 0.28 / 0.24 原图像素以内的整体上下微移，周期 5.4 / 7.1 秒。肩膀、腋下与面部内部没有局部拉伸。头发、衣物使用独立透明网格，从根部到末梢渐增 0.22–0.4 度的轻摆；发束、衣物和根部覆盖片继承所属人物的位移。手工轮廓在帽沿草编、细碎飞丝处为近似，原版仅适合微动；1.2.2 已同步增加固定根段和孔内补色支持，不能只加角度而跳过这些约束。

背景底图由内置 imagegen 去除人物后补画。只在原人物遮挡处使用生成内容，当前可见背景仍由原图像素覆盖。对发束、布料与人物边界，离线程序向洞内延伸 10px 邻近原纹理，补齐微动露出的细缝；原制作阶段所有活动层的保守位移上界小于 3px。根部另保留原图覆盖片。这个补底支持当前微幅动作，不等于补出了完整的隐藏人体或衣物结构。

眨眼仍使用已制作的局部闭眼关键帧，只有眼部遮罩参与混合。调色板「果园分层微风」与「果园轻眨眼」各自独立；关闭分层后回到 0.8.4 的轻眨眼方式。后台、专注和减少动态时回退静态；输入、滚轮与滚动时暂时冻结，最后事件 220ms 后恢复。

## 独立版源码与验证

运行用 PNG 已包含于 theme/assets/layered，坐标规格位于 theme/design/orchard-layer-spec.json，补底为 theme/assets/orchard-layer-underpaint.png。独立版构建直接使用这些成品图层，无需重新生成。原制作阶段的生成源文件和离线制作脚本未纳入这份安装项目。主题集成验证使用 tests/theme-browser.cjs。

## imagegen 记录

使用内置工具，未调用付费视频模型。输入为用户果园原图，原生成源文件保留于先前制作工作区；本项目携带运行用补底 orchard-layer-underpaint.png。

最终提示词：

> Use case: precise-object-edit. Edit the supplied square orchard illustration into a clean background plate for layered animation. Remove BOTH female characters entirely, including all skin, hair, hats, clothes, the blue flowing ribbons, their hands and the held woven basket. Reconstruct the occluded orchard with matching softly focused green foliage, warm dappled afternoon sunlight, subtle branches and distant apples. Preserve the exact original square framing, camera angle, overall colors and the existing visible background. Keep the large foreground red apple and leaves in the upper left and the branches/leaves across the top at their exact positions. There must be no humans, hair, body fragments or character silhouettes remaining. Match the painterly anime rendering of the original. No text. This is an occlusion-repair plate, not a new composition.
