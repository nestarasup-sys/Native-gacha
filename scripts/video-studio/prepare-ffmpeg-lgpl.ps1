param(
  [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$resourcesPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'resources'))
$manifestPath = Join-Path $resourcesPath 'video-tools.manifest.json'
$destination = Join-Path $resourcesPath 'video-tools'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if ($manifest.schemaVersion -ne 1 -or $manifest.provider -ne 'BtbN/FFmpeg-Builds') {
  throw 'Manifesto de ferramentas de vídeo desconhecido.'
}
if ($manifest.variant -ne 'lgpl' -or $manifest.license -ne 'LGPL-2.1-or-later') {
  throw 'Este instalador aceita somente o pacote LGPL definido pelo projeto.'
}
if ($manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
  throw 'O manifesto não contém um SHA-256 válido.'
}
$downloadUri = [Uri]$manifest.url
if ($downloadUri.Scheme -ne 'https' -or $downloadUri.Host -ne 'github.com') {
  throw 'A URL do pacote precisa usar HTTPS e o host oficial github.com.'
}

if (Test-Path -LiteralPath $destination) {
  $buildInfoPath = Join-Path $destination 'BUILD_INFO.json'
  $ffmpegPath = Join-Path $destination 'ffmpeg.exe'
  $ffprobePath = Join-Path $destination 'ffprobe.exe'
  $requiredFiles = @('ffmpeg.exe', 'ffprobe.exe', 'FFMPEG_LICENSE.txt', 'BUILD_INFO.json', 'SOURCE_INFO.txt')
  $complete = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $destination $_) -PathType Leaf) }).Count -eq 0
  if ($complete) {
    $installedInfo = Get-Content -LiteralPath $buildInfoPath -Raw | ConvertFrom-Json
    if ($installedInfo.sha256 -eq $manifest.sha256) {
      $installedFfmpegVersion = @(& $ffmpegPath -version 2>&1)
      $ffmpegExitCode = $LASTEXITCODE
      $installedFfprobeVersion = @(& $ffprobePath -version 2>&1)
      $ffprobeExitCode = $LASTEXITCODE
      $validInstall = ($ffmpegExitCode -eq 0) -and ($ffprobeExitCode -eq 0) -and ([string]$installedFfmpegVersion[0] -eq [string]$installedInfo.ffmpegVersion) -and ([string]$installedFfprobeVersion[0] -eq [string]$installedInfo.ffprobeVersion)
      if ($validInstall) {
        Write-Output 'FFmpeg/FFprobe deste manifesto já estão preparados.'
        exit 0
      }
    }
  }
  throw 'A pasta resources/video-tools já existe, mas não corresponde a este manifesto. Ela foi preservada; revise-a antes de tentar novamente.'
}

$runId = [Guid]::NewGuid().ToString('N')
$stagePath = Join-Path $resourcesPath ('.video-tools-staging-' + $runId)
$ownsWorkDirectory = [string]::IsNullOrWhiteSpace($ArchivePath)
$workPath = $null
$archive = $null

if ($ownsWorkDirectory) {
  $workPath = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ('native-gacha-ffmpeg-' + $runId)))
  $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $workPath.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'O diretório temporário saiu da pasta Temp do sistema.'
  }
  if (Test-Path -LiteralPath $workPath) {
    throw 'O diretório temporário já existe; nenhum arquivo foi sobrescrito.'
  }
} else {
  if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    throw 'O arquivo ZIP informado não foi encontrado.'
  }
  $archive = (Resolve-Path -LiteralPath $ArchivePath).Path
  if ([System.IO.Path]::GetFileName($archive) -ne $manifest.assetName) {
    throw 'O nome do arquivo ZIP não corresponde ao manifesto.'
  }
}

$resourcesPrefix = $resourcesPath.TrimEnd('\') + '\'
try {
  New-Item -ItemType Directory -Path $stagePath | Out-Null
  if ($ownsWorkDirectory) {
    New-Item -ItemType Directory -Path $workPath | Out-Null
    $archive = Join-Path $workPath $manifest.assetName
    Invoke-WebRequest -Uri $downloadUri -OutFile $archive
  }

  $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $manifest.sha256.ToLowerInvariant()) {
    throw 'SHA-256 divergente. O pacote não foi instalado.'
  }

  $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $ffmpegEntries = @($zip.Entries | Where-Object { $_.FullName -match '(?i)(^|/)bin/ffmpeg\.exe$' })
    $ffprobeEntries = @($zip.Entries | Where-Object { $_.FullName -match '(?i)(^|/)bin/ffprobe\.exe$' })
    $licenseEntries = @($zip.Entries | Where-Object { $_.FullName -match '(?i)(^|/)LICENSE\.txt$' })
    if ($ffmpegEntries.Count -ne 1 -or $ffprobeEntries.Count -ne 1 -or $licenseEntries.Count -ne 1) {
      throw 'O ZIP não contém exatamente os dois executáveis e a licença esperados.'
    }

    function Copy-ZipEntry([System.IO.Compression.ZipArchiveEntry]$Entry, [string]$Path) {
      $inputStream = $Entry.Open()
      try {
        $outputStream = [System.IO.File]::Create($Path)
        try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
      } finally {
        $inputStream.Dispose()
      }
    }

    $stageFfmpeg = Join-Path $stagePath 'ffmpeg.exe'
    $stageFfprobe = Join-Path $stagePath 'ffprobe.exe'
    Copy-ZipEntry $ffmpegEntries[0] $stageFfmpeg
    Copy-ZipEntry $ffprobeEntries[0] $stageFfprobe
    Copy-ZipEntry $licenseEntries[0] (Join-Path $stagePath 'FFMPEG_LICENSE.txt')
  } finally {
    $zip.Dispose()
  }

  foreach ($executable in @($stageFfmpeg, $stageFfprobe)) {
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf) -or (Get-Item -LiteralPath $executable).Length -lt 1MB) {
      throw 'Um dos executáveis extraídos está ausente ou incompleto.'
    }
  }

  $ffmpegVersionLines = @(& $stageFfmpeg -version 2>&1)
  $ffmpegExitCode = $LASTEXITCODE
  if ($ffmpegExitCode -ne 0 -or $ffmpegVersionLines.Count -eq 0) {
    throw 'O ffmpeg.exe não iniciou corretamente.'
  }
  $ffprobeVersionLines = @(& $stageFfprobe -version 2>&1)
  $ffprobeExitCode = $LASTEXITCODE
  if ($ffprobeExitCode -ne 0 -or $ffprobeVersionLines.Count -eq 0) {
    throw 'O ffprobe.exe não iniciou corretamente.'
  }

  $encoderOutput = (& $stageFfmpeg -hide_banner -encoders 2>&1 | Out-String)
  $encoderExitCode = $LASTEXITCODE
  if ($encoderExitCode -ne 0) {
    throw 'Não foi possível listar os codificadores do FFmpeg.'
  }
  foreach ($encoder in $manifest.requiredEncoders) {
    if ($encoderOutput -notmatch ('\b' + [Regex]::Escape($encoder) + '\b')) {
      throw ('O build não contém o codificador obrigatório ' + $encoder + '.')
    }
  }
  $hasH264Encoder = $false
  foreach ($encoder in $manifest.acceptedH264Encoders) {
    if ($encoderOutput -match ('\b' + [Regex]::Escape($encoder) + '\b')) { $hasH264Encoder = $true }
  }
  if (-not $hasH264Encoder) {
    throw 'O build não contém nenhum codificador H.264 aceito pelo Editor V6.'
  }

  $buildInfo = [ordered]@{
    schemaVersion = 1
    provider = $manifest.provider
    releaseTag = $manifest.releaseTag
    assetName = $manifest.assetName
    sha256 = $actualHash
    platform = $manifest.platform
    variant = $manifest.variant
    license = $manifest.license
    ffmpegVersion = [string]$ffmpegVersionLines[0]
    ffprobeVersion = [string]$ffprobeVersionLines[0]
    preparedAtUtc = [DateTime]::UtcNow.ToString('o')
  }
  $json = $buildInfo | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText((Join-Path $stagePath 'BUILD_INFO.json'), $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

  $sourceInfo = @(
    'Provider: ' + $manifest.provider
    'Release: ' + $manifest.releaseTag
    'Asset: ' + $manifest.assetName
    'SHA-256: ' + $actualHash
    'Source: ' + $manifest.url
    'License: ' + $manifest.license
    'License details: ' + $manifest.ffmpegLegal
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText((Join-Path $stagePath 'SOURCE_INFO.txt'), $sourceInfo + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

  if (Test-Path -LiteralPath $destination) {
    throw 'A pasta de ferramentas apareceu durante a instalação; nenhum conteúdo existente foi substituído.'
  }
  Move-Item -LiteralPath $stagePath -Destination $destination
  Write-Output ('FFmpeg/FFprobe preparados em ' + $destination)
  Write-Output ('Build verificado: ' + [string]$ffmpegVersionLines[0])
} finally {
  $resolvedStage = [System.IO.Path]::GetFullPath($stagePath)
  if ((Test-Path -LiteralPath $resolvedStage) -and $resolvedStage.StartsWith($resourcesPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage) -match '^\.video-tools-staging-[0-9a-f]{32}$') {
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
  if ($ownsWorkDirectory -and $workPath) {
    $resolvedWork = [System.IO.Path]::GetFullPath($workPath)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ((Test-Path -LiteralPath $resolvedWork) -and $resolvedWork.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedWork) -match '^native-gacha-ffmpeg-[0-9a-f]{32}$') {
      Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
  }
}
