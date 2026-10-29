$ErrorActionPreference = 'Stop'

$runs = @(
  @{ Memo = 'on'; Label = 'A1' },
  @{ Memo = 'off'; Label = 'B1' },
  @{ Memo = 'off'; Label = 'B2' },
  @{ Memo = 'on'; Label = 'A2' },
  @{ Memo = 'on'; Label = 'A3' },
  @{ Memo = 'off'; Label = 'B3' }
)

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$PID-$([guid]::NewGuid().ToString('N'))"
$evidenceRoot = Join-Path $workspace "out\editor-v6-stress\ab-memo\runs\$runId"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $evidenceRoot) | Out-Null
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$env:GACHA_EDITOR_V6_STRESS_OUTPUT_ROOT = $evidenceRoot
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion
$hostInfo = [pscustomobject]@{
  os = "$($os.Caption) $($os.Version)"
  cpu = $cpu.Name
  logicalProcessors = $cpu.NumberOfLogicalProcessors
  ramGB = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)
  gpus = @($gpu)
}
$json = $hostInfo | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $evidenceRoot 'environment.json'), $json, [System.Text.UTF8Encoding]::new($false))

foreach ($run in $runs) {
  Write-Host "Editor V6 memo A/B: $($run.Label), memo $($run.Memo), cenário pesado, 30 s"
  & npm run test:editor-v6:stress-offscreen -- --scenario=heavy "--memo=$($run.Memo)" "--label=$($run.Label)"
  if ($LASTEXITCODE -ne 0) { throw "A rodada $($run.Label) falhou com código $LASTEXITCODE." }
}

$env:GACHA_EDITOR_V6_STRESS_AB_INPUT_ROOT = Join-Path $evidenceRoot 'ab-memo'
$env:GACHA_EDITOR_V6_STRESS_AB_OUTPUT_ROOT = Join-Path $evidenceRoot 'analysis'
Write-Host "Analisando relatórios sintéticos em $env:GACHA_EDITOR_V6_STRESS_AB_INPUT_ROOT"
& npm run editor-v6:analyze-memo-ab
if ($LASTEXITCODE -ne 0) { throw "A análise A/B falhou com código $LASTEXITCODE." }
Write-Host "Evidências desta comparação: $evidenceRoot"
