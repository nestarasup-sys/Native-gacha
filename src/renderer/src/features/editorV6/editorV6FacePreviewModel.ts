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

/** Owns one reusable character renderer and releases a renderer prepared for stale work. */
export function createEditorV6FaceRendererCache(
  prepareRenderer: PrepareRenderer,
  keyForRenderer: KeyForRenderer = editorV6CharacterRenderKey
) {
  let cached: { key: string; renderer: PreparedEditorV6FaceRenderer } | null = null

  const get = async (
    character: CustomizerCharacter,
    poseSourceRevision?: string,
    isCurrent: () => boolean = () => true,
    modelSourceRevision?: string
  ): Promise<PreparedEditorV6FaceRenderer | null> => {
    const key = keyForRenderer(character, poseSourceRevision, modelSourceRevision)
    if (cached?.key === key) return cached.renderer

    const renderer = await prepareRenderer(character)
    if (!isCurrent()) {
      renderer.dispose()
      return null
    }
    if (cached?.key === key) {
      renderer.dispose()
      return cached.renderer
    }

    cached?.renderer.dispose()
    cached = { key, renderer }
    return renderer
  }

  const dispose = () => {
    const renderer = cached?.renderer
    cached = null
    renderer?.dispose()
  }

  return { get, dispose }
}

export type { PreparedEditorV6FaceRenderer } from './faceModeAssets'
