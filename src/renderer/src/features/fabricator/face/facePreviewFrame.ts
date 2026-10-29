export type PreviewFrameScheduler = {
  schedule: (update: () => void) => void
  flush: () => void
  cancel: () => void
}

export function createPreviewFrameScheduler(
  requestFrame: (callback: () => void) => number,
  cancelFrame: (frameId: number) => void
): PreviewFrameScheduler {
  let frameId: number | null = null
  let pendingUpdate: (() => void) | null = null

  function flush() {
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
    const update = pendingUpdate
    pendingUpdate = null
    update?.()
  }

  function cancel() {
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
    pendingUpdate = null
  }

  function schedule(update: () => void) {
    pendingUpdate = update
    if (frameId !== null) return
    frameId = requestFrame(() => {
      frameId = null
      const latestUpdate = pendingUpdate
      pendingUpdate = null
      latestUpdate?.()
    })
  }

  return { schedule, flush, cancel }
}
