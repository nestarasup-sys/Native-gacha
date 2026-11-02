export type PersistenceShutdownEvent = {
  preventDefault(): void
}

export type PersistenceShutdownDependencies = {
  getPendingOperations(): Promise<unknown>[]
  cancelExports(): void
  resumeAfterFailedShutdown(): void
  hasUsableWindow(): boolean
  createWindow(): void
  showPersistenceFailure(): void
  closeDataPlatform(): void
  quit(): void
}

/** Coordinates the existing shutdown drain while leaving queue policy with each data owner. */
export function createPersistenceShutdownHandler(deps: PersistenceShutdownDependencies) {
  let waitingForPersistenceWrites = false
  let persistenceWritesDrained = false

  return function handleBeforeQuit(event: PersistenceShutdownEvent): void {
    if (persistenceWritesDrained) return

    // Always block quit while an asynchronous drain is in flight. A second
    // before-quit must not bypass the first drain.
    event.preventDefault()
    if (waitingForPersistenceWrites) return

    waitingForPersistenceWrites = true
    deps.cancelExports()
    const pendingOperations = deps.getPendingOperations()

    void Promise.allSettled(pendingOperations).then((results) => {
      waitingForPersistenceWrites = false
      const failed = results.some((result) => result.status === 'rejected')
      if (failed) {
        // Keep the application open so the user can retry or recover the write.
        deps.resumeAfterFailedShutdown()
        if (!deps.hasUsableWindow()) deps.createWindow()
        deps.showPersistenceFailure()
        return
      }

      persistenceWritesDrained = true
      deps.closeDataPlatform()
      deps.quit()
    })
  }
}
