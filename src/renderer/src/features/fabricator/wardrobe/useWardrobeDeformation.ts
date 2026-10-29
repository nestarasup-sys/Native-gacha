import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react'
import type { WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'
import { applyWardrobeWarpBrush, createWardrobeWarpMesh, drawWardrobeWarp, type WardrobeWarpMesh, type WardrobeWarpPoint, wardrobeWarpPadding } from './wardrobeMeshWarp'
import { createWardrobeDeformationPatch, createWardrobeRestorationPatch, wardrobeWarpBaseBounds, type WardrobeDeformationPoint, type WardrobeDeformationSessionGeometry } from './wardrobeDeformationModel'

type WardrobeWarpSession = WardrobeDeformationSessionGeometry & {
  image: HTMLImageElement
  committedUrl: string
  mesh: WardrobeWarpMesh
}

type WardrobeWarpDrag = {
  pointerId: number
  componentId: string
  last: WardrobeWarpPoint
  displayOffset: WardrobeDeformationPoint
  originalX: Float32Array
  originalY: Float32Array
  changed: boolean
}

type UseWardrobeDeformationOptions = {
  selected: WardrobeComponent | null
  selectedId: string | null
  draftEdition: number | undefined
  draftRef: MutableRefObject<WardrobeSet | null>
  artboardRef: RefObject<HTMLDivElement | null>
  scale: number
  testPose: boolean
  bodyOffsets: Record<string, WardrobeDeformationPoint>
  updateComponent: (id: string, values: Partial<WardrobeComponent>) => void
  setDirty: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string>>
}
const zeroOffset: WardrobeDeformationPoint = { x: 0, y: 0 }

function loadWardrobeWarpImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem da peça para deformar.'))
    image.src = source
    if (image.complete && image.naturalWidth > 0) resolve(image)
  })
}

export function useWardrobeDeformation({
  selected,
  selectedId,
  draftEdition,
  draftRef,
  artboardRef,
  scale,
  testPose,
  bodyOffsets,
  updateComponent,
  setDirty,
  setError
}: UseWardrobeDeformationOptions) {
  const [deformMode, setDeformMode] = useState(false)
  const [warpReadyId, setWarpReadyId] = useState<string | null>(null)
  const [warpRadius, setWarpRadius] = useState(80)
  const [warpStrength, setWarpStrength] = useState(70)
  const warpCanvasRef = useRef<HTMLCanvasElement>(null)
  const warpBrushCursorRef = useRef<HTMLDivElement>(null)
  const warpSessionsRef = useRef(new Map<string, WardrobeWarpSession>())
  const warpDragRef = useRef<WardrobeWarpDrag | null>(null)
  const warpDrawFrameRef = useRef<number | null>(null)
  const lastWarpPointRef = useRef<WardrobeWarpPoint | null>(null)
  const dirtyWarpImageIdsRef = useRef(new Set<string>())

  const clear = useCallback(() => {
    if (warpDrawFrameRef.current !== null) cancelAnimationFrame(warpDrawFrameRef.current)
    warpDrawFrameRef.current = null
    warpDragRef.current = null
    lastWarpPointRef.current = null
    warpSessionsRef.current.clear()
    dirtyWarpImageIdsRef.current.clear()
    setWarpReadyId(null)
    setDeformMode(false)
    if (warpBrushCursorRef.current) warpBrushCursorRef.current.style.display = 'none'
  }, [])

  const ensureWardrobeWarpSession = useCallback(async (component: WardrobeComponent): Promise<WardrobeWarpSession> => {
    const cached = warpSessionsRef.current.get(component.id)
    if (cached && (cached.sourceUrl === component.dataUrl || cached.committedUrl === component.dataUrl)) {
      warpSessionsRef.current.delete(component.id)
      warpSessionsRef.current.set(component.id, cached)
      return cached
    }
    if (cached) warpSessionsRef.current.delete(component.id)
    const image = await loadWardrobeWarpImage(component.dataUrl)
    if (warpSessionsRef.current.size >= 4) {
      const oldest = warpSessionsRef.current.keys().next().value
      if (oldest) warpSessionsRef.current.delete(oldest)
    }
    const session: WardrobeWarpSession = {
      sourceUrl: component.dataUrl,
      committedUrl: component.dataUrl,
      image,
      mesh: createWardrobeWarpMesh(),
      committedPadding: 0
    }
    warpSessionsRef.current.set(component.id, session)
    return session
  }, [])

  const drawWardrobeWarpPreview = useCallback((component: WardrobeComponent, displayOffset: WardrobeDeformationPoint = zeroOffset, displayScale = scale) => {
    const canvas = warpCanvasRef.current
    const session = warpSessionsRef.current.get(component.id)
    if (!canvas || !session) return null
    const imageSize = { width: session.image.naturalWidth, height: session.image.naturalHeight }
    const bounds = wardrobeWarpBaseBounds(component, imageSize, session.committedPadding, displayOffset)
    const padding = wardrobeWarpPadding(session.mesh)
    const result = drawWardrobeWarp(canvas, session.image, session.mesh, padding)
    const scaleX = bounds.width / session.image.naturalWidth
    const scaleY = bounds.height / session.image.naturalHeight
    canvas.style.left = `${(bounds.x - result.padding * scaleX) * displayScale}px`
    canvas.style.top = `${(bounds.y - result.padding * scaleY) * displayScale}px`
    canvas.style.width = `${result.width * scaleX * displayScale}px`
    canvas.style.height = `${result.height * scaleY * displayScale}px`
    canvas.style.transform = `rotate(${component.rotation}deg)`
    canvas.style.transformOrigin = 'center'
    return { session, bounds, padding: result.padding, scaleX, scaleY }
  }, [scale])

  const scheduleWardrobeWarpPreview = useCallback((component: WardrobeComponent, displayOffset: WardrobeDeformationPoint = zeroOffset) => {
    if (warpDrawFrameRef.current !== null) return
    warpDrawFrameRef.current = requestAnimationFrame(() => {
      warpDrawFrameRef.current = null
      const current = draftRef.current?.components.find((item) => item.id === component.id) ?? component
      drawWardrobeWarpPreview(current, displayOffset)
    })
  }, [drawWardrobeWarpPreview, draftRef])

  const warpPointFromPointer = useCallback((event: ReactPointerEvent<HTMLElement>): WardrobeWarpPoint | null => {
    const bounds = artboardRef.current?.getBoundingClientRect()
    if (!bounds || scale <= 0) return null
    return { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale }
  }, [artboardRef, scale])

  const updateWarpBrushCursor = useCallback((point: WardrobeWarpPoint | null) => {
    const cursor = warpBrushCursorRef.current
    if (!cursor || !point || !deformMode) {
      if (cursor) cursor.style.display = 'none'
      return
    }
    const diameter = warpRadius * 2 * scale
    cursor.style.display = 'block'
    cursor.style.width = `${diameter}px`
    cursor.style.height = `${diameter}px`
    cursor.style.left = `${point.x * scale - diameter / 2}px`
    cursor.style.top = `${point.y * scale - diameter / 2}px`
  }, [deformMode, warpRadius, scale])

  useEffect(() => {
    if (!deformMode || !selected || draftEdition === 2) {
      setWarpReadyId(null)
      if (warpBrushCursorRef.current) warpBrushCursorRef.current.style.display = 'none'
      return
    }
    const cached = warpSessionsRef.current.get(selected.id)
    if (cached && (cached.sourceUrl === selected.dataUrl || cached.committedUrl === selected.dataUrl)) {
      warpSessionsRef.current.delete(selected.id)
      warpSessionsRef.current.set(selected.id, cached)
      setWarpReadyId(selected.id)
      return
    }
    let active = true
    setWarpReadyId(null)
    void ensureWardrobeWarpSession(selected).then(() => {
      if (active) setWarpReadyId(selected.id)
    }).catch((reason: unknown) => {
      if (active) {
        setDeformMode(false)
        setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a peça para deformação.')
      }
    })
    return () => { active = false }
  }, [deformMode, selectedId, selected?.dataUrl, draftEdition, ensureWardrobeWarpSession, setError])

  useLayoutEffect(() => {
    if (!deformMode || !selected || warpReadyId !== selected.id || testPose) return
    const offset = selected.binding?.boneId === selected.attachedPartId ? bodyOffsets[selected.attachedPartId] ?? zeroOffset : zeroOffset
    drawWardrobeWarpPreview(selected, offset, scale)
    updateWarpBrushCursor(lastWarpPointRef.current)
  }, [deformMode, selectedId, warpReadyId, scale, selected?.dataUrl, selected?.x, selected?.y, selected?.width, selected?.height, selected?.rotation, selected?.attachedPartId, selected?.binding?.boneId, bodyOffsets, testPose, drawWardrobeWarpPreview, updateWarpBrushCursor])

  useEffect(() => { updateWarpBrushCursor(lastWarpPointRef.current) }, [updateWarpBrushCursor])
  useEffect(() => { if (testPose) setDeformMode(false) }, [testPose])
  useEffect(() => () => {
    if (warpDrawFrameRef.current !== null) cancelAnimationFrame(warpDrawFrameRef.current)
    warpDrawFrameRef.current = null
    warpDragRef.current = null
    warpSessionsRef.current.clear()
    dirtyWarpImageIdsRef.current.clear()
  }, [])

  const beginWardrobeWarp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, component: WardrobeComponent, displayOffset: WardrobeDeformationPoint) => {
    if (event.button !== 0 || !deformMode || warpReadyId !== component.id || !selected || selected.id !== component.id) return
    const session = warpSessionsRef.current.get(component.id)
    const point = warpPointFromPointer(event)
    if (!session || !point) return
    drawWardrobeWarpPreview(component, displayOffset)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    warpDragRef.current = {
      pointerId: event.pointerId,
      componentId: component.id,
      last: point,
      displayOffset,
      originalX: new Float32Array(session.mesh.offsetX),
      originalY: new Float32Array(session.mesh.offsetY),
      changed: false
    }
    lastWarpPointRef.current = point
    updateWarpBrushCursor(point)
  }, [deformMode, warpReadyId, selected, warpPointFromPointer, drawWardrobeWarpPreview, updateWarpBrushCursor])

  const moveWardrobeWarp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, component: WardrobeComponent, displayOffset: WardrobeDeformationPoint) => {
    const point = warpPointFromPointer(event)
    if (!point) return
    lastWarpPointRef.current = point
    updateWarpBrushCursor(point)
    const drag = warpDragRef.current
    const session = warpSessionsRef.current.get(component.id)
    if (!drag || drag.pointerId !== event.pointerId || drag.componentId !== component.id || !session) return
    event.preventDefault()
    event.stopPropagation()
    const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y }
    const distance = Math.hypot(delta.x, delta.y)
    if (distance <= 0.001) return
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, warpRadius * 0.2)))
    const bounds = wardrobeWarpBaseBounds(component, { width: session.image.naturalWidth, height: session.image.naturalHeight }, session.committedPadding, displayOffset)
    for (let step = 1; step <= steps; step += 1) {
      const previousPoint = { x: drag.last.x + delta.x * ((step - 1) / steps), y: drag.last.y + delta.y * ((step - 1) / steps) }
      const brushPoint = { x: drag.last.x + delta.x * (step / steps), y: drag.last.y + delta.y * (step / steps) }
      applyWardrobeWarpBrush(session.mesh, session.image, bounds, brushPoint, { x: brushPoint.x - previousPoint.x, y: brushPoint.y - previousPoint.y }, warpRadius, warpStrength / 100)
    }
    drag.last = point
    drag.changed = true
    scheduleWardrobeWarpPreview(component, displayOffset)
  }, [warpPointFromPointer, updateWarpBrushCursor, warpRadius, warpStrength, scheduleWardrobeWarpPreview])

  const finishWardrobeWarp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, component: WardrobeComponent, displayOffset: WardrobeDeformationPoint) => {
    if (event.type === 'pointerup') moveWardrobeWarp(event, component, displayOffset)
    const drag = warpDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || drag.componentId !== component.id) return
    warpDragRef.current = null
    if (warpDrawFrameRef.current !== null) cancelAnimationFrame(warpDrawFrameRef.current)
    warpDrawFrameRef.current = null
    const session = warpSessionsRef.current.get(component.id)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Pointer capture may already have been released by Chromium. */ }
    if (!session) return
    if (event.type === 'pointercancel') {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawWardrobeWarpPreview(component, displayOffset)
      return
    }
    if (!drag.changed) {
      drawWardrobeWarpPreview(component, displayOffset)
      return
    }
    let layout: ReturnType<typeof drawWardrobeWarpPreview> = null
    let imageUrl = ''
    try {
      layout = drawWardrobeWarpPreview(component, displayOffset)
      const canvas = warpCanvasRef.current
      if (!layout || !canvas) return
      imageUrl = canvas.toDataURL('image/png')
    } catch (reason) {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawWardrobeWarpPreview(component, displayOffset)
      setError(reason instanceof Error ? `Não foi possível finalizar a deformação: ${reason.message}` : 'Não foi possível finalizar a deformação.')
      return
    }
    if (!layout || !imageUrl) return
    const patch = createWardrobeDeformationPatch(component, {
      sourceUrl: session.sourceUrl,
      image: { width: session.image.naturalWidth, height: session.image.naturalHeight },
      committedPadding: session.committedPadding
    }, layout, displayOffset, imageUrl)
    session.committedPadding = layout.padding
    session.committedUrl = imageUrl
    dirtyWarpImageIdsRef.current.add(component.id)
    setDirty(true)
    setError('')
    updateComponent(component.id, patch)
  }, [moveWardrobeWarp, drawWardrobeWarpPreview, setDirty, setError, updateComponent])

  const leaveWardrobeWarp = useCallback(() => {
    if (warpDragRef.current) return
    lastWarpPointRef.current = null
    updateWarpBrushCursor(null)
  }, [updateWarpBrushCursor])

  const invalidateImage = useCallback((componentId: string) => {
    warpSessionsRef.current.delete(componentId)
    dirtyWarpImageIdsRef.current.add(componentId)
  }, [])

  const restoreDeformation = useCallback((component: WardrobeComponent | null) => {
    if (!component) return
    const patch = createWardrobeRestorationPatch(component)
    if (!patch) return
    warpSessionsRef.current.delete(component.id)
    dirtyWarpImageIdsRef.current.add(component.id)
    setDeformMode(false)
    setWarpReadyId(null)
    setError('')
    updateComponent(component.id, patch)
  }, [setError, updateComponent])

  const hasDirtyImage = useCallback((componentId: string) => dirtyWarpImageIdsRef.current.has(componentId), [])
  const clearDirtyImages = useCallback(() => dirtyWarpImageIdsRef.current.clear(), [])

  return {
    deformMode,
    setDeformMode,
    warpReadyId,
    warpRadius,
    setWarpRadius,
    warpStrength,
    setWarpStrength,
    warpCanvasRef,
    warpBrushCursorRef,
    clear,
    invalidateImage,
    restoreDeformation,
    hasDirtyImage,
    clearDirtyImages,
    beginWardrobeWarp,
    moveWardrobeWarp,
    finishWardrobeWarp,
    leaveWardrobeWarp
  }
}
