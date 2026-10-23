[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SourceDirectory = $null,
    [switch]$NoLaunch
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
    $SourceDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'app'
}
$sourceRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $SourceDirectory).Path).TrimEnd('\')
$installRoot = Get-SunlitRoot
$executable = Join-Path $installRoot 'SunlitTidesCodex.exe'
if ($sourceRoot -eq $installRoot -or (Test-SunlitChild $sourceRoot $installRoot)) { throw '安装来源不能位于安装目录中。' }
Assert-SunlitNoReparse $sourceRoot
foreach ($required in @('SunlitTidesCodex.exe', 'theme\manifest.json', 'theme\payload.js', 'theme\remove.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $required) -PathType Leaf)) { throw ('缺少发行文件：' + $required) }
}
$themeManifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'theme\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($themeManifest.id -ne 'sunlit-tides.codex' -or $themeManifest.version -ne '1.0.0') { throw '主题标识或版本不匹配。' }
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($sourceRoot.Length + 1)
    if ($relative -match '(^|\\)(data|\.sunlit-tides-owned\.json)(\\|$)') { throw '发行包不能包含用户状态或旧安装记录。' }
    [pscustomobject]@{ path = $relative; sha256 = (Get-SunlitHash $_.FullName) }
})
$existingMarker = $null
if (Test-Path -LiteralPath $installRoot) {
    Assert-SunlitNoReparse $installRoot
    $existingMarker = Get-SunlitMarker $installRoot
    if ($null -eq $existingMarker -and @(Get-ChildItem -LiteralPath $installRoot -Force).Count -gt 0) { throw '现有目录没有本程序所有权记录；不会覆盖。' }
    if ($null -ne $existingMarker) {
        foreach ($file in $files) {
            $old = @($existingMarker.files | Where-Object { $_.path -eq $file.path -and $_.sha256 -eq $file.sha256 })
            $path = Join-Path $installRoot $file.path
            if ($old.Count -ne 1 -or -not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-SunlitHash $path) -ne $file.sha256) {
                throw '已有安装与本发行包不同。请先恢复并卸载，再安装新版本；当前文件已保留。'
            }
        }
        if (@($existingMarker.files).Count -ne $files.Count) { throw '已有安装文件列表不同，请先卸载；当前文件已保留。' }
    }
}
$runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runValue = '"' + $executable + '" --startup'
$oldRun = Get-SunlitRunValue
if ($null -ne $oldRun -and $oldRun -ne $runValue) { throw '同名启动项由其他命令占用，已保留。' }
$shortcuts = @(Get-SunlitShortcuts)
foreach ($shortcut in $shortcuts) { if (-not (Test-SunlitShortcut $shortcut $executable)) { throw ('快捷方式已由其他程序占用：' + $shortcut) } }
if (-not $PSCmdlet.ShouldProcess($installRoot, '安装独立主题、当前用户登录启动和主题快捷方式')) { return }

if ($null -eq $existingMarker) {
    $stage = Join-Path $env:LOCALAPPDATA ('SunlitTidesCodex.stage.' + [Guid]::NewGuid().ToString('N'))
    if (-not (Test-SunlitChild $stage $env:LOCALAPPDATA)) { throw '暂存路径校验失败。' }
    try {
        [void](New-Item -ItemType Directory -Path $stage)
        foreach ($file in $files) {
            $destination = Join-Path $stage $file.path
            if (-not (Test-SunlitChild $destination $stage)) { throw '发行包包含越界路径。' }
            [void](New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force)
            Copy-Item -LiteralPath (Join-Path $sourceRoot $file.path) -Destination $destination
            if ((Get-SunlitHash $destination) -ne $file.sha256) { throw '暂存文件完整性校验失败。' }
        }
        $marker = [ordered]@{ schema = 1; product = 'sunlit-tides.codex'; version = '1.0.0'; installRoot = $installRoot; files = $files; shortcuts = $shortcuts }
        $marker | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage '.sunlit-tides-owned.json') -Encoding UTF8
        if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot }
        # Both resolved paths are checked to remain in LOCALAPPDATA; no vendor files are moved.
        if (-not (Test-SunlitChild $installRoot $env:LOCALAPPDATA) -or -not (Test-SunlitChild $stage $env:LOCALAPPDATA)) { throw '移动路径校验失败。' }
        Move-Item -LiteralPath $stage -Destination $installRoot
    } finally {
        if ((Test-Path -LiteralPath $stage) -and (Test-SunlitChild $stage $env:LOCALAPPDATA) -and (Split-Path $stage -Leaf) -like 'SunlitTidesCodex.stage.*') { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
}
[void](New-Item -Path $runPath -Force)
Set-ItemProperty -LiteralPath $runPath -Name SunlitTidesCodex -Value $runValue -Type String
$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($shortcut in $shortcuts) {
        [void](New-Item -ItemType Directory -Path (Split-Path $shortcut -Parent) -Force)
        $link = $shell.CreateShortcut($shortcut)
        try {
            $link.TargetPath = $executable
            $link.Arguments = '--launch'
            $link.WorkingDirectory = $installRoot
            $link.Description = '独立晴光与泡影主题；登录时自动启动；托盘可恢复默认外观'
            $link.IconLocation = $executable + ',0'
            $link.Save()
        } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
    }
} finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
if (-not $NoLaunch) { [void](Start-Process -FilePath $executable -ArgumentList '--launch' -WindowStyle Hidden -PassThru) }
Write-Output ('已安装：' + $installRoot)
Write-Output '登录 Windows 后自动启用；原生入口在 Codex 完全退出后冷启动，可能仍需使用主题快捷方式。'
