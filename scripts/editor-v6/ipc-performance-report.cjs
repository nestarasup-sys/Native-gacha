const IPC_PERFORMANCE_JSON_PREFIX = '[GV5_IPC_PERF_JSON] '

function parseIpcPerformanceReport(processOutput) {
  const line = String(processOutput)
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(IPC_PERFORMANCE_JSON_PREFIX))

  if (!line) return { status: 'missing', metrics: [] }

  const metrics = JSON.parse(line.slice(IPC_PERFORMANCE_JSON_PREFIX.length))
  if (!Array.isArray(metrics) || !metrics.every(isMetricRow)) {
    throw new TypeError('O snapshot IPC não corresponde ao contrato de métricas esperado.')
  }

  return { status: 'captured', metrics }
}

function isMetricRow(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.channel === 'string'
    && Number.isInteger(value.calls)
    && value.calls >= 0
    && Number.isInteger(value.failures)
    && value.failures >= 0
    && value.failures <= value.calls
    && Number.isFinite(value.averageMs)
    && value.averageMs >= 0
    && Number.isFinite(value.worstMs)
    && value.worstMs >= 0
}

module.exports = { parseIpcPerformanceReport }
