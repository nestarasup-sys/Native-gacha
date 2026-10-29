type PendingSave = { timer: number; run: () => Promise<void> }

export type FaceSaveQueueDependencies = {
  schedule: (callback: () => void, delayMs: number) => number
  cancel: (timer: number) => void
  onAssetsUpdated: () => void
  onError: (reason: unknown) => void
  debounceMs?: number
}

export type FaceSaveQueue = {
  queueSave: (key: string, run: () => Promise<void>) => void
  flushSave: (key: string) => Promise<void>
  flushAllSaves: () => Promise<void>
}

/** Debounces updates by asset key, serializes each key, and drains pending/in-flight work. */
export function createFaceSaveQueue(dependencies: FaceSaveQueueDependencies): FaceSaveQueue {
  const pendingSaves = new Map<string, PendingSave>()
  const saveChains = new Map<string, Promise<void>>()
  const saveRuns = new Map<string, () => Promise<void>>()
  const debounceMs = dependencies.debounceMs ?? 180

  function enqueueSave(key: string, run: () => Promise<void>) {
    const next = (saveChains.get(key) ?? Promise.resolve()).catch(() => undefined).then(run)
    saveChains.set(key, next)
    void next.then(() => {
      dependencies.onAssetsUpdated()
      if (saveChains.get(key) === next) saveChains.delete(key)
      if (saveRuns.get(key) === run && !pendingSaves.has(key)) saveRuns.delete(key)
    }).catch(dependencies.onError)
    return next
  }

  function queueSave(key: string, run: () => Promise<void>) {
    const previous = pendingSaves.get(key)
    if (previous) dependencies.cancel(previous.timer)
    saveRuns.set(key, run)
    const timer = dependencies.schedule(() => {
      pendingSaves.delete(key)
      enqueueSave(key, run)
    }, debounceMs)
    pendingSaves.set(key, { timer, run })
  }

  async function flushSave(key: string) {
    let attempts = 0
    while (true) {
      const pending = pendingSaves.get(key)
      if (pending) {
        dependencies.cancel(pending.timer)
        pendingSaves.delete(key)
        enqueueSave(key, pending.run)
      }
      const current = saveChains.get(key)
      if (!current) return
      try {
        await current
        return
      } catch (reason) {
        const retry = saveRuns.get(key)
        if (attempts > 0 || !retry) throw reason
        attempts += 1
        enqueueSave(key, retry)
      }
    }
  }

  async function flushAllSaves() {
    while (true) {
      const keys = [...new Set([...pendingSaves.keys(), ...saveChains.keys()])]
      if (keys.length === 0) return
      const results = await Promise.allSettled(keys.map(flushSave))
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failure) throw failure.reason
      if (pendingSaves.size === 0 && saveChains.size === 0) return
    }
  }

  return { queueSave, flushSave, flushAllSaves }
}
