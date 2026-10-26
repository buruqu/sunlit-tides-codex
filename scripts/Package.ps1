param([string]$Dotnet = 'dotnet')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$releaseRoot = Join-Path $projectRoot 'release'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
$finalRoot = Join-Path $releaseRoot ('SunlitTidesCodex-' + $version + '-win-x64')
$packageRoot = Join-Path $releaseRoot ('SunlitTidesCodex.stage.' + [Guid]::NewGuid().ToString('N'))
function Assert-ReleasePath([string]$candidate) {
    $resolved = [IO.Path]::GetFullPath($candidate)
    $boundary = [IO.Path]::GetFullPath($releaseRoot).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Release path escaped output directory' }
    if ((Test-Path -LiteralPath $resolved) -and ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Release path cannot be a reparse point' }
}
Assert-ReleasePath $packageRoot
$appRoot = Join-Path $packageRoot 'app'
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
Push-Location $projectRoot
try {
    & node scripts/build-theme.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Theme build failed' }
    & $Dotnet publish host/SunlitTidesCodex.csproj -c Release -r win-x64 --self-contained true -o $appRoot -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
    if ($LASTEXITCODE -ne 0) { throw 'Host publish failed' }
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'theme') -Force | Out-Null
    Copy-Item -LiteralPath 'dist/theme/payload.js','dist/theme/remove.js','dist/theme/manifest.json' -Destination (Join-Path $appRoot 'theme') -Force
    New-Item -ItemType Directory -Path (Join-Path $appRoot 'media') -Force | Out-Null
    Copy-Item -LiteralPath 'media/startup.mp4','media/MEDIA_NOTICE.md' -Destination (Join-Path $appRoot 'media') -Force
    $installerRoot = Join-Path $packageRoot 'installer'
    New-Item -ItemType Directory -Path $installerRoot -Force | Out-Null
    foreach ($name in @('Common.ps1','Install.ps1','Restore.ps1','Uninstall.ps1','Entrypoints.ps1','Manage-Entrypoints.ps1','README.md')) {
        Copy-Item -LiteralPath (Join-Path 'installer' $name) -Destination $installerRoot -Force
    }
    Copy-Item -LiteralPath 'README.md','LICENSE','NOTICE.md' -Destination $packageRoot -Force
    Copy-Item -LiteralPath 'licenses','docs' -Destination $packageRoot -Recurse -Force
    foreach ($action in @('Install','Restore','Uninstall')) {
        $command = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"%~dp0installer\$action.ps1`"`r`nif errorlevel 1 pause`r`n"
        [IO.File]::WriteAllText((Join-Path $packageRoot "$action.cmd"), $command, [Text.Encoding]::ASCII)
    }
    foreach ($entryAction in @('Install','Restore')) {
        $entryCommand = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"%~dp0installer\Manage-Entrypoints.ps1`" -Action $entryAction`r`nif errorlevel 1 pause`r`n"
        $entryName = if ($entryAction -eq 'Install') { 'Repair-Entrypoints.cmd' } else { 'Restore-Entrypoints.cmd' }
        [IO.File]::WriteAllText((Join-Path $packageRoot $entryName), $entryCommand, [Text.Encoding]::ASCII)
    }
    $lines = Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Where-Object Name -ne 'SHA256SUMS.txt' | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($packageRoot.Length + 1).Replace('\','/')
        (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $relative
    }
    [IO.File]::WriteAllLines((Join-Path $packageRoot 'SHA256SUMS.txt'), $lines, [Text.UTF8Encoding]::new($false))
    # Always archive a fresh staging tree; never include old output or runtime data.
    $zip = "$finalRoot.zip"
    Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zip -Force -CompressionLevel Optimal
    $hash = Get-FileHash -LiteralPath $zip -Algorithm SHA256
    [IO.File]::WriteAllText("$zip.sha256", $hash.Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($zip) + "`n", [Text.Encoding]::ASCII)
    Assert-ReleasePath $packageRoot
    Assert-ReleasePath $finalRoot
    if (Test-Path -LiteralPath $finalRoot) {
        $previous = $finalRoot + '.previous.' + [Guid]::NewGuid().ToString('N')
        Assert-ReleasePath $previous
        Move-Item -LiteralPath $finalRoot -Destination $previous
    }
    Move-Item -LiteralPath $packageRoot -Destination $finalRoot
    Write-Output $zip
    Write-Output $hash.Hash
} finally { Pop-Location }
