while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $request = ConvertFrom-Json -InputObject $line
    $processes = @(
      foreach ($target in $request.processes) {
        try {
          $process = Get-Process -Id ([int]$target.pid) -ErrorAction Stop
          [PSCustomObject]@{
            pid = [int]$process.Id
            role = [string]$target.role
            name = [string]$process.ProcessName
            workingSetBytes = [long]$process.WorkingSet64
            privateBytes = [long]$process.PrivateMemorySize64
            cpuSeconds = if ($null -eq $process.CPU) { $null } else { [double]$process.CPU }
          }
        } catch { }
      }
    )
    $response = [PSCustomObject]@{
      sampleId = [int]$request.sampleId
      frame = [int]$request.frame
      sampledAt = [DateTime]::UtcNow.ToString('o')
      processes = $processes
    }
    [Console]::Out.WriteLine(($response | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    [Console]::Error.Flush()
  }
}
