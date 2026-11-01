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

export type LocalDiagnosticEventInput = {
  severity: 'error' | 'warning' | 'info'
  code: string
  route?: string
  message: string
}

export type LocalDiagnosticEvent = LocalDiagnosticEventInput & {
  id: string
  at: string
  source: 'renderer' | 'main'
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

export type DataManagementDesktopApi = {
  getAppDataStorageSummary: () => Promise<DataStorageSummary>
  listLocalDiagnosticEvents: () => Promise<LocalDiagnosticEvent[]>
  recordLocalDiagnosticEvent: (event: LocalDiagnosticEventInput) => Promise<void>
  getRuntimeDiagnostics: () => Promise<RuntimeDiagnosticsSnapshot>
  saveDiagnosticsReport: () => Promise<DiagnosticsReportSaveResult>
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
