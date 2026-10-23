# 来源与分发边界

本项目从用户本机的「西格莉卡 × 达妮娅 · 晴光与泡影」0.8.5 提取为独立 Windows 程序，首版 1.0.0 仅保留「果园午后」和「昭日遇见暗潮」两套场景及其装饰。调色板、布局、动效与宿主均可从本仓库构建，无需 Tessalume 安装或服务。

- Tessalume：lyc1uckYoo / Tessalume Contributors，https://github.com/lyc1uckYoo/tessalume 。派生运行时、模板和基础样式保留 MIT 许可于 `licenses/TESSALUME-MIT.txt`。修改包括扫描调度、清理边界、保留原生节点和独立加载封装。
- DSH 达妮娅主题：Ewnscat，https://github.com/Ewnscat-ya/dsh-client-ui-skin-denia 。使用原始明暗达妮娅立绘与 Q 版 GIF；原始署名链（包括 Ewnscat、Small-tailqwq、linxin6666）完整保存在 `licenses/DSH-NOTICE.txt`。上游许可文件原样保存在 `licenses/DSH-LICENSE.txt`，官方 CC BY-NC-SA 4.0 完整条款见 https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.zh-hans 。不把上游素材重新标为 MIT。
- 鸣潮及角色形象的原作权利归 Kuro Games（库洛游戏）。
- 用户提供插画、团子头像、500×500 西西吃饭 GIF 原字节素材保留来源；其中部分作者/再分发授权尚未在本机素材记录中确认。公开分享前应补足这些素材的来源及分享条件，也可用自己的授权素材替换。
- `duo-night.png`、西西透明立绘、果园闭眼帧与遮挡补底包含内置 imagegen 生成/编辑部分；原图、处理方法及提示词记录在 `docs/ASSETS.md`。果园人物图层以原图 RGB 和手工透明遮罩构成。
- 字体使用系统已安装的 Noto Sans SC、Microsoft YaHei UI、Segoe UI 回退；不捆绑或下载字体。

安装器和托盘宿主是本项目代码；其行为不涉及 Codex 账户登录、订阅或聊天内容收集。所有调试连接限制到经过当前 Codex 包路径和端口所属进程验证的 loopback 端点。没有分析上报或外部主题更新服务。
