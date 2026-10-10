# Draws a geopath.js result (--json file) on the game's own map tiles (Maps/high/<X>_<Y>.jpg, 4096 px = 32768 units),
# so a planned route can be checked by eye: start (green), waypoints (yellow line + dots), goal (red).
# Usage: powershell -File draw_path.ps1 -Json path.json -Out path.png [-Scale 0.5] [-Pad 1500]
param([Parameter(Mandatory)][string]$Json, [Parameter(Mandatory)][string]$Out, [double]$Scale = 0.5, [int]$Pad = 1500)
Add-Type -AssemblyName System.Drawing
$p = Get-Content $Json -Raw | ConvertFrom-Json
$pts = @($p.from) + @($p.points) + @($p.to) | Where-Object { $_ -ne $null }
$x1 = ($pts | Measure-Object x -Minimum).Minimum - $Pad; $x2 = ($pts | Measure-Object x -Maximum).Maximum + $Pad
$y1 = ($pts | Measure-Object y -Minimum).Minimum - $Pad; $y2 = ($pts | Measure-Object y -Maximum).Maximum + $Pad
$k = $Scale / 8                                                    # px per world unit
$W = [int](($x2 - $x1) * $k); $H = [int](($y2 - $y1) * $k)
$bmp = New-Object System.Drawing.Bitmap $W, $H; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::Black)
for ($rx = [math]::Floor($x1 / 32768) + 20; $rx -le [math]::Floor($x2 / 32768) + 20; $rx++) {
  for ($ry = [math]::Floor($y1 / 32768) + 18; $ry -le [math]::Floor($y2 / 32768) + 18; $ry++) {
    $f = "$PSScriptRoot\..\..\..\Maps\high\${rx}_${ry}.jpg"; if (-not (Test-Path $f)) { continue }
    $img = [System.Drawing.Image]::FromFile($f)
    $wx = ($rx - 20) * 32768; $wy = ($ry - 18) * 32768
    $g.DrawImage($img, [single](($wx - $x1) * $k), [single](($wy - $y1) * $k), [single](32768 * $k), [single](32768 * $k))
    $img.Dispose()
  }
}
function P($o) { New-Object System.Drawing.PointF ([single](($o.x - $x1) * $k)), ([single](($o.y - $y1) * $k)) }
$line = @($p.from) + @($p.points) | ForEach-Object { P $_ }
if ($line.Count -ge 2) { $g.DrawLines((New-Object System.Drawing.Pen ([System.Drawing.Color]::Yellow), 3), [System.Drawing.PointF[]]$line) }
foreach ($wp in $p.points) { $q = P $wp; $g.FillEllipse([System.Drawing.Brushes]::Orange, $q.X - 3, $q.Y - 3, 6, 6) }
$s = P $p.from; $g.FillEllipse([System.Drawing.Brushes]::Lime, $s.X - 7, $s.Y - 7, 14, 14)
$e = P $p.to; $g.FillEllipse([System.Drawing.Brushes]::Red, $e.X - 7, $e.Y - 7, 14, 14)
$font = New-Object System.Drawing.Font 'Arial', 11, ([System.Drawing.FontStyle]::Bold)
$txt = if ($p.ok) { "OK: $($p.points.Count) waypoints, ~$($p.lengthUnits) units, $($p.ms) ms" } else { "NO PATH: $($p.reason)" }
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 0, 0, 0))), 0, 0, [math]::Min([int]$W, 420), 22)
$g.DrawString($txt, $font, [System.Drawing.Brushes]::White, 4, 3)
$bmp.Save($Out); $g.Dispose(); $bmp.Dispose()
"saved $Out ($W x $H)"
