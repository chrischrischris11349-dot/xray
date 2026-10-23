# Authored geometric artwork; no downloaded images or runtime dependency.
Add-Type -AssemblyName System.Drawing
$taskArtRoot = Join-Path $PSScriptRoot '..\src-tauri\windows'
function New-XRayArt([int]$Width, [int]$Height, [string]$Name, [bool]$Sidebar) {
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
  $canvas = [System.Drawing.Graphics]::FromImage($bitmap)
  $canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, [System.Drawing.Color]::FromArgb(36,38,41), [System.Drawing.Color]::FromArgb(10,11,13), 60)
  $canvas.FillRectangle($gradient, $rect)
  $silver = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(233,235,239))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(154,160,170))
  $line = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(42,255,255,255), 1)
  if ($Sidebar) {
    for ($i = 0; $i -lt 6; $i++) { $canvas.DrawEllipse($line, -80-$i*12, 145-$i*8, 270+$i*24, 270+$i*24) }
    $markX=22; $markY=38; $markSize=48
  } else { $markX=101; $markY=11; $markSize=34 }
  $canvas.FillRectangle($silver, $markX, $markY, $markSize, $markSize)
  $cross = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(20,22,25), 3)
  $cross.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $cross.EndCap = $cross.StartCap
  $a = [single]($markSize*0.31); $b = [single]($markSize*0.69)
  $canvas.DrawLine($cross, [single]($markX+$a), [single]($markY+$a), [single]($markX+$b), [single]($markY+$b))
  $canvas.DrawLine($cross, [single]($markX+$b), [single]($markY+$a), [single]($markX+$a), [single]($markY+$b))
  $font = [System.Drawing.Font]::new('Segoe UI', $(if ($Sidebar) { 24 } else { 15 }), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $small = [System.Drawing.Font]::new('Segoe UI', 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  if ($Sidebar) { $canvas.DrawString('XRay', $font, $silver, 19, 101); $canvas.DrawString("YOUR WORKSPACE`nYOUR WAY", $small, $muted, 21, 142); $canvas.DrawString('DESKTOP / 0.4', $small, $muted, 21, 278) }
  else { $canvas.DrawString('XRay', $font, $silver, 40, 17) }
  $bitmap.Save((Join-Path $taskArtRoot $Name), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $small.Dispose(); $font.Dispose(); $cross.Dispose(); $line.Dispose(); $muted.Dispose(); $silver.Dispose(); $gradient.Dispose(); $canvas.Dispose(); $bitmap.Dispose()
}
New-XRayArt 150 57 'header.bmp' $false
New-XRayArt 164 314 'sidebar.bmp' $true
