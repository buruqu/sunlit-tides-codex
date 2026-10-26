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
$version = '1.2.6'
if ($sourceRoot -eq $installRoot -or (Test-SunlitChild $sourceRoot $installRoot)) { throw '安装来源不能位于安装目录中。' }
Assert-SunlitLocalPath $installRoot
Assert-SunlitNoReparse $sourceRoot
foreach ($required in @('SunlitTidesCodex.exe', 'theme\manifest.json', 'theme\payload.js', 'theme\remove.js', 'media\startup.mp4')) {
    $path = Join-Path $sourceRoot $required
    if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) { throw ('缺少或空发行文件：' + $required) }
}
$themeManifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'theme\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($themeManifest.id -ne 'sunlit-tides.codex' -or $themeManifest.version -ne $version) { throw '主题标识或版本不匹配。' }
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($sourceRoot.Length + 1)
    Assert-SunlitRelativeFile $relative
    [pscustomobject]@{ path = $relative; sha256 = (Get-SunlitHash $_.FullName) }
})
$existingMarker = $null
$hadRoot = Test-Path -LiteralPath $installRoot
if ($hadRoot) {
    Assert-SunlitNoReparse $installRoot
    $existingMarker = Get-SunlitMarker $installRoot
    if ($null -eq $existingMarker -and @(Get-ChildItem -LiteralPath $installRoot -Force).Count -gt 0) { throw '现有目录没有本程序所有权记录；不会覆盖。' }
    if ($null -ne $existingMarker) {
        if ($existingMarker.version -notin @('1.0.0', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', $version)) { throw '不支持此已安装版本；现有安装已保留。' }
        Assert-SunlitInstalledFiles $installRoot $existingMarker $files
    }
}
$runValue = '"' + $executable + '" --startup'
$oldRun = Get-SunlitRunValue
if ($null -ne $oldRun -and $oldRun -ne $runValue) { throw '同名启动项由其他命令占用，已保留。' }
$shortcuts = @(Get-SunlitShortcuts)
$priorShortcuts = @{}
foreach ($shortcut in $shortcuts) { $priorShortcuts[$shortcut] = Test-Path -LiteralPath $shortcut }
foreach ($shortcut in $shortcuts) { if (-not (Test-SunlitShortcut $shortcut $executable)) { throw ('快捷方式已由其他程序占用：' + $shortcut) } }
if (-not $PSCmdlet.ShouldProcess($installRoot, '暂存并验证 1.2.6，恢复旧主题、保留用户设置与完整旧版本备份后安装')) { return }

$installMutex = New-Object Threading.Mutex($false, ('Local\SunlitTidesCodex.Install.' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$hasInstallMutex = $false
try {
    try { $hasInstallMutex = $installMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $hasInstallMutex = $true }
    if (-not $hasInstallMutex) { throw '另一个安装操作正在运行，请等待其完成。' }
$token = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.' + [Guid]::NewGuid().ToString('N')
$stage = Join-Path $env:LOCALAPPDATA ('SunlitTidesCodex.stage.' + $token)
$oldVersion = if ($null -eq $existingMarker) { 'empty' } else { $existingMarker.version }
$backup = Join-Path $env:LOCALAPPDATA ('SunlitTidesCodex.backup.' + $oldVersion + '.' + $token)
foreach ($path in @($stage, $backup)) {
    Assert-SunlitLocalPath $path
    if (Test-Path -LiteralPath $path) { throw '暂存或备份路径已存在，已停止。' }
}
$oldMoved = $false
$newMoved = $false
$oldStopped = $false
$settingsBytes = $null
$settingsPath = Join-Path $installRoot 'data\settings.json'
$hadSettings = $false
try {
    [void](New-Item -ItemType Directory -Path $stage)
    foreach ($file in $files) {
        $destination = Join-Path $stage $file.path
        if (-not (Test-SunlitChild $destination $stage)) { throw '发行包包含越界路径。' }
        [void](New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force)
        Copy-Item -LiteralPath (Join-Path $sourceRoot $file.path) -Destination $destination
        if ((Get-SunlitHash $destination) -ne $file.sha256) { throw '暂存文件完整性校验失败。' }
    }
    $stagedManifest = Get-Content -LiteralPath (Join-Path $stage 'theme\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($stagedManifest.id -ne 'sunlit-tides.codex' -or $stagedManifest.version -ne $version) { throw '暂存主题标识或版本不匹配。' }
    $marker = [ordered]@{ schema = 1; product = 'sunlit-tides.codex'; version = $version; installRoot = $installRoot; files = $files; shortcuts = $shortcuts }
    $marker | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage '.sunlit-tides-owned.json') -Encoding UTF8
    if ($null -ne $existingMarker) {
        # Recheck immediately before running the known old executable. Its --quit
        # writes enabled=false; capture the original bytes before asking it to stop.
        Assert-SunlitInstalledFiles $installRoot $existingMarker $files
        $hadSettings = Test-Path -LiteralPath $settingsPath -PathType Leaf
        if ($hadSettings) {
            $settingsBytes = [IO.File]::ReadAllBytes($settingsPath)
            [void](New-Item -ItemType Directory -Path (Join-Path $stage 'data'))
            [IO.File]::WriteAllBytes((Join-Path $stage 'data\settings.json'), $settingsBytes)
        }
        Stop-SunlitOwnedHelper $installRoot $existingMarker
        $oldStopped = $true
        Assert-SunlitInstalledFiles $installRoot $existingMarker $files
        if ($hadSettings) { [IO.File]::WriteAllBytes($settingsPath, $settingsBytes) }
        elseif (Test-Path -LiteralPath $settingsPath) {
            # Preserve the original absent-file state without deleting a helper-created file.
            $quitSettings = Join-Path $installRoot ('data\settings.quit.' + $token + '.json')
            Move-Item -LiteralPath $settingsPath -Destination $quitSettings
        }
        $data = Join-Path $installRoot 'data'
        if (Test-Path -LiteralPath $data -PathType Container) {
            [void](New-Item -ItemType Directory -Path (Join-Path $stage 'data') -Force)
            foreach ($item in Get-ChildItem -LiteralPath $data -Force) { Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $stage 'data') -Recurse -Force }
        }
    }
    # No recursive deletion: complete previous installs and failed stages remain recoverable.
    Assert-SunlitNoReparse $stage
    foreach ($path in @($stage, $installRoot, $backup)) { Assert-SunlitLocalPath $path }
    if ($hadRoot) {
        Move-SunlitDirectory $installRoot $backup
        $oldMoved = $true
    }
    Move-SunlitDirectory $stage $installRoot
    $newMoved = $true
    Set-SunlitIntegration $installRoot $shortcuts
    if (-not $NoLaunch) {
        # --launch intentionally re-enables a fresh installation. Existing users'
        # disabled-theme choice must survive an upgrade or reinstall.
        $launchCommand = if ($null -eq $existingMarker) { '--launch' } else { '--watch' }
        [void](Start-Process -FilePath $executable -ArgumentList $launchCommand -WindowStyle Hidden -PassThru)
    }
} catch {
    $failure = $_
    # Do not move a live new helper. Start-Process is the final fallible operation;
    # a returned process is a successful handoff, not a health claim.
    try {
        foreach ($path in @($stage, $installRoot, $backup)) { Assert-SunlitLocalPath $path }
        if ($newMoved) {
            # Remove only integration entries that did not exist before this attempt
            # and still point to our exact command. Existing entries remain stable.
            if ($null -eq $oldRun -and (Get-SunlitRunValue) -eq $runValue) { Remove-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name SunlitTidesCodex }
            foreach ($shortcut in $shortcuts) {
                if (-not $priorShortcuts[$shortcut] -and (Test-Path -LiteralPath $shortcut -PathType Leaf) -and (Test-SunlitShortcut $shortcut $executable)) { Remove-Item -LiteralPath $shortcut }
            }
            Assert-SunlitNoReparse $installRoot
            if (@(Get-SunlitProcesses $executable).Count -gt 0) { throw '新版宿主仍在运行；需要人工恢复保留的备份。' }
            Move-SunlitDirectory $installRoot $stage
            $newMoved = $false
        }
        if ($oldMoved) {
            Assert-SunlitNoReparse $backup
            Move-SunlitDirectory $backup $installRoot
            $oldMoved = $false
        }
        if ($oldStopped -and $hadSettings -and (Test-Path -LiteralPath $installRoot -PathType Container)) { [IO.File]::WriteAllBytes($settingsPath, $settingsBytes) }
    } catch { throw ('安装失败且自动恢复未完成。原错误：' + $failure.Exception.Message + '；恢复错误：' + $_.Exception.Message + '；备份：' + $backup + '；暂存：' + $stage) }
    throw ('安装失败，原安装已保留或恢复，宿主可能已停止。' + $failure.Exception.Message + '；已保留暂存：' + $stage)
}
Write-Output ('已安装 ' + $version + '：' + $installRoot)
if ($oldMoved) { Write-Output ('旧版本完整备份（含用户状态）：' + $backup) }
try {
    $entryReport = Sync-SunlitEntrypoints $installRoot 'Install'
    $entryReport | ConvertTo-Json -Depth 8 | Write-Output
    if (@($entryReport.Errors).Count -gt 0) { Write-Warning '主题已安装；部分普通入口未完成迁移，详见入口报告。' }
} catch { Write-Warning ('主题已安装；普通入口迁移未完成：' + $_.Exception.Message) }
Write-Output '普通桌面和开始菜单快捷方式已按报告迁移；原生固定项需核对。原快捷方式备份保留在 data\entrypoints。'
} finally {
    if ($hasInstallMutex) { $installMutex.ReleaseMutex() }
    $installMutex.Dispose()
}
