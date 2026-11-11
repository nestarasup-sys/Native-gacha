export type EditorV6ExportStageSample = {
  name: string
  samples: number
  totalMilliseconds: number
  maxMilliseconds: number
}

/** Collects per-stage export timings while preserving insertion order for diagnostics. */
export function createEditorV6ExportStageProfiler(
  onStage?: (stage: string, milliseconds: number) => void,
  now: () => number = () => performance.now()
) {
  const stages = new Map<string, Omit<EditorV6ExportStageSample, 'name'>>()

  const record = (stage: string, milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return
    const current = stages.get(stage) ?? { samples: 0, totalMilliseconds: 0, maxMilliseconds: 0 }
    current.samples += 1
    current.totalMilliseconds += milliseconds
    current.maxMilliseconds = Math.max(current.maxMilliseconds, milliseconds)
    stages.set(stage, current)
    onStage?.(stage, milliseconds)
  }

  return {
    record,
    report: (stage: string, startedAt: number) => record(stage, now() - startedAt),
    snapshot: (): EditorV6ExportStageSample[] => [...stages].map(([name, sample]) => ({ name, ...sample }))
  }
}
