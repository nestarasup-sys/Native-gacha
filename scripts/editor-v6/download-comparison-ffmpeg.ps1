$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$releaseTag = 'autobuild-2026-11-14-12-37'
$assetName = 'ffmpeg-n9.0.2-57-gd838f9f9ae-win64-lgpl-9.0.zip'
$expectedSha256 = '0c229f788a2e33a62ca4ea41d509028aa42df051c27b93a166155d7534db8271'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$toolRoot = Join-Path $repoRoot 'out\editor-v6-stress\tools\ffmpeg-n9.0.2-lgpl'
$archive = Join-Path $toolRoot $assetName
$extractRoot = Join-Path $toolRoot 'unpacked'
$downloadUrl = "https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/$releaseTag/$assetName"

New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archive
}
$actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) {
  throw "SHA-256 da build de comparação não corresponde à release assinada pelo manifesto: $actualSha256"
}

if (-not (Test-Path -LiteralPath $extractRoot)) {
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot
}
$bin = Join-Path $extractRoot 'ffmpeg-n9.0.2-57-gd838f9f9ae-win64-lgpl-9.0\bin'
foreach ($name in @('ffmpeg.exe', 'ffprobe.exe')) {
  $path = Join-Path $bin $name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Executável ausente na build verificada: $name" }
}
& (Join-Path $bin 'ffmpeg.exe') -hide_banner -version | Select-Object -First 1
& (Join-Path $bin 'ffmpeg.exe') -hide_banner -encoders 2>$null | Select-String '\blibopenh264\b|\bh264_amf\b|\bh264_mf\b'
[pscustomobject]@{ Directory=$bin; ArchiveSha256=$actualSha256; Release=$releaseTag; License='LGPL-3.0-or-later' } | ConvertTo-Json -Compress
