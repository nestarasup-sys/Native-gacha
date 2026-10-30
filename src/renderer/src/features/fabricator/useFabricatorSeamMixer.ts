import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorHistoryAction, FabricatorProject } from '../../../../shared/fabricator'
import { orderedParts } from './models/rig'
import { paintSeamMixerSegment } from './models/seamMixer'
import { BoundedSeamMixerSurfaceCache } from './models/seamMixerSurfaceCache'
import { createSeamMixerSession, type MixerStrokeState } from './models/seamMixerSession'

type MutableValue<T> = { current: T }

type UseFabricatorSeamMixerOptions = {
  stageRef: MutableValue<HTMLDivElement | null>
  projectRef: MutableValue<FabricatorProject | null>
  dirtyAssets: MutableValue<Map<string, string>>
  scale: number
  pan: { x: number; y: number }
  setMixerPainting: (painting: boolean) => void
  startHistoryGesture: (action: FabricatorHistoryAction) => void
  updateProject: (updater: (current: FabricatorProject) => FabricatorProject, action?: FabricatorHistoryAction) => void
  setError: (message: string) => void
}

/** Owns the seam brush queue, cached surfaces and pointer stroke lifecycle. */
export function useFabricatorSeamMixer({ stageRef, projectRef, dirtyAssets, scale, pan, setMixerPainting, startHistoryGesture, updateProject, setError }: UseFabricatorSeamMixerOptions) {
  const strokeRef = useRef<MixerStrokeState | null>(null)
  const touchedPixelsRef = useRef<Map<string, Uint8Array>>(new Map())
  const surfacesRef = useRef(new BoundedSeamMixerSurfaceCache())
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const generationRef = useRef(0)

  const paintMixerSegment = async (fromX: number, fromY: number, toX: number, toY: number, touchedPixels: Map<string, Uint8Array>, generation: number) => {
    const currentProject = projectRef.current
    if (!currentProject || !scale || generation !== generationRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const hiddenParts = new Set(currentProject.hiddenPartIds ?? [])
    const candidates = orderedParts(currentProject.parts, currentProject.layerOrder).reverse()
      .filter((part) => !hiddenParts.has(part.id))
    const changedAssets = await paintSeamMixerSegment({
      fromX,
      fromY,
      toX,
      toY,
      projectSize: currentProject,
      scale,
      pan,
      stageBounds: stage.getBoundingClientRect(),
      candidates,
      touchedPixels,
      surfaces: surfacesRef.current,
      session: generation,
      getCurrentSession: () => generationRef.current
    })
    if (!changedAssets?.size || generation !== generationRef.current) return
    for (const [partId, dataUrl] of changedAssets) dirtyAssets.current.set(partId, dataUrl)
    updateProject((current) => ({
      ...current,
      parts: current.parts.map((part) => changedAssets.has(part.id)
        ? { ...part, dataUrl: changedAssets.get(part.id)! }
        : part)
    }), 'mixer')
  }

  const session = createSeamMixerSession({
    stroke: strokeRef,
    touchedPixels: touchedPixelsRef,
    queue: queueRef,
    generation: generationRef
  }, paintMixerSegment, setError)

  const startMixerStroke = <T extends Element,>(event: ReactPointerEvent<T>) => {
    if (!projectRef.current || !stageRef.current) return
    event.preventDefault()
    event.stopPropagation()
    stageRef.current.setPointerCapture(event.pointerId)
    startHistoryGesture('mixer')
    touchedPixelsRef.current = new Map()
    strokeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setMixerPainting(true)
    session.queueSegment(event.clientX, event.clientY, event.clientX, event.clientY)
  }

  const moveMixerStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    session.queueSegment(stroke.x, stroke.y, event.clientX, event.clientY)
    stroke.x = event.clientX
    stroke.y = event.clientY
  }

  const resetSession = () => {
    session.reset()
    surfacesRef.current.clear()
  }

  useEffect(() => () => {
    generationRef.current += 1
    strokeRef.current = null
    touchedPixelsRef.current.clear()
    surfacesRef.current.clear()
  }, [])

  return {
    mixerStrokeRef: strokeRef,
    mixerQueueRef: queueRef,
    startMixerStroke,
    moveMixerStroke,
    resetSession,
    clearSurfaces: () => surfacesRef.current.clear()
  }
}
