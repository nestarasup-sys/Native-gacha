/** Renderer-owned debounced writes that must finish before navigation, backup, or shutdown. */
export type PendingWriteFlusher = () => Promise<void>

const flushers = new Set<PendingWriteFlusher>()
let flushInFlight: Promise<void> | null = null

export function registerPendingWriteFlusher(flusher: PendingWriteFlusher): () => void {
  flushers.add(flusher)
  return () => { flushers.delete(flusher) }
}

export function flushPendingRendererWrites(): Promise<void> {
  if (flushInFlight) return flushInFlight

  const currentFlush = Promise.allSettled(
    Array.from(flushers, (flusher) => Promise.resolve().then(flusher))
  ).then((results) => {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure) throw failure.reason
  })
  flushInFlight = currentFlush
  void currentFlush.then(
    () => { if (flushInFlight === currentFlush) flushInFlight = null },
    () => { if (flushInFlight === currentFlush) flushInFlight = null }
  )
  return currentFlush
}
