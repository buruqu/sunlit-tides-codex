独立 Windows 宿主与安装脚本
=========================

发行目录约定：`app/SunlitTidesCodex.exe`、`app/theme/manifest.json`、`app/theme/payload.js`、`app/theme/remove.js`、`app/media/startup.mp4`，以及当前 `installer/` 目录。主题素材和许可由发行包提供。无需安装 Tessalume、Node 或 .NET；自包含宿主仅使用 Windows 自带功能。

安装：在 Windows PowerShell 运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Install.ps1`。默认安装到 `%LOCALAPPDATA%\SunlitTidesCodex`，创建当前用户登录启动项和桌面、开始菜单主题快捷方式，首次安装随后启用主题；升级沿用主题开关。可用 `-SourceDirectory` 指定包含 EXE 与 theme 目录的发行目录；`-NoLaunch` 只安装，暂不运行。`-WhatIf` 只检查和预览。支持从 1.0.0 / 1.1.0 升级到 1.1.1，也可重新安装 1.1.1。升级先验证旧版本全部受管文件未被修改，再暂存并验证新包；请求旧宿主恢复默认并退出后，保留 `data/` 和退出前的 `settings.json`，完整旧目录留在 `%LOCALAPPDATA%\SunlitTidesCodex.backup.<版本>.<时间>.<随机值>`。失败会尝试恢复原目录，失败暂存保留供检查。额外文件留在完整备份中；若与新版路径冲突、存在连接点或受管文件已变更则停止，不能自动覆盖。`-NoLaunch` 保持退出前设置；首次安装后通过 `--launch` 启用主题；升级后通过 `--startup` 恢复宿主并尊重原先的主题启用或关闭选择。备份不自动清理，卸载也不会删除旧版本备份。

登录 Windows 时，已启用的宿主自动以仅限回环地址的主题连接参数启动 Codex。主题快捷方式也会重新启用并打开 Codex。若 Codex 已运行且未带调试参数，宿主只激活现有窗口、提示完成任务后自行退出再从主题入口打开，不会关闭或重启 Codex。原生开始菜单项、旧任务栏固定项、协议和直接 EXE 冷启动不会被拦截，因此这些路径在 Codex 完全退出后重新启动，可能没有主题。Codex 更新后仍按当前商店包 manifest 重新发现入口。

托盘提供启用、恢复默认、打开 Codex、查看状态、恢复默认并退出。恢复默认持久保存为关闭主题，先移除本宿主注册的后续文档脚本，再移除当前页面主题。之后登录只启动处于关闭状态的托盘，不会为了主题启动 Codex。退出同样恢复并保存关闭状态；恢复失败时保留托盘继续重试，不会伪报恢复成功。主题快捷方式或“启用”可再次开启。

恢复脚本：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Restore.ps1`。卸载脚本：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Uninstall.ps1`。卸载先请求恢复并退出自己的宿主，成功后仅移除匹配的启动项、快捷方式、原始安装文件和自己的状态日志；修改过或额外添加的文件保留。不会终止 Codex，不会修改 Codex 的安装包、用户配置或 Tessalume 文件。当前 Codex 的 CDP 端口随该 Codex 进程退出而关闭，恢复主题本身不会关闭这个端口。

宿主命令：`--launch`、`--startup`、`--enable`、`--restore`、`--status`、`--quit`、`--self-test`。控制命令通过当前用户专属命名管道发送；没有宿主时，恢复与退出命令执行一次恢复后返回。`--self-test` 仅执行离线输入验证、状态序列化、启动策略和恢复顺序测试，不连接 Codex，不读写实际用户状态。命令错误返回非零退出码。`data/status.json` 提供结构化状态；日志只记录固定类别，最多保留当前和一个滚动日志，每份约 128 KiB，不记录对话、网络响应、认证资料或页面标题。

构建示例（在项目根目录）：

```powershell
dotnet publish .\host\SunlitTidesCodex.csproj -c Release -r win-x64 --self-contained true -o .\dist\app
```

将根目录制作的 `dist/theme/` 复制到 `dist/app/theme/`，并提供 `dist/app/media/startup.mp4`，将安装脚本作为 `dist/installer/` 发行。自包含发布目录中的运行时许可文件也应保留。构建后可运行 `dist/app/SunlitTidesCodex.exe --self-test`；所有 Codex 连接、登录启动和 UI 验证均需另行实际验收，离线自检不代表这些已通过。

隔离安装器验证：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Test-Upgrade.ps1`。该脚本仅操作新建临时夹具，替换夹具内的注册表、快捷方式和宿主控制入口，不执行真实安装或启动宿主。夹具目录保留并在测试结束时打印。
