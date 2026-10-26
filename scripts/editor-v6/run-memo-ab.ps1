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
$evidenceRoot = Join-Path $workspace 'out\editor-v6-stress\ab-memo'
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
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
