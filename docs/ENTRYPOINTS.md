# 普通入口的受管迁移

installer/Entrypoints.ps1 独立于宿主安装事务。先完成并验证新宿主，再迁移普通入口；局部迁移失败会返回明确错误，不能把入口指回不支持 --open 的旧宿主。

## 集成接口

~~~powershell
. (Join-Path $PSScriptRoot 'Entrypoints.ps1')
$report = Invoke-SunlitEntrypoints -Action Install -Root $installRoot -OfficialExe $verifiedCurrentAppxExe -Aumid $verifiedAumid -IconPath $stableOfficialIcon
~~~

Action 为 Inspect、Install、Verify 或 Restore。也可通过 powershell.exe -File installer\Entrypoints.ps1 -Action Inspect -Root ... 调用；CLI 输出 JSON，存在 Errors 时退出码为 1。函数直接返回对象，便于安装器报告局部未完成。

- Install 只替换已存在且身份精确匹配的 .lnk，保留原文件名。目标为安装根的 SunlitTidesCodex.exe，参数固定 --open，工作目录为安装根。普通打开不会自行改变主题开关。
- OfficialExe、Aumid 应由调用方从当前 OpenAI.Codex Appx 包查证。省略时模块也按包名精确发现。IconPath 必须是 Root\data\entrypoints 内已准备的稳定文件，省略则使用当前官方 EXE 的图标位置。
- 默认只看当前用户 Desktop、Programs、TaskBar；Desktop/TaskBar 仅直接 .lnk，Programs 最多八层。全程最多 256 个目录、2048 个链接、默认 20 秒。到限明确报告未完成，不把部分结果当作全覆盖。可显式传入这些目录中的 SearchRoots 子集。
- Inspect 与 Verify 不创建 journal、不替换文件。Verify 核对已记录链接的当前哈希及 --open 目标。

## 身份与保护

不按 ChatGPT、Codex 或任何显示名识别。接受精确官方 EXE、精确 AppsFolder/AUMID，以及 WScript TargetPath 为空但 Shell System.Link.TargetParsingPath 或 System.AppUserModel.ID 精确匹配的 MSIX 链接。自定义参数不会泛化为默认入口。

旧入口只有在目标文件名精确为 DragonCodexBoot.exe 且其相邻 launcher.json 的 AppLaunch 精确指向当前应用时才迁移。不会运行旧入口、改旧目录或遍历磁盘。旧项目的 MIT 许可和 notice 已在互操作核对时查阅；本模块独立编写，没有导入其集成脚本。

替换使用全新 COM shell link，不修改旧 MSIX link 的内部字段，因此不继承旧 AppsFolder 元数据。

data\entrypoints 保存不可覆盖的 originals、managed、records、events、transactions。原始字节和哈希先验证，Prepared 记录和提交意图先落盘，再用目标目录中的临时兄弟文件执行原子 File.Replace，兼容桌面被重定向到另一卷。最终哈希守卫后的竞态保留被替换版本，并在仍能确认当前文件属于本次写入时恢复用户版本；期间再次修改时保留可恢复版本并报告错误。

重复 Install 对未修改受管链接保持字节及 journal 幂等。用户删除、修改或无法核验的链接不重建、不接管。Restore 只在当前哈希等于记录的 managed 哈希且目标仍为本宿主 --open 时恢复原始字节；原始备份缺失或改变会阻止恢复。路径检查拒绝 reparse、越界 journal 路径、UNC、ADS 与歧义路径。

## 卸载与原生固定项

RemainingHostLinks 包含所有扫描到仍指向宿主的 .lnk，包括改过参数的用户链接和旧专用 --launch 链接。调用方应先移除其独立确认拥有的专用入口，再确认普通入口恢复完成。

只有 Restore 报告 SafeToRemoveHost=true，才表示本轮受限扫描完整且未发现仍需宿主的链接。HostLinkVerificationComplete=false、扫描到限、未知 reparse 或无法读取的链接不能证明可删除宿主。Errors、Preserved 必须向用户说明；仍有宿主依赖时保留 EXE。

本模块不重启 Explorer、不改 Taskband 注册表、不改 MSIX 注册或包体。原生 AppsFolder/开始菜单固定项、任务栏缓存不一定受 .lnk 改写影响，报告始终含 NativePinsRequireReview=true，须由调用方另行核对或通过 UI 处理，不能承诺“文件已替换即固定项已生效”。

## 隔离测试

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File installer\Test-Entrypoints.ps1
~~~

测试只在新建临时 TestRoot 中制作链接和虚拟 EXE，不运行应用。MSIX 原链接的空 TargetPath/ParsingPath 使用仅 TestRoot 允许的元数据注入，新替换文件使用真实 Windows COM；并发和备份失败使用真实文件操作。MetadataProvider、Checkpoint 禁止用于非 TestRoot 调用，测试根也不能包含实际用户集成目录。保留隔离目录和 test-results/entrypoints/report.json 供检查。
