[CmdletBinding()]
param(
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path 'app-data\\stress-media'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path 'app-data\\stress-media'))
if ($OutputDirectory -ne $expectedRoot) {
  throw 'A mídia sintética deve ficar em app-data/stress-media do repositório.'
}

$ffmpegCommand = Get-Command ffmpeg.exe -ErrorAction Stop
$ffprobeCommand = Get-Command ffprobe.exe -ErrorAction Stop
if (Test-Path -LiteralPath $OutputDirectory) {
  $directory = Get-Item -LiteralPath $OutputDirectory -Force
  if (($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'A pasta de mídia não pode ser um link ou junction.'
  }
} else {
  [void](New-Item -ItemType Directory -Path $OutputDirectory)
}

$files = @(
  @{ Name = 'synthetic-moving-24fps-audio440hz.mp4'; Rate = '24'; Size = '640x360'; Duration = 8; Tone = 440 },
  @{ Name = 'synthetic-moving-30fps-audio660hz.mp4'; Rate = '30'; Size = '480x270'; Duration = 7; Tone = 660 }
)
foreach ($file in $files) {
  $path = Join-Path $OutputDirectory $file.Name
  if (Test-Path -LiteralPath $path) {
    throw "O arquivo já existe e será preservado: $($file.Name)"
  }
  & $ffmpegCommand.Source -n -hide_banner -loglevel error `
    -f lavfi -i "testsrc2=size=$($file.Size):rate=$($file.Rate):duration=$($file.Duration)" `
    -f lavfi -i "sine=frequency=$($file.Tone):sample_rate=44100:duration=$($file.Duration)" `
    -shortest -c:v libx264 -preset veryfast -crf 29 -pix_fmt yuv420p `
    -c:a aac -b:a 96k -movflags +faststart $path
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg falhou ao criar $($file.Name)." }
  $probe = & $ffprobeCommand.Source -v error -count_frames -show_entries format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames -of json $path
  if ($LASTEXITCODE -ne 0) { throw "FFprobe falhou ao validar $($file.Name)." }
  $metadata = $probe | ConvertFrom-Json
  $video = @($metadata.streams | Where-Object { $_.codec_type -eq 'video' })[0]
  $audio = @($metadata.streams | Where-Object { $_.codec_type -eq 'audio' })[0]
  $expectedWidth = [int]($file.Size.Split('x')[0])
  $expectedHeight = [int]($file.Size.Split('x')[1])
  $expectedFrames = $file.Duration * [int]$file.Rate - 1
  if (-not $video -or -not $audio -or $video.avg_frame_rate -ne "$($file.Rate)/1" -or [int]$video.width -ne $expectedWidth -or [int]$video.height -ne $expectedHeight -or [int]$video.nb_read_frames -lt $expectedFrames) {
    throw "FFprobe identificou mídia incompleta ou com propriedades inesperadas: $($file.Name)"
  }
  [pscustomobject]@{
    name = $file.Name
    path = $path
    sizeBytes = (Get-Item -LiteralPath $path).Length
    durationSeconds = [double]$metadata.format.duration
    frameRate = $video.avg_frame_rate
    videoFrames = [int]$video.nb_read_frames
    resolution = "$($video.width)x$($video.height)"
    videoCodec = $video.codec_name
    audioCodec = $audio.codec_name
    source = 'FFmpeg lavfi testsrc2 motion + sine tone; generated locally'
  }
}
