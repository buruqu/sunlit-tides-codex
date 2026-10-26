# Managed current-user .lnk migration. Does not launch apps, restart Explorer,
# edit Taskband/MSIX, or depend on the legacy launcher's integration code.
[CmdletBinding()]
param(
    [Alias('Action')][ValidateSet('Inspect','Install','Verify','Restore')][string]$SunlitEntryAction = 'Inspect',
    [Alias('Root')][string]$SunlitEntryRoot,
    [Alias('SearchRoots')][string[]]$SunlitEntrySearchRoots,
    [Alias('OfficialExe')][string]$SunlitEntryOfficialExe,
    [Alias('Aumid')][string]$SunlitEntryAumid,
    [Alias('IconPath')][string]$SunlitEntryIconPath,
    [Alias('TestRoot')][string]$SunlitEntryTestRoot
)
Set-StrictMode -Version Latest

function Get-SunlitEntryValue($Object, [string]$Name, $Default = $null) {
    if ($null -eq $Object) { return $Default }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $Default }
    return $property.Value
}
function Get-SunlitEntryPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path)) { throw 'An absolute local path is required.' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full -notmatch '^[A-Za-z]:\\' -or $full.Substring(2).Contains(':') -or $full -match '(^|\\)[^\\]*[. ](\\|$)') { throw 'UNC, device, alternate-stream and ambiguous paths are refused.' }
    return $full
}
function Test-SunlitEntryEqual([string]$A, [string]$B) { [string]::Equals($A, $B, [StringComparison]::OrdinalIgnoreCase) }
function Test-SunlitEntryChild([string]$Path, [string]$Parent) {
    (Get-SunlitEntryPath $Path).StartsWith((Get-SunlitEntryPath $Parent) + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Assert-SunlitEntryNoReparse([string]$Path) {
    $current = Get-SunlitEntryPath $Path
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw ('Reparse path refused: ' + $current) }
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}
function Get-SunlitEntryHash([string]$Path) {
    Assert-SunlitEntryNoReparse $Path
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
}
function New-SunlitEntryDirectory([string]$Path) {
    Assert-SunlitEntryNoReparse $Path
    [void][IO.Directory]::CreateDirectory($Path)
    Assert-SunlitEntryNoReparse $Path
}
function Copy-SunlitEntryImmutable([string]$Source, [string]$Destination, [string]$ExpectedHash) {
    Assert-SunlitEntryNoReparse $Source
    Assert-SunlitEntryNoReparse $Destination
    $inputFile = [IO.File]::Open($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $outputFile = $null
    try {
        $outputFile = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $inputFile.CopyTo($outputFile); $outputFile.Flush($true)
    } finally { if ($null -ne $outputFile) { $outputFile.Dispose() }; $inputFile.Dispose() }
    if ((Get-SunlitEntryHash $Destination) -ne $ExpectedHash) { throw ('Immutable copy verification failed: ' + $Destination) }
}
function Write-SunlitEntryNewJson([string]$Path, $Value) {
    Assert-SunlitEntryNoReparse $Path
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $encoding = New-Object Text.UTF8Encoding($true)
    $bytes = $encoding.GetBytes(($Value | ConvertTo-Json -Depth 12))
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    # Move is atomic and refuses an existing final filename. No journal or
    # original backup is ever overwritten, including during reinstall.
    [IO.File]::Move($temporary, $Path)
}
function Get-SunlitEntryDefaultRoots {
    @(
        [Environment]::GetFolderPath('DesktopDirectory'),
        [Environment]::GetFolderPath('Programs'),
        (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}
function Get-SunlitEntryLink([string]$Path) {
    $wscript = $null; $shortcut = $null; $shell = $null; $folder = $null; $item = $null
    try {
        $wscript = New-Object -ComObject WScript.Shell
        $shortcut = $wscript.CreateShortcut($Path)
        $target = [string]$shortcut.TargetPath; $arguments = [string]$shortcut.Arguments
        $shell = New-Object -ComObject Shell.Application
        $folder = $shell.NameSpace([IO.Path]::GetDirectoryName($Path))
        if ($null -ne $folder) { $item = $folder.ParseName([IO.Path]::GetFileName($Path)) }
        $appId = ''; $parsing = ''
        if ($null -ne $item) {
            $appId = [string]$item.ExtendedProperty('System.AppUserModel.ID')
            $parsing = [string]$item.ExtendedProperty('System.Link.TargetParsingPath')
        }
        [pscustomobject]@{ TargetPath = $target; Arguments = $arguments; WorkingDirectory = [string]$shortcut.WorkingDirectory; IconLocation = [string]$shortcut.IconLocation; Aumid = $appId; ParsingPath = $parsing }
    } finally {
        foreach ($com in @($item, $folder, $shell, $shortcut, $wscript)) { if ($null -ne $com -and [Runtime.InteropServices.Marshal]::IsComObject($com)) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($com) } }
    }
}
function Test-SunlitEntryAppIdentity([string]$Value, $Context) {
    if ([string]::IsNullOrWhiteSpace($Value) -or [string]::IsNullOrWhiteSpace($Context.Aumid)) { return $false }
    (Test-SunlitEntryEqual $Value $Context.Aumid) -or (Test-SunlitEntryEqual $Value ('shell:AppsFolder\' + $Context.Aumid))
}
function Get-SunlitEntryIdentity([string]$Path, $Metadata, $Context) {
    $target = [string](Get-SunlitEntryValue $Metadata 'TargetPath' '')
    $arguments = [string](Get-SunlitEntryValue $Metadata 'Arguments' '')
    if ([string]::IsNullOrWhiteSpace($arguments)) {
        if (Test-SunlitEntryEqual $target $Context.OfficialExe) { return 'official-executable' }
        if (Test-SunlitEntryAppIdentity $target $Context) { return 'official-appsfolder' }
        if ([string]::IsNullOrWhiteSpace($target) -and ((Test-SunlitEntryAppIdentity ([string](Get-SunlitEntryValue $Metadata 'Aumid' '')) $Context) -or (Test-SunlitEntryAppIdentity ([string](Get-SunlitEntryValue $Metadata 'ParsingPath' '')) $Context))) { return 'official-msix-shell-link' }
    }
    if ((Test-SunlitEntryEqual $target (Join-Path $env:WINDIR 'explorer.exe')) -and (Test-SunlitEntryAppIdentity ($arguments.Trim().Trim('"')) $Context)) { return 'official-explorer-appsfolder' }
    # Legacy authority is its exact executable basename AND its adjacent
    # launcher.json AppLaunch value. Shortcut display names are never evidence.
    if (-not [string]::IsNullOrWhiteSpace($target) -and [string]::IsNullOrWhiteSpace($arguments) -and (Test-SunlitEntryEqual ([IO.Path]::GetFileName($target)) 'DragonCodexBoot.exe')) {
        $legacy = Get-SunlitEntryPath $target; Assert-SunlitEntryNoReparse $legacy
        $configuration = Join-Path ([IO.Path]::GetDirectoryName($legacy)) 'launcher.json'
        Assert-SunlitEntryNoReparse $configuration
        if ((Test-Path -LiteralPath $legacy -PathType Leaf) -and (Test-Path -LiteralPath $configuration -PathType Leaf)) {
            if ((Get-Item -LiteralPath $configuration).Length -gt 1048576) { throw 'Legacy launcher configuration exceeds the bounded read size.' }
            $settings = Get-Content -LiteralPath $configuration -Raw -Encoding UTF8 | ConvertFrom-Json
            $launch = [string](Get-SunlitEntryValue $settings 'AppLaunch' '')
            if ((Test-SunlitEntryAppIdentity $launch $Context) -or (Test-SunlitEntryEqual $launch $Context.OfficialExe)) { return 'verified-legacy-launcher' }
        }
    }
    return $null
}
function Test-SunlitEntryPathAllowed([string]$Path, $Context) {
    $full = Get-SunlitEntryPath $Path
    if ([IO.Path]::GetExtension($full) -ine '.lnk') { return $false }
    foreach ($directory in $Context.SearchRoots) { if (Test-SunlitEntryChild $full $directory) { return $true } }
    return $false
}
function Read-SunlitEntryRecords($Context) {
    $directory = Join-Path $Context.StateRoot 'records'
    if (-not (Test-Path -LiteralPath $directory)) { return }
    Assert-SunlitEntryNoReparse $directory
    $files = @(Get-ChildItem -LiteralPath $directory -File -Filter '*.json' -Force)
    if ($files.Count -gt 2048) { throw 'Entrypoint journal exceeds the bounded record count.' }
    foreach ($file in $files) {
        Assert-SunlitEntryNoReparse $file.FullName
        if ($file.Length -gt 262144) { throw 'Entrypoint record exceeds the bounded read size.' }
        $record = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $id = [string](Get-SunlitEntryValue $record 'id' '')
        if ($id -notmatch '^[0-9]{19}\.[a-f0-9]{32}$' -or $file.Name -cne ($id + '.json') -or (Get-SunlitEntryValue $record 'schema' 0) -ne 1 -or (Get-SunlitEntryValue $record 'product' '') -cne 'sunlit-tides.codex.entrypoints' -or -not (Test-SunlitEntryEqual ([string](Get-SunlitEntryValue $record 'root' '')) $Context.Root)) { throw 'Invalid or foreign entrypoint ownership record.' }
        if ([string](Get-SunlitEntryValue $record 'originalSha256' '') -notmatch '^[a-f0-9]{64}$' -or [string](Get-SunlitEntryValue $record 'managedSha256' '') -notmatch '^[a-f0-9]{64}$' -or -not (Test-SunlitEntryPathAllowed ([string](Get-SunlitEntryValue $record 'path' '')) $Context)) { throw 'Entrypoint record contains an invalid hash or escaped shortcut path.' }
        Assert-SunlitEntryNoReparse $record.path
        $record
    }
}
function Get-SunlitEntryEventPath($Context, [string]$Id, [string]$Event) { Join-Path $Context.StateRoot ('events\' + $Id + '.' + $Event + '.json') }
function Test-SunlitEntryEvent($Context, [string]$Id, [string]$Event) {
    $path = Get-SunlitEntryEventPath $Context $Id $Event
    Assert-SunlitEntryNoReparse $path
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Entrypoint event exceeds the bounded read size.' }
    $value = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Get-SunlitEntryValue $value 'id' '') -cne $Id -or (Get-SunlitEntryValue $value 'event' '') -cne $Event -or -not (Test-SunlitEntryEqual ([string](Get-SunlitEntryValue $value 'root' '')) $Context.Root)) { throw 'Invalid entrypoint journal event.' }
    return $true
}
function Add-SunlitEntryEvent($Context, [string]$Id, [string]$Event, $Details = $null) {
    if (Test-SunlitEntryEvent $Context $Id $Event) { return }
    Write-SunlitEntryNewJson (Get-SunlitEntryEventPath $Context $Id $Event) ([ordered]@{ id = $Id; event = $Event; root = $Context.Root; at = [DateTime]::UtcNow.ToString('o'); details = $Details })
}
function Invoke-SunlitEntryCheckpoint($Context, [string]$Name, [string]$Path, $Details) {
    if ($null -ne $Context.Checkpoint) { & $Context.Checkpoint $Name $Path $Details }
}
function New-SunlitEntryTemplate([string]$Path, $Context) {
    Assert-SunlitEntryNoReparse $Path
    if (Test-Path -LiteralPath $Path) { throw 'Managed shortcut template already exists.' }
    $shell = $null; $link = $null
    try {
        $shell = New-Object -ComObject WScript.Shell; $link = $shell.CreateShortcut($Path)
        $link.TargetPath = $Context.Executable; $link.Arguments = '--open'; $link.WorkingDirectory = $Context.Root
        $link.Description = 'Codex'; $link.IconLocation = $Context.IconPath + ',0'; $link.Save()
    } finally { foreach ($com in @($link, $shell)) { if ($null -ne $com) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($com) } } }
    if (-not (Test-SunlitEntryOwnedMetadata (Get-SunlitEntryLink $Path) $Context)) { throw 'Fresh managed shortcut verification failed.' }
}
function Test-SunlitEntryOwnedMetadata($Metadata, $Context) {
    (Test-SunlitEntryEqual ([string](Get-SunlitEntryValue $Metadata 'TargetPath' '')) $Context.Executable) -and ([string](Get-SunlitEntryValue $Metadata 'Arguments' '') -ceq '--open')
}
function Invoke-SunlitEntrySwap($Context, $Record, [string]$Source, [string]$Before, [string]$After, [string]$Operation) {
    $attempt = [Guid]::NewGuid().ToString('N')
    $prefix = Join-Path ([IO.Path]::GetDirectoryName($Record.path)) ('.sunlit-tides-' + $attempt)
    $stage = $prefix + '.staged.lnk'; $displaced = $prefix + '.displaced.lnk'; $rollback = $prefix + '.rollback.lnk'
    $archive = Join-Path $Context.StateRoot ('transactions\' + $attempt + '.displaced.lnk')
    try {
        Copy-SunlitEntryImmutable $Source $stage $After
        Invoke-SunlitEntryCheckpoint $Context 'BeforeCommit' $Record.path $Record
        Assert-SunlitEntryNoReparse $Record.path
        if ((Get-SunlitEntryHash $Record.path) -ne $Before) { throw 'Shortcut changed concurrently before replacement; preserved.' }
        # Commit intent is durable before touching the directory entry. A crash
        # after this point never authorizes retrying over an original/user link.
        Add-SunlitEntryEvent $Context $Record.id ($attempt + '.intent') ([ordered]@{ operation = $Operation; path = $Record.path; stage = $stage; displaced = $displaced; rollback = $rollback; expectedBefore = $Before; expectedAfter = $After })
        Assert-SunlitEntryNoReparse $Record.path
        if ((Get-SunlitEntryHash $Record.path) -ne $Before) { throw 'Shortcut changed while preparing commit; preserved.' }
        Invoke-SunlitEntryCheckpoint $Context 'AfterGuard' $Record.path $Record
        Assert-SunlitEntryNoReparse $Record.path
        # Both temporary siblings share the shortcut's volume even if Desktop
        # is redirected to another drive. Replace preserves a raced-out version.
        [IO.File]::Replace($stage, $Record.path, $displaced)
        $actualBefore = Get-SunlitEntryHash $displaced
        Copy-SunlitEntryImmutable $displaced $archive $actualBefore
        if ($actualBefore -ne $Before) {
            if ((Get-SunlitEntryHash $Record.path) -eq $After) {
                [IO.File]::Replace($displaced, $Record.path, $rollback)
                $rollbackHash = Get-SunlitEntryHash $rollback
                Copy-SunlitEntryImmutable $rollback (Join-Path $Context.StateRoot ('transactions\' + $attempt + '.rollback.lnk')) $rollbackHash
            }
            throw ('Concurrent replacement detected; current/user and displaced versions retained: ' + $archive)
        }
        Add-SunlitEntryEvent $Context $Record.id $Operation ([ordered]@{ before = $Before; after = $After; displaced = $archive })
        Invoke-SunlitEntryCheckpoint $Context 'AfterReplace' $Record.path $Record
        return ((Get-SunlitEntryHash $Record.path) -eq $After)
    } finally {
        # Delete only our known staged bytes. Unexpected displaced/rollback
        # versions stay recoverable beside the link and in the immutable journal.
        if ((Test-Path -LiteralPath $stage -PathType Leaf) -and (Get-SunlitEntryHash $stage) -eq $After) { [IO.File]::Delete($stage) }
        if ((Test-Path -LiteralPath $displaced -PathType Leaf) -and (Test-Path -LiteralPath $archive -PathType Leaf) -and (Get-SunlitEntryHash $displaced) -eq (Get-SunlitEntryHash $archive)) { [IO.File]::Delete($displaced) }
        if ((Test-Path -LiteralPath $rollback -PathType Leaf) -and (Get-SunlitEntryHash $rollback) -eq $After) { [IO.File]::Delete($rollback) }
    }
}
function Find-SunlitEntryLinks($Context, $Report) {
    $queue = New-Object 'Collections.Generic.Queue[object]'
    foreach ($directory in $Context.SearchRoots) { if (Test-Path -LiteralPath $directory -PathType Container) { $queue.Enqueue([pscustomobject]@{ path = $directory; depth = 0; maximumDepth = $Context.SearchDepths[$directory] }) } }
    $seen = @{}; $watch = [Diagnostics.Stopwatch]::StartNew()
    while ($queue.Count) {
        if ($Report.FoldersInspected -ge 256 -or $Report.LinksInspected -ge 2048 -or $watch.Elapsed.TotalSeconds -ge $Context.ScanBudgetSeconds) { $Report.ScanLimited = $true; $Report.Errors += [pscustomobject]@{ Path = ''; Reason = 'Bounded shortcut scan limit reached; remaining entrances were not silently treated as migrated.' }; break }
        $next = $queue.Dequeue()
        if ($seen.ContainsKey($next.path)) { continue }; $seen[$next.path] = $true
        Assert-SunlitEntryNoReparse $next.path; $Report.FoldersInspected++
        foreach ($item in Get-ChildItem -LiteralPath $next.path -Force -ErrorAction Stop) {
            # Ordinary Desktop/TaskBar entries are directly in their known
            # folder. Do not walk user projects or data beneath Desktop.
            if ($item.PSIsContainer -and $next.maximumDepth -eq 0) { continue }
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $Report.SkippedUnsafe += $item.FullName; continue }
            if ($item.PSIsContainer) { if ($next.depth -lt $next.maximumDepth) { $queue.Enqueue([pscustomobject]@{ path = $item.FullName; depth = $next.depth + 1; maximumDepth = $next.maximumDepth }) } else { $Report.ScanLimited = $true; $Report.Errors += [pscustomobject]@{ Path = $item.FullName; Reason = 'Programs shortcut scan depth limit reached.' } } }
            elseif ($item.Extension -ieq '.lnk') { $Report.LinksInspected++; $item.FullName }
        }
    }
}
function Invoke-SunlitEntrypoints {
    [CmdletBinding()]
    param(
        [ValidateSet('Inspect','Install','Verify','Restore')][string]$Action = 'Inspect',
        [Parameter(Mandatory = $true)][string]$Root,
        [string[]]$SearchRoots,
        [string]$OfficialExe,
        [string]$Aumid,
        [string]$IconPath,
        [string]$TestRoot,
        [scriptblock]$MetadataProvider,
        [scriptblock]$Checkpoint,
        [ValidateRange(1,60)][int]$ScanBudgetSeconds = 20
    )
    $report = [pscustomobject][ordered]@{ schema = 1; action = $Action; root = $Root; status = 'Running'; Replaced = 0; AlreadyOwned = 0; Restored = 0; Candidates = @(); Preserved = @(); Errors = @(); RemainingHostLinks = @(); HostLinkVerificationComplete = $false; SafeToRemoveHost = $false; LinksInspected = 0; FoldersInspected = 0; ScanLimited = $false; SkippedUnsafe = @(); SearchRoots = @(); NativePinsRequireReview = $true; ExplorerRestarted = $false; RegistryChanged = $false; MSIXChanged = $false; Limits = @('Native MSIX/AppsFolder pins and taskbar cache are not changed by replacing .lnk files. They require separate user-interface handling.', 'Only current-user Desktop, Programs and TaskBar .lnk files are inspected; names are never identities.') }
    $mutex = $null; $locked = $false; $context = $null; $paths = @(); $records = @(); $scanCompleted = $false
    try {
        $Root = Get-SunlitEntryPath $Root; Assert-SunlitEntryNoReparse $Root; $report.root = $Root
        $defaults = @(Get-SunlitEntryDefaultRoots | ForEach-Object { Get-SunlitEntryPath $_ })
        if ($TestRoot) {
            $TestRoot = Get-SunlitEntryPath $TestRoot; Assert-SunlitEntryNoReparse $TestRoot
            if (-not (Test-Path -LiteralPath $TestRoot -PathType Container) -or -not (Test-SunlitEntryChild $Root $TestRoot) -or -not $SearchRoots) { throw 'TestRoot requires an existing isolated directory, child install root and explicit child SearchRoots.' }
            foreach ($directory in $defaults) { if ((Test-SunlitEntryEqual $directory $TestRoot) -or (Test-SunlitEntryChild $directory $TestRoot)) { throw 'TestRoot cannot contain actual user integration roots.' } }
        } elseif ($null -ne $MetadataProvider -or $null -ne $Checkpoint) { throw 'Metadata/fault injection is restricted to isolated TestRoot fixtures.' }
        if (-not $SearchRoots) { $SearchRoots = $defaults }
        $allowed = @()
        foreach ($directory in $SearchRoots) {
            $full = Get-SunlitEntryPath $directory; Assert-SunlitEntryNoReparse $full
            if ($TestRoot) { if (-not (Test-SunlitEntryChild $full $TestRoot)) { throw 'SearchRoot escapes TestRoot.' } }
            else { $within = $false; foreach ($known in $defaults) { if ((Test-SunlitEntryEqual $full $known) -or (Test-SunlitEntryChild $full $known)) { $within = $true } }; if (-not $within) { throw 'SearchRoots are restricted to current-user integration folders.' } }
            if ((Test-SunlitEntryEqual $Root $full) -or (Test-SunlitEntryChild $Root $full)) { throw 'Installation state cannot be inside the shortcut scan scope.' }
            if ($allowed -inotcontains $full) { $allowed += $full }
        }
        $report.SearchRoots = $allowed
        $searchDepths = @{}
        $programs = Get-SunlitEntryPath ([Environment]::GetFolderPath('Programs'))
        foreach ($directory in $allowed) { $searchDepths[$directory] = if ($TestRoot -or (Test-SunlitEntryEqual $directory $programs) -or (Test-SunlitEntryChild $directory $programs)) { 8 } else { 0 } }
        $stateRoot = Join-Path $Root 'data\entrypoints'; Assert-SunlitEntryNoReparse $stateRoot
        $executable = Join-Path $Root 'SunlitTidesCodex.exe'
        if ($Action -in @('Install','Inspect')) {
            if (-not $OfficialExe -or -not $Aumid) {
                $package = @(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop | Where-Object { $_.Name -ceq 'OpenAI.Codex' }) | Select-Object -First 1
                if ($null -eq $package) { throw 'Current OpenAI.Codex package identity was not found.' }
                if (-not $Aumid) { $Aumid = $package.PackageFamilyName + '!App' }
                if (-not $OfficialExe) { foreach ($name in @('app\Codex.exe','app\ChatGPT.exe')) { $candidate = Join-Path $package.InstallLocation $name; if (Test-Path -LiteralPath $candidate -PathType Leaf) { $OfficialExe = $candidate; break } } }
            }
            $OfficialExe = Get-SunlitEntryPath $OfficialExe
            if (-not (Test-Path -LiteralPath $OfficialExe -PathType Leaf) -or $Aumid -notmatch '^[A-Za-z0-9_.-]+![A-Za-z0-9_.-]+$') { throw 'A precise installed executable and AUMID are required.' }
            if ($TestRoot -and -not (Test-SunlitEntryChild $OfficialExe $TestRoot)) { throw 'Fixture official executable escapes TestRoot.' }
        }
        if ($Action -eq 'Install') {
            if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Installed theme host does not exist; no links were changed.' }
            if ($IconPath) { $IconPath = Get-SunlitEntryPath $IconPath; if (-not (Test-SunlitEntryChild $IconPath $stateRoot)) { throw 'Stable icon must be inside data\entrypoints.' }; Assert-SunlitEntryNoReparse $IconPath; if (-not (Test-Path -LiteralPath $IconPath -PathType Leaf)) { throw 'Stable official icon is missing.' } }
            else { $IconPath = $OfficialExe }
            foreach ($folder in @($stateRoot, (Join-Path $stateRoot 'originals'), (Join-Path $stateRoot 'managed'), (Join-Path $stateRoot 'records'), (Join-Path $stateRoot 'events'), (Join-Path $stateRoot 'transactions'))) { New-SunlitEntryDirectory $folder }
        }
        $context = [pscustomobject]@{ Root = $Root; StateRoot = $stateRoot; SearchRoots = $allowed; SearchDepths = $searchDepths; OfficialExe = $OfficialExe; Aumid = $Aumid; IconPath = $IconPath; Executable = $executable; TestRoot = $TestRoot; MetadataProvider = $MetadataProvider; Checkpoint = $Checkpoint; ScanBudgetSeconds = $ScanBudgetSeconds }
        $rootBytes = [Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant()); $sha = [Security.Cryptography.SHA256]::Create()
        try { $key = [BitConverter]::ToString($sha.ComputeHash($rootBytes)).Replace('-', '').Substring(0,24) } finally { $sha.Dispose() }
        $mutex = New-Object Threading.Mutex($false, ('Local\SunlitTidesCodex.Entrypoints.' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value + '.' + $key))
        try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'Another managed entrypoint operation is in progress.' }
        $records = @(Read-SunlitEntryRecords $context)
        $paths = @(Find-SunlitEntryLinks $context $report)
        $scanCompleted = $true
        foreach ($record in $records) { if ($paths -inotcontains $record.path) { $paths += $record.path } }
        foreach ($path in $paths) {
            try {
                Assert-SunlitEntryNoReparse $path
                $active = @($records | Where-Object { (Test-SunlitEntryEqual $_.path $path) -and -not (Test-SunlitEntryEvent $context $_.id 'restored') })
                if ($active.Count -gt 1) { throw 'Multiple active ownership records exist for this path.' }
                $record = if ($active.Count) { $active[0] } else { $null }
                if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { if ($null -ne $record) { $report.Preserved += [pscustomobject]@{ Path = $path; Reason = 'Shortcut was removed; not recreated.' } }; continue }
                $currentHash = Get-SunlitEntryHash $path
                $metadata = if ($null -ne $MetadataProvider) { & $MetadataProvider $path } else { Get-SunlitEntryLink $path }
                if ($null -ne $record) {
                    $original = Join-Path $stateRoot ('originals\' + $record.id + '.lnk'); $managed = Join-Path $stateRoot ('managed\' + $record.id + '.lnk')
                    if ((Get-SunlitEntryHash $original) -ne $record.originalSha256 -or (Get-SunlitEntryHash $managed) -ne $record.managedSha256) { throw 'Original backup or managed template changed; no shortcut was touched.' }
                    if ($currentHash -eq $record.managedSha256 -and (Test-SunlitEntryOwnedMetadata $metadata $context)) {
                        if ($Action -eq 'Restore') {
                            $unchanged = Invoke-SunlitEntrySwap $context $record $original $record.managedSha256 $record.originalSha256 'restored'
                            if ($unchanged) { $report.Restored++ } else { $report.Preserved += [pscustomobject]@{ Path = $path; Reason = 'User changed the restored shortcut after replacement.' } }
                        } else { $report.AlreadyOwned++ }
                        continue
                    }
                    $intents = @(Get-ChildItem -LiteralPath (Join-Path $stateRoot 'events') -File -Filter ($record.id + '.*.intent.json'))
                    if ($currentHash -ne $record.originalSha256 -or $intents.Count -or (Test-SunlitEntryEvent $context $record.id 'installed')) { $report.Preserved += [pscustomobject]@{ Path = $path; Reason = 'Shortcut changed after preparation/installation; preserved.' }; continue }
                    if ($Action -ne 'Install') { continue }
                } else {
                    if ($Action -in @('Restore','Verify')) { continue }
                    $identity = Get-SunlitEntryIdentity $path $metadata $context
                    if (-not $identity) { continue }
                    $report.Candidates += [pscustomobject]@{ Path = $path; Identity = $identity }
                    if ($Action -ne 'Install') { continue }
                    $id = [DateTime]::UtcNow.Ticks.ToString('D19') + '.' + [Guid]::NewGuid().ToString('N')
                    $original = Join-Path $stateRoot ('originals\' + $id + '.lnk'); $managed = Join-Path $stateRoot ('managed\' + $id + '.lnk')
                    Invoke-SunlitEntryCheckpoint $context 'BeforeBackup' $path ([pscustomobject]@{ BackupPath = $original })
                    Copy-SunlitEntryImmutable $path $original $currentHash
                    New-SunlitEntryTemplate $managed $context
                    $record = [pscustomobject][ordered]@{ schema = 1; product = 'sunlit-tides.codex.entrypoints'; id = $id; root = $Root; path = $path; identity = $identity; originalSha256 = $currentHash; managedSha256 = (Get-SunlitEntryHash $managed); createdUtc = [DateTime]::UtcNow.ToString('o') }
                    Write-SunlitEntryNewJson (Join-Path $stateRoot ('records\' + $id + '.json')) $record
                    $records += $record
                }
                $unchanged = Invoke-SunlitEntrySwap $context $record $managed $record.originalSha256 $record.managedSha256 'installed'
                if ($unchanged) { $report.Replaced++ } else { $report.Preserved += [pscustomobject]@{ Path = $path; Reason = 'User changed the new shortcut after replacement.' } }
            } catch { $report.Errors += [pscustomobject]@{ Path = $path; Reason = $_.Exception.Message } }
        }
    } catch { $report.Errors += [pscustomobject]@{ Path = $Root; Reason = $_.Exception.Message } }
    finally {
        $report.HostLinkVerificationComplete = $scanCompleted -and -not $report.ScanLimited -and $report.SkippedUnsafe.Count -eq 0
        if ($null -ne $context) {
            foreach ($path in @($paths | Select-Object -Unique)) {
                try { if (Test-Path -LiteralPath $path -PathType Leaf) { Assert-SunlitEntryNoReparse $path; $metadata = if ($null -ne $MetadataProvider) { & $MetadataProvider $path } else { Get-SunlitEntryLink $path }; if (Test-SunlitEntryEqual ([string](Get-SunlitEntryValue $metadata 'TargetPath' '')) $context.Executable) { $report.RemainingHostLinks += $path } } }
                catch { $report.HostLinkVerificationComplete = $false; $report.Errors += [pscustomobject]@{ Path = $path; Reason = 'Cannot verify whether the link still needs the host: ' + $_.Exception.Message } }
            }
        }
        if ($locked) { $mutex.ReleaseMutex() }; if ($null -ne $mutex) { $mutex.Dispose() }
        $report.status = if ($report.Errors.Count) { 'PartialFailure' } elseif ($report.Preserved.Count) { 'PreservedUserChanges' } else { 'Complete' }
        $report.SafeToRemoveHost = $Action -eq 'Restore' -and $report.HostLinkVerificationComplete -and $report.RemainingHostLinks.Count -eq 0 -and -not $report.ScanLimited
    }
    return $report
}
if ($MyInvocation.InvocationName -ne '.') {
    if (-not $SunlitEntryRoot) { throw 'Pass -Root for an explicit Inspect/Install/Verify/Restore operation.' }
    $result = Invoke-SunlitEntrypoints -Action $SunlitEntryAction -Root $SunlitEntryRoot -SearchRoots $SunlitEntrySearchRoots -OfficialExe $SunlitEntryOfficialExe -Aumid $SunlitEntryAumid -IconPath $SunlitEntryIconPath -TestRoot $SunlitEntryTestRoot
    $result | ConvertTo-Json -Depth 12
    if ($result.Errors.Count) { exit 1 }
}
