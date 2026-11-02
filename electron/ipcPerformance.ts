import { createIpcPerformanceCollector } from './application/ipcPerformanceCollector'

/** No payloads, paths, IDs or names. Disabled by default; Logs Dev can opt in for at most five minutes. */
const collector = createIpcPerformanceCollector({ initiallyEnabled: process.env.GV5_IPC_PERF === '1' })

export function measureIpc<T>(label: string, action: () => Promise<T> | T): Promise<T> | T {
  if (!collector.isEnabled()) return action()
  return collector.measure(label, action)
}

export function getIpcPerformanceSnapshot() {
  return collector.snapshot()
}

export function setIpcPerformanceCollectionEnabled(enabled: boolean) {
  return collector.setEnabled(enabled)
}

if (process.env.GV5_IPC_PERF === '1') process.on('exit', () => {
  const snapshot = collector.snapshot()
  console.log(`[GV5_IPC_PERF_JSON] ${JSON.stringify(snapshot.rows)}`)
  console.table(snapshot.rows)
})
