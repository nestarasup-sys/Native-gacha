export type RoteiroSnapshotSaveStatus = 'saving' | 'saved' | 'error'

type RoteiroSnapshotPersistenceDependencies<T> = {
  saveSnapshot: (snapshot: T) => Promise<void>
  setStatus: (status: RoteiroSnapshotSaveStatus) => void
  logFailure: (error: unknown) => void
}

/** Tracks renderer snapshot writes and flushes the latest state before persistence boundaries. */
export function createRoteiroSnapshotPersistence<T>(dependencies: RoteiroSnapshotPersistenceDependencies<T>) {
  let revision = 0
  let lastRequested: T | null = null
  let persisted: T | null = null
  let persistedRevision = 0
  const writes = new Set<Promise<void>>()

  const saveSnapshot = (snapshot: T) => {
    const requestedRevision = ++revision
    lastRequested = snapshot
    dependencies.setStatus('saving')
    const write = Promise.resolve().then(() => dependencies.saveSnapshot(snapshot)).then(() => {
      if (requestedRevision >= persistedRevision) {
        persistedRevision = requestedRevision
        persisted = snapshot
      }
      if (requestedRevision === revision) dependencies.setStatus('saved')
    }, (error: unknown) => {
      if (requestedRevision === revision) dependencies.setStatus('error')
      if (lastRequested === snapshot) lastRequested = null
      dependencies.logFailure(error)
      throw error
    })
    writes.add(write)
    void write.then(() => writes.delete(write), () => writes.delete(write))
    return write
  }

  const flushPendingWrites = async (loaded: boolean, getLatestSnapshot: () => T) => {
    if (!loaded) return
    while (true) {
      const pending = [...writes]
      if (pending.length > 0) await Promise.allSettled(pending)
      const latest = getLatestSnapshot()
      if (persisted === latest && writes.size === 0) return
      if (lastRequested === latest && writes.size > 0) continue
      await saveSnapshot(latest)
    }
  }

  return {
    saveSnapshot,
    isLastRequestedSnapshot: (snapshot: T) => lastRequested === snapshot,
    flushPendingWrites
  }
}
