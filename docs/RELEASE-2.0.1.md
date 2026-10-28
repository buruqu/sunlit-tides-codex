# 晴光与泡影 Studio · Codex 2.0.1 / DSH 0.2.1

联合标签：`v2.0.1`。公开品牌统一为 **晴光与泡影 Studio / Sunlit Tides Studio**；安装目录、可执行文件名、插件包名和存储标识保留，延续旧版升级与工程兼容。

[联合发行页](https://github.com/buruqu/sunlit-tides-studio/releases/tag/v2.0.1) · [Codex 安装包](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.0.1/SunlitTidesCodex-2.0.1-win-x64.zip) · [DSH 安装包](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.0.1/SunlitTides-DSH-0.2.1.zip) · [仓库源码](https://github.com/buruqu/sunlit-tides-studio/archive/refs/tags/v2.0.1.zip) · [DSH 独立源码](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.0.1/SunlitTides-DSH-source-0.2.1.zip)

## 双端 DIY

素材调色板与画布编辑器支持 PNG、JPEG、WebP、GIF，覆盖背景、侧栏背景、立绘、表情、普通图片、特效粒子纹理六类用途。可编辑内置素材、调整实际功能区、设置字体与渐变、叠加落叶 / 泡泡 / 自定义粒子；亮暗独立保存，支持草稿取消、恢复和跨端工程导入导出。详见 [DIY 使用说明](DIY.md)。

本版完善以下操作：

- 按实际像素保持比例，宽高输入与画布缩放联动，兼容旧工程并处理极端狭长图。
- 方向键移动 1px、Shift 移动 10px，支持键盘撤销 / 重做，保留聊天与数值输入自身快捷键。
- 水平 / 垂直居中、移回画布可作用于新增预览，操作可撤销；编辑时可收起面板保留草稿。
- 内置立绘保持完整显示；编辑后正确交接预设层和自定义层，避免重复残影。
- 区域参数、选框与真实功能区使用一致边界，保留顶部 44px；窗口变化不自动重写保存布局。
- 背景支持负坐标与更大尺寸；完整显示使用原图，切回铺满恢复原场景动态。

## 安装与恢复

Codex 从包内 `Install.cmd` 安装或升级，验证旧版受管文件并保留设置与完整备份；兼容原有 1.x 与 2.0.0 候选升级路径。仅切换主题辅助程序，不强制重启 Codex。`Restore.cmd` 恢复默认外观，`Uninstall.cmd` 卸载辅助程序。

DSH 须正常退出后，以显式 `DshHome` 与 `CliPath` 运行包内 `installer/Install.ps1`；`installer/Restore.ps1` 另需安装输出中的 `BackupPath`。安装器不自动停启 DSH，恢复前会检查配置变化。完整命令见 [安装指南](INSTALL.md)。

## 验证范围与限制

本轮开发检查使用完整构建包与合成宿主界面，覆盖工程导入 / 导出回读、保存 / 取消、旧工程、预览、布局边界与实际输入操作；旧候选的立绘完整显示问题已通过负例复现并用于修复检查。共享编辑器30项、Codex构建4项、隔离安装器30项通过，两端完整DIY浏览器流程通过。Codex已完成本机升级及原生编辑/取消验证；DSH原生截图通道不可用，不能以合成截图代替其像素验收。具体范围见 [验证记录](VALIDATION.md)。

**合成浏览器检查和预览图不代表本版原生窗口实机验收通过。** 安装后的文件一致性、宿主状态、原生窗口效果与发布资产可达性需分别核对；本说明不将历史版本的人工确认沿用为本版验收。

本次安装复核：Codex已在原生窗口完成编辑草稿与取消检查，原设置保留；DSH已升级到0.2.1，20个运行文件与发行包一致，重新打开后用户确认DIY入口可见。DSH原生画布拖拽/保存的完整交互与像素检查仍未覆盖。

预设动画及粒子保留现有策略；呼吸自然度仍有独立待检查项。本版不支持视频、Live2D 或脚本工程导入，DSH 不含 GPT / Dragon 启动动画。容量与存储限制见 [DIY 使用说明](DIY.md)，媒体授权边界继续遵守 [NOTICE.md](../NOTICE.md) 与 [素材记录](ASSETS.md)。
