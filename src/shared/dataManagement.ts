export type DataStorageGroupSummary = { files: number; bytes: number; unreadable: number }

export type DataStorageSummary = {
  disk: { measuredAt: string; groups: Record<string, DataStorageGroupSummary> }
  catalog: {
    assets: number
    archivedAssets: number
    uniqueObjects: number
    referencedObjects: number
    objectBytes: number
    unreferencedObjects: number
  }
}

export type DataMigrationDomainSummary = {
  domainId: string
  state: string
  fileCount: number
  directoryCount: number
  byteLength: number
  inventorySha256: string | null
}

export type DataMigrationSummary = {
  domains: DataMigrationDomainSummary[]
  availableBytes: number
  estimatedRequiredBytes: number
  hasEnoughSpace: boolean
}

export type DataMigrationOutcome = { domainId: string; state: string; fileCount: number; byteLength: number }
export type DataMigrationResult = { outcomes: DataMigrationOutcome[]; paused: boolean; summary: DataMigrationSummary }
export type DataMigrationPauseResult = { paused: boolean }
export type DataMigrationProgress = {
  domainId: string
  completedFiles: number
  totalFiles: number
  completedBytes: number
  totalBytes: number
}

export type DataBackupSummary = {
  id: string
  createdAt: string
  fileCount: number
  byteLength: number
  verifiedAt: string | null
}

export type DataBackupVerification = {
  id: string
  valid: boolean
  fileCount: number
  byteLength: number
  createdAt: string
  verifiedAt: string
  databaseSchema: number
}

export type DataBackupRestoreResult = {
  cancelled?: boolean
  safetyBackupId?: string
  restoreId?: string
  backupId?: string
  fileCount?: number
  byteLength?: number
}

export type DataBackupDeleteResult = { deleted: boolean }

export const DIAGNOSTIC_DOMAINS = [
  'electron', 'storage', 'fabricator', 'customizer', 'studio', 'editor-v6', 'roteiros', 'base-videos', 'media-library', 'ui'
] as const

export type DiagnosticDomain = typeof DIAGNOSTIC_DOMAINS[number]
export const DIAGNOSTIC_RESULTS = ['started', 'success', 'failure', 'cancelled'] as const
export type DiagnosticResult = typeof DIAGNOSTIC_RESULTS[number]
export const MAX_DIAGNOSTIC_EVENT_MESSAGE_CHARS = 16_384

export type LocalDiagnosticEventInput = {
  severity: 'error' | 'warning' | 'info'
  code: string
  route?: string
  message: string
  domain?: DiagnosticDomain
  operation?: string
  stage?: string
  result?: DiagnosticResult
  durationMs?: number
  correlationId?: string
}

export type LocalDiagnosticEvent = LocalDiagnosticEventInput & {
  id: string
  at: string
  source: 'renderer' | 'main'
}

export type RuntimeProcessMetric = {
  pid: number
  kind: 'main' | 'renderer' | 'auxiliary' | 'other'
  type: string
  label: string
  cpuPercent: number | null
  workingSetBytes: number | null
  peakWorkingSetBytes: number | null
  privateBytes: number | null
}

export type RuntimeDiagnosticsSnapshot = {
  measuredAt: string
  appVersion: string
  electronVersion: string
  chromiumVersion: string
  nodeVersion: string
  platform: string
  architecture: string
  uptimeSeconds: number
  processMetrics: {
    sampleIntervalMs: number | null
    processes: RuntimeProcessMetric[]
  }
  memory: {
    mainRssBytes: number
    mainHeapUsedBytes: number
    mainExternalBytes: number
    rendererWorkingSetBytes: number | null
    rendererPeakWorkingSetBytes: number | null
    rendererPrivateBytes: number | null
    rendererSharedBytes: number | null
  }
}

export type DiagnosticsReportSaveResult = { saved: boolean; fileName?: string }
export type DiagnosticEventExportResult = { saved: boolean; fileName?: string; eventCount: number }
export type IpcPerformanceRow = {
  channel: string
  calls: number
  failures: number
  averageMs: number
  worstMs: number
}
export type IpcPerformanceDiagnosticsSnapshot = {
  enabled: boolean
  startedAt: string | null
  durationMs: number
  maxDurationMs: number
  rows: IpcPerformanceRow[]
}
export type DiagnosticsQuickCheckId = 'runtime' | 'events' | 'backups'
export type DiagnosticsQuickCheckResult = {
  id: DiagnosticsQuickCheckId
  status: 'passed' | 'failed'
  durationMs: number
  itemsChecked: number
}
export type DiagnosticsQuickCheckSnapshot = {
  startedAt: string
  completedAt: string
  cancelled: boolean
  results: DiagnosticsQuickCheckResult[]
}

export type DataManagementDesktopApi = {
  getAppDataStorageSummary: () => Promise<DataStorageSummary>
  listLocalDiagnosticEvents: () => Promise<LocalDiagnosticEvent[]>
  recordLocalDiagnosticEvent: (event: LocalDiagnosticEventInput) => Promise<void>
  getRuntimeDiagnostics: () => Promise<RuntimeDiagnosticsSnapshot>
  saveDiagnosticsReport: (quickChecks?: DiagnosticsQuickCheckSnapshot) => Promise<DiagnosticsReportSaveResult>
  exportLocalDiagnosticEvents: (eventIds: string[]) => Promise<DiagnosticEventExportResult>
  getIpcPerformanceSnapshot: () => Promise<IpcPerformanceDiagnosticsSnapshot>
  setIpcPerformanceCollection: (enabled: boolean) => Promise<IpcPerformanceDiagnosticsSnapshot>
  getDataMigrationSummary: () => Promise<DataMigrationSummary>
  runDataMigration: () => Promise<DataMigrationResult>
  pauseDataMigration: () => Promise<DataMigrationPauseResult>
  restartAfterDataMigration: () => Promise<void>
  onDataMigrationProgress: (callback: (progress: DataMigrationProgress) => void) => () => void
  listDataBackups: () => Promise<DataBackupSummary[]>
  createDataBackup: () => Promise<DataBackupVerification>
  verifyDataBackup: (id: string) => Promise<DataBackupVerification>
  restoreDataBackup: (id: string) => Promise<DataBackupRestoreResult>
  deleteDataBackup: (id: string) => Promise<DataBackupDeleteResult>
}
