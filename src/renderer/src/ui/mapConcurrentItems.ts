/** Maps ordered work with a bounded number of active tasks and cooperative cancellation. */
export async function mapConcurrentItems<T, R>(
  items: readonly T[],
  operation: (item: T, index: number) => Promise<R>,
  isCancelled: () => boolean,
  concurrency = 3
): Promise<R[]> {
  if (!items.length || isCancelled()) return []

  const requestedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 3
  const workerCount = Math.max(1, Math.min(items.length, requestedConcurrency))
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let failed = false
  let failure: unknown

  const worker = async () => {
    while (!isCancelled() && !failed) {
      const index = nextIndex++
      if (index >= items.length) return
      try {
        results[index] = await operation(items[index], index)
      } catch (reason) {
        failed = true
        failure = reason
        return
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  if (isCancelled()) return []
  if (failed) throw failure
  return results
}
