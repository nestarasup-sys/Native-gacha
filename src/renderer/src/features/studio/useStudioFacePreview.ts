import { useRef } from 'react'
import { studioCharacterRenderKey } from '../../../../shared/studioSceneModel'
import { faceRenderGeometry, trimTransparentImage } from '../../characters/characterGeometry'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceExpressionEffects } from '../../../../shared/fabricator'
import type { StudioDocument, StudioFaceMode, StudioFaceTransforms } from '../../../../shared/studio'

export const STUDIO_FACE_RENDER_VERSION = 7

type RenderedStudioFace = { dataUrl: string; width: number; height: number }
type StudioFaceRenderer = {
  key: string
  render: (
    appearance?: CustomizerFaceAppearance,
    transforms?: StudioFaceTransforms,
    effects?: FaceExpressionEffects,
    mode?: StudioFaceMode
  ) => Promise<RenderedStudioFace>
}
type StudioFacePreviewJob = {
  studioId: string
  elementId: string
  assetId: string
  character: CustomizerCharacter
  transforms: StudioFaceTransforms
}
type StudioFacePreviewDependencies = {
  activeStudio: StudioDocument | null
  activeStudioId: string | null
  sceneRef: { current: HTMLDivElement | null }
  transformsRef: { current: Record<string, StudioFaceTransforms> }
  patchStudio: (transform: (studio: StudioDocument) => StudioDocument) => void
  setError: (message: string | null) => void
}

/** Owns cached face rendering and coalesces rapid slider updates into one preview job. */
export function useStudioFacePreview(dependencies: StudioFacePreviewDependencies) {
  const dependenciesRef = useRef(dependencies)
  dependenciesRef.current = dependencies
  const rendererRef = useRef<StudioFaceRenderer | null>(null)
  const renderTimerRef = useRef<number | null>(null)
  const renderVersionRef = useRef(0)
  const pendingJobRef = useRef<StudioFacePreviewJob | null>(null)
  const renderRunningRef = useRef(false)

  const prepareRenderer = async (character: CustomizerCharacter): Promise<StudioFaceRenderer> => {
    const key = studioCharacterRenderKey(character)
    const { prepareSavedCharacterRenderer } = await import('../../characters/characterRenderer')
    const renderer = await prepareSavedCharacterRenderer(character)
    return { key, render: renderer.render }
  }

  const getRenderer = async (character: CustomizerCharacter): Promise<StudioFaceRenderer> => {
    if (rendererRef.current?.key !== studioCharacterRenderKey(character)) {
      rendererRef.current = await prepareRenderer(character)
    }
    return rendererRef.current
  }

  const renderFace = async (
    character: CustomizerCharacter,
    appearance?: CustomizerFaceAppearance,
    transforms?: StudioFaceTransforms,
    effects?: FaceExpressionEffects,
    mode?: StudioFaceMode
  ) => (await getRenderer(character)).render(appearance, transforms, effects, mode)

  const renderPendingPreview = async () => {
    if (renderRunningRef.current) return
    renderRunningRef.current = true
    try {
      while (pendingJobRef.current) {
        const job = pendingJobRef.current
        pendingJobRef.current = null
        const version = renderVersionRef.current
        try {
          let renderer = rendererRef.current
          if (renderer?.key !== studioCharacterRenderKey(job.character)) {
            const preparedRenderer = await prepareRenderer(job.character)
            if (version !== renderVersionRef.current) continue
            rendererRef.current = preparedRenderer
            renderer = preparedRenderer
          }
          if (!renderer) continue
          const current = dependenciesRef.current
          const element = current.activeStudio?.elements.find((candidate) => candidate.id === job.elementId)
          const rendered = await renderer.render(
            job.character.customization.faceAppearance,
            current.transformsRef.current[job.elementId] ?? job.transforms,
            element?.activeExpressionEffects,
            element?.activeFaceMode
          )
          const trimmed = await trimTransparentImage(rendered.dataUrl)
          const studioDataUrl = trimmed?.dataUrl ?? rendered.dataUrl
          const latest = dependenciesRef.current
          if (version === renderVersionRef.current && job.studioId === latest.activeStudioId) {
            latest.patchStudio((studio) => ({
              ...studio,
              elements: studio.elements.map((item) => item.id === job.elementId
                ? {
                    ...item,
                    faceRendererVersion: STUDIO_FACE_RENDER_VERSION,
                    ...faceRenderGeometry(item, rendered, trimmed, latest.sceneRef.current?.clientWidth ?? 1000, latest.sceneRef.current?.clientHeight ?? 562)
                  }
                : item),
              assets: studio.assets.map((asset) => asset.id === job.assetId
                ? { ...asset, dataUrl: studioDataUrl, mimeType: 'image/png' }
                : asset),
              updatedAt: new Date().toISOString()
            }))
          }
        } catch (reason) {
          const current = dependenciesRef.current
          if (version === renderVersionRef.current && job.studioId === current.activeStudioId) {
            current.setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a prévia facial.')
          }
        }
      }
    } finally {
      renderRunningRef.current = false
    }
    if (pendingJobRef.current && renderTimerRef.current === null) {
      renderTimerRef.current = window.setTimeout(() => {
        renderTimerRef.current = null
        void renderPendingPreview()
      }, 0)
    }
  }

  const schedulePreview = (job: StudioFacePreviewJob) => {
    pendingJobRef.current = job
    renderVersionRef.current += 1
    if (renderTimerRef.current !== null) return
    renderTimerRef.current = window.setTimeout(() => {
      renderTimerRef.current = null
      void renderPendingPreview()
    }, 55)
  }

  const flushPreview = () => {
    if (renderTimerRef.current !== null) window.clearTimeout(renderTimerRef.current)
    renderTimerRef.current = null
    void renderPendingPreview()
  }

  const cancelPendingAndWait = async () => {
    renderVersionRef.current += 1
    pendingJobRef.current = null
    if (renderTimerRef.current !== null) {
      window.clearTimeout(renderTimerRef.current)
      renderTimerRef.current = null
    }
    while (renderRunningRef.current) await new Promise((resolve) => window.setTimeout(resolve, 16))
  }

  return { renderFace, schedulePreview, flushPreview, cancelPendingAndWait }
}
