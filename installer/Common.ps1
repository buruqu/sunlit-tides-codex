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
    $seen = @{}
    if (@($marker.files).Count -eq 0) { throw '所有权记录没有文件列表。' }
    foreach ($entry in $marker.files) {
        Assert-SunlitRelativeFile $entry.path
        if ($entry.sha256 -notmatch '^[A-Fa-f0-9]{64}$' -or $seen.ContainsKey($entry.path)) { throw '所有权记录包含重复路径或无效校验值。' }
        $seen[$entry.path] = $true
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
    if (-not (Test-Path -LiteralPath $Path)) { return $true }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $shell = New-Object -ComObject WScript.Shell
    try {
        $link = $shell.CreateShortcut($Path)
        try { return $link.TargetPath -eq $Executable -and $link.Arguments -eq '--launch' }
        finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
function Assert-SunlitRelativeFile([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or [IO.Path]::IsPathRooted($Path) -or $Path.Contains('/') -or $Path.Contains('\\') -or $Path -match '(^|[\\/])(\.\.?|data|\.sunlit-tides-owned\.json)([\\/]|$)' -or $Path -match '[:*?"<>|]' -or $Path -match '(^|[\\/])[^\\/]*[. ]([\\/]|$)') {
        throw '文件路径无效或包含用户状态。'
    }
}
function Assert-SunlitNoReparseAncestors([string]$Path) {
    $ancestor = [IO.Path]::GetFullPath($Path)
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '路径经过符号链接或连接点。' }
        }
        $ancestor = Split-Path $ancestor -Parent
    }
}
function Assert-SunlitNoReparse([string]$Root) {
    Assert-SunlitNoReparseAncestors $Root
    # Inspect each directory before descending, so a junction is never traversed.
    $pending = New-Object 'Collections.Generic.Queue[string]'
    $pending.Enqueue($Root)
    while ($pending.Count -gt 0) {
        $path = $pending.Dequeue()
        $item = Get-Item -LiteralPath $path -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '目录中存在符号链接或连接点，已停止。' }
        if ($item.PSIsContainer) {
            foreach ($child in Get-ChildItem -LiteralPath $path -Force) { $pending.Enqueue($child.FullName) }
        }
    }
}
function Assert-SunlitLocalPath([string]$Path) {
    $local = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')
    $absolute = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not (Test-SunlitChild $absolute $local)) { throw '移动路径不在 LOCALAPPDATA 内。' }
    Assert-SunlitNoReparseAncestors $absolute
}
function Move-SunlitDirectory([string]$Source, [string]$Destination) {
    Assert-SunlitLocalPath $Source
    Assert-SunlitLocalPath $Destination
    Assert-SunlitNoReparse $Source
    if (Test-Path -LiteralPath $Destination) { throw '目标目录已存在；不会合并或覆盖。' }
    # Directory.Move fails atomically if the destination appears concurrently.
    # Move-Item would instead nest the old directory inside an existing folder.
    [IO.Directory]::Move($Source, $Destination)
}
function Assert-SunlitInstalledFiles([string]$Root, $Marker, $NewFiles) {
    Assert-SunlitNoReparse $Root
    foreach ($old in $Marker.files) {
        $path = Join-Path $Root $old.path
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-SunlitHash $path) -ne $old.sha256) { throw ('已安装文件缺失或已修改，已保留：' + $old.path) }
    }
    # Unknown files stay in the complete backup, but may never be silently replaced.
    $owned = @{}
    foreach ($old in $Marker.files) { $owned[$old.path] = $true }
    foreach ($item in Get-ChildItem -LiteralPath $Root -Recurse -Force) {
        $relative = $item.FullName.Substring($Root.Length + 1)
        if ($relative -eq '.sunlit-tides-owned.json' -or $relative -eq 'data' -or $relative.StartsWith('data\', [StringComparison]::OrdinalIgnoreCase) -or $owned.ContainsKey($relative)) { continue }
        foreach ($new in $NewFiles) {
            if ($relative -eq $new.path -or $relative.StartsWith($new.path + '\', [StringComparison]::OrdinalIgnoreCase) -or (-not $item.PSIsContainer -and $new.path.StartsWith($relative + '\', [StringComparison]::OrdinalIgnoreCase))) {
                throw ('新发行文件与非受管路径冲突，已保留：' + $relative)
            }
        }
    }
    if ((Test-Path -LiteralPath (Join-Path $Root 'data')) -and -not (Test-Path -LiteralPath (Join-Path $Root 'data') -PathType Container)) { throw '用户状态 data 路径不是目录。' }
}
function Set-SunlitIntegration([string]$Root, [string[]]$Shortcuts) {
    $executable = Join-Path $Root 'SunlitTidesCodex.exe'
    $runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $runValue = '"' + $executable + '" --startup'
    [void](New-Item -Path $runPath -Force)
    Set-ItemProperty -LiteralPath $runPath -Name SunlitTidesCodex -Value $runValue -Type String
    $shell = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcut in $Shortcuts) {
            [void](New-Item -ItemType Directory -Path (Split-Path $shortcut -Parent) -Force)
            $link = $shell.CreateShortcut($shortcut)
            try {
                $link.TargetPath = $executable
                $link.Arguments = '--launch'
                $link.WorkingDirectory = $Root
                $link.Description = '独立晴光与泡影主题；登录时自动启动；托盘可恢复默认外观'
                $link.IconLocation = $executable + ',0'
                $link.Save()
            } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
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
