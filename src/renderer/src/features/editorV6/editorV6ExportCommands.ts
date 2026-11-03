import type { EditorV6Document } from '../../../../shared/editorV6'
import { planEditorV6Export, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionBundle } from '../../../../shared/editorV6HairMotion'
import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'

type ExportJob = EditorV6ExportStatus

export async function runEditorV6ExportCommand(input: {
  project: EditorV6Document
  options: EditorV6ExportOptions
  hairPresetSlot: number
  hairPreset: HairMotionPreset | null
  prepareHair: (project: EditorV6Document, slot: number, preset: HairMotionPreset, options: EditorV6ExportOptions) => Promise<EditorV6HairMotionBundle>
  startExport: (project: EditorV6Document, options: EditorV6ExportOptions, hairMotion?: EditorV6HairMotionBundle) => Promise<ExportJob | null>
  onPreparingHair?: (preparing: boolean) => void
  onStatus?: (status: ExportJob) => void
}): Promise<ExportJob | null> {
  const { project, options, hairPreset, hairPresetSlot } = input
  const exportOptions = { ...options, hairAnimationPresetSlot: hairPreset ? hairPresetSlot : undefined }
  planEditorV6Export(exportOptions, project.timeline.durationFrames)

  let hairMotion: EditorV6HairMotionBundle | undefined
  if (hairPreset) {
    input.onPreparingHair?.(true)
    try {
      hairMotion = await input.prepareHair(project, hairPresetSlot, hairPreset, exportOptions)
    } finally {
      input.onPreparingHair?.(false)
    }
  }

  const status = await input.startExport(project, exportOptions, hairMotion)
  if (status) input.onStatus?.(status)
  return status
}

export async function cancelEditorV6ExportCommand(input: {
  job: ExportJob
  cancel: (jobId: string) => Promise<void>
  getStatus: (jobId: string) => Promise<ExportJob>
  onStatus?: (status: ExportJob) => void
}): Promise<ExportJob> {
  await input.cancel(input.job.id)
  const status = await input.getStatus(input.job.id)
  input.onStatus?.(status)
  return status
}
