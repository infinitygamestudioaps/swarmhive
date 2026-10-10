# Makes light web tiles for the dashboard map: Maps\X_Y.jpg (900 px, one L2 region = 32768x32768 game units)
# -> Dashboard\maptiles\X_Y.jpg (512 px, JPEG q72). Surface tiles only (X_Y_1 / X_Y_2 = underground levels).
# Region of a game position: X = floor(x / 32768) + 20, Y = floor(y / 32768) + 18.
Add-Type -AssemblyName System.Drawing
$src = "$PSScriptRoot\..\..\..\Maps"; $dst = "$PSScriptRoot\..\..\..\Dashboard\maptiles"; $size = 512
New-Item -ItemType Directory -Force $dst | Out-Null
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 72L
$n = 0
Get-ChildItem "$src\*.jpg" | Where-Object Name -match '^\d+_\d+\.jpg$' | ForEach-Object {
    $out = Join-Path $dst $_.Name
    if ((Test-Path $out) -and (Get-Item $out).LastWriteTime -gt $_.LastWriteTime) { return }
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($out, $codec, $ep)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose(); $n++
}
$all = Get-ChildItem "$dst\*.jpg"
"made $n tiles; $($all.Count) total, {0:N1} MB" -f (($all | Measure-Object Length -Sum).Sum / 1MB)
