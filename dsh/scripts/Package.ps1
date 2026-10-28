[CmdletBinding()]
param([string]$OutputDirectory,[string]$NativeCarrierDirectory,[string]$Dotnet='dotnet')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(!$OutputDirectory){
 $OutputDirectory=Join-Path $root 'release'
 New-Item -ItemType Directory -Path $OutputDirectory -Force|Out-Null
}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(!(Test-Path -LiteralPath $OutputDirectory -PathType Container)){throw 'Output directory must already exist'}
$pkg=Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json
# Native mode exits before the Codex host startup path; no startup video is shipped.
# Build from this checkout unless the caller provides its already verified publish.
if(!$NativeCarrierDirectory){
 $NativeCarrierDirectory=Join-Path $root ('release/panel-native-'+[guid]::NewGuid().ToString('N'))
 $nativeProject=Join-Path $root '../host/SunlitTidesCodex.csproj'
 if(!(Test-Path -LiteralPath $nativeProject)){ $nativeProject=Join-Path $root 'native-source/host/SunlitTidesCodex.csproj' }
 & $Dotnet publish $nativeProject -c Release -r win-x64 --self-contained true -o $NativeCarrierDirectory -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
 if($LASTEXITCODE -ne 0){throw 'Native panel carrier publish failed'}
}
$nativeRoot=Join-Path $root 'native'
New-Item -ItemType Directory -Path $nativeRoot -Force|Out-Null
$nativeFiles=@('SunlitTidesCodex.exe')
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','Microsoft.Web.WebView2.Wpf.dll','WebView2Loader.dll')){
 if(Test-Path -LiteralPath (Join-Path $NativeCarrierDirectory $name) -PathType Leaf){$nativeFiles+=$name}
}
foreach($name in $nativeFiles){
 $source=Join-Path $NativeCarrierDirectory $name
 if(!(Test-Path -LiteralPath $source -PathType Leaf)){throw "Native carrier missing: $name"}
 if((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Native carrier cannot be a reparse point'}
 Copy-Item -LiteralPath $source -Destination (Join-Path $nativeRoot $name) -Force
}
$extra=Get-ChildItem -LiteralPath $nativeRoot -Force|Where-Object Name -NotIn $nativeFiles
if($extra){throw 'Unexpected files in native carrier folder; use a clean reviewed native folder'}
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
  if($relative -match '(^|/)(node_modules|test-results|release|native|bin|obj|\.git)(/|$)'){continue}
  if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected reparse file'}
  if($relative -match '(^|/)(\.env|credentials|backups?)(/|\.|$)|\.(db|sqlite|pem|pfx|key)$'){throw "Unexpected source file: $relative"}
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
 }
 # An independent source archive also contains the native carrier sources.
 $parentRoot=Split-Path -Parent $root
 $hostSource=Join-Path $parentRoot 'host'
 if(Test-Path -LiteralPath (Join-Path $hostSource 'SunlitTidesCodex.csproj')){
  foreach($entry in Get-ChildItem -LiteralPath $hostSource -File -Recurse){
   $relative=$entry.FullName.Substring($hostSource.Length+1).Replace('\','/')
   if($relative -match '(^|/)(bin|obj)(/|$)'){continue}
   if($relative -notmatch '\.(cs|csproj|manifest|js)$'){continue}
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.FullName,('native-source/host/'+$relative),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  }
  foreach($relative in @('shared/panel-carrier.html','assets/branding/sunlit-tides.ico')){
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $parentRoot $relative),('native-source/'+$relative),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  }
 }
}finally{$archive.Dispose()}
Move-Item -LiteralPath $temporary -Destination $sourceZip -Force
foreach($zipPath in @($runtimeZip,$sourceZip)){
 $archive=[IO.Compression.ZipFile]::OpenRead($zipPath)
 try{foreach($entry in $archive.Entries){if(!$entry.Name){continue};$stream=$entry.Open();try{$stream.CopyTo([IO.Stream]::Null)}finally{$stream.Dispose()}}}finally{$archive.Dispose()}
}
Write-Output $runtimeZip
Write-Output $sourceZip
