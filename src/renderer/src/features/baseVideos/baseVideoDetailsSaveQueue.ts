import type { BaseVideoDetails } from '../../../../shared/baseVideos'

export type BaseVideoSaveStatus = 'saving' | 'saved' | 'error'

export type BaseVideoDetailsSaveQueueDependencies = {
  saveDetails: (details: BaseVideoDetails) => Promise<void>
  setStatus: (videoId: string, status: BaseVideoSaveStatus) => void
  setError: (reason: unknown) => void
  setTimeout: (callback: () => void, delay: number) => number
  clearTimeout: (timer: number) => void
  debounceMs?: number
}

export function createBaseVideoDetailsSaveQueue(dependencies: BaseVideoDetailsSaveQueueDependencies) {
  const pendingSaves = new Map<string, BaseVideoDetails>()
  const saveTimers = new Map<string, number>()
  const inFlightSaves = new Map<string, Promise<void>>()
  const debounceMs = dependencies.debounceMs ?? 350

  const persistPendingSave = async (videoId: string, updateUi = true): Promise<void> => {
    while (true) {
      const inFlight = inFlightSaves.get(videoId)
      if (inFlight) { await inFlight; continue }
      const details = pendingSaves.get(videoId)
      if (!details) return
      if (updateUi) dependencies.setStatus(videoId, 'saving')
      const request = dependencies.saveDetails(details).catch((reason: unknown) => {
        if (updateUi) {
          dependencies.setStatus(videoId, 'error')
          dependencies.setError(reason)
        }
        throw reason
      })
      inFlightSaves.set(videoId, request)
      try {
        await request
        if (pendingSaves.get(videoId) === details) {
          pendingSaves.delete(videoId)
          if (updateUi) dependencies.setStatus(videoId, 'saved')
        }
      } finally {
        if (inFlightSaves.get(videoId) === request) inFlightSaves.delete(videoId)
      }
    }
  }

  const clearSaveTimer = (videoId: string) => {
    const timer = saveTimers.get(videoId)
    if (timer !== undefined) dependencies.clearTimeout(timer)
    saveTimers.delete(videoId)
  }

  const flushPendingSave = async (videoId: string): Promise<void> => {
    clearSaveTimer(videoId)
    await persistPendingSave(videoId)
  }

  const flushPendingSaves = async (): Promise<void> => {
    while (true) {
      for (const timer of saveTimers.values()) dependencies.clearTimeout(timer)
      saveTimers.clear()
      const videoIds = [...new Set([...pendingSaves.keys(), ...inFlightSaves.keys()])]
      if (videoIds.length === 0) return
      const results = await Promise.allSettled(videoIds.map((videoId) => persistPendingSave(videoId)))
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failure) throw failure.reason
      if (pendingSaves.size === 0 && inFlightSaves.size === 0) {
        for (const timer of saveTimers.values()) dependencies.clearTimeout(timer)
        saveTimers.clear()
        return
      }
    }
  }

  const scheduleSave = (details: BaseVideoDetails): void => {
    dependencies.setStatus(details.videoId, 'saving')
    pendingSaves.set(details.videoId, details)
    clearSaveTimer(details.videoId)
    const timer = dependencies.setTimeout(() => {
      saveTimers.delete(details.videoId)
      dependencies.setStatus(details.videoId, 'saving')
      void persistPendingSave(details.videoId).catch(() => undefined)
    }, debounceMs)
    saveTimers.set(details.videoId, timer)
  }

  return {
    scheduleSave,
    persistPendingSave,
    flushPendingSave,
    flushPendingSaves,
    hasPending: (videoId: string) => pendingSaves.has(videoId)
  }
}
