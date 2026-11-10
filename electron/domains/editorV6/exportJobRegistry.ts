import type { EditorV6ExportStatus } from '../../../src/shared/editorV6Export'

export type EditorV6ExportJob = {
  owner: number
  status: EditorV6ExportStatus
  controller: AbortController
  promise: Promise<void>
}

const terminalStates = new Set<EditorV6ExportStatus['state']>(['completed', 'cancelled', 'failed'])

export function isEditorV6ExportJobTerminal(status: EditorV6ExportStatus): boolean {
  return terminalStates.has(status.state)
}

/** Owns export job identity, window ownership, and shutdown-facing job inventory. */
export function createEditorV6ExportJobRegistry() {
  const jobs = new Map<string, EditorV6ExportJob>()

  return {
    add(job: EditorV6ExportJob) {
      jobs.set(job.status.id, job)
    },
    findOwned(id: string, owner: number): EditorV6ExportJob {
      const job = id === 'latest'
        ? [...jobs.values()].reverse().find((entry) => entry.owner === owner)
        : jobs.get(id)
      if (!job || job.owner !== owner) throw Error('Exportação não encontrada nesta janela.')
      return job
    },
    hasActive(): boolean {
      return [...jobs.values()].some((job) => !isEditorV6ExportJobTerminal(job.status))
    },
    cancelAll(reason: Error): void {
      for (const job of jobs.values()) if (!isEditorV6ExportJobTerminal(job.status)) job.controller.abort(reason)
    },
    pendingPromises(): Promise<void>[] {
      return [...jobs.values()].filter((job) => !isEditorV6ExportJobTerminal(job.status)).map((job) => job.promise)
    },
    pruneTerminal(maximumEntries = 20): void {
      if (jobs.size <= maximumEntries) return
      for (const [id, job] of jobs) if (isEditorV6ExportJobTerminal(job.status)) jobs.delete(id)
    },
    get size(): number {
      return jobs.size
    }
  }
}
