type PendingTask = {
  run: () => Promise<unknown>
  isCancelled: () => boolean
  resolve: (value: unknown | null) => void
  reject: (reason: unknown) => void
}

/** Shares one concurrency ceiling across independent async loaders. */
export function createConcurrencyLimiter(maxConcurrency: number) {
  const configuredLimit = Number.isFinite(maxConcurrency) ? Math.floor(maxConcurrency) : 3
  const limit = Math.max(1, configuredLimit)
  let active = 0
  const pending: PendingTask[] = []

  const drain = () => {
    while (active < limit && pending.length > 0) {
      const task = pending.shift()!
      if (task.isCancelled()) {
        task.resolve(null)
        continue
      }

      active += 1
      void Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
        active -= 1
        drain()
      })
    }
  }

  return function schedule<T>(run: () => Promise<T>, isCancelled: () => boolean): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      pending.push({
        run,
        isCancelled,
        resolve: (value) => resolve(value as T | null),
        reject
      })
      drain()
    })
  }
}
