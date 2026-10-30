import { useEffect, useRef } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { editorV6CharacterRenderKey } from '../../../../shared/editorV6SceneModel'
import type { EditorV6Document, EditorV6Element, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import { faceRenderGeometry } from '../../characters/characterGeometry'
import {
  bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION, editorV6FaceModeForElement,
  type PreparedEditorV6FaceRenderer
} from './faceModeAssets'

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
}

type MutableRef<T> = { current: T }
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
    modelSourceRevision?: string,
    isCurrent: () => boolean = () => true
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

type Dependencies = {
  activeProject: EditorV6Document | null
  activeProjectId: string | null
  sceneRef: MutableRef<HTMLDivElement | null>
  transformsRef: MutableRef<Record<string, EditorV6FaceTransforms>>
  patchProject: (projectId: string, blockId: string | null | undefined, transform: (project: EditorV6Document) => EditorV6Document) => void
  setError: (message: string | null) => void
}

/** Coalesces face-transform changes and keeps preview rendering resources out of the page. */
export function useEditorV6FacePreview(dependencies: Dependencies) {
  const dependenciesRef = useRef(dependencies)
  dependenciesRef.current = dependencies
  const pendingJobRef = useRef<EditorV6FacePreviewJob | null>(null)
  const renderTimerRef = useRef<number | null>(null)
  const renderVersionRef = useRef(0)
  const renderRunningRef = useRef(false)
  const disposedRef = useRef(false)
  const disposeWhenIdleRef = useRef(false)
  const rendererCacheRef = useRef<ReturnType<typeof createEditorV6FaceRendererCache> | null>(null)

  if (!rendererCacheRef.current) {
    rendererCacheRef.current = createEditorV6FaceRendererCache(async (character) => {
      const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
      return prepareSavedCharacterRenderer(character)
    })
  }
  const rendererCache = rendererCacheRef.current

  const clearRenderTimer = () => {
    if (renderTimerRef.current !== null) window.clearTimeout(renderTimerRef.current)
    renderTimerRef.current = null
  }

  const schedulePendingRender = (delay: number) => {
    if (disposedRef.current || renderTimerRef.current !== null || !pendingJobRef.current) return
    renderTimerRef.current = window.setTimeout(() => {
      renderTimerRef.current = null
      void renderPendingPreview()
    }, delay)
  }

  const finishRenderRun = () => {
    renderRunningRef.current = false
    if (disposedRef.current || disposeWhenIdleRef.current) {
      rendererCache.dispose()
      disposeWhenIdleRef.current = false
      return
    }
    schedulePendingRender(0)
  }

  const renderPendingPreview = async () => {
    if (renderRunningRef.current || disposedRef.current) return
    renderRunningRef.current = true
    try {
      while (pendingJobRef.current && !disposedRef.current) {
        const job = pendingJobRef.current
        pendingJobRef.current = null
        const version = renderVersionRef.current
        const current = dependenciesRef.current
        const project = current.activeProject
        if (!project || !isCurrentEditorV6FacePreviewTarget(job, project, current.activeProjectId)) continue
        const element = editorV6FacePreviewTarget(job, project)
        if (!element) continue
        if (!element) continue

        try {
          const renderer = await rendererCache.get(job.character, job.poseSourceRevision, job.modelSourceRevision,
            () => !disposedRef.current && version === renderVersionRef.current)
          if (!renderer || disposedRef.current || version !== renderVersionRef.current) continue

          const latest = dependenciesRef.current
          const transforms = latest.transformsRef.current[job.elementId] ?? job.transforms
          const faceMode = editorV6FaceModeForElement(element, job.character.customization.faceAppearance)
          const rendered = await renderer.renderToCanvas(job.character.customization.faceAppearance, transforms, element.activeExpressionEffects, faceMode)
          const afterRender = dependenciesRef.current
          if (version !== renderVersionRef.current || disposedRef.current
            || !isCurrentEditorV6FacePreviewTarget(job, afterRender.activeProject, afterRender.activeProjectId)
            || (afterRender.transformsRef.current[job.elementId] ?? job.transforms) !== transforms) continue
          const baked = await bakeFaceModeAssets(element.text ?? job.character.name, renderer,
            job.character.customization.faceAppearance, transforms, element.activeExpressionEffects, faceMode, rendered)
          const publish = dependenciesRef.current
          if (version !== renderVersionRef.current || disposedRef.current || !isCurrentEditorV6FacePreviewTarget(job, publish.activeProject, publish.activeProjectId)) continue
          if ((publish.transformsRef.current[job.elementId] ?? job.transforms) !== transforms) continue

          publish.patchProject(job.projectId, job.blockId, (project) => {
            if (!isCurrentEditorV6FacePreviewTarget(job, project, job.projectId)) return project
            return {
              ...project,
              elements: project.elements.map((candidate) => candidate.id === job.elementId
                ? { ...candidate, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, faceModeAssetIds: { ...baked.assetIds, [faceMode]: job.assetId }, ...faceRenderGeometry(candidate, rendered, baked.crop, publish.sceneRef.current?.clientWidth ?? 1000, publish.sceneRef.current?.clientHeight ?? 562) }
                : candidate),
              assets: [...project.assets.map((asset) => asset.id === job.assetId ? { ...asset, dataUrl: baked.dataUrl, mimeType: 'image/png' as const } : asset), ...baked.extraAssets],
              updatedAt: new Date().toISOString()
            }
          })
        } catch (reason) {
          const latest = dependenciesRef.current
          if (version === renderVersionRef.current && !disposedRef.current && isCurrentEditorV6FacePreviewTarget(job, latest.activeProject, latest.activeProjectId)) {
            latest.setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a prévia facial.')
          }
        }
      }
    } finally {
      finishRenderRun()
    }
  }

  const cancelPendingAndWait = async () => {
    renderVersionRef.current += 1
    pendingJobRef.current = null
    clearRenderTimer()
    while (renderRunningRef.current && !disposedRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 16))
    }
  }

  const withRenderer = async <T,>(
    character: CustomizerCharacter,
    poseSourceRevision: string | undefined,
    modelSourceRevision: string | undefined,
    operation: (renderer: PreparedEditorV6FaceRenderer) => Promise<T>
  ): Promise<T | null> => {
    await cancelPendingAndWait()
    if (disposedRef.current) return null
    renderRunningRef.current = true
    try {
      const renderer = await rendererCache.get(character, poseSourceRevision, modelSourceRevision, () => !disposedRef.current)
      if (!renderer || disposedRef.current) return null
      return await operation(renderer)
    } finally {
      finishRenderRun()
    }
  }

  const schedulePreview = (job: EditorV6FacePreviewJob) => {
    pendingJobRef.current = job
    renderVersionRef.current += 1
    schedulePendingRender(55)
  }

  const flushPreview = () => {
    clearRenderTimer()
    schedulePendingRender(0)
  }

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      renderVersionRef.current += 1
      pendingJobRef.current = null
      clearRenderTimer()
      if (renderRunningRef.current) disposeWhenIdleRef.current = true
      else rendererCache.dispose()
    }
  }, [rendererCache])

  return { renderRunningRef, schedulePreview, flushPreview, cancelPendingAndWait, withRenderer }
}
