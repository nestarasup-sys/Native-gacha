import type { EditorV6ExportStatus } from '../../../../shared/editorV6Export'

export const isEditorV6ExportFinished = (job: EditorV6ExportStatus): boolean =>
  ['completed', 'cancelled', 'failed'].includes(job.state)

export type EditorV6ExportStatusPollingScheduler = {
  schedule: (callback: () => void, delayMs: number) => number
  cancel: (timerId: number) => void
}

type Dependencies = {
  getStatus: (jobId: string) => Promise<EditorV6ExportStatus>
  onStatus: (status: EditorV6ExportStatus) => void
  onError: (reason: unknown) => void
  scheduler: EditorV6ExportStatusPollingScheduler
  intervalMs?: number
}

/** Polls until its owner stops the subscription; in-flight results are ignored after cleanup. */
export function startEditorV6ExportStatusPolling(jobId: string, dependencies: Dependencies): () => void {
  const { getStatus, onStatus, onError, scheduler, intervalMs = 500 } = dependencies
  let stopped = false
  let timerId: number | null = null

  const poll = async () => {
    try {
      const status = await getStatus(jobId)
      if (!stopped) onStatus(status)
    } catch (reason) {
      if (!stopped) onError(reason)
    }

    if (!stopped) timerId = scheduler.schedule(() => { void poll() }, intervalMs)
  }

  void poll()
  return () => {
    stopped = true
    if (timerId !== null) scheduler.cancel(timerId)
  }
}
