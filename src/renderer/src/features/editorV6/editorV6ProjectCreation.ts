import type { EditorV6Document, EditorV6MediaAsset, EditorV6ProjectSummary, EditorV6Timeline } from '../../../../shared/editorV6'
import type { EditorV6ExportAudio } from '../../../../shared/editorV6Export'
import type { EditorV6DuplicateIdentity } from './editorV6ProjectDuplication'

type TrackOperation = <T>(operation: () => Promise<T>) => Promise<T>

export type EditorV6ProjectCreationDependencies = {
  projects: () => readonly EditorV6ProjectSummary[]
  nextNumber: { current: number }
  activeProject: () => EditorV6Document | null
  createTimeline: () => EditorV6Timeline
  colorForNumber: (number: number) => string
  projectSummary: (document: EditorV6Document) => EditorV6ProjectSummary
  duplicateDocument: (source: EditorV6Document, identity: EditorV6DuplicateIdentity, createId: () => string) => EditorV6Document
  createId: () => string
  now: () => string
  loadProject: (projectId: string) => Promise<EditorV6Document | null>
  cloneExportAudio: (sourceId: string, duplicateId: string, audio: EditorV6ExportAudio[]) => Promise<void>
  cloneMedia: (sourceId: string, duplicateId: string, media: EditorV6MediaAsset[]) => Promise<void>
  writeDocument: (document: EditorV6Document) => Promise<unknown>
  upsertSummary: (summary: EditorV6ProjectSummary) => void
  selectProject: (projectId: string) => void
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
  trackOperation: TrackOperation
}

/** Owns creation and duplication of Editor V6 projects, including copied media. */
export function createEditorV6ProjectCreationCommands(dependencies: EditorV6ProjectCreationDependencies) {
  const allocateNumber = () => {
    const highest = dependencies.projects().reduce((max, project) => Math.max(max, Number(project.title.match(/^Editor V6\s+(\d+)/i)?.[1] ?? 0)), 0)
    const number = Math.max(dependencies.nextNumber.current, highest + 1)
    dependencies.nextNumber.current = number + 1
    return number
  }

  const createStudio = async () => {
    const number = allocateNumber()
    const now = dependencies.now()
    const studio: EditorV6Document = {
      schemaVersion: 1,
      id: dependencies.createId(),
      title: `Editor V6 ${String(number).padStart(2, '0')}`,
      color: dependencies.colorForNumber(number),
      createdAt: now,
      updatedAt: now,
      backgroundColor: '#d7b5cd',
      backgroundAssetId: null,
      backgroundX: 0,
      backgroundY: 0,
      backgroundWidth: 100,
      backgroundHeight: 100,
      backgroundRotation: 0,
      assets: [],
      elements: [],
      timeline: dependencies.createTimeline()
    }
    try {
      dependencies.setError(null)
      await dependencies.writeDocument(studio)
      dependencies.upsertSummary(dependencies.projectSummary(studio))
      dependencies.selectProject(studio.id)
      dependencies.setSaved(true)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível criar o projeto do Editor V6.')
    }
  }

  const duplicateStudio = (sourceSummary: EditorV6ProjectSummary | null) => dependencies.trackOperation(async () => {
    if (!sourceSummary) return
    let source: EditorV6Document | null
    try {
      const active = dependencies.activeProject()
      source = active?.id === sourceSummary.id ? active : await dependencies.loadProject(sourceSummary.id)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o projeto que será duplicado.')
      return
    }
    if (!source) {
      dependencies.setError('Não foi possível carregar o projeto que será duplicado.')
      return
    }

    const number = allocateNumber()
    const now = dependencies.now()
    const duplicate = dependencies.duplicateDocument(source, {
      id: dependencies.createId(),
      title: `Editor V6 ${String(number).padStart(2, '0')}`,
      color: dependencies.colorForNumber(number),
      createdAt: now,
      updatedAt: now
    }, () => dependencies.createId())
    try {
      dependencies.setError(null)
      if (source.exportAudio?.length) await dependencies.cloneExportAudio(source.id, duplicate.id, source.exportAudio)
      if (source.media?.length) await dependencies.cloneMedia(source.id, duplicate.id, source.media)
      await dependencies.writeDocument(duplicate)
      dependencies.upsertSummary(dependencies.projectSummary(duplicate))
      dependencies.selectProject(duplicate.id)
      dependencies.setSaved(true)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o projeto do Editor V6.')
    }
  })

  return { allocateNumber, createStudio, duplicateStudio }
}
