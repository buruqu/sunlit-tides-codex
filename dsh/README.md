# 晴光与泡影 Studio · DSH

**Sunlit Tides Studio for DeepSeek Harness** 是独立社区动态皮肤，当前插件版本 **0.2.1**，随联合标签 `v2.0.1` 发布。品牌名称已更新，技术包名 `@dsh-external/dsh-client-ui-skin-sunlit-tides` 保持兼容。本项目与 DeepSeek、OpenAI、库洛游戏无官方隶属关系。

[下载安装包](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.0.1/SunlitTides-DSH-0.2.1.zip) · [独立源码](https://github.com/buruqu/sunlit-tides-studio/releases/download/v2.0.1/SunlitTides-DSH-source-0.2.1.zip) · [联合发行页](https://github.com/buruqu/sunlit-tides-studio/releases/tag/v2.0.1)

## 双端共用的 DIY 编辑器

从 **晴光 → 素材与 DIY / 开启 DIY 编辑** 进入。背景、侧栏背景、立绘、表情、普通图片、特效粒子纹理六类素材支持 PNG、JPEG、WebP、GIF 导入；内置素材也可在同一调色板调整、替换或恢复默认。

画布支持拖拽、缩放、按像素保持比例、翻转、旋转、透明度、层级和模糊；方向键微调、撤销 / 重做、居中与移回画布方便精修。侧栏、聊天区与输入框可移动缩放并保留原生交互。字体、字号、行高、纯色 / 渐变可调，代码、链接与状态信息保留语义样式。落叶、泡泡及自定义图片 / GIF 粒子可调整数量、速度、方向与范围。

亮暗方案独立存于当前 WebUI 的 IndexedDB，草稿可保存或取消，支持恢复及工程导入导出；与 Codex 交换工程时不套用另一宿主的功能区布局。普通参数面板修改即时保存。单图 12 MiB、素材库 60 MiB；详细操作与限制见包内 [DIY.md](DIY.md)。

## 预设与兼容

- 跟随 DSH 亮暗外观，默认「果园午后 / 夜色相依」，相册保留「夜色相依·泪光」等场景。预设包含人物分层摆动、眨眼、光影、落叶或泡泡；贯穿背景和独立侧栏可切换，角色透明度可独立调整。
- 原生场景按设备刷新率调度，上限 120fps；输入、滚动、后台与减少动态模式会暂停或回退静态图，WebGL 不可用时保留原图。实际帧率取决于设备负载。预设呼吸参数沿用原实现，自然度仍有独立待检查项。
- 最初接口基线为 Windows 桌面端 DSH `0.2.1-rc.2`，适配环境为 `0.2.1-rc.3`；这与皮肤版本 `0.2.1` 是两个版本体系。其他宿主版本及远程 Web 部署未承诺已验收。
- 依赖 DSH 的插件接口与界面结构，宿主更新后可能需要适配。不修改账号、模型权限或聊天记录，不捆绑字体，不自动云同步 DIY 素材。
- **DSH 不包含 GPT / Dragon 启动动画。** 导入素材不会自动获得原预设的人物网格动画；不支持视频、Live2D、脚本、远程 URL 或用户 SVG 导入。

## 预览

以下为合成 DSH 界面的预设预览，不含真实聊天，不代表本版原生窗口验收。

| 果园午后 | 夜色相依 |
| --- | --- |
| ![亮色合成预览](preview/light.png) | ![暗色合成预览](preview/dark.png) |

## 安装与恢复

先正常退出 DSH。解压安装包，在解压目录打开 PowerShell；按实际安装填写资料目录与官方 `dsh.cmd` 路径：

```powershell
$dshData = Read-Host 'DSH 资料目录（包含 profiles 和 plugins）'
$dshCli = Read-Host 'DSH 安装自带的 dsh.cmd 完整路径'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Install.ps1 -DshHome $dshData -CliPath $dshCli
```

安装器使用官方 CLI 注册新包，保留并停用旧 Denia 入口，备份受管插件与 profile 配置；成功后自行从原入口打开 DSH。脚本不会自动启动或终止应用，检测到运行中的 DSH 会停止。升级只能覆盖身份可核验的受管目录。

需要恢复时，先退出 DSH，再使用安装输出中的受管恢复点：

```powershell
$dshBackup = Read-Host '安装输出中的恢复点目录'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Restore.ps1 -BackupPath $dshBackup -DshHome $dshData -CliPath $dshCli
```

新开 PowerShell 会话时先重新填写 `$dshData` 与 `$dshCli`。恢复器核对配置与安装后的哈希；后续有改动时停止，避免覆盖新设置。不要手动删除备份或替换整个 profile。更多边界见 [安装指南](https://github.com/buruqu/sunlit-tides-studio/blob/v2.0.1/docs/INSTALL.md)。

## 构建与验证

需要 Node.js 22+。从整个仓库根目录开始运行；独立源码 ZIP 省略 `cd dsh`：

```powershell
cd dsh
npm install
npm run build
npm run test:scene
npm run test:client
npm run test:typography
npm run test:package
node tests/diy-integration.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Package.ps1
```

浏览器检查使用 Playwright 与本机 Edge；部分检查支持 `PLAYWRIGHT_EXECUTABLE_PATH`，以各测试入口为准。构建生成 `lib/client.js`，打包输出到 `release/`；运行安装包无需单独运行 Node 或外部主题服务。合成测试、安装文件一致性及原生窗口验收分别记录，不能相互替代，见 [联合发布说明](https://github.com/buruqu/sunlit-tides-studio/blob/v2.0.1/docs/RELEASE-2.0.1.md)。

## 来源与许可

代码、角色与媒体适用不同条件。保留 Tessalume 派生代码的 MIT 声明、DSH 上游素材的 CC BY-NC-SA 4.0 署名链及原作角色权利；部分用户提供媒体的公开再分发条件仍待确认。AI 处理不使素材自动成为原创或 MIT。二次使用、修改和分发前请核对 [NOTICE.md](NOTICE.md)、[ASSETS.md](ASSETS.md) 和 [licenses/](licenses/)，品牌变更不改变历史版权。
