[CmdletBinding(SupportsShouldProcess = $true)]
param()
. (Join-Path $PSScriptRoot 'Common.ps1')
$installRoot = Get-SunlitRoot
if (-not (Test-Path -LiteralPath $installRoot)) { Write-Output '未安装晴光与泡影主题。'; return }
Assert-SunlitNoReparse $installRoot
$marker = Get-SunlitMarker $installRoot
if ($null -eq $marker) { throw '现有目录没有本程序所有权记录，已保留。' }
if (-not $PSCmdlet.ShouldProcess($installRoot, '恢复默认、退出主题宿主并移除自己的启动项、快捷方式和未修改安装文件')) { return }
$executable = Join-Path $installRoot 'SunlitTidesCodex.exe'
# These two installer-owned shortcuts have their own exact ownership check;
# remove them before verifying that ordinary links no longer need the host.
foreach ($shortcut in @(Get-SunlitShortcuts)) {
    if ((Test-Path -LiteralPath $shortcut -PathType Leaf) -and (Test-SunlitShortcut $shortcut $executable)) { Remove-Item -LiteralPath $shortcut }
}
$entryReport = Sync-SunlitEntrypoints $installRoot 'Restore'
if (-not $entryReport.SafeToRemoveHost) {
    $entryReport | ConvertTo-Json -Depth 8 | Write-Output
    throw '部分普通入口需要核对，已保留主题宿主及备份，避免留下失效入口。'
}
Stop-SunlitOwnedHelper $installRoot $marker
$executable = Join-Path $installRoot 'SunlitTidesCodex.exe'
$runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runValue = '"' + $executable + '" --startup'
$registered = Get-SunlitRunValue
if ($registered -eq $runValue) { Remove-ItemProperty -LiteralPath $runPath -Name SunlitTidesCodex }
foreach ($shortcut in @(Get-SunlitShortcuts)) {
    if ((Test-Path -LiteralPath $shortcut -PathType Leaf) -and (Test-SunlitShortcut $shortcut $executable)) { Remove-Item -LiteralPath $shortcut }
}
$preserved = @()
foreach ($file in $marker.files) {
    $path = Join-Path $installRoot $file.path
    if (-not (Test-SunlitChild $path $installRoot)) { throw '删除路径越界，已停止。' }
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        if ((Get-SunlitHash $path) -eq $file.sha256) { Remove-Item -LiteralPath $path }
        else { $preserved += $file.path }
    }
}
foreach ($name in @('settings.json', 'settings.json.tmp', 'status.json', 'status.json.tmp', 'registrations.json', 'registrations.json.tmp', 'host.log', 'host.log.1')) {
    $path = Join-Path $installRoot ('data\' + $name)
    if ((Test-SunlitChild $path $installRoot) -and (Test-Path -LiteralPath $path -PathType Leaf)) { Remove-Item -LiteralPath $path }
}
# Empty-directory deletion only: user-added or changed files are retained.
foreach ($directory in @(Get-ChildItem -LiteralPath $installRoot -Directory -Recurse -Force | Sort-Object { $_.FullName.Length } -Descending)) {
    if ((Test-SunlitChild $directory.FullName $installRoot) -and @(Get-ChildItem -LiteralPath $directory.FullName -Force).Count -eq 0) { Remove-Item -LiteralPath $directory.FullName }
}
$remaining = @(Get-ChildItem -LiteralPath $installRoot -Force | Where-Object { $_.Name -ne '.sunlit-tides-owned.json' })
if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath (Join-Path $installRoot '.sunlit-tides-owned.json')
    if ((Test-SunlitChild $installRoot $env:LOCALAPPDATA) -and @(Get-ChildItem -LiteralPath $installRoot -Force).Count -eq 0) { Remove-Item -LiteralPath $installRoot }
    Write-Output '已恢复默认并卸载晴光与泡影主题。'
} else {
    Write-Output ('主题已停止，启动项和主题快捷方式已移除；修改过或额外添加的文件已保留在：' + $installRoot)
}
Write-Output '没有改动 Tessalume、Codex 安装包或 Codex 用户数据；当前 Codex 的调试端口随该进程退出而关闭。'
