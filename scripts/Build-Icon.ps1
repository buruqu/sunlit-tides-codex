param(
    [string]$Source = (Join-Path $PSScriptRoot '..\assets\branding\sunlit-tides.png'),
    [string]$Output = (Join-Path $PSScriptRoot '..\assets\branding\sunlit-tides.ico')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sourceImage = [Drawing.Image]::FromFile([IO.Path]::GetFullPath($Source))
try {
    if ($sourceImage.Width -ne $sourceImage.Height) { throw 'Icon source must be square.' }
    $sizes = @(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
    $frames = @()
    foreach ($size in $sizes) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $buffer = [IO.MemoryStream]::new()
        try {
            $graphics.Clear([Drawing.Color]::Transparent)
            $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($sourceImage, [Drawing.Rectangle]::new(0, 0, $size, $size), 0, 0, $sourceImage.Width, $sourceImage.Height, [Drawing.GraphicsUnit]::Pixel)
            $bitmap.Save($buffer, [Drawing.Imaging.ImageFormat]::Png)
            $frames += [pscustomobject]@{ Size = $size; Bytes = $buffer.ToArray() }
        } finally { $buffer.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
    $outputPath = [IO.Path]::GetFullPath($Output)
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath))
    $stream = [IO.File]::Create($outputPath)
    $writer = [IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$frames.Count)
        $offset = 6 + 16 * $frames.Count
        foreach ($frame in $frames) {
            $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([UInt16]1); $writer.Write([UInt16]32)
            $writer.Write([UInt32]$frame.Bytes.Length); $writer.Write([UInt32]$offset)
            $offset += $frame.Bytes.Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
    } finally { $writer.Dispose(); $stream.Dispose() }
    [pscustomobject]@{ Path = $outputPath; Sizes = $sizes; Bytes = (Get-Item -LiteralPath $outputPath).Length }
} finally { $sourceImage.Dispose() }
