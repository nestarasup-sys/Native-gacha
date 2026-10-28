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
