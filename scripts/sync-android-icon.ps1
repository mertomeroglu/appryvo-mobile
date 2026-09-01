Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\merto\Desktop\Ryvo-iOS-AppIcon.png"
if (-not (Test-Path $sourcePath)) {
    $sourcePath = "$PSScriptRoot\..\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
}

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source icon not found at $sourcePath"
    exit 1
}

Write-Host "Using icon source: $sourcePath"

$srcImage = [System.Drawing.Image]::FromFile($sourcePath)

function Resize-AndSave {
    param(
        [System.Drawing.Image]$Image,
        [int]$TargetWidth,
        [int]$TargetHeight,
        [string]$DestinationPath,
        [float]$PaddingRatio = 0.0
    )

    $dir = [System.IO.Path]::GetDirectoryName($DestinationPath)
    if (-not (Test-Path $dir)) {
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap $TargetWidth, $TargetHeight
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $padX = [int]($TargetWidth * $PaddingRatio)
    $padY = [int]($TargetHeight * $PaddingRatio)
    $drawW = $TargetWidth - (2 * $padX)
    $drawH = $TargetHeight - (2 * $padY)

    $destRect = New-Object System.Drawing.Rectangle $padX, $padY, $drawW, $drawH
    $graphics.DrawImage($Image, $destRect, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $bmp.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $DestinationPath ($TargetWidth x $TargetHeight)"
}

function Create-Background {
    param(
        [int]$TargetWidth,
        [int]$TargetHeight,
        [string]$DestinationPath,
        [System.Drawing.Color]$Color
    )
    $dir = [System.IO.Path]::GetDirectoryName($DestinationPath)
    if (-not (Test-Path $dir)) {
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap $TargetWidth, $TargetHeight
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.Clear($Color)
    $bmp.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Generated Background: $DestinationPath ($TargetWidth x $TargetHeight)"
}

$resDir = "$PSScriptRoot\..\android\app\src\main\res"

# Standard Legacy Mipmaps (launcher_icon.png)
$mipmapSizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($kv in $mipmapSizes.GetEnumerator()) {
    $folder = $kv.Key
    $size = $kv.Value
    $dest = "$resDir\$folder\launcher_icon.png"
    Resize-AndSave -Image $srcImage -TargetWidth $size -TargetHeight $size -DestinationPath $dest -PaddingRatio 0.0
}

# Adaptive Icons (108dp base grid, inner safe zone ~66-72dp so padding ~0.15 - 0.18)
$adaptiveSizes = @{
    "drawable-mdpi"    = 108
    "drawable-hdpi"    = 162
    "drawable-xhdpi"   = 216
    "drawable-xxhdpi"  = 324
    "drawable-xxxhdpi" = 432
}

# Sample background color from top-left pixel
$cornerBmp = New-Object System.Drawing.Bitmap $srcImage
$bgColor = $cornerBmp.GetPixel(5, 5)
$cornerBmp.Dispose()
Write-Host "Sampled Background Color: R=$($bgColor.R), G=$($bgColor.G), B=$($bgColor.B)"

foreach ($kv in $adaptiveSizes.GetEnumerator()) {
    $folder = $kv.Key
    $size = $kv.Value

    # Foreground balanced (with padding for adaptive round/squircle mask)
    $fgBalancedDest = "$resDir\$folder\ic_launcher_foreground_balanced.png"
    Resize-AndSave -Image $srcImage -TargetWidth $size -TargetHeight $size -DestinationPath $fgBalancedDest -PaddingRatio 0.15

    # Foreground standard
    $fgDest = "$resDir\$folder\ic_launcher_foreground.png"
    Resize-AndSave -Image $srcImage -TargetWidth $size -TargetHeight $size -DestinationPath $fgDest -PaddingRatio 0.12

    # Background
    $bgDest = "$resDir\$folder\ic_launcher_background.png"
    Create-Background -TargetWidth $size -TargetHeight $size -DestinationPath $bgDest -Color $bgColor
}

# Also save a copy to project assets
$backupAsset = "$PSScriptRoot\..\..\..\ryvo_assets\android_acik_ikon.png"
if (Test-Path "$PSScriptRoot\..\..\..\ryvo_assets") {
    Copy-Item $sourcePath -Destination $backupAsset -Force
    Write-Host "Saved asset backup: $backupAsset"
}

$srcImage.Dispose()
Write-Host "Android icons updated successfully from $sourcePath"
