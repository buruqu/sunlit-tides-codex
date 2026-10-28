[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$install=Join-Path $project 'installer/Install.ps1'
$restore=Join-Path $project 'installer/Restore.ps1'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('sunlit-installer-tests-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot|Out-Null
function Assert($Condition,[string]$Message) { if (!$Condition) { throw "ASSERT: $Message" } }
function Write-Utf8([string]$Path,[string]$Text) { [IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($true)) }
function global:Get-CimInstance {
    if ($env:SUNLIT_TEST_RUNNING -eq '1') { return [pscustomobject]@{Name='DeepSeek Harness.exe';ProcessId=123;ExecutablePath='';CommandLine=''} }
    return @()
}
function New-Fixture([string]$Name) {
    $root=Join-Path $testRoot $Name
    $fixtureHome=Join-Path $root 'home'; $profile=Join-Path $fixtureHome 'profiles/desktop';$source=Join-Path $root 'source';$cliDir=Join-Path $root 'app/resources/runtime/cli/bin'
    foreach($p in @($profile,(Join-Path $source 'lib'),(Join-Path $source 'native'),$cliDir)){New-Item -ItemType Directory -Path $p -Force|Out-Null}
    [IO.File]::WriteAllText((Join-Path $source 'package.json'), '{"name":"@dsh-external/dsh-client-ui-skin-sunlit-tides","version":"0.3.0","description":"晴光与泡影：西格莉卡与达妮娅的 DSH 动态主题","dsh":{"bundle":{"patch":"./cordis.patch.yml"}},"files":["lib","cordis.patch.yml","native"],"scripts":{"build":"node example.js"}}', [Text.UTF8Encoding]::new($false))
    Write-Utf8 (Join-Path $source 'lib/index.js') 'export const marker = "test";'
    # An inert file exercises package copying only; it is never executed.
    Write-Utf8 (Join-Path $source 'native/SunlitTidesCodex.exe') 'INERT NATIVE CARRIER FIXTURE - NOT EXECUTABLE'
    Write-Utf8 (Join-Path $source 'cordis.patch.yml') "- insert:`n    - id: ui-skin-sunlit-tides`n      name: '@dsh-external/dsh-client-ui-skin-sunlit-tides'`n"
    [IO.File]::WriteAllText((Join-Path $profile 'package.json'), '{"name":"fixture","description":"原始配置晴","private":true,"dependencies":{"keep":"1.0.0"},"dsh":{"profile":{"bundles":["base","denia"]}}}', [Text.UTF8Encoding]::new($false))
    Write-Utf8 (Join-Path $profile 'pnpm-lock.yaml') 'original-lock'
    Write-Utf8 (Join-Path $profile 'cordis.patch.yml') "# fixture`n- id: keep`n  config:`n    value: 1`n"
    # pnpm-workspace.yaml intentionally absent: absence must round-trip.
    $pwsh=(Get-Process -Id $PID).Path
    Write-Utf8 (Join-Path $cliDir 'dsh.cmd') "@echo off`r`n`"$pwsh`" -NoLogo -NoProfile -File `"%~dp0mock.ps1`" %*`r`nexit /b %errorlevel%`r`n"
    Write-Utf8 (Join-Path $cliDir 'mock.ps1') @'
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference='Stop'
if ('--ignore-scripts' -notin $Arguments -or '--offline' -notin $Arguments) { exit 93 }
$profile=Join-Path $env:DSH_HOME 'profiles/desktop'
Add-Content -LiteralPath (Join-Path $env:DSH_HOME 'mock-cli.log') -Value ($Arguments -join '|')
if ($Arguments[3] -eq 'add') {
  $p=Get-Content -LiteralPath (Join-Path $profile 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json -AsHashtable
  $n='@dsh-external/dsh-client-ui-skin-sunlit-tides'
  $p.dependencies[$n]='link:'+$Arguments[4]
  if ($n -notin $p.dsh.profile.bundles) { $p.dsh.profile.bundles+=@($n) }
  [IO.File]::WriteAllText((Join-Path $profile 'package.json'),($p|ConvertTo-Json -Depth 10))
  [IO.File]::WriteAllText((Join-Path $profile 'pnpm-lock.yaml'),'installed-lock')
  [IO.File]::WriteAllText((Join-Path $profile 'pnpm-workspace.yaml'),'new-workspace')
  if ($env:SUNLIT_TEST_FAIL -eq '1') { exit 7 }
}
exit 0
'@
    return @{Home=$fixtureHome;Profile=$profile;Source=$source;Cli=(Join-Path $cliDir 'dsh.cmd')}
}
function Snapshot([string]$Path) {
    $s=@{};foreach($n in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','cordis.patch.yml')){$p=Join-Path $Path $n;$s[$n]=if(Test-Path -LiteralPath $p){(Get-FileHash -LiteralPath $p).Hash}else{'ABSENT'}};return ($s|ConvertTo-Json -Compress)
}
function Latest-Backup([string]$FixtureHome) { (Get-ChildItem -LiteralPath (Join-Path $FixtureHome '.sunlit-tides-install-backups') -Directory|Sort-Object CreationTimeUtc|Select-Object -Last 1).FullName }
foreach($p in @($install,$restore)) {
    $tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors)|Out-Null
    Assert ($errors.Count -eq 0) "syntax $p"
    $bytes=[IO.File]::ReadAllBytes($p);Assert ($bytes[0]-eq 239 -and $bytes[1]-eq 187 -and $bytes[2]-eq 191) "UTF8 BOM $p"
}
$missing=New-Fixture 'missing-native';$missingBefore=Snapshot $missing.Profile
Remove-Item -LiteralPath (Join-Path $missing.Source 'native/SunlitTidesCodex.exe')
$missingError=$null
try{& $install -DshHome $missing.Home -CliPath $missing.Cli -SourcePath $missing.Source}catch{$missingError=$_.Exception.Message}
Assert ($missingError -match '缺少受管原生面板程序') 'missing native carrier rejected by package contract'
Assert ((Snapshot $missing.Profile)-eq $missingBefore) 'missing native carrier leaves profile untouched'
Assert (!(Test-Path -LiteralPath (Join-Path $missing.Home '.sunlit-tides-install-backups'))) 'missing native carrier creates no backup or install mutation'
Write-Output 'PASS negative: missing native carrier is refused before any profile or backup mutation.'
$f=New-Fixture 'success';$before=Snapshot $f.Profile
$ps51=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
if (!(Test-Path -LiteralPath $ps51 -PathType Leaf)) { throw '缺少 Windows PowerShell 5.1，无法完成必需的 -File 默认路径测例。' }
$fixtureInstaller=Join-Path $f.Source 'installer'
New-Item -ItemType Directory -Path $fixtureInstaller|Out-Null
# The fresh PS5.1 process cannot inherit this test's process-probe function.
# Inject that one fixture seam into disposable copies, retaining direct -File
# invocation and default SourcePath binding. Never query or stop the real DSH.
$probeAnchor='$ErrorActionPreference = ''Stop'''
$fixtureText=[IO.File]::ReadAllText($install)
Assert ($fixtureText.Contains($probeAnchor)) 'fixture process-probe injection anchor exists'
$fixtureProbe="function global:Get-CimInstance { return @() }`r`n"
$fixtureText=$fixtureText.Replace($probeAnchor,$fixtureProbe+$probeAnchor)
Write-Utf8 (Join-Path $fixtureInstaller 'Install.ps1') $fixtureText
$legacyInstaller=Join-Path $fixtureInstaller 'Install.Legacy.ps1'
$legacyText=$fixtureText.Replace(' -Raw -Encoding UTF8',' -Raw')
Write-Utf8 $legacyInstaller $legacyText
# Reproduce the reported 5.1 bug with the identical non-BOM Chinese package fixture.
$negativeOutput=& $ps51 -NoProfile -ExecutionPolicy Bypass -File $legacyInstaller -DshHome $f.Home -CliPath $f.Cli -WhatIf 2>&1
Assert ($LASTEXITCODE -ne 0) 'negative: legacy ANSI Get-Content fails on Chinese UTF8 package'
Write-Output 'PASS negative: Windows PowerShell 5.1 legacy ANSI JSON reader rejects Chinese UTF8 without BOM.'
# A fresh Windows PowerShell 5.1 -File process must resolve SourcePath after parameter binding.
# Deliberately omit -SourcePath; only the disposable fixture home/CLI are passed.
& $ps51 -NoProfile -ExecutionPolicy Bypass -File (Join-Path $fixtureInstaller 'Install.ps1') -DshHome $f.Home -CliPath $f.Cli -WhatIf
Assert ($LASTEXITCODE -eq 0) 'Windows PowerShell 5.1 -File default SourcePath WhatIf'
Assert ((Snapshot $f.Profile)-eq $before) 'Windows PowerShell 5.1 WhatIf profile untouched'
Assert (!(Test-Path -LiteralPath (Join-Path $f.Home '.sunlit-tides-install-backups'))) 'Windows PowerShell 5.1 WhatIf no backup mutation'
& $install -DshHome $f.Home -CliPath $f.Cli -SourcePath $f.Source -WhatIf
Assert ((Snapshot $f.Profile)-eq $before) 'WhatIf profile untouched'
Assert (!(Test-Path -LiteralPath (Join-Path $f.Home '.sunlit-tides-install-backups'))) 'WhatIf no backup mutation'
$env:SUNLIT_TEST_RUNNING='1';$rejected=$false
try{& $install -DshHome $f.Home -CliPath $f.Cli -SourcePath $f.Source}catch{$rejected=$true}
$env:SUNLIT_TEST_RUNNING=$null;Assert $rejected 'running DSH rejected'
& $install -DshHome $f.Home -CliPath $f.Cli -SourcePath $f.Source
$b1=Latest-Backup $f.Home
Assert ((Get-Content -LiteralPath (Join-Path $f.Profile 'cordis.patch.yml') -Raw)-match 'id: ui-skin-denia\s+disabled: true') 'Denia disabled'
$installed=Snapshot $f.Profile
$plugin=Join-Path $f.Home 'plugins/dsh-client-ui-skin-sunlit-tides'
Assert ((Get-FileHash -LiteralPath (Join-Path $plugin 'native/SunlitTidesCodex.exe')).Hash -eq (Get-FileHash -LiteralPath (Join-Path $f.Source 'native/SunlitTidesCodex.exe')).Hash) 'native carrier copied exactly without execution'
Write-Utf8 (Join-Path $plugin 'custom-old.txt') 'preserve old directory'
& $install -DshHome $f.Home -CliPath $f.Cli -SourcePath $f.Source
$b2=Latest-Backup $f.Home
Assert (Test-Path -LiteralPath (Join-Path $b2 'previous-plugin/custom-old.txt')) 'upgrade preserves complete old plugin'
& $restore -BackupPath $b2 -DshHome $f.Home -CliPath $f.Cli
Assert ((Snapshot $f.Profile)-eq $installed) 'upgrade rollback exact profile'
Assert (Test-Path -LiteralPath (Join-Path $plugin 'custom-old.txt')) 'upgrade rollback old plugin restored'
$patch=Join-Path $f.Profile 'cordis.patch.yml';$bytes=[IO.File]::ReadAllBytes($patch)
Add-Content -LiteralPath $patch -Value '# later user change'
$changed=Snapshot $f.Profile;$rejected=$false
try{& $restore -BackupPath $b1 -DshHome $f.Home -CliPath $f.Cli}catch{$rejected=$true}
Assert $rejected 'later profile changes refused';Assert ((Snapshot $f.Profile)-eq $changed) 'refusal does not overwrite'
[IO.File]::WriteAllBytes($patch,$bytes)
& $restore -BackupPath $b1 -DshHome $f.Home -CliPath $f.Cli
Assert ((Snapshot $f.Profile)-eq $before) 'initial rollback restores hashes and absence'
Assert (Test-Path -LiteralPath $plugin) 'rollback preserves unreferenced new plugin'
$g=New-Fixture 'failure';$original=Snapshot $g.Profile;$env:SUNLIT_TEST_FAIL='1';$failed=$false
try{& $install -DshHome $g.Home -CliPath $g.Cli -SourcePath $g.Source}catch{$failed=$true}
$env:SUNLIT_TEST_FAIL=$null
Assert $failed 'add error surfaced';Assert ((Snapshot $g.Profile)-eq $original) 'failed install restores original profile'
$bad=New-Fixture 'unmanaged';New-Item -ItemType Directory -Path (Join-Path $bad.Home 'plugins/dsh-client-ui-skin-sunlit-tides') -Force|Out-Null
$rejected=$false;try{& $install -DshHome $bad.Home -CliPath $bad.Cli -SourcePath $bad.Source}catch{$rejected=$true}
Assert $rejected 'unmanaged target refused'
Remove-Item Function:\Get-CimInstance
Write-Output "PASS: syntax/BOM, missing-native refusal, Windows PowerShell 5.1 -File/default SourcePath/WhatIf with fixture-only process probe, WhatIf, simulated running guard, installation/native copy, exact restore, absence, owned upgrade, later-change refusal, failure recovery, unmanaged refusal. No real application was installed, queried, stopped, or restarted. Isolated evidence: $testRoot"
