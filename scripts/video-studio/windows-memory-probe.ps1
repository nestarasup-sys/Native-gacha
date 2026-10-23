# Windows-only, opt-in diagnosis. No command lines, documents, filenames or media are logged.
# Example: .\scripts\video-studio\windows-memory-probe.ps1 -RootPid 12345 -Samples 120 -IntervalSeconds 1 -CsvPath $env:TEMP\video-studio-memory.csv
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$RootPid,
  [ValidateRange(1, 3600)][int]$Samples = 60,
  [ValidateRange(1, 60)][int]$IntervalSeconds = 1,
  [string]$CsvPath = ''
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
  throw 'This probe is only supported on Windows.'
}
function Get-ProcessTreeIds([int]$MainId) {
  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($MainId)
  $queue = [System.Collections.Generic.Queue[int]]::new()
  $queue.Enqueue($MainId)
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    foreach ($candidate in $processes) {
      if ([int]$candidate.ParentProcessId -eq $parent) {
        $id = [int]$candidate.ProcessId
        if ($ids.Add($id)) { $queue.Enqueue($id) }
      }
    }
  }
  return $processes | Where-Object { $ids.Contains([int]$_.ProcessId) }
}
$results = [System.Collections.Generic.List[object]]::new()
for ($sample = 0; $sample -lt $Samples; $sample++) {
  $now = (Get-Date).ToUniversalTime().ToString('o')
  foreach ($item in @(Get-ProcessTreeIds $RootPid)) {
    try {
      $process = Get-Process -Id ([int]$item.ProcessId) -ErrorAction Stop
      $results.Add([pscustomobject]@{
        Utc = $now
        Sample = $sample
        ParentPid = [int]$item.ParentProcessId
        Pid = [int]$item.ProcessId
        ProcessName = [string]$item.Name
        WorkingSetBytes = [long]$process.WorkingSet64
        PrivateBytes = [long]$process.PrivateMemorySize64
        VirtualBytes = [long]$process.VirtualMemorySize64
        Handles = [int]$process.HandleCount
      })
    } catch {
      # Process exited during sampling, not a fatal error.
    }
  }
  if ($sample -lt $Samples - 1) { Start-Sleep -Seconds $IntervalSeconds }
}
if ($CsvPath) {
  $parent = Split-Path -Parent $CsvPath
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    throw 'CSV destination directory does not exist.'
  }
  $results | Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8
  Write-Host ('Saved {0} process samples to {1}' -f $results.Count, $CsvPath)
} else {
  $results
}
# NOTE: Chromium GPU dedicated-memory consumption is not included. GPU VRAM
# and allocated decoder surfaces need Windows GPUView/WPR/WPA correlation.
# Shared working sets overlap and must not be treated as exclusive physical RAM.
