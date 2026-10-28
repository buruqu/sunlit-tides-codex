[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$DshHome,
    [Parameter(Mandatory = $true)][string]$CliPath,
    [string]$SourcePath = ''
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $installerRoot = $PSScriptRoot
    if ([string]::IsNullOrWhiteSpace($installerRoot)) { $installerRoot = Split-Path -Parent $PSCommandPath }
    if ([string]::IsNullOrWhiteSpace($installerRoot)) { throw '无法确定安装器位置，请显式提供 SourcePath。' }
    $SourcePath = Split-Path -Parent $installerRoot
}
$owner = 'sunlit-tides-installer-v1'
$packageName = '@dsh-external/dsh-client-ui-skin-sunlit-tides'
$pluginName = 'dsh-client-ui-skin-sunlit-tides'
$configNames = @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml')
function FullPath([string]$Path) { [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar) }
function Assert-PlainPath([string]$Path) {
    $cursor = FullPath $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "拒绝重解析路径: $cursor" }
        }
        $next = Split-Path -Parent $cursor
        if ($next -eq $cursor) { break }; $cursor = $next
    }
}
function Assert-Stopped {
    $installRoot = FullPath (Join-Path (Split-Path -Parent $CliPath) '../../../..')
    $exe = Join-Path $installRoot 'DeepSeek Harness.exe'
    $running = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'DeepSeek Harness.exe' -or
        ($_.ExecutablePath -and $_.ExecutablePath.Equals($exe, [StringComparison]::OrdinalIgnoreCase)) -or
        ($_.Name -in @('node.exe', 'electron.exe') -and $_.CommandLine -match 'dsh-desktop-host[\\/]lib[\\/]index\.js')
    })
    if ($running.Count) { throw "检测到 DSH 仍在运行 (PID $($running.ProcessId -join ', '))。请完全退出后安装；本脚本不会停启应用。" }
}
function Get-State([string]$Dir, [string]$Name) {
    $p = Join-Path $Dir $Name
    if (Test-Path -LiteralPath $p -PathType Leaf) { return @{ exists = $true; sha256 = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash } }
    if (Test-Path -LiteralPath $p) { throw "配置不是普通文件: $p" }
    return @{ exists = $false; sha256 = $null }
}
function Write-Json([string]$Path, $Value) { [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 15), [Text.UTF8Encoding]::new($true)) }
function Invoke-DshCli([string[]]$Arguments) {
    $oldHome = $env:DSH_HOME
    try { $env:DSH_HOME = $DshHome; & $CliPath @Arguments; $script:cliExit = $LASTEXITCODE }
    finally { $env:DSH_HOME = $oldHome }
}
function Restore-Config($States, [string]$Backup, [string]$Profile) {
    foreach ($name in $configNames) {
        $dest = Join-Path $Profile $name
        if ($States[$name].exists) { Copy-Item -LiteralPath (Join-Path $Backup "profile/$name") -Destination $dest -Force }
        elseif (Test-Path -LiteralPath $dest -PathType Leaf) { Remove-Item -LiteralPath $dest -Force }
    }
}
function Disable-Denia([string]$Path) {
    $text = [IO.File]::ReadAllText($Path)
    if ($text.Trim() -eq '[]') { $text = '' }
    $pattern = '(?ms)^-\s+id:\s*[\x27\x22]?ui-skin-denia[\x27\x22]?\s*(?:#[^\r\n]*)?\r?\n(?:(?!^-\s).)*'
    $matches = [regex]::Matches($text, $pattern)
    if ($matches.Count -gt 1) { throw 'Denia 存在多个用户补丁，拒绝自动改写；请先消除重复。' }
    if ($matches.Count -eq 1) {
        $block = $matches[0].Value
        $disabled = [regex]::Matches($block, '(?m)^  disabled:.*$')
        if ($disabled.Count -gt 1) { throw 'Denia 补丁包含重复 disabled。' }
        if ($disabled.Count) { $updated = [regex]::Replace($block, '(?m)^  disabled:.*$', '  disabled: true') }
        else { $updated = $block.TrimEnd() + "`r`n  disabled: true`r`n" }
        $text = $text.Substring(0, $matches[0].Index) + $updated + $text.Substring($matches[0].Index + $matches[0].Length)
    } else {
        if ($text -match '(?m)^-\s+id:.*ui-skin-denia') { throw 'Denia 补丁语法超出本安装器安全处理范围。' }
        $text = $text.TrimEnd() + "`r`n`r`n# Sunlit Tides: retain Denia installed, disable its runtime row.`r`n- id: ui-skin-denia`r`n  disabled: true`r`n"
    }
    [IO.File]::WriteAllText($Path, $text, [Text.UTF8Encoding]::new($true))
}
$DshHome = FullPath $DshHome; $CliPath = FullPath $CliPath; $SourcePath = FullPath $SourcePath
$profile = Join-Path $DshHome 'profiles/desktop'
$plugins = Join-Path $DshHome 'plugins'
$target = Join-Path $plugins $pluginName
foreach ($p in @($DshHome, $profile, $plugins, $target, $CliPath, $SourcePath)) { Assert-PlainPath $p }
if (!(Test-Path -LiteralPath $CliPath -PathType Leaf) -or (Split-Path -Leaf $CliPath) -ne 'dsh.cmd') { throw 'CliPath 必须是安装自带的 dsh.cmd。' }
if (!(Test-Path -LiteralPath (Join-Path $profile 'package.json') -PathType Leaf)) { throw 'desktop profile 尚未初始化。' }
if (!(Test-Path -LiteralPath (Join-Path $profile 'cordis.patch.yml') -PathType Leaf)) { throw '缺少 desktop cordis.patch.yml。' }
if ($SourcePath.Equals((FullPath $target), [StringComparison]::OrdinalIgnoreCase)) { throw '源包不能是安装目标。' }
$pkg = Get-Content -LiteralPath (Join-Path $SourcePath 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pkg.name -ne $packageName -or $pkg.dsh.bundle.patch -ne './cordis.patch.yml') { throw '源包身份或 bundle 契约不符。' }
if ($pkg.scripts) {
    foreach ($s in $pkg.scripts.PSObject.Properties.Name) {
        if ($s -match '^(preinstall|install|postinstall|prepare|prepublish|prepublishOnly|prepack|postpack)$') { throw "拒绝源包生命周期脚本: $s" }
    }
}
$runtimeFiles = @('package.json') + @($pkg.files)
if ('native' -notin $pkg.files -or !(Test-Path -LiteralPath (Join-Path $SourcePath 'native/SunlitTidesCodex.exe') -PathType Leaf)) { throw '源包缺少受管原生面板程序。请使用完整发布包。' }
foreach ($name in $runtimeFiles) {
    if (!$name -or [IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)|[*?]') { throw "非法 runtime 文件声明: $name" }
    $p = Join-Path $SourcePath $name
    if (!(Test-Path -LiteralPath $p)) { throw "runtime 文件缺失: $p" }
    Assert-PlainPath $p
    if ((Get-Item -LiteralPath $p).PSIsContainer) {
        foreach ($child in Get-ChildItem -LiteralPath $p -Force -Recurse) { if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "源包包含重解析项: $($child.FullName)" } }
    }
}
$priorPlugin = Test-Path -LiteralPath $target
if ($priorPlugin) {
    $marker = Join-Path $target '.sunlit-tides-managed.json'
    if (!(Test-Path -LiteralPath $marker -PathType Leaf)) { throw '目标插件目录不属于本安装器，拒绝覆盖。' }
    $mark = Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($mark.owner -ne $owner -or $mark.package -ne $packageName) { throw '目标插件目录受管标记不符。' }
    foreach ($child in Get-ChildItem -LiteralPath $target -Force -Recurse) { if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '旧插件包含重解析项，拒绝搬移。' } }
}
foreach ($name in $configNames) { Assert-PlainPath (Join-Path $profile $name) }
Assert-Stopped
if (!$PSCmdlet.ShouldProcess($profile, "安装 $($pkg.name)@$($pkg.version)，停用 Denia 并保存可校验恢复点")) { return }
$backupRoot = Join-Path $DshHome '.sunlit-tides-install-backups'
Assert-PlainPath $backupRoot
$backup = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path (Join-Path $backup 'profile') -Force | Out-Null
$before = @{}
foreach ($name in $configNames) {
    $before[$name] = Get-State $profile $name
    if ($before[$name].exists) {
        $saved = Join-Path $backup "profile/$name"
        Copy-Item -LiteralPath (Join-Path $profile $name) -Destination $saved
        if ((Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash -ne $before[$name].sha256) { throw "备份校验失败: $name" }
    }
}
$manifest = @{ owner=$owner; schema=1; createdAt=(Get-Date).ToString('o'); status='prepared'; dshHome=$DshHome; profile=$profile; target=$target; cliPath=$CliPath; package=$packageName; version=$pkg.version; priorPlugin=$priorPlugin; before=$before; after=@{} }
$manifestPath = Join-Path $backup 'manifest.json'
Write-Json $manifestPath $manifest
Write-Output "恢复点: $backup"
$pluginReplaced = $false; $priorMoved = $false; $cliStarted = $false
try {
    Assert-Stopped
    New-Item -ItemType Directory -Path $plugins -Force | Out-Null
    if ($priorPlugin) { Move-Item -LiteralPath $target -Destination (Join-Path $backup 'previous-plugin'); $priorMoved = $true }
    New-Item -ItemType Directory -Path $target | Out-Null
    $pluginReplaced = $true
    foreach ($name in $runtimeFiles) { Copy-Item -LiteralPath (Join-Path $SourcePath $name) -Destination (Join-Path $target $name) -Recurse -Force }
    Write-Json (Join-Path $target '.sunlit-tides-managed.json') @{owner=$owner; package=$packageName; backup=$backup; version=$pkg.version}
    Assert-Stopped
    $cliStarted = $true
    Invoke-DshCli -Arguments @('plugin', '--profile', 'desktop', 'add', $target, '--ignore-scripts', '--offline')
    if ($cliExit -ne 0) { throw "官方 CLI add 失败，退出码 $cliExit" }
    Disable-Denia (Join-Path $profile 'cordis.patch.yml')
    $afterPackage = Get-Content -LiteralPath (Join-Path $profile 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($packageName -notin @($afterPackage.dsh.profile.bundles) -or !$afterPackage.dependencies.PSObject.Properties[$packageName]) { throw 'CLI 未建立预期依赖和 bundle。' }
    foreach ($name in $configNames) { $manifest.after[$name] = Get-State $profile $name }
    $manifest.status='installed'; Write-Json $manifestPath $manifest
    Write-Output "安装配置完成；DSH 未启动。备份: $backup"
} catch {
    $failure = $_.Exception.Message
    try {
        Assert-Stopped
        Restore-Config $before $backup $profile
        if ($pluginReplaced -or $priorMoved) {
            if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination (Join-Path $backup 'failed-candidate') }
            if ($priorPlugin -and (Test-Path -LiteralPath (Join-Path $backup 'previous-plugin'))) { Copy-Item -LiteralPath (Join-Path $backup 'previous-plugin') -Destination $target -Recurse }
        }
        $dependencyRepair = 'not-needed'
        if ($cliStarted -and $before['pnpm-lock.yaml'].exists) {
            Invoke-DshCli -Arguments @('plugin', '--profile', 'desktop', 'install', '--ignore-scripts', '--offline', '--frozen-lockfile')
            $dependencyRepair = if ($cliExit -eq 0) {'complete'} else {'failed; node_modules may need manual repair'}
            Restore-Config $before $backup $profile
        } elseif ($cliStarted) { $dependencyRepair = 'manual; original lockfile absent' }
        foreach ($name in $configNames) {
            $actual = Get-State $profile $name
            if ($actual.exists -ne $before[$name].exists -or $actual.sha256 -ne $before[$name].sha256) { throw "自动恢复后配置哈希不符: $name" }
        }
        $manifest.status='failed-config-restored'; $manifest.dependencyRepair=$dependencyRepair
    } catch { $manifest.status='failed-needs-manual-recovery'; $manifest.recoveryError=$_.Exception.Message }
    $manifest.error=$failure; Write-Json $manifestPath $manifest
    throw "安装未完成: $failure。恢复状态: $($manifest.status)。完整恢复点保留于 $backup；依赖状态: $($manifest.dependencyRepair)"
}
