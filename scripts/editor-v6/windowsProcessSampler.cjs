const { spawn } = require('node:child_process')

function createWindowsProcessSampler(scriptPath) {
  if (process.platform !== 'win32') throw new Error('O perfil de processos requer Windows/Get-Process.')
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let stdout = '', stderr = '', sampleId = 0
  const pending = new Map()
  const lastCpu = new Map()

  child.stdout.on('data', (chunk) => {
    stdout += chunk
    for (;;) {
      const newline = stdout.indexOf('\n')
      if (newline < 0) break
      const line = stdout.slice(0, newline).trim()
      stdout = stdout.slice(newline + 1)
      if (!line) continue
      let result
      try { result = JSON.parse(line) } catch { continue }
      const request = pending.get(result.sampleId)
      if (!request) continue
      pending.delete(result.sampleId)
      clearTimeout(request.timeout)
      const now = Date.parse(result.sampledAt)
      result.processes = (result.processes ?? []).map((item) => {
        const prior = lastCpu.get(item.pid)
        const elapsedMs = prior ? Math.max(1, now - prior.at) : null
        const cpuPercentSincePreviousSample = prior && Number.isFinite(item.cpuSeconds)
          ? Math.max(0, (item.cpuSeconds - prior.cpuSeconds) * 100000 / elapsedMs)
          : null
        if (Number.isFinite(item.cpuSeconds)) lastCpu.set(item.pid, { at: now, cpuSeconds: item.cpuSeconds })
        return { ...item, cpuPercentSincePreviousSample }
      })
      request.resolve(result)
    }
  })
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192) })
  child.on('exit', (code) => {
    const error = new Error(`O amostrador PowerShell encerrou (${code}): ${stderr.slice(-2000)}`)
    for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(error) }
    pending.clear()
  })

  return {
    sample(processes, frame) {
      if (child.exitCode !== null || child.killed) return Promise.reject(new Error('O amostrador de processos não está ativo.'))
      const id = ++sampleId
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`A amostragem de memória do sistema excedeu 5 segundos (quadro ${frame}).`))
        }, 5000)
        pending.set(id, { resolve, reject, timeout })
        child.stdin.write(`${JSON.stringify({ sampleId: id, frame, processes })}\n`, (error) => {
          if (!error) return
          pending.delete(id); clearTimeout(timeout); reject(error)
        })
      })
    },
    async close() {
      child.stdin.end()
      if (child.exitCode !== null) return
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(() => { child.kill(); resolve() }, 2000))
      ])
    }
  }
}

module.exports = { createWindowsProcessSampler }
