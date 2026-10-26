# 来源与分发边界

本项目将 buruqu/sunlit-tides-codex 的晴光与泡影视觉素材与动画内核移植为独立 DeepSeek Harness 皮肤插件，当前动画来源基线为 1.2.7。场景配置、遮罩、风吹与泪光算法保留，DSH 生命周期、界面适配和调色板独立实现。

- 晴光与泡影源码：https://github.com/buruqu/sunlit-tides-codex 。原创代码沿用根目录 LICENSE 的 MIT 许可；角色与媒体不因此转为 MIT。
- Tessalume：lyc1uckYoo / Tessalume Contributors，https://github.com/lyc1uckYoo/tessalume 。原项目派生历史和 MIT 声明保留于 licenses/TESSALUME-MIT.txt。本插件不加载 Tessalume 或 Codex 宿主。
- DSH 达妮娅主题：Ewnscat，https://github.com/Ewnscat-ya/dsh-client-ui-skin-denia 。使用原始达妮娅明暗立绘与 Q 版 GIF，并参考其公开 DSH 皮肤接口与宿主选择器。完整署名链（包括 Ewnscat、Small-tailqwq、linxin6666）保留于 licenses/DSH-NOTICE.txt；CC BY-NC-SA 4.0 许可保留于 licenses/DSH-LICENSE.txt。
- 鸣潮及角色形象的原作权利归 Kuro Games（库洛游戏）；本项目是个人同人主题。
- 用户提供的插画、团子头像和 GIF 保留原来源；部分媒体的公开再分发条件尚未确认。当前交付用于本机个人试用，不将媒体重新标为原创或 MIT。
- AI 生成、局部处理、原图图层和遮罩记录见 ASSETS.md。此文沿用上游素材记录，历史文件布局与当前 DSH 目录的对应关系见该文开头。
- 不捆绑字体，使用系统字体回退。DSH 包不包含 .NET、Windows 托盘宿主或 Dragon 视频；保留的相关许可是上游历史记录。

插件只处理外观，设置保存在当前 WebUI 的独立 localStorage 键中，不读取或上传聊天、模型密钥、账号信息。没有外部分析服务、自动更新或运行时代码下载。
