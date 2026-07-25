# Draws the Basalt icon: dark rounded tile + orange triangle.
# Outputs public/icon-192.png, public/icon-512.png and basalt.ico (multi-size).
Add-Type -AssemblyName System.Drawing

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bg = [System.Drawing.ColorTranslator]::FromHtml('#12121a')
$fg = [System.Drawing.ColorTranslator]::FromHtml('#ff9950')

function New-Tile([int]$s) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  # rounded square background
  $r = [int]($s * 0.22); $d = $r * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($s - $d, 0, $d, $d, 270, 90)
  $path.AddArc($s - $d, $s - $d, $d, $d, 0, 90)
  $path.AddArc(0, $s - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $brush = New-Object System.Drawing.SolidBrush($bg)
  $g.FillPath($brush, $path)

  # triangle: ::new with explicit floats; New-Object Type(a,b) mis-parses here
  $cx = $s / 2.0
  $tri = @(
    [System.Drawing.PointF]::new([float]$cx, [float]($s * 0.25)),
    [System.Drawing.PointF]::new([float]($cx - $s * 0.27), [float]($s * 0.73)),
    [System.Drawing.PointF]::new([float]($cx + $s * 0.27), [float]($s * 0.73))
  )
  $tb = New-Object System.Drawing.SolidBrush($fg)
  $g.FillPolygon($tb, [System.Drawing.PointF[]]$tri)

  $g.Dispose(); $brush.Dispose(); $tb.Dispose(); $path.Dispose()
  return $bmp
}

# PWA icons
foreach ($size in 192, 512) {
  $b = New-Tile $size
  $b.Save((Join-Path $dir "public\icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}

# Windows .ico — PNG payloads embedded (Vista+ format)
$sizes = 16, 32, 48, 64, 128, 256
$blobs = @()
foreach ($size in $sizes) {
  $b = New-Tile $size
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $blobs += , $ms.ToArray()
  $ms.Dispose(); $b.Dispose()
}
$ico = New-Object System.IO.FileStream((Join-Path $dir 'basalt.ico'), [System.IO.FileMode]::Create)
$w = New-Object System.IO.BinaryWriter($ico)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $w.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))   # 0 means 256
  $w.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
  $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$blobs[$i].Length)
  $w.Write([uint32]$offset)
  $offset += $blobs[$i].Length
}
foreach ($b in $blobs) { $w.Write($b) }
$w.Flush(); $w.Dispose(); $ico.Dispose()

Write-Output "icons written to $dir"
