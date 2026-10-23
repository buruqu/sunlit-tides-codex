# 1.0.0 验证记录

日期：2026-10-23。环境：Windows x64、.NET SDK 8.0.426；自包含目标 win-x64，浏览器测试使用本机 Edge / Playwright 1.62.1。

- 独立主题构建检查 2/2：两种场景、所有资产存在、可执行 payload 无未替换占位符/外部绝对目录；恢复脚本不处理其他主题。
- 实际分发 payload 浏览器集成 8/8：亮暗图片、原生项目菜单的点击/键盘/焦点、单聊天滚动区、长输入框、独立明暗设置保留、应用幂等、恢复和重新应用、无未捕获脚本错误。保留全部原生节点，含旧空首页包裹节点。
- 布局原始缺陷回归 11/11：复现旧双纵向滚动条与相册盖住菜单；修复后覆盖 1280/720/420 宽度与明暗组合、嵌套与 portal 菜单。代码横向滚动及设置/侧栏滚动不受影响。
- 独立宿主 Release 构建：0 警告、0 错误；离线自检 23 项通过。
- 宿主实际嵌入的启动/安装/移除 JS 模板离线回归 6/6：等待中的 DOM 启动、图片异步提交、恢复与重新启用时序、单次在途加载、真实 runtime 指纹验证。
- 安装/恢复/卸载 PowerShell：Windows PowerShell 5.1 语法检查通过；中文脚本使用 UTF-8 BOM。安装路径限制、文件所有权记录、变更文件保留和恢复失败不删除材料由独立代码审查确认。
- 分发采用新 GUID 暂存树；包内不带本地配置、用户数据、注册脚本 ID 或运行日志。

实机验证（Codex 26.1016.8622.0）：

- 真实 Windows PowerShell 5.1 默认发行目录 `-WhatIf` 和实际安装通过；修复了参数阶段脚本路径、无 BOM 中文 JSON 解码，以及 `Get-FileHash` 继承 WhatIf 的兼容问题。
- 独立宿主接管当前 Codex，无应用重启；宿主状态 active、一个主页面，运行 themeId 为 sunlit-tides.codex，版本 1.0.0。旧 Tessalume 进程已退出，旧设置备份保留。
- 安装后当前用户 Run 项、桌面及开始菜单快捷方式均存在，指向独立宿主。
- 恢复脚本实际执行成功：运行主题 ID、主题根节点、调色板和场景属性全部清空，原生 main 恢复 overflow visible。随后通过宿主 --enable 成功重新应用，果园图层 ready 且无错误。
- 实机 main 为 overflow clip，唯一聊天纵向滚动容器仍为原生 .thread-scroll-container；相册 DOM 数量为 0。

未实际重启 Windows、退出账号再登录或强制重启 Codex，也未以卸载当前安装作为验收步骤。登录启动项和启动/恢复机制已验证，但不把这些等同于所有启动路径及未来 Codex 版本的兼容保证。宿主绝不为主题强制结束 Codex；完整退出后使用旧原生入口冷启动的连接限制见 README。

代码与截图报告可通过 `npm run build:theme`、`npm test`、`npm run test:browser`、`SunlitTidesCodex.exe --self-test` 和 `node host/tests/bootstrap-barrier.cjs` 重跑。测试产物在 `test-results/`，不提交用户环境数据。
