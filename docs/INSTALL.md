# 安装、升级与恢复

从 [v2.1.0 联合发行页](https://github.com/buruqu/sunlit-tides-studio/releases/tag/v2.1.0) 选择对应包。安装包与源码包用途不同：普通用户下载 Codex Windows x64 包或 DSH 插件包即可。本批为 Codex 2.1.0 / DSH 0.3.0，包含 2.0.2 的专用入口图标、可拖出面板和素材用途编辑。升级前建议在编辑器导出工程，并保留自己的素材原文件。

## Codex Desktop · 2.1.0

1. 安装并登录 Windows Codex Desktop；主题包面向 Windows 11 x64。
2. 解压 `SunlitTidesCodex-2.1.0-win-x64.zip`，双击包内 `Install.cmd`，无需管理员权限。
3. 使用原来的普通桌面 / 开始菜单入口，或专用主题入口打开。首次加载图片可能需要数秒。

安装器默认使用 `%LOCALAPPDATA%\SunlitTidesCodex`，创建当前用户托盘宿主、登录启动项及主题快捷方式。升级先验证旧版受管文件，保留设置、数据及完整旧目录；无法确认目录身份、文件被修改或发生路径冲突时会停止。品牌更新不要求改名或清空旧设置。

升级只切换主题辅助程序，不强制重启 Codex。当前窗口已有可用本机主题连接时可直接应用；若 Codex 启动时未带连接参数，宿主只激活窗口，主题需等后续正常冷启动加载。旧主题管理器同时运行可能相互覆盖，请先关闭旧管理器。

### 启动入口

安装器按真实目标识别普通 Codex 快捷方式，保留名称、图标和原始入口备份。普通入口沿用保存的主题开关；专用主题入口显式启用主题。MSIX 原生固定项可能需要重新固定已接入的普通快捷方式；直接 EXE、协议和更新程序自行重启不属于覆盖范围。

包内 `Repair-Entrypoints.cmd` 修复可识别入口，`Restore-Entrypoints.cmd` 恢复未被用户改动的受管入口。详细机制见 [入口说明](ENTRYPOINTS.md)。

### 恢复与卸载

- 托盘选择「恢复 Codex 默认外观」，或双击 `Restore.cmd`，停止自动应用并移除当前主题；参数保留，可再启用。
- `Uninstall.cmd` 恢复默认及受管入口，再移除本主题程序与自有启动项；遇到无法安全恢复的入口或已修改文件会保留并报告。
- 恢复默认不会删除账号、聊天、项目或 Codex 原有设置，也不强制重启 Codex。现有本机调试端口随该 Codex 进程结束；卸载后原入口的下次冷启动不再添加主题参数。
- 完整旧版备份不自动清理。`Restore.cmd` 是恢复外观的入口，不是覆盖安装目录的旧版本回滚器；安装故障请保留输出及备份供核对，不要直接覆盖整个目录。

Codex 可选启动视频可在调色板、视频底部或托盘关闭，Esc 可跳过；Windows 媒体组件不可用时自动跳过。

## DeepSeek Harness · 插件 0.3.0

最初接口基线是 DSH Windows 桌面端 `0.2.1-rc.2`，适配环境为 `0.2.1-rc.3`。插件版本与宿主版本分开管理；安装器要求已经初始化的 desktop profile，以及安装自带的官方 `dsh.cmd`。

先正常退出 DSH，解压 `SunlitTides-DSH-0.3.0.zip`，在解压目录打开 PowerShell：

```powershell
$dshData = Read-Host 'DSH 资料目录（包含 profiles 和 plugins）'
$dshCli = Read-Host 'DSH 安装自带的 dsh.cmd 完整路径'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Install.ps1 -DshHome $dshData -CliPath $dshCli
```

资料目录应包含 `profiles/desktop/package.json` 和 `profiles/desktop/cordis.patch.yml`。安装器通过官方 CLI 注册独立插件，备份受管插件及配置，保留并停用旧 Denia 皮肤入口。检测到 DSH 运行时会停止，不自动关闭或启动应用。成功后从原来的入口启动 DSH。

### 恢复

保留安装输出中的恢复点。退出 DSH 后，在同一解压目录运行：

```powershell
$dshBackup = Read-Host '安装输出中的恢复点目录'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Restore.ps1 -BackupPath $dshBackup -DshHome $dshData -CliPath $dshCli
```

若是新的 PowerShell 会话，先重新填写 `$dshData` 和 `$dshCli`。恢复器要求恢复点与目标一致，并验证安装后配置未被修改；检查不通过时停止，避免覆盖后续工作。不要手动删除恢复点或整体替换 profile。DSH 包不含 GPT / Dragon 启动动画。

## 可拖出面板与依赖

两端面板通过标题栏拖出窗口，拖回应用内松手停靠；原页面保留草稿、素材和撤销历史。需要机器已有的 Windows WebView2 Runtime；缺失或连接失败时保留应用内编辑并提示，不自动安装运行时。安装包自包含，无需 .NET SDK 或单独安装 Node.js。源码构建需要 Windows、Node.js 22+、.NET 8 SDK 和首次恢复 WebView2 SDK 依赖的 NuGet 连接。

DSH 包包含按需启动的受管原生面板程序，安装器会拒绝缺少该文件的不完整包。它使用官方插件 Connection RPC，不修改 DSH 安装源码，也不包含 Codex / Dragon 启动视频。

## 编辑数据

亮暗工程与导入素材保存在当前应用 WebUI 的 IndexedDB；普通升级保留同一应用资料中的记录，清除资料、换电脑或改变 WebUI 地址不会自动迁移。使用「导出分享工程」备份，素材原文件另行保管。恢复主题默认不会删除素材库；存储限制与清理规则见 [编辑使用说明](DIY.md)。
