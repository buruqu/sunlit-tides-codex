# Isolated fixture tests. No actual user integration or real helper is invoked.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('SunlitTidesCodex.installer-tests.' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $testRoot)
$originalLocal = $env:LOCALAPPDATA
$utf8 = New-Object Text.UTF8Encoding($true)
function Write-Fixture([string]$Path, [string]$Content) {
    [void][IO.Directory]::CreateDirectory((Split-Path $Path -Parent))
    [IO.File]::WriteAllText($Path, $Content, $utf8)
}
function Assert-Fixture([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function New-Fixture([string]$Name) {
    $fixture = Join-Path $testRoot $Name
    $local = Join-Path $fixture 'local'
    $app = Join-Path $fixture 'app'
    $install = Join-Path $local 'SunlitTidesCodex'
    [void][IO.Directory]::CreateDirectory($local)
    [void][IO.Directory]::CreateDirectory((Join-Path $fixture 'installer'))
    foreach ($name in @('Install.ps1', 'Common.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $fixture ('installer\' + $name)) }
    $mock = @'
function Get-SunlitRunValue { return $null }
function Get-SunlitShortcuts { @() }
function Sync-SunlitEntrypoints([string]$Root, [string]$Action) {
    [pscustomobject]@{ Replaced = 0; Restored = 0; Preserved = @(); Errors = @(); FixtureOnly = $true }
}
function Stop-SunlitOwnedHelper([string]$Root, $Marker) {
    [IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'quit.called'), 'yes')
    [IO.File]::WriteAllText((Join-Path $Root 'data\settings.json'), '{"enabled":false,"lastPort":123,"startupEnabled":true}')
}
function Set-SunlitIntegration([string]$Root, [string[]]$Shortcuts) {
    [IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'integration.called'), 'yes')
    if (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'fail.integration')) { throw 'fixture integration failure' }
}
function Get-SunlitProcesses([string]$Executable) { @() }
function Start-Process([string]$FilePath, [string]$ArgumentList, [string]$WindowStyle, [switch]$PassThru) {
    if ($WindowStyle -ne 'Hidden') { throw 'Fixture expected hidden helper.' }
    [IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'launch.called'), $ArgumentList)
    [pscustomobject]@{ Id = 0 }
}
'@
    Add-Content -LiteralPath (Join-Path $fixture 'installer\Common.ps1') -Value $mock -Encoding UTF8
    foreach ($name in @('SunlitTidesCodex.exe', 'theme\payload.js', 'theme\remove.js', 'media\startup.mp4')) { Write-Fixture (Join-Path $app $name) ('new ' + $name) }
    Write-Fixture (Join-Path $app 'theme\manifest.json') '{"id":"sunlit-tides.codex","version":"1.2.6"}'
    $files = @()
    foreach ($name in @('SunlitTidesCodex.exe', 'theme\payload.js', 'theme\remove.js', 'theme\manifest.json')) {
        $path = Join-Path $install $name
        Write-Fixture $path ('old ' + $name)
        $files += [pscustomobject]@{ path = $name; sha256 = (Get-SunlitHash $path) }
    }
    $marker = [ordered]@{ schema = 1; product = 'sunlit-tides.codex'; version = '1.0.0'; installRoot = $install; files = $files; shortcuts = @() }
    Write-Fixture (Join-Path $install '.sunlit-tides-owned.json') ($marker | ConvertTo-Json -Depth 6)
    $settings = '{"enabled":true,"lastPort":54321,"startupEnabled":false,"futureOption":"preserve me"}'
    Write-Fixture (Join-Path $install 'data\settings.json') $settings
    Write-Fixture (Join-Path $install 'data\custom.json') '{"value":"keep"}'
    Write-Fixture (Join-Path $install 'notes.txt') 'unowned: preserve in backup'
    [pscustomobject]@{ root = $fixture; local = $local; app = $app; install = $install; settings = $settings; script = (Join-Path $fixture 'installer\Install.ps1') }
}
function Invoke-Fixture($Fixture, [switch]$Preview, [switch]$ExpectFailure, [switch]$Launch) {
    $env:LOCALAPPDATA = $Fixture.local
    $failed = $false
    try { & $Fixture.script -SourceDirectory $Fixture.app -NoLaunch:(!$Launch) -WhatIf:$Preview }
    catch { $failed = $true; Write-Output ('EXPECTED FAILURE: ' + $_.Exception.Message) }
    Assert-Fixture ($failed -eq [bool]$ExpectFailure) 'Unexpected installer outcome.'
}
try {
    $fixture = New-Fixture 'upgrade'
    Invoke-Fixture $fixture
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $fixture.install 'data\settings.json') -Raw -Encoding UTF8) -eq $fixture.settings) 'Settings changed during --quit upgrade.'
    Assert-Fixture (Test-Path -LiteralPath (Join-Path $fixture.install 'data\custom.json')) 'Custom data was not preserved.'
    Assert-Fixture ((Get-SunlitMarker $fixture.install).version -eq '1.2.6') 'New marker version missing.'
    Assert-Fixture (-not (Test-Path -LiteralPath (Join-Path $fixture.local 'launch.called'))) 'NoLaunch started a helper.'
    $backups = @(Get-ChildItem -LiteralPath $fixture.local -Directory -Filter 'SunlitTidesCodex.backup.*')
    Assert-Fixture ($backups.Count -eq 1) 'Complete old backup missing.'
    Assert-Fixture (Test-Path -LiteralPath (Join-Path $backups[0].FullName 'notes.txt')) 'Unowned backup file lost.'
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $backups[0].FullName 'SunlitTidesCodex.exe') -Raw -Encoding UTF8) -eq 'old SunlitTidesCodex.exe') 'Old executable backup changed.'
    Write-Output 'PASS upgrade preserves pre-quit settings, data, and complete old backup'
    Invoke-Fixture $fixture
    Assert-Fixture (@(Get-ChildItem -LiteralPath $fixture.local -Directory -Filter 'SunlitTidesCodex.backup.*').Count -eq 2) 'Reinstall did not retain both backups.'
    Write-Output 'PASS 1.2.6 reinstall retains its own validated backup'

    foreach ($priorVersion in @('1.1.3','1.1.4','1.2.0','1.2.1','1.2.2','1.2.3','1.2.4','1.2.5')) {
    $fixture = New-Fixture ('upgrade-from-' + $priorVersion)
    $markerPath = Join-Path $fixture.install '.sunlit-tides-owned.json'
    $trialMarker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $trialMarker.version = $priorVersion
    Write-Fixture $markerPath ($trialMarker | ConvertTo-Json -Depth 6)
    Invoke-Fixture $fixture
    Assert-Fixture ((Get-SunlitMarker $fixture.install).version -eq '1.2.6') 'Trial upgrade missing.'
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $fixture.install 'data\settings.json') -Raw -Encoding UTF8) -eq $fixture.settings) 'Trial settings changed.'
    Write-Output ('PASS ' + $priorVersion + ' upgrades with settings intact')
    }

    $fixture = New-Fixture 'fresh'
    [IO.Directory]::Move($fixture.install, (Join-Path $fixture.root 'original-fixture'))
    Invoke-Fixture $fixture
    Assert-Fixture ((Get-SunlitMarker $fixture.install).version -eq '1.2.6') 'Fresh install missing.'
    Assert-Fixture (-not (Test-Path -LiteralPath (Join-Path $fixture.local 'quit.called'))) 'Fresh install controlled an old helper.'
    Write-Output 'PASS fresh install does not invoke old helper'

    $fixture = New-Fixture 'upgrade-default-launch'
    $fixture.settings = '{"enabled":false,"startupEnabled":false,"lastPort":54321}'
    Write-Fixture (Join-Path $fixture.install 'data\settings.json') $fixture.settings
    Invoke-Fixture $fixture -Launch
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $fixture.local 'launch.called') -Raw) -eq '--watch') 'Upgrade must monitor without enabling or activating the app.'
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $fixture.install 'data\settings.json') -Raw -Encoding UTF8) -eq $fixture.settings) 'Default upgrade lost disabled settings.'
    Write-Output 'PASS default upgrade uses --watch without activating app and preserves disabled-theme choice'

    $fixture = New-Fixture 'fresh-default-launch'
    [IO.Directory]::Move($fixture.install, (Join-Path $fixture.root 'original-fixture'))
    Invoke-Fixture $fixture -Launch
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $fixture.local 'launch.called') -Raw) -eq '--launch') 'Fresh install did not enable theme through --launch.'
    Write-Output 'PASS default fresh install uses --launch'

    $fixture = New-Fixture 'whatif'
    Invoke-Fixture $fixture -Preview
    Assert-Fixture (-not (Test-Path -LiteralPath (Join-Path $fixture.local 'quit.called'))) 'WhatIf stopped the helper.'
    Assert-Fixture (@(Get-ChildItem -LiteralPath $fixture.local -Directory).Count -eq 1) 'WhatIf created a stage or backup.'
    Assert-Fixture ((Get-SunlitMarker $fixture.install).version -eq '1.0.0') 'WhatIf modified installation.'
    Write-Output 'PASS WhatIf has no writes or control calls'

    foreach ($case in @('modified', 'unowned-collision', 'unowned-parent', 'missing-media', 'bad-marker', 'duplicate-marker', 'reparse')) {
        $fixture = New-Fixture $case
        switch ($case) {
            'modified' { Write-Fixture (Join-Path $fixture.install 'theme\payload.js') 'user edit' }
            'unowned-collision' { Write-Fixture (Join-Path $fixture.install 'media\startup.mp4') 'user video' }
            'unowned-parent' { Write-Fixture (Join-Path $fixture.install 'media') 'user file blocks directory' }
            'missing-media' { Move-Item -LiteralPath (Join-Path $fixture.app 'media\startup.mp4') -Destination (Join-Path $fixture.root 'omitted-media.mp4') }
            'bad-marker' {
                $path = Join-Path $fixture.install '.sunlit-tides-owned.json'
                $marker = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
                $marker.files[0].path = '..\outside.exe'
                Write-Fixture $path ($marker | ConvertTo-Json -Depth 6)
            }
            'duplicate-marker' {
                $path = Join-Path $fixture.install '.sunlit-tides-owned.json'
                $marker = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
                $marker.files += $marker.files[0]
                Write-Fixture $path ($marker | ConvertTo-Json -Depth 6)
            }
            'reparse' {
                $target = Join-Path $fixture.root 'junction-target'
                [void][IO.Directory]::CreateDirectory($target)
                [void](New-Item -ItemType Junction -Path (Join-Path $fixture.install 'junction') -Value $target)
            }
        }
        Invoke-Fixture $fixture -ExpectFailure
        Assert-Fixture (-not (Test-Path -LiteralPath (Join-Path $fixture.local 'quit.called'))) ('Preflight failure stopped helper: ' + $case)
        Assert-Fixture (@(Get-ChildItem -LiteralPath $fixture.local -Directory).Count -eq 1) ('Preflight failure created stage: ' + $case)
        Write-Output ('PASS preflight refuses ' + $case)
    }

    $fixture = New-Fixture 'rollback'
    Write-Fixture (Join-Path $fixture.local 'fail.integration') 'yes'
    Invoke-Fixture $fixture -ExpectFailure
    Assert-Fixture ((Get-SunlitMarker $fixture.install).version -eq '1.0.0') 'Rollback did not restore old install.'
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $fixture.install 'data\settings.json') -Raw -Encoding UTF8) -eq $fixture.settings) 'Rollback did not restore old settings.'
    Assert-Fixture (@(Get-ChildItem -LiteralPath $fixture.local -Directory -Filter 'SunlitTidesCodex.stage.*').Count -eq 1) 'Failed stage should remain recoverable.'
    Write-Output 'PASS post-swap failure restores complete old installation and retains stage'
    $fixture = New-Fixture 'quit-failure'
    $mock = @'
function Stop-SunlitOwnedHelper([string]$Root, $Marker) {
    [IO.File]::WriteAllText((Join-Path $Root 'data\settings.json'), '{"enabled":false}')
    throw 'fixture restoration failure'
}
'@
    Add-Content -LiteralPath (Join-Path $fixture.root 'installer\Common.ps1') -Value $mock -Encoding UTF8
    Invoke-Fixture $fixture -ExpectFailure
    Assert-Fixture ((Get-SunlitMarker $fixture.install).version -eq '1.0.0') 'Failed quit moved old installation.'
    $stages = @(Get-ChildItem -LiteralPath $fixture.local -Directory -Filter 'SunlitTidesCodex.stage.*')
    Assert-Fixture ($stages.Count -eq 1) 'Failed quit lost recovery stage.'
    Assert-Fixture ((Get-Content -LiteralPath (Join-Path $stages[0].FullName 'data\settings.json') -Raw -Encoding UTF8) -eq $fixture.settings) 'Failed quit lost pre-quit settings.'
    Assert-Fixture (-not (Test-Path -LiteralPath (Join-Path $fixture.local 'integration.called'))) 'Failed quit changed integration.'
    Write-Output 'PASS failed old restore preserves original install and pre-quit recovery settings'
    Write-Output ('All 23 isolated installer checks passed; retained fixture root: ' + $testRoot)
} finally { $env:LOCALAPPDATA = $originalLocal }
