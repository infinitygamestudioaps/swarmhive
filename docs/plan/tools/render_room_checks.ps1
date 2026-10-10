# Renders the room polygon check images for docs/plan/tools/room_polys.js:
# every <base>_meta.json in -Dir -> <base>.png = the map layer(s) from Maps\high under the overlay PNG (walkable cells, polygons, spawns)
# plus the room labels, the safe spots (green shields) and a title. The overlay is kept (re-render without recomputing).
param([string]$Dir = (Join-Path $PSScriptRoot '..\room_polys'))
Add-Type -AssemblyName System.Drawing
$maps = Join-Path $PSScriptRoot '..\..\..\Maps\high'
$cache = @{}
Get-ChildItem -Path $Dir -Filter '*_meta.json' | ForEach-Object {
  $m = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $bmp = New-Object System.Drawing.Bitmap ([int]$m.W), ([int]($m.H + 28))
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 13, 42, 51))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
  foreach ($r in $m.regions) {
    $f = Join-Path $maps ($r.file + '.jpg')
    if (-not (Test-Path $f)) { continue }
    if (-not $cache.ContainsKey($f)) { $cache[$f] = [System.Drawing.Image]::FromFile($f) }
    $img = $cache[$f]
    $x = ($r.x0 - $m.box[0]) / $m.scale; $y = ($r.y0 - $m.box[2]) / $m.scale + 28; $s = 32768 / $m.scale
    $g.DrawImage($img, [single]$x, [single]$y, [single]$s, [single]$s)
  }
  # darken the map a little so the colours read
  $shade = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
  $g.FillRectangle($shade, 0, 28, $m.W, $m.H)
  $ovp = Join-Path $Dir $m.overlay
  if (Test-Path $ovp) { $ov = [System.Drawing.Image]::FromFile($ovp); $g.DrawImage($ov, 0, 28, $ov.Width, $ov.Height); $ov.Dispose() }
  $font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
  $black = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
  foreach ($l in $m.labels) {
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, [int]$l.c[0], [int]$l.c[1], [int]$l.c[2]))
    $x = [single]($l.x + 6); $y = [single]($l.y + 28 - 8)
    foreach ($o in @(@(-1,0),@(1,0),@(0,-1),@(0,1))) { $g.DrawString($l.text, $font, $black, $x + $o[0], $y + $o[1]) }
    $g.DrawString($l.text, $font, $b, $x, $y)
  }
  # safe spots: green shield + number
  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 40, 200, 80))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 1.5
  $sf = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
  foreach ($s in @($m.safe)) {
    if ($null -eq $s) { continue }
    $x = [single]$s.x; $y = [single]($s.y + 28)
    $pts = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF ($x - 7), ($y - 8)), (New-Object System.Drawing.PointF ($x + 7), ($y - 8)), (New-Object System.Drawing.PointF ($x + 7), ($y + 1)), (New-Object System.Drawing.PointF $x, ($y + 9)), (New-Object System.Drawing.PointF ($x - 7), ($y + 1)))
    $g.FillPolygon($green, $pts); $g.DrawPolygon($pen, $pts)
    foreach ($o in @(@(-1,0),@(1,0),@(0,-1),@(0,1))) { $g.DrawString($s.text, $sf, $black, $x + 9 + $o[0], $y - 7 + $o[1]) }
    $g.DrawString($s.text, $sf, $green, $x + 9, $y - 7)
  }
  $tf = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
  $g.FillRectangle($black, 0, 0, $m.W, 28)
  $g.DrawString($m.title, $tf, [System.Drawing.Brushes]::White, 6, 4)
  $g.Dispose()
  $bmp.Save((Join-Path $Dir $m.out), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("rendered " + $m.out)
}
foreach ($k in $cache.Keys) { $cache[$k].Dispose() }
