# All mutations are under isolated TestRoot fixtures. No real integration.
[CmdletBinding()]
param([string]$TestRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Entrypoints.ps1')
if (-not $TestRoot) { $TestRoot = Join-Path ([IO.Path]::GetTempPath()) ('SunlitTidesCodex.entrypoint-tests.' + [Guid]::NewGuid().ToString('N')) }
$TestRoot = Get-SunlitEntryPath $TestRoot
Assert-SunlitEntryNoReparse $TestRoot
if (Test-Path -LiteralPath $TestRoot) { throw 'Tests require a new, isolated TestRoot.' }
[void][IO.Directory]::CreateDirectory($TestRoot)
$results = New-Object 'Collections.Generic.List[object]'
$utf8 = New-Object Text.UTF8Encoding($true)
function Write-EntryFixture([string]$Path, [string]$Text) { [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)); [IO.File]::WriteAllText($Path, $Text, $utf8) }
function Assert-EntryFixture([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Check-EntryFixture([string]$Name, [scriptblock]$Task) {
    try { & $Task; $results.Add([pscustomobject]@{ name = $Name; passed = $true }); Write-Output ('PASS ' + $Name) }
    catch { $results.Add([pscustomobject]@{ name = $Name; passed = $false; error = $_.Exception.Message; location = [string]$_.ScriptStackTrace }); Write-Output ('FAIL ' + $Name + ': ' + $_.Exception.Message) }
}
function New-EntryFixture([string]$Name) {
    $directory = Join-Path $TestRoot $Name; $install = Join-Path $directory 'local\SunlitTidesCodex'
    $roots = @('Desktop','Programs','TaskBar') | ForEach-Object { $p = Join-Path $directory $_; [void][IO.Directory]::CreateDirectory($p); $p }
    $official = Join-Path $directory 'official\Codex.exe'; $other = Join-Path $directory 'other\Other.exe'; $legacy = Join-Path $directory 'legacy\DragonCodexBoot.exe'; $aumid = 'OpenAI.Codex_fixture!App'
    foreach ($p in @((Join-Path $install 'SunlitTidesCodex.exe'), $official, $other, $legacy)) { Write-EntryFixture $p 'fixture: never execute' }
    Write-EntryFixture (Join-Path $directory 'legacy\launcher.json') ('{"AppLaunch":"shell:AppsFolder\\' + $aumid + '"}')
    $icon = Join-Path $install 'data\entrypoints\codex.ico'; Write-EntryFixture $icon 'fixture icon path'
    [pscustomobject]@{ directory = $directory; root = $install; roots = @($roots); official = $official; other = $other; legacy = $legacy; aumid = $aumid; icon = $icon }
}
function New-EntryLink([string]$Path, [string]$Target, [string]$Arguments = '') {
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path))
    $shell = $null; $link = $null
    try { $shell = New-Object -ComObject WScript.Shell; $link = $shell.CreateShortcut($Path); $link.TargetPath = $Target; $link.Arguments = $Arguments; $link.WorkingDirectory = [IO.Path]::GetDirectoryName($Target); $link.IconLocation = $Target + ',0'; $link.Save() }
    finally { foreach ($com in @($link,$shell)) { if ($null -ne $com) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($com) } } }
}
function Get-EntryFixtureMetadata([string]$Path) {
    # Only original MSIX metadata is mocked. New managed links use real COM.
    $content = [IO.File]::ReadAllText($Path)
    if ($content.StartsWith('SUNLIT_MSIX_FIXTURE:')) { return ($content.Substring('SUNLIT_MSIX_FIXTURE:'.Length) | ConvertFrom-Json) }
    return (Get-SunlitEntryLink $Path)
}
function Invoke-EntryFixture($Fixture, [string]$Action = 'Install', [scriptblock]$Checkpoint) {
    $reader = (Get-Command Get-EntryFixtureMetadata -CommandType Function).ScriptBlock
    Invoke-SunlitEntrypoints -Action $Action -Root $Fixture.root -SearchRoots $Fixture.roots -OfficialExe $Fixture.official -Aumid $Fixture.aumid -IconPath $Fixture.icon -TestRoot $TestRoot -MetadataProvider $reader -Checkpoint $Checkpoint
}
function Get-EntryFixtureRecord($Fixture) { @(Get-ChildItem -LiteralPath (Join-Path $Fixture.root 'data\entrypoints\records') -File -Filter '*.json' | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json }) }

Check-EntryFixture 'MSIX empty target with exact ParsingPath becomes a fresh --open link and restores byte-for-byte' {
    $f = New-EntryFixture 'msix'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'
    $metadata = [ordered]@{ TargetPath = ''; Arguments = ''; Aumid = $null; ParsingPath = $f.aumid }
    Write-EntryFixture $p ('SUNLIT_MSIX_FIXTURE:' + ($metadata | ConvertTo-Json -Compress))
    $before = Get-SunlitEntryHash $p; $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Errors.Count -eq 0 -and $r.Replaced -eq 1) ($r | ConvertTo-Json -Depth 8)
    $link = Get-SunlitEntryLink $p
    Assert-EntryFixture ((Test-SunlitEntryEqual $link.TargetPath (Join-Path $f.root 'SunlitTidesCodex.exe')) -and $link.Arguments -ceq '--open') 'Ordinary link is not --open.'
    Assert-EntryFixture ($link.Aumid -ne $f.aumid -and $link.ParsingPath -ne $f.aumid) 'Fresh shell link retained old MSIX identity.'
    Assert-EntryFixture ($link.IconLocation -eq ($f.icon + ',0')) 'Stable icon path was not used.'
    $record = Get-EntryFixtureRecord $f
    Assert-EntryFixture ((Get-SunlitEntryHash (Join-Path $f.root ('data\entrypoints\originals\' + $record.id + '.lnk'))) -eq $before) 'Original MSIX bytes changed.'
    $restored = Invoke-EntryFixture $f 'Restore'
    Assert-EntryFixture ($restored.Errors.Count -eq 0 -and $restored.Restored -eq 1 -and (Get-SunlitEntryHash $p) -eq $before -and $restored.SafeToRemoveHost) 'MSIX bytes did not restore exactly.'
}
Check-EntryFixture 'exact official exe matches regardless of name; misleading names do not match' {
    $f = New-EntryFixture 'names'; $yes = Join-Path $f.roots[1] 'Unrelated display name.lnk'; $no = Join-Path $f.roots[0] 'Codex ChatGPT.lnk'
    New-EntryLink $yes $f.official; New-EntryLink $no $f.other; $noHash = Get-SunlitEntryHash $no
    $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Replaced -eq 1 -and $r.Errors.Count -eq 0 -and (Get-SunlitEntryHash $no) -eq $noHash) 'Name-based matching touched another app.'
}
Check-EntryFixture 'only exact legacy executable plus matching AppLaunch is migrated' {
    $f = New-EntryFixture 'legacy-good'; $p = Join-Path $f.roots[1] 'ChatGPT.lnk'; New-EntryLink $p $f.legacy
    $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Replaced -eq 1 -and $r.Errors.Count -eq 0 -and $r.Candidates[0].Identity -eq 'verified-legacy-launcher') 'Valid legacy launcher not recognized.'
}
Check-EntryFixture 'wrong legacy AppLaunch and lookalike executable remain untouched' {
    $f = New-EntryFixture 'legacy-wrong'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.legacy
    Write-EntryFixture (Join-Path $f.directory 'legacy\launcher.json') '{"AppLaunch":"shell:AppsFolder\\Other.Product!App"}'
    $renamed = Join-Path $f.directory 'lookalike\DragonCodexBoot-other.exe'; Write-EntryFixture $renamed 'fixture'
    Write-EntryFixture (Join-Path $f.directory 'lookalike\launcher.json') ('{"AppLaunch":"shell:AppsFolder\\' + $f.aumid + '"}')
    $q = Join-Path $f.roots[1] 'Codex.lnk'; New-EntryLink $q $renamed
    $a = Get-SunlitEntryHash $p; $b = Get-SunlitEntryHash $q; $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Replaced -eq 0 -and $r.Errors.Count -eq 0 -and (Get-SunlitEntryHash $p) -eq $a -and (Get-SunlitEntryHash $q) -eq $b) 'Non-current legacy target changed.'
}
Check-EntryFixture 'custom exe arguments and nonexact AppsFolder commands are not default entrances' {
    $f = New-EntryFixture 'custom-args'; $p = Join-Path $f.roots[0] 'Codex.lnk'; $q = Join-Path $f.roots[1] 'ChatGPT.lnk'
    New-EntryLink $p $f.official '--custom-profile'; New-EntryLink $q (Join-Path $env:WINDIR 'explorer.exe') ('shell:AppsFolder\' + $f.aumid + ' --other')
    $a = Get-SunlitEntryHash $p; $b = Get-SunlitEntryHash $q; $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Replaced -eq 0 -and $r.Errors.Count -eq 0 -and (Get-SunlitEntryHash $p) -eq $a -and (Get-SunlitEntryHash $q) -eq $b) 'Nonexact custom command changed.'
}
Check-EntryFixture 'exact explorer AppsFolder command supports taskbar lnk with explicit native-pin limit' {
    $f = New-EntryFixture 'explorer'; $p = Join-Path $f.roots[2] 'ChatGPT.lnk'; New-EntryLink $p (Join-Path $env:WINDIR 'explorer.exe') ('"shell:AppsFolder\' + $f.aumid + '"')
    $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Replaced -eq 1 -and $r.Errors.Count -eq 0 -and $r.NativePinsRequireReview -and -not $r.ExplorerRestarted -and -not $r.RegistryChanged -and -not $r.MSIXChanged) 'Taskbar handling/native-pin limit was lost.'
}
Check-EntryFixture 'repeat Install is byte-idempotent and immutable backup and journal remain unchanged' {
    $f = New-EntryFixture 'idempotent'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official
    $original = Get-SunlitEntryHash $p; $r = Invoke-EntryFixture $f; Assert-EntryFixture ($r.Errors.Count -eq 0) ($r | ConvertTo-Json -Depth 8)
    $managed = Get-SunlitEntryHash $p; $record = Get-EntryFixtureRecord $f; $backup = Join-Path $f.root ('data\entrypoints\originals\' + $record.id + '.lnk')
    $count = @(Get-ChildItem -LiteralPath (Join-Path $f.root 'data\entrypoints') -File -Recurse).Count; $again = Invoke-EntryFixture $f
    Assert-EntryFixture ($again.Errors.Count -eq 0 -and $again.AlreadyOwned -eq 1 -and $again.Replaced -eq 0 -and (Get-SunlitEntryHash $p) -eq $managed -and (Get-SunlitEntryHash $backup) -eq $original) 'Reinstall changed managed/original bytes.'
    Assert-EntryFixture (@(Get-ChildItem -LiteralPath (Join-Path $f.root 'data\entrypoints') -File -Recurse).Count -eq $count) 'Reinstall rewrote journal.'
    $verified = Invoke-EntryFixture $f 'Verify'; Assert-EntryFixture ($verified.Errors.Count -eq 0 -and $verified.AlreadyOwned -eq 1) 'Verify did not confirm exact hash and --open target.'
    $restored = Invoke-EntryFixture $f 'Restore'; $twice = Invoke-EntryFixture $f 'Restore'
    Assert-EntryFixture ($restored.Restored -eq 1 -and $restored.Errors.Count -eq 0 -and $twice.Restored -eq 0 -and $twice.Errors.Count -eq 0 -and (Get-SunlitEntryHash $p) -eq $original) 'Restore not exact and idempotent.'
}
Check-EntryFixture 'user-modified host link is preserved and blocks host removal' {
    $f = New-EntryFixture 'user-edit'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official; $null = Invoke-EntryFixture $f
    New-EntryLink $p (Join-Path $f.root 'SunlitTidesCodex.exe') '--open --user-choice'; $modified = Get-SunlitEntryHash $p
    $restore = Invoke-EntryFixture $f 'Restore'; $again = Invoke-EntryFixture $f
    Assert-EntryFixture ($restore.Restored -eq 0 -and $restore.Preserved.Count -eq 1 -and $restore.RemainingHostLinks.Count -eq 1 -and -not $restore.SafeToRemoveHost -and (Get-SunlitEntryHash $p) -eq $modified) 'User-edited link or needed host not protected.'
    Assert-EntryFixture ($again.Replaced -eq 0 -and $again.Preserved.Count -eq 1 -and @(Get-EntryFixtureRecord $f).Count -eq 1) 'Reinstall took ownership of user edit.'
}
Check-EntryFixture 'user-retargeted and removed links are never overwritten or recreated' {
    $f = New-EntryFixture 'user-retarget'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; $q = Join-Path $f.roots[1] 'Codex.lnk'
    New-EntryLink $p $f.official; New-EntryLink $q $f.official; $null = Invoke-EntryFixture $f
    New-EntryLink $p $f.other; $changed = Get-SunlitEntryHash $p; [IO.File]::Delete($q)
    $r = Invoke-EntryFixture $f 'Restore'
    Assert-EntryFixture ($r.Preserved.Count -eq 2 -and $r.Restored -eq 0 -and $r.Errors.Count -eq 0 -and (Get-SunlitEntryHash $p) -eq $changed -and -not (Test-Path -LiteralPath $q) -and $r.SafeToRemoveHost) 'User retarget/removal not protected.'
}
Check-EntryFixture 'real immutable-backup write failure leaves original untouched and reports failure' {
    $f = New-EntryFixture 'backup-failure'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official; $before = Get-SunlitEntryHash $p
    $hook = { param($Name,$Path,$Details) if ($Name -eq 'BeforeBackup') { [void][IO.Directory]::CreateDirectory($Details.BackupPath) } }
    $r = Invoke-EntryFixture $f 'Install' $hook
    Assert-EntryFixture ($r.Errors.Count -gt 0 -and $r.Replaced -eq 0 -and (Get-SunlitEntryHash $p) -eq $before -and @(Get-EntryFixtureRecord $f).Count -eq 0) 'Backup failure silently succeeded or mutated original.'
}
Check-EntryFixture 'concurrent change before hash guard is preserved without replacement' {
    $f = New-EntryFixture 'before-guard'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official
    $mutant = Join-Path $f.directory 'user-choice.lnk'; New-EntryLink $mutant $f.other; $replacementBytes = [IO.File]::ReadAllBytes($mutant); $expected = Get-SunlitEntryHash $mutant
    $hook = { param($Name,$Path,$Details) if ($Name -eq 'BeforeCommit') { [IO.File]::WriteAllBytes($Path,$replacementBytes) } }.GetNewClosure()
    $r = Invoke-EntryFixture $f 'Install' $hook
    Assert-EntryFixture ($r.Errors.Count -gt 0 -and $r.Replaced -eq 0 -and (Get-SunlitEntryHash $p) -eq $expected) 'Concurrent edit overwritten.'
}
Check-EntryFixture 'race after final guard restores raced-out user bytes and retains immutable evidence' {
    $f = New-EntryFixture 'after-guard'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official
    $mutant = Join-Path $f.directory 'user-choice.lnk'; New-EntryLink $mutant $f.other; $replacementBytes = [IO.File]::ReadAllBytes($mutant); $expected = Get-SunlitEntryHash $mutant
    $hook = { param($Name,$Path,$Details) if ($Name -eq 'AfterGuard') { [IO.File]::WriteAllBytes($Path,$replacementBytes) } }.GetNewClosure()
    $r = Invoke-EntryFixture $f 'Install' $hook
    Assert-EntryFixture ($r.Errors.Count -gt 0 -and $r.Replaced -eq 0 -and (Get-SunlitEntryHash $p) -eq $expected) 'Post-guard raced-out user bytes not restored.'
    $archives = @(Get-ChildItem -LiteralPath (Join-Path $f.root 'data\entrypoints\transactions') -Filter '*.displaced.lnk' -File)
    Assert-EntryFixture ($archives.Count -eq 1 -and (Get-SunlitEntryHash $archives[0].FullName) -eq $expected) 'Displaced user version not retained.'
}
Check-EntryFixture 'post-install concurrent user edit is retained on subsequent Install' {
    $f = New-EntryFixture 'after-replace'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official
    $mutant = Join-Path $f.directory 'user-choice.lnk'; New-EntryLink $mutant $f.other; $replacementBytes = [IO.File]::ReadAllBytes($mutant); $expected = Get-SunlitEntryHash $mutant
    $hook = { param($Name,$Path,$Details) if ($Name -eq 'AfterReplace') { [IO.File]::WriteAllBytes($Path,$replacementBytes) } }.GetNewClosure()
    $r = Invoke-EntryFixture $f 'Install' $hook; $again = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Preserved.Count -eq 1 -and $again.Preserved.Count -eq 1 -and $again.Replaced -eq 0 -and (Get-SunlitEntryHash $p) -eq $expected) 'Post-replace user edit lost.'
}
Check-EntryFixture 'tampered original backup blocks restore and keeps host required' {
    $f = New-EntryFixture 'backup-tamper'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official; $null = Invoke-EntryFixture $f
    $record = Get-EntryFixtureRecord $f; $managed = Get-SunlitEntryHash $p
    Write-EntryFixture (Join-Path $f.root ('data\entrypoints\originals\' + $record.id + '.lnk')) 'modified backup'
    $r = Invoke-EntryFixture $f 'Restore'
    Assert-EntryFixture ($r.Errors.Count -gt 0 -and $r.Restored -eq 0 -and $r.RemainingHostLinks.Count -eq 1 -and -not $r.SafeToRemoveHost -and (Get-SunlitEntryHash $p) -eq $managed) 'Unverified backup restored or needed host removable.'
}
Check-EntryFixture 'junction children are skipped and reparse search roots refused' {
    $f = New-EntryFixture 'reparse'; $outside = Join-Path $f.directory 'outside'; [void][IO.Directory]::CreateDirectory($outside)
    $p = Join-Path $outside 'ChatGPT.lnk'; New-EntryLink $p $f.official; $before = Get-SunlitEntryHash $p
    $junction = Join-Path $f.roots[0] 'junction'; [void](New-Item -ItemType Junction -Path $junction -Target $outside)
    $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Replaced -eq 0 -and $r.SkippedUnsafe.Count -eq 1 -and (Get-SunlitEntryHash $p) -eq $before) 'Junction traversed.'
    $f.roots = @($junction); $r = Invoke-EntryFixture $f
    Assert-EntryFixture ($r.Errors.Count -gt 0 -and -not $r.HostLinkVerificationComplete -and (Get-SunlitEntryHash $p) -eq $before) 'Reparse root accepted.'
}
Check-EntryFixture 'escaped journal path is rejected before any restore' {
    $f = New-EntryFixture 'journal-escape'; $p = Join-Path $f.roots[0] 'ChatGPT.lnk'; New-EntryLink $p $f.official; $null = Invoke-EntryFixture $f; $before = Get-SunlitEntryHash $p
    $record = Get-EntryFixtureRecord $f; $record.path = Join-Path $f.directory 'outside.lnk'
    Write-EntryFixture (Join-Path $f.root ('data\entrypoints\records\' + $record.id + '.json')) ($record | ConvertTo-Json)
    $r = Invoke-EntryFixture $f 'Restore'
    Assert-EntryFixture ($r.Errors.Count -gt 0 -and -not $r.SafeToRemoveHost -and -not $r.HostLinkVerificationComplete -and (Get-SunlitEntryHash $p) -eq $before) 'Escaped journal accepted.'
}
Check-EntryFixture 'fixture roots cannot escape and injected hooks are refused in production mode' {
    $f = New-EntryFixture 'test-boundary'
    $Root = 'caller-sentinel'; $Action = 'caller-action'; $savedTestRoot = $TestRoot
    . (Join-Path $PSScriptRoot 'Entrypoints.ps1') -Root $f.root -Action Inspect
    Assert-EntryFixture ($Root -ceq 'caller-sentinel' -and $Action -ceq 'caller-action' -and $TestRoot -ceq $savedTestRoot) 'Dot-source import overwrote caller parameters.'
    $bad = Invoke-SunlitEntrypoints -Action Inspect -Root $f.root -SearchRoots @($TestRoot) -OfficialExe $f.official -Aumid $f.aumid -TestRoot $TestRoot
    Assert-EntryFixture ($bad.Errors.Count -gt 0) 'Nonchild fixture root accepted.'
    $bad = Invoke-SunlitEntrypoints -Action Inspect -Root $f.root -MetadataProvider { param($p) $null }
    Assert-EntryFixture ($bad.Errors.Count -gt 0 -and $bad.LinksInspected -eq 0) 'Hooks escaped isolation.'
}
$report = [pscustomobject]@{ at = [DateTime]::UtcNow.ToString('o'); testRoot = $TestRoot; actualUserIntegrationTouched = $false; method = 'Isolated files and real COM-created replacements; original MSIX metadata injection, real File.Replace race/backup failure, hash ownership, journal escape and reparse guards.'; passed = @($results | Where-Object { $_.passed }).Count; total = $results.Count; results = @($results.ToArray()) }
$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'test-results\entrypoints'; [void][IO.Directory]::CreateDirectory($out)
[IO.File]::WriteAllText((Join-Path $out 'report.json'), ($report | ConvertTo-Json -Depth 8), $utf8)
$report | ConvertTo-Json -Depth 8
if ($report.passed -ne $report.total) { exit 1 }
