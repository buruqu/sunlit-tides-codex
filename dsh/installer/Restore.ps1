[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][string]$DshHome,
    [Parameter(Mandatory = $true)][string]$CliPath
)
$ErrorActionPreference = 'Stop'
$owner='sunlit-tides-installer-v1'
$configNames=@('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','cordis.patch.yml')
function FullPath([string]$Path) { [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar) }
function Assert-PlainPath([string]$Path) {
    $cursor=FullPath $Path
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "拒绝重解析路径: $cursor" }
        $next=Split-Path -Parent $cursor; if ($next -eq $cursor) { break }; $cursor=$next
    }
}
function Assert-Stopped {
    $running=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'DeepSeek Harness.exe' -or ($_.Name -in @('node.exe','electron.exe') -and $_.CommandLine -match 'dsh-desktop-host[\\/]lib[\\/]index\.js') })
    if ($running.Count) { throw "检测到 DSH 仍在运行 (PID $($running.ProcessId -join ', '))，拒绝回退；本脚本不会停启应用。" }
}
function Write-Json([string]$Path,$Value) { [IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($true)) }
function Invoke-DshCli([string[]]$Arguments) {
    $oldHome=$env:DSH_HOME
    try { $env:DSH_HOME=$DshHome; & $CliPath @Arguments; $script:cliExit=$LASTEXITCODE }
    finally { $env:DSH_HOME=$oldHome }
}
function Restore-Config {
    foreach ($name in $configNames) {
        $saved=$manifest.before.$name; $dest=Join-Path $profile $name
        if ($saved.exists) { Copy-Item -LiteralPath (Join-Path $BackupPath "profile/$name") -Destination $dest -Force }
        elseif (Test-Path -LiteralPath $dest -PathType Leaf) { Remove-Item -LiteralPath $dest -Force }
    }
}
$DshHome=FullPath $DshHome; $CliPath=FullPath $CliPath; $BackupPath=FullPath $BackupPath
$backupRoot=FullPath (Join-Path $DshHome '.sunlit-tides-install-backups')
if (!(Split-Path -Parent $BackupPath).Equals($backupRoot,[StringComparison]::OrdinalIgnoreCase)) { throw '恢复点必须是本 DshHome 的受管备份直接子目录。' }
$profile=FullPath (Join-Path $DshHome 'profiles/desktop')
$target=FullPath (Join-Path $DshHome 'plugins/dsh-client-ui-skin-sunlit-tides')
$manifestPath=Join-Path $BackupPath 'manifest.json'
foreach ($p in @($DshHome,$BackupPath,$profile,$target,$CliPath,$manifestPath)) { Assert-PlainPath $p }
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.owner -ne $owner -or $manifest.schema -ne 1 -or $manifest.status -ne 'installed') { throw '恢复点身份/状态不符，拒绝自动覆盖。' }
if (!(FullPath $manifest.dshHome).Equals($DshHome,[StringComparison]::OrdinalIgnoreCase) -or !(FullPath $manifest.profile).Equals($profile,[StringComparison]::OrdinalIgnoreCase) -or !(FullPath $manifest.target).Equals($target,[StringComparison]::OrdinalIgnoreCase) -or !(FullPath $manifest.cliPath).Equals($CliPath,[StringComparison]::OrdinalIgnoreCase)) { throw '恢复点目标与显式参数不一致。' }
if (!(Test-Path -LiteralPath $CliPath -PathType Leaf) -or (Split-Path -Leaf $CliPath) -ne 'dsh.cmd') { throw 'CliPath 必须是安装自带 dsh.cmd。' }
foreach ($name in $configNames) {
    $p=Join-Path $profile $name; Assert-PlainPath $p
    $after=$manifest.after.$name; $before=$manifest.before.$name
    if ($null -eq $after -or $null -eq $before) { throw "恢复点缺少 $name 状态。" }
    $exists=Test-Path -LiteralPath $p -PathType Leaf
    if ($exists -ne [bool]$after.exists -or ($exists -and (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -ne $after.sha256)) { throw "安装后用户已变更 $name，拒绝覆盖。保留备份，请人工合并。" }
    if ($before.exists) {
        $saved=Join-Path $BackupPath "profile/$name"; Assert-PlainPath $saved
        if (!(Test-Path -LiteralPath $saved -PathType Leaf) -or (Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash -ne $before.sha256) { throw "备份 $name 缺失或哈希不符。" }
    }
}
if ($manifest.priorPlugin) {
    $prior=Join-Path $BackupPath 'previous-plugin'; Assert-PlainPath $prior
    if (!(Test-Path -LiteralPath $prior -PathType Container)) { throw '缺少完整旧插件目录。' }
    foreach ($p in @($prior,$target)) {
        if (Test-Path -LiteralPath $p) { foreach ($child in Get-ChildItem -LiteralPath $p -Recurse -Force) { if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '插件树包含重解析项，拒绝自动搬移。' } } }
    }
    $mark=Get-Content -LiteralPath (Join-Path $target '.sunlit-tides-managed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($mark.owner -ne $owner -or !(FullPath $mark.backup).Equals($BackupPath,[StringComparison]::OrdinalIgnoreCase)) { throw '当前插件不是该恢复点对应安装，拒绝替换。' }
}
Assert-Stopped
if (!$PSCmdlet.ShouldProcess($profile,"恢复 $BackupPath 中四个配置及原依赖；保留新皮肤文件")) { return }
Assert-Stopped
Restore-Config
if ($manifest.priorPlugin) {
    Move-Item -LiteralPath $target -Destination (Join-Path $BackupPath 'restored-candidate')
    Copy-Item -LiteralPath (Join-Path $BackupPath 'previous-plugin') -Destination $target -Recurse
}
$repair='not-needed'; $repairError=$null
try {
    if ($manifest.before.'pnpm-lock.yaml'.exists) {
        Assert-Stopped
        Invoke-DshCli -Arguments @('plugin', '--profile', 'desktop', 'install', '--ignore-scripts', '--offline', '--frozen-lockfile')
        if ($cliExit -ne 0) { throw "依赖离线重建退出 $cliExit" }
        $repair='complete'
    } else { $repair='manual; original lockfile absent' }
} catch { $repair='manual'; $repairError=$_.Exception.Message }
finally { Restore-Config }
foreach ($name in $configNames) {
    $p=Join-Path $profile $name; $saved=$manifest.before.$name
    if ((Test-Path -LiteralPath $p -PathType Leaf) -ne [bool]$saved.exists -or ($saved.exists -and (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -ne $saved.sha256)) { throw "恢复后 $name 校验失败，备份保留在 $BackupPath" }
}
$manifest.status='restored'; $manifest|Add-Member -NotePropertyName dependencyRepair -NotePropertyValue $repair -Force
$manifest|Add-Member -NotePropertyName restoredAt -NotePropertyValue (Get-Date).ToString('o') -Force
if ($repairError) { $manifest|Add-Member -NotePropertyName recoveryError -NotePropertyValue $repairError -Force }
Write-Json $manifestPath $manifest
Write-Output "原配置哈希已恢复。依赖重建: $repair。新旧插件和备份均保留。DSH 未启动。恢复点: $BackupPath"
if ($repair -ne 'complete') { throw "原配置已恢复，但 node_modules 未确认恢复: $repairError。请保留全部备份并人工修复依赖。" }
