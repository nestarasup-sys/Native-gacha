import type {
  DataBackupSummary, DiagnosticsQuickCheckId, DiagnosticsQuickCheckResult, DiagnosticsQuickCheckSnapshot,
  LocalDiagnosticEvent, RuntimeDiagnosticsSnapshot
} from '../../../../shared/dataManagement'

type QuickCheckDependencies = {
  getRuntimeDiagnostics: () => Promise<RuntimeDiagnosticsSnapshot>
  listLocalDiagnosticEvents: () => Promise<LocalDiagnosticEvent[]>
  listDataBackups: () => Promise<DataBackupSummary[]>
  now?: () => number
  nowIso?: () => string
}

function nonNegativeDuration(startedAt: number, now: () => number): number {
  const elapsed = now() - startedAt
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(300_000, Math.round(elapsed))) : 0
}

/** Runs brief local reads in order, stopping before the next IPC when cancelled. */
export async function runLogsDevQuickChecks(
  dependencies: QuickCheckDependencies,
  signal: AbortSignal
): Promise<DiagnosticsQuickCheckSnapshot> {
  const now = dependencies.now ?? (() => performance.now())
  const nowIso = dependencies.nowIso ?? (() => new Date().toISOString())
  const startedAt = nowIso()
  const results: DiagnosticsQuickCheckResult[] = []

  async function run<T>(
    id: DiagnosticsQuickCheckId,
    operation: () => Promise<T>,
    countItems: (value: T) => number
  ): Promise<void> {
    if (signal.aborted) return
    const began = now()
    let status: DiagnosticsQuickCheckResult['status'] = 'failed'
    let itemsChecked = 0
    try {
      const value = await operation()
      itemsChecked = countItems(value)
      status = 'passed'
    } catch {
      // Error text can include local paths; the check stores only its status and duration.
    }
    results.push({ id, status, durationMs: nonNegativeDuration(began, now), itemsChecked })
  }

  await run('runtime', dependencies.getRuntimeDiagnostics, (runtime) => {
    if (!runtime || !runtime.measuredAt || !runtime.appVersion || !Array.isArray(runtime.processMetrics?.processes)) {
      throw new Error('Runtime diagnostics contract did not match.')
    }
    return runtime.processMetrics.processes.length
  })
  await run('events', dependencies.listLocalDiagnosticEvents, (events) => {
    if (!Array.isArray(events)) throw new Error('Event list contract did not match.')
    return events.length
  })
  await run('backups', dependencies.listDataBackups, (backups) => {
    if (!Array.isArray(backups)) throw new Error('Backup list contract did not match.')
    return backups.length
  })

  return { startedAt, completedAt: nowIso(), cancelled: signal.aborted, results }
}
