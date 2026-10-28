# 晴光与泡影 Studio / Sunlit Tides Studio

为 Windows **Codex Desktop** 与 **DeepSeek Harness（DSH）**打造的可视化外观工作室。以西格莉卡 × 达妮娅的动态场景为起点，也可以导入自己的图片、安排布局、调整字体与粒子，制作亮暗独立的主题方案。

本项目是独立社区作品，与 OpenAI、DeepSeek、库洛游戏无官方隶属关系。本次联合版本为 **Codex 2.1.0 / DSH 0.3.0**，发行标签为 `v2.1.0`。

本版的调色板和编辑面板可通过标题栏拖出、拖回应用；导入素材按用途自动放置，界面统一使用“开启编辑”。包含此前 2.0.2 的专用入口图标，见[发布说明](docs/RELEASE-2.1.0.md)。

## 下载

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Codex Desktop | [Windows x64 · 2.1.0](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.1.0/SunlitTidesCodex-2.1.0-win-x64.zip) | 自包含托盘宿主，无需单独安装 Node.js、.NET 或 Tessalume |
| DeepSeek Harness | [DSH 插件 · 0.3.0](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.1.0/SunlitTides-DSH-0.3.0.zip) | 使用 DSH 自带 CLI 安装，不含 GPT / Dragon 启动动画 |

[联合发行页](https://github.com/buruqu/sunlit-tides-studio/releases/tag/v2.1.0) · [整个仓库源码](https://github.com/buruqu/sunlit-tides-studio/archive/refs/tags/v2.1.0.zip) · [DSH 独立源码](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.1.0/SunlitTides-DSH-source-0.3.0.zip) · [发布说明](docs/RELEASE-2.1.0.md)

## 双端可视化编辑

- **素材用途**：导入 PNG、JPEG、WebP、GIF 后选择主背景、侧栏背景、聊天区背景、输入框背景、顶部功能栏背景、左右立绘或表情，即可自动定位；相同用途更新已有位置，换图保留已有调整。自由装饰和特效可继续叠加。
- **可拖出的面板**：按住标题栏拖到应用边缘，面板由桌面载体承接；拖回应用内松手停靠。原页面保留草稿、素材和撤销历史。需要 Windows WebView2 Runtime；缺失或连接失败时保留应用内编辑，不自动安装运行时。
- **画布编辑**：拖拽移动、缩放、按实际像素保持比例，调整透明度、翻转、旋转、模糊、层级与完整显示 / 铺满；方向键微调、撤销 / 重做、居中及移回画布，编辑时可收起属性面板。
- **动态调色板与功能区**：调整原预设的背景、角色与动效参数；侧栏、聊天区、输入框可直接移动和缩放，保留原生交互及输入草稿。
- **字体与特效**：设置本机字体、字号、行高、纯色与渐变；添加落叶、泡泡或自己的图片 / GIF 粒子，调整数量、大小、方向、速度与摇摆。
- **本地工程**：亮暗方案独立保存；画布草稿支持保存或取消，可恢复默认、恢复上次保存、清理未使用素材，并导出 / 导入分享工程。Codex 与 DSH 可交换素材方案，各自保留宿主功能区布局。

Codex 从 **调色板 → 开启编辑** 进入；DSH 从 **晴光 → 开启编辑** 进入。完整操作、快捷键及容量限制见[编辑使用说明](docs/DIY.md)。

## 预设场景

亮色默认「果园午后」，暗色默认「夜色相依」，相册另有「夜色相依·泪光」。预设保留分层人物、发束与衣物摆动、眨眼、光影和粒子；果园默认落叶，夜景默认泡泡。贯穿背景与独立侧栏两种布局可切换，立绘与表情透明度可独立调整。

输入、滚动、后台及减少动态模式会暂停或回退动画；原生场景按显示刷新率调度，最高 120fps，实际表现取决于设备与负载。导入静态图按图片显示，不会自动生成原预设的人物网格动画。

| 果园午后 · 亮色 | 夜色相依 · 暗色 |
| --- | --- |
| ![Codex 亮色合成预览](docs/preview-light.png) | ![Codex 暗色合成预览](docs/preview-dark.png) |

以上是主题的合成界面预览，不含真实聊天；用于展示预设视觉，不代表本版原生窗口验收。DSH 预览见 [DSH 说明](dsh/README.md#预览)。

## 安装与恢复

**Codex**：解压安装 ZIP，双击 `Install.cmd`。安装器验证受管旧版后升级并保留设置与完整备份；升级仅切换主题辅助程序，不强制重启 Codex。可连接的现有窗口会直接应用；未带本机主题连接的窗口需在后续正常冷启动时加载。托盘可启用主题或恢复默认，`Restore.cmd` 恢复官方外观，`Uninstall.cmd` 卸载主题辅助程序。

**DSH**：先正常退出 DSH，再通过包内 `installer/Install.ps1`，显式提供 DSH 资料目录与官方 `dsh.cmd`。安装器注册独立插件，保留并停用旧 Denia 入口；不自动停启应用。`installer/Restore.ps1` 可按安装记录恢复，遇到后续配置变化会停止覆盖。

逐步命令、启动入口及恢复边界见 [安装指南](docs/INSTALL.md)。普通 Codex 快捷方式可受管接入；MSIX 原生固定项可能需要重新固定，直接 EXE、协议和应用更新自行重启不保证加载主题。

## 兼容与限制

- Codex 包面向 Windows 11 x64；DSH 最初接口基线为 Windows 桌面端 `0.2.1-rc.2`，适配环境为 `0.2.1-rc.3`。主题 / 插件版本号与宿主版本号分别管理，未承诺其他版本或远程 Web 部署已验收。
- 主题依赖宿主界面结构与现有注入接口，宿主更新可能需要重新适配；不修改官方程序、账号、模型、权限或聊天记录。Codex 连接仅限经验证的本机回环端点。
- DIY 素材存于当前 WebUI 的 IndexedDB，不自动云同步；清除应用资料、换电脑或换地址前请导出工程。单图上限 12 MiB、素材库 60 MiB；不支持用户 SVG、远程 URL、视频、Live2D 或脚本工程导入。
- Codex 可选 Dragon 启动视频，支持跳过及关闭，播放依赖 Windows 媒体组件；DSH 包不含该功能。预设呼吸自然度仍有独立待检查项，本版未重调其参数。

品牌名统一为 **晴光与泡影 Studio / Sunlit Tides Studio**；历史技术标识、插件包名、可执行文件名与安装目录保持兼容，不要求用户手动改名。

## 源码与验证

构建需要 Windows、Node.js 22+；两端原生浮动面板需要 .NET 8 SDK 和可恢复 WebView2 SDK 的 NuGet 连接。使用安装包不需要构建环境。

```powershell
npm install
npm run build:theme
npm test
dotnet run --project host -- --self-test
npm run test:browser
node tests/diy-core.cjs
node tests/diy-integration.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Package.ps1
```

浏览器检查需要 Playwright 和可用浏览器，可通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定浏览器。DSH 构建命令见 [DSH README](dsh/README.md#构建与验证)。`theme/` 为 Codex 主题，`host/` 为 Windows 宿主，`dsh/` 为 DSH 插件，`shared/` 为共用编辑器。构建产物、安装状态和日志不作为源码提交。验证范围见 [发布说明](docs/RELEASE-2.1.0.md) 与 [本版验证记录](docs/VALIDATION-2.1.0.md)；合成浏览器测试不等于原生窗口验收。

## 来源与许可

代码采用 MIT 许可，保留 Tessalume 等派生代码的历史版权声明。**图片、角色、GIF、启动视频与代码许可不同**：DSH 上游素材保留 CC BY-NC-SA 4.0 署名链；角色权利归原权利人；用户提供及 AI 处理素材不因此成为项目原创或一律 MIT。部分媒体的公开再分发条件仍未在素材记录中确认，分发或二次使用前须核对来源与授权，必要时替换为已获授权素材。

请阅读 [NOTICE.md](NOTICE.md)、[素材记录](docs/ASSETS.md)、[DSH 来源说明](dsh/NOTICE.md) 与 [licenses/](licenses/)。品牌更新不改变这些版权及素材限制。
