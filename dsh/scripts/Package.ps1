[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(!$OutputDirectory){
 $OutputDirectory=Join-Path $root 'release'
 New-Item -ItemType Directory -Path $OutputDirectory -Force|Out-Null
}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(!(Test-Path -LiteralPath $OutputDirectory -PathType Container)){throw 'Output directory must already exist'}
$pkg=Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json
$stage=Join-Path $root ('release/stage-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force|Out-Null
$files=@('package.json','installer')+@($pkg.files)
foreach($file in $files){Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file) -Recurse -Force}
$sums=Get-ChildItem -LiteralPath $stage -File -Recurse|Sort-Object FullName|ForEach-Object{(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()+'  '+$_.FullName.Substring($stage.Length+1).Replace('\','/')}
[IO.File]::WriteAllLines((Join-Path $stage 'SHA256SUMS.txt'),$sums,[Text.UTF8Encoding]::new($false))
$runtimeZip=Join-Path $OutputDirectory ('SunlitTides-DSH-'+$pkg.version+'.zip')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $runtimeZip -CompressionLevel Optimal -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceZip=Join-Path $OutputDirectory ('SunlitTides-DSH-source-'+$pkg.version+'.zip')
$temporary=$sourceZip+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
$archive=[IO.Compression.ZipFile]::Open($temporary,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($entry in Get-ChildItem -LiteralPath $root -File -Recurse -Force){
  $relative=$entry.FullName.Substring($root.Length+1).Replace('\','/')
  if($relative -match '(^|/)(node_modules|test-results|release|\.git)(/|$)'){continue}
  if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected reparse file'}
  if($relative -match '(^|/)(\.env|credentials|backups?)(/|\.|$)|\.(db|sqlite|pem|pfx|key)$'){throw "Unexpected source file: $relative"}
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
 }
}finally{$archive.Dispose()}
Move-Item -LiteralPath $temporary -Destination $sourceZip -Force
foreach($zipPath in @($runtimeZip,$sourceZip)){
 $archive=[IO.Compression.ZipFile]::OpenRead($zipPath)
 try{foreach($entry in $archive.Entries){if(!$entry.Name){continue};$stream=$entry.Open();try{$stream.CopyTo([IO.Stream]::Null)}finally{$stream.Dispose()}}}finally{$archive.Dispose()}
}
Write-Output $runtimeZip
Write-Output $sourceZip
