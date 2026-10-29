import type { FaceExpressionWorkspaceDraft } from '../../../../shared/fabricator.ts'

export type ExpressionWorkspaceDraftSaveStatus = 'saving' | 'saved' | 'failed'

export type ExpressionWorkspaceDraftQueue = {
  schedule: (draft: FaceExpressionWorkspaceDraft) => void
  flush: (modelSlot: number) => Promise<void>
  cancelScheduled: () => void
  reset: () => void
}

/** Debounces draft writes, serializes disk snapshots, and drains the latest one on flush. */
export function createExpressionWorkspaceDraftQueue({
  write,
  scheduleTimer,
  cancelTimer,
  setStatus,
  reportError,
  debounceMs = 120
}: {
  write: (draft: FaceExpressionWorkspaceDraft) => Promise<void>
  scheduleTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancelTimer: (timer: ReturnType<typeof setTimeout>) => void
  setStatus: (status: ExpressionWorkspaceDraftSaveStatus) => void
  reportError: (message: string) => void
  debounceMs?: number
}): ExpressionWorkspaceDraftQueue {
  let timer: ReturnType<typeof setTimeout> | null = null
  let latestDraft: FaceExpressionWorkspaceDraft | null = null
  let writeQueue: Promise<void> = Promise.resolve()
  let activeDraft: FaceExpressionWorkspaceDraft | null = null
  let activeWrite: Promise<void> | null = null
  let persistedDraft: FaceExpressionWorkspaceDraft | null = null

  const persist = (draft: FaceExpressionWorkspaceDraft) => {
    if (activeDraft === draft && activeWrite) return activeWrite
    if (persistedDraft === draft) return Promise.resolve()
    const current = writeQueue.catch(() => undefined).then(() => write(draft))
    let tracked: Promise<void>
    tracked = current.then(() => {
      persistedDraft = draft
      if (latestDraft === draft) setStatus('saved')
    }).catch((reason: unknown) => {
      if (latestDraft === draft) {
        setStatus('failed')
        reportError(reason instanceof Error ? `Falha ao gravar o rascunho no disco: ${reason.message}` : 'Falha ao gravar o rascunho no disco.')
      }
      throw reason
    }).finally(() => {
      if (activeWrite === tracked) {
        activeDraft = null
        activeWrite = null
      }
    })
    activeDraft = draft
    activeWrite = tracked
    writeQueue = tracked
    return tracked
  }

  const clearTimer = () => {
    if (timer !== null) cancelTimer(timer)
    timer = null
  }

  return {
    schedule(draft) {
      latestDraft = draft
      clearTimer()
      timer = scheduleTimer(() => {
        timer = null
        if (latestDraft?.modelSlot === draft.modelSlot) void persist(latestDraft).catch(() => undefined)
      }, debounceMs)
    },
    async flush(modelSlot) {
      clearTimer()
      const latest = latestDraft
      if (latest?.modelSlot === modelSlot) await persist(latest)
      await writeQueue
    },
    cancelScheduled: clearTimer,
    reset() {
      clearTimer()
      latestDraft = null
    }
  }
}
