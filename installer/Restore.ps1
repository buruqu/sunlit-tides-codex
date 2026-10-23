[CmdletBinding(SupportsShouldProcess = $true)]
param()
. (Join-Path $PSScriptRoot 'Common.ps1')
$installRoot = Get-SunlitRoot
$marker = Get-SunlitMarker $installRoot
if ($null -eq $marker) { throw '没有找到受管的晴光与泡影主题安装。' }
Assert-SunlitNoReparse $installRoot
$exe = Join-Path $installRoot 'SunlitTidesCodex.exe'
$ownedExe = @($marker.files | Where-Object { $_.path -eq 'SunlitTidesCodex.exe' })
if ($ownedExe.Count -ne 1 -or (Get-SunlitHash $exe) -ne $ownedExe[0].sha256) { throw '主题宿主文件已修改，不会运行。' }
if (-not $PSCmdlet.ShouldProcess($installRoot, '关闭自动应用并恢复 Codex 默认外观')) { return }
Invoke-SunlitControl $exe '--restore'
Write-Output '已关闭自动应用并恢复默认外观。可从主题快捷方式重新启用；Codex 安装文件未修改。'
