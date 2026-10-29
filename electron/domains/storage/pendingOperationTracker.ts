/** Tracks active filesystem operations so shutdown and backup can drain them. */
export function createPendingOperationTracker() {
  const pending = new Set<Promise<unknown>>()

  function track<T>(operation: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(operation)
    pending.add(promise)
    void promise.then(() => pending.delete(promise), () => pending.delete(promise))
    return promise
  }

  return { track, getPending: () => [...pending] }
}
