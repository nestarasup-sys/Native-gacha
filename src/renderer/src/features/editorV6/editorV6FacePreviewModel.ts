import type { CustomizerCharacter } from '../../../../shared/customizer'
import { editorV6CharacterRenderKey } from '../../../../shared/editorV6SceneModel'
import type { EditorV6Document, EditorV6Element, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { PreparedEditorV6FaceRenderer } from './faceModeAssets'

export type EditorV6FacePreviewJob = {
  projectId: string
  elementId: string
  assetId: string
  blockId?: string | null
  poseSlot?: number | null
  poseSourceRevision?: string
  modelSourceRevision?: string
  character: CustomizerCharacter
  transforms: EditorV6FaceTransforms
  previousState?: Pick<EditorV6Element, 'faceAppearance' | 'faceTransforms' | 'activeExpressionEffects' | 'activeFaceMode'>
}

export function shouldResetEditorV6FacePreviewCache(previousProjectId: string | null, currentProjectId: string | null): boolean {
  return previousProjectId !== currentProjectId
}

type PrepareRenderer = (character: CustomizerCharacter) => Promise<PreparedEditorV6FaceRenderer>
type KeyForRenderer = (character: CustomizerCharacter, poseSourceRevision?: string, modelSourceRevision?: string) => string

export function editorV6FacePreviewTarget(job: EditorV6FacePreviewJob, project: EditorV6Document): EditorV6Element | null {
  const block = job.blockId
    ? project.timeline.tracks.flatMap((track) => track.blocks).find((candidate) => candidate.id === job.blockId && candidate.elementId === job.elementId)
    : undefined
  if (job.blockId && !block) return null
  return block?.state ?? project.elements.find((element) => element.id === job.elementId) ?? null
}

/** A rendered preview remains publishable only while its project and character source are unchanged. */
export function isCurrentEditorV6FacePreviewTarget(
  job: EditorV6FacePreviewJob,
  project: EditorV6Document | null,
  activeProjectId: string | null
): boolean {
  if (!project || project.id !== job.projectId || activeProjectId !== job.projectId) return false
  const target = editorV6FacePreviewTarget(job, project)
  return Boolean(target
    && target.kind === 'character'
    && target.assetId === job.assetId
    && target.characterId === job.character.id
    && target.poseSlot === job.poseSlot
    && target.poseSourceRevision === job.poseSourceRevision
    && target.modelSourceRevision === job.modelSourceRevision
    && JSON.stringify(target.faceTransforms ?? {}) === JSON.stringify(job.transforms)
    && (!target.characterSourceUpdatedAt || target.characterSourceUpdatedAt === job.character.updatedAt))
}

/** Owns reusable character renderers and releases resources prepared for stale work. */
export function createEditorV6FaceRendererCache(
  prepareRenderer: PrepareRenderer,
  keyForRenderer: KeyForRenderer = editorV6CharacterRenderKey,
  capacity = 1
) {
  const cached = new Map<string, PreparedEditorV6FaceRenderer>()

  const get = async (
    character: CustomizerCharacter,
    poseSourceRevision?: string,
    isCurrent: () => boolean = () => true,
    modelSourceRevision?: string
  ): Promise<PreparedEditorV6FaceRenderer | null> => {
    const key = keyForRenderer(character, poseSourceRevision, modelSourceRevision)
    const hit = cached.get(key)
    if (hit) {
      cached.delete(key)
      cached.set(key, hit)
      return hit
    }

    const renderer = await prepareRenderer(character)
    if (!isCurrent()) {
      renderer.dispose()
      return null
    }
    const existing = cached.get(key)
    if (existing) {
      renderer.dispose()
      return existing
    }

    cached.set(key, renderer)
    if (cached.size > capacity) {
      const oldest = cached.keys().next().value!
      cached.get(oldest)!.dispose()
      cached.delete(oldest)
    }
    return renderer
  }

  const dispose = () => {
    for (const renderer of cached.values()) renderer.dispose()
    cached.clear()
  }

  return { get, dispose }
}

export type { PreparedEditorV6FaceRenderer } from './faceModeAssets'
