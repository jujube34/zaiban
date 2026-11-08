Add-Type -AssemblyName System.Drawing

$publicDir = Join-Path $PSScriptRoot '..\public'
$publicDir = [System.IO.Path]::GetFullPath($publicDir)

function New-RoundedPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-MarkImage {
  param(
    [int]$Size = 1024,
    [bool]$Maskable = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($Maskable) {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f4f1e9'))
    $margin = [int]($Size * 0.15)
    $markSize = $Size - ($margin * 2)
    $radius = [int]($markSize * 0.235)
    $path = New-RoundedPath -X $margin -Y $margin -Width $markSize -Height $markSize -Radius $radius
    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#21483c'))
    $graphics.FillPath($green, $path)
    $offsetX = $margin
    $offsetY = $margin
    $scale = $markSize / 1024.0
  } else {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $margin = [int]($Size * 0.025)
    $markSize = $Size - ($margin * 2)
    $radius = [int]($markSize * 0.235)
    $path = New-RoundedPath -X $margin -Y $margin -Width $markSize -Height $markSize -Radius $radius
    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#21483c'))
    $graphics.FillPath($green, $path)
    $offsetX = $margin
    $offsetY = $margin
    $scale = $markSize / 1024.0
  }

  $cream = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#f7f3e8')), ([float](58 * $scale))
  $cream.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $cream.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $graphics.DrawLine(
    $cream,
    [float]($offsetX + 298 * $scale),
    [float]($offsetY + 377 * $scale),
    [float]($offsetX + 548 * $scale),
    [float]($offsetY + 377 * $scale)
  )
  $graphics.DrawLine(
    $cream,
    [float]($offsetX + 298 * $scale),
    [float]($offsetY + 512 * $scale),
    [float]($offsetX + 748 * $scale),
    [float]($offsetY + 512 * $scale)
  )
  $graphics.DrawLine(
    $cream,
    [float]($offsetX + 298 * $scale),
    [float]($offsetY + 647 * $scale),
    [float]($offsetX + 600 * $scale),
    [float]($offsetY + 647 * $scale)
  )

  $orange = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#d28a5b'))
  $dot = [float](64 * $scale)
  $graphics.FillEllipse(
    $orange,
    [float]($offsetX + 744 * $scale - $dot / 2),
    [float]($offsetY + 360 * $scale - $dot / 2),
    $dot,
    $dot
  )

  $graphics.Dispose()
  return $bitmap
}

function Save-Resized {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Size,
    [string]$Name
  )
  $target = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($Source, 0, 0, $Size, $Size)
  $graphics.Dispose()
  $target.Save((Join-Path $publicDir $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $target.Dispose()
}

$master = New-MarkImage -Size 1024 -Maskable $false
Save-Resized -Source $master -Size 512 -Name 'pwa-512x512.png'
Save-Resized -Source $master -Size 192 -Name 'pwa-192x192.png'
Save-Resized -Source $master -Size 180 -Name 'apple-touch-icon.png'
$master.Dispose()

$maskable = New-MarkImage -Size 1024 -Maskable $true
Save-Resized -Source $maskable -Size 512 -Name 'maskable-icon-512x512.png'
$maskable.Dispose()

Write-Output 'Icons generated.'
