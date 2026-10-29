/** Tracks complete renderer actions that must finish before a page can close. */
export function createPendingOperationTracker() {
  const pending = new Set<Promise<unknown>>()
  let flushInFlight: Promise<void> | null = null

  const track = <T,>(operation: () => Promise<T>): Promise<T> => {
    const task = Promise.resolve().then(operation)
    pending.add(task)
    void task.then(() => pending.delete(task), () => pending.delete(task))
    return task
  }

  const flush = (): Promise<void> => {
    if (flushInFlight) return flushInFlight
    const current = (async () => {
      while (pending.size > 0) {
        const results = await Promise.allSettled([...pending])
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
      }
    })()
    flushInFlight = current
    void current.then(
      () => { if (flushInFlight === current) flushInFlight = null },
      () => { if (flushInFlight === current) flushInFlight = null }
    )
    return current
  }

  return { track, flush }
}
