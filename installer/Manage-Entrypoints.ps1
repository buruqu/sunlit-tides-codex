[CmdletBinding(SupportsShouldProcess = $true)]
param([ValidateSet('Install','Restore','Verify','Inspect')][string]$Action = 'Inspect')
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-SunlitRoot
if ($Action -in @('Install','Restore') -and -not $PSCmdlet.ShouldProcess($root, ('Ordinary shortcut ' + $Action))) { return }
$result = Sync-SunlitEntrypoints $root $Action
$result | ConvertTo-Json -Depth 8 | Write-Output
if (@($result.Errors).Count -gt 0) { throw 'Some shortcuts require attention; see the report. Existing backups were retained.' }
