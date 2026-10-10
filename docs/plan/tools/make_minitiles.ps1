# Cut one map region into 4x4 sharp pieces for the dashboard's character mini-map.
# Source: Maps\high\<X>_<Y>.jpg (4096 px per region = 8 game units per px), else Maps\<X>_<Y>.jpg (900 px).
# Output: Dashboard\minitiles\<X>_<Y>_<col>_<row>.jpg, 1024 px each (one piece = 8192 x 8192 game units).
# Called on demand by Dashboard\server.js the first time a region is needed; results are cached on disk.
param([Parameter(Mandatory)][string]$Region)
$ErrorActionPreference = 'Stop'
if ($Region -notmatch '^\d+_\d+(_\d)?$') { throw "bad region $Region" }   # <X>_<Y> or an underground layer <X>_<Y>_<n> (live raid map)
Add-Type -AssemblyName System.Drawing
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$src = "$root\Maps\high\$Region.jpg"
if (-not (Test-Path $src)) { $src = "$root\Maps\$Region.jpg" }
if (-not (Test-Path $src)) { Write-Output "NOSRC"; exit 0 }
$out = "$root\Dashboard\minitiles"
New-Item -ItemType Directory -Force $out | Out-Null
$img = [System.Drawing.Image]::FromFile($src)
try {
  $cw = $img.Width / 4
  $size = [Math]::Min(1024, [int]$cw)
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 78L
  for ($c = 0; $c -lt 4; $c++) {
    for ($r = 0; $r -lt 4; $r++) {
      $bmp = New-Object System.Drawing.Bitmap $size, $size
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = 'HighQualityBicubic'
      $dst = New-Object System.Drawing.RectangleF 0, 0, $size, $size
      $srcR = New-Object System.Drawing.RectangleF ([single]($c * $cw)), ([single]($r * $cw)), ([single]$cw), ([single]$cw)
      $g.DrawImage($img, $dst, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
      $bmp.Save("$out\${Region}_${c}_${r}.jpg", $codec, $ep)
      $g.Dispose(); $bmp.Dispose()
    }
  }
  Write-Output "OK $src"
} finally { $img.Dispose() }
