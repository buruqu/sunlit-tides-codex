Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SunlitRoot {
    [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'SunlitTidesCodex')).TrimEnd('\')
}
function Get-SunlitHash([string]$Path) {
    # Windows PowerShell's Get-FileHash -LiteralPath calls a property cmdlet that
    # inherits -WhatIf; hash through a read-only stream so preflight still works.
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $sha.Dispose(); $stream.Dispose() }
}
function Get-SunlitRunValue {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run', $false)
    try { if ($null -ne $key) { return $key.GetValue('SunlitTidesCodex', $null) }; return $null }
    finally { if ($null -ne $key) { $key.Dispose() } }
}
function Test-SunlitChild([string]$Path, [string]$Root) {
    $absolute = [IO.Path]::GetFullPath($Path)
    $parent = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $absolute.StartsWith($parent + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Get-SunlitMarker([string]$Root) {
    $file = Join-Path $Root '.sunlit-tides-owned.json'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $null }
    $marker = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($marker.product -ne 'sunlit-tides.codex' -or $marker.installRoot -ne $Root -or $marker.schema -ne 1) {
        throw '安装所有权记录无效；已保留现有目录。'
    }
    foreach ($entry in $marker.files) {
        if (-not (Test-SunlitChild (Join-Path $Root $entry.path) $Root)) { throw '所有权记录包含越界路径。' }
    }
    $marker
}
function Get-SunlitShortcuts {
    @(
        (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Codex · 晴光与泡影.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex · 晴光与泡影.lnk')
    )
}
function Test-SunlitShortcut([string]$Path, [string]$Executable) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $true }
    $shell = New-Object -ComObject WScript.Shell
    try {
        $link = $shell.CreateShortcut($Path)
        try { return $link.TargetPath -eq $Executable -and $link.Arguments -eq '--launch' }
        finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
function Assert-SunlitNoReparse([string]$Root) {
    $rootItem = Get-Item -LiteralPath $Root -Force
    if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '目录不能是符号链接或连接点。' }
    foreach ($item in Get-ChildItem -LiteralPath $Root -Recurse -Force) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '目录中存在符号链接或连接点，已停止。' }
    }
}
function Invoke-SunlitControl([string]$Executable, [string]$Command) {
    $child = Start-Process -FilePath $Executable -ArgumentList $Command -WindowStyle Hidden -PassThru
    if (-not $child.WaitForExit(45000)) { throw '主题宿主未及时回应；已保留安装文件。' }
    if ($child.ExitCode -ne 0) { throw ('主题宿主未完成恢复或控制操作，退出码 ' + $child.ExitCode + '；已保留安装文件。') }
}
function Get-SunlitProcesses([string]$Executable) {
    @(Get-Process -Name SunlitTidesCodex -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -eq $Executable } catch { $false }
    })
}
function Stop-SunlitOwnedHelper([string]$Root, $Marker) {
    $exe = Join-Path $Root 'SunlitTidesCodex.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw '主题宿主文件缺失，无法证明页面主题已恢复；已保留全部安装文件与恢复记录。'
    }
    $ownedExe = @($Marker.files | Where-Object { $_.path -eq 'SunlitTidesCodex.exe' })
    if ($ownedExe.Count -ne 1 -or (Get-SunlitHash $exe) -ne $ownedExe[0].sha256) {
        throw '主题宿主文件已被修改；不会运行或删除该文件。'
    }
    Invoke-SunlitControl $exe '--quit'
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (@(Get-SunlitProcesses $exe).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (@(Get-SunlitProcesses $exe).Count -gt 0) { throw '主题宿主仍在运行；不会强制终止或删除。' }
    $registrations = Join-Path $Root 'data\registrations.json'
    if (Test-Path -LiteralPath $registrations -PathType Leaf) {
        $value = Get-Content -LiteralPath $registrations -Raw -Encoding UTF8 | ConvertFrom-Json
        if (@($value.PSObject.Properties).Count -gt 0) { throw '仍有页面注入等待恢复；已保留安装文件。' }
    }
}
