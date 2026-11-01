import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { Icon } from '../../ui/components/Icon'
import { applyWardrobeWarpBrushStroke, createWardrobeWarpMesh, drawWardrobeWarp, type WardrobeWarpMesh, type WardrobeWarpPoint } from './wardrobe/wardrobeMeshWarp'
import { WardrobeDeformationBrushControls } from './wardrobe/WardrobePreviewControls'
import { createMaleTorsoDeformationPatch } from './models/maleTorsoDeformation'
import { extractAlphaContourPoints, nearestAlphaContourPoint, type AlphaContourPoint } from './models/maleTorsoContour'

type Props = {
  project: FabricatorProject
  baseTorso: ModelPart
  savedTorso?: ModelPart
  onClose: () => void
  onSave: (part: ModelPart) => Promise<void>
}

function copiedTorso(source: ModelPart): ModelPart {
  const { chromaBaseDataUrl: _baseImage, ...part } = source
  return { ...part, id: 'male-torso', name: 'Tronco masculino', selected: false, chromaBaseSaved: false, chromaBaseDataUrl: undefined }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar o tronco para deformação.'))
    image.src = source
    if (image.complete && image.naturalWidth > 0) resolve(image)
  })
}

function findImageAlphaContour(image: HTMLImageElement): AlphaContourPoint[] {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  context.drawImage(image, 0, 0)
  return extractAlphaContourPoints(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
}

export function MaleTorsoEditorModal({ project, baseTorso, savedTorso, onClose, onSave }: Props) {
  const initialPart = savedTorso ?? copiedTorso(baseTorso)
  const [part, setPart] = useState<ModelPart>(initialPart)
  const [previewScale, setPreviewScale] = useState(() => Math.min(560 / Math.max(1, initialPart.width), 520 / Math.max(1, initialPart.height)))
  const [deforming, setDeforming] = useState(false)
  const [deformationTool, setDeformationTool] = useState<'brush' | 'contour'>('brush')
  const [warpReady, setWarpReady] = useState(false)
  const [radius, setRadius] = useState(44)
  const [strength, setStrength] = useState(70)
  const [previewBackground, setPreviewBackground] = useState('#ffffff')
  const [lastDeformation, setLastDeformation] = useState<ModelPart | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const boardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brushCursorRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const contourPointsRef = useRef<AlphaContourPoint[]>([])
  const meshRef = useRef<WardrobeWarpMesh>(createWardrobeWarpMesh(20, 26))
  const dragRef = useRef<{ pointerId: number; startClient: WardrobeWarpPoint; startWorld: WardrobeWarpPoint; contourAnchor: WardrobeWarpPoint | null; tool: 'brush' | 'contour'; last: WardrobeWarpPoint; originalX: Float32Array; originalY: Float32Array; changed: boolean; activated: boolean } | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastPointerRef = useRef<WardrobeWarpPoint | null>(null)

  useEffect(() => {
    if (!deforming) { setWarpReady(false); imageRef.current = null; contourPointsRef.current = []; return }
    let active = true
    setWarpReady(false)
    meshRef.current = createWardrobeWarpMesh(20, 26)
    void loadImage(part.dataUrl).then((image) => {
      if (!active) return
      imageRef.current = image
      try { contourPointsRef.current = findImageAlphaContour(image) }
      catch { contourPointsRef.current = [] }
      setWarpReady(true)
    }).catch((reason: unknown) => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a deformação.'); setDeforming(false) }
    })
    return () => { active = false }
  }, [deforming, part.dataUrl])

  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current) }, [])

  const drawWarp = () => {
    const canvas = canvasRef.current
    const image = imageRef.current
    const board = boardRef.current
    if (!canvas || !image || !board) return null
    const scale = Math.min(board.clientWidth / part.width, board.clientHeight / part.height)
    const originX = (board.clientWidth - part.width * scale) / 2
    const originY = (board.clientHeight - part.height * scale) / 2
    const result = drawWardrobeWarp(canvas, image, meshRef.current, 0)
    const padX = result.padding * part.width / image.naturalWidth
    const padY = result.padding * part.height / image.naturalHeight
    canvas.style.left = `${originX - padX * scale}px`
    canvas.style.top = `${originY - padY * scale}px`
    canvas.style.width = `${result.width * part.width / image.naturalWidth * scale}px`
    canvas.style.height = `${result.height * part.height / image.naturalHeight * scale}px`
    canvas.style.transform = `rotate(${part.rotation}deg)`
    return { result, padX, padY, scale }
  }

  useEffect(() => {
    if (!deforming || !warpReady) return
    const frame = requestAnimationFrame(drawWarp)
    return () => cancelAnimationFrame(frame)
  }, [deforming, warpReady, part.x, part.y, part.width, part.height, part.rotation])

  const scheduleDraw = () => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; drawWarp() })
  }

  const modelPoint = (event: ReactPointerEvent<HTMLCanvasElement>): WardrobeWarpPoint | null => {
    const board = boardRef.current
    if (!board) return null
    const bounds = board.getBoundingClientRect()
    const scale = Math.min(bounds.width / part.width, bounds.height / part.height)
    if (scale <= 0) return null
    const originX = (bounds.width - part.width * scale) / 2
    const originY = (bounds.height - part.height * scale) / 2
    const world = { x: (event.clientX - bounds.left - originX) / scale, y: (event.clientY - bounds.top - originY) / scale }
    return world
  }

  const localPoint = (world: WardrobeWarpPoint): WardrobeWarpPoint => {
    const radians = -part.rotation * Math.PI / 180
    const centerX = part.width / 2
    const centerY = part.height / 2
    const dx = world.x - centerX
    const dy = world.y - centerY
    return { x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians), y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians) }
  }

  const worldPoint = (local: WardrobeWarpPoint): WardrobeWarpPoint => {
    const radians = part.rotation * Math.PI / 180
    const centerX = part.width / 2
    const centerY = part.height / 2
    const dx = local.x - centerX
    const dy = local.y - centerY
    return { x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians), y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians) }
  }

  const nearestContourWorldPoint = (world: WardrobeWarpPoint) => {
    const image = imageRef.current
    if (!image || !contourPointsRef.current.length) return null
    const local = localPoint(world)
    const target = { x: local.x * image.naturalWidth / part.width, y: local.y * image.naturalHeight / part.height }
    const nearest = nearestAlphaContourPoint(contourPointsRef.current, target)
    if (!nearest) return null
    const anchor = { x: nearest.point.x * part.width / image.naturalWidth, y: nearest.point.y * part.height / image.naturalHeight }
    const distance = Math.hypot((nearest.point.x - target.x) * part.width / image.naturalWidth, (nearest.point.y - target.y) * part.height / image.naturalHeight)
    return { point: worldPoint(anchor), distance }
  }

  const cursorPoint = (world: WardrobeWarpPoint) => {
    if (deformationTool !== 'contour') return world
    const nearest = nearestContourWorldPoint(world)
    const snapDistance = Math.max(10, Math.min(24, radius * 0.65))
    return nearest && nearest.distance <= snapDistance ? nearest.point : world
  }

  const updateBrushCursor = (point: WardrobeWarpPoint | null) => {
    lastPointerRef.current = point
    const cursor = brushCursorRef.current
    const board = boardRef.current
    if (!cursor || !board || !deforming || !point) {
      if (cursor) cursor.style.display = 'none'
      return
    }
    const scale = Math.min(board.clientWidth / part.width, board.clientHeight / part.height)
    const diameter = Math.max(8, radius * 2 * scale)
    cursor.style.display = 'block'
    cursor.style.width = `${diameter}px`
    cursor.style.height = `${diameter}px`
    cursor.style.left = `${point.x * scale - diameter / 2}px`
    cursor.style.top = `${point.y * scale - diameter / 2}px`
  }

  useEffect(() => {
    if (!deforming) {
      updateBrushCursor(null)
      return
    }
    if (lastPointerRef.current) updateBrushCursor(lastPointerRef.current)
  }, [deforming, deformationTool, radius, part.width, part.height, part.rotation, warpReady])

  const leaveWarpPreview = () => {
    if (dragRef.current) return
    updateBrushCursor(null)
  }

  const beginWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!warpReady || event.button !== 0 || dragRef.current) return
    const point = modelPoint(event)
    if (!point) return
    let anchor = point
    let contourAnchor: WardrobeWarpPoint | null = null
    if (deformationTool === 'contour') {
      const nearest = nearestContourWorldPoint(point)
      const grabDistance = Math.max(10, Math.min(24, radius * 0.65))
      if (!nearest || nearest.distance > grabDistance) {
        setError('Clique próximo ao contorno visível do tronco para puxá-lo.')
        return
      }
      anchor = nearest.point
      contourAnchor = nearest.point
    }
    updateBrushCursor(anchor)
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startWorld: point, contourAnchor, tool: deformationTool, last: anchor, originalX: new Float32Array(meshRef.current.offsetX), originalY: new Float32Array(meshRef.current.offsetY), changed: false, activated: false }
  }

  const moveWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = modelPoint(event)
    if (!point) return
    const drag = dragRef.current
    const image = imageRef.current
    const brushPoint = drag?.tool === 'contour' && drag.contourAnchor
      ? { x: drag.contourAnchor.x + point.x - drag.startWorld.x, y: drag.contourAnchor.y + point.y - drag.startWorld.y }
      : deformationTool === 'contour' ? cursorPoint(point) : point
    updateBrushCursor(brushPoint)
    if (!drag || drag.pointerId !== event.pointerId || !image) return
    event.preventDefault()
    if (!drag.activated && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) < 3) return
    if (Math.hypot(brushPoint.x - drag.last.x, brushPoint.y - drag.last.y) < 0.01) return
    applyWardrobeWarpBrushStroke(meshRef.current, image, { x: 0, y: 0, width: part.width, height: part.height, rotation: part.rotation }, drag.last, brushPoint, radius, strength / 100)
    drag.last = brushPoint
    drag.activated = true
    drag.changed = true
    scheduleDraw()
  }

  const finishWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.type === 'pointerup') moveWarp(event)
    dragRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* O ponteiro pode já ter sido liberado pelo navegador. */ }
    if (event.type === 'pointercancel') {
      meshRef.current.offsetX.set(drag.originalX)
      meshRef.current.offsetY.set(drag.originalY)
      drawWarp()
      return
    }
    if (!drag.changed) return
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    const layout = drawWarp()
    const canvas = canvasRef.current
    if (!layout || !canvas) return
    const image = imageRef.current
    if (!image) return
    let dataUrl: string
    try { dataUrl = canvas.toDataURL('image/png') }
    catch (reason) {
      meshRef.current.offsetX.set(drag.originalX)
      meshRef.current.offsetY.set(drag.originalY)
      drawWarp()
      setError(reason instanceof Error ? `Não foi possível gerar a imagem deformada: ${reason.message}` : 'Não foi possível gerar a imagem deformada.')
      return
    }
    setLastDeformation(part)
    setPart((current) => createMaleTorsoDeformationPatch(current, dataUrl))
    meshRef.current = createWardrobeWarpMesh(20, 26)
    imageRef.current = null
    setWarpReady(false)
    setError('')
  }

  const finishDeformation = () => setDeforming(false)

  const undoDeformation = () => {
    if (!lastDeformation) return
    setPart(lastDeformation)
    setLastDeformation(null)
  }

  const restoreOriginal = () => {
    setPart(copiedTorso(baseTorso))
    setPreviewScale(Math.min(560 / Math.max(1, baseTorso.width), 520 / Math.max(1, baseTorso.height)))
    setLastDeformation(null)
    setDeforming(false)
    setError('')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try { await onSave({ ...part, id: 'male-torso', name: 'Tronco masculino', selected: false }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o tronco masculino.') }
    finally { setSaving(false) }
  }

  return <div className="male-torso-modal-backdrop" role="presentation">
    <section className="male-torso-modal" role="dialog" aria-modal="true" aria-labelledby="male-torso-title">
      <header className="male-torso-modal-header"><div><small>MODELOS DEV · CÓPIA INDEPENDENTE</small><h2 id="male-torso-title">Tronco masculino · Modelo {String(project.slot).padStart(2, '0')}</h2><p>Edite e deforme esta cópia. O tronco feminino original continua intacto.</p></div><button type="button" aria-label="Fechar editor" disabled={saving} onClick={onClose}>×</button></header>
      <div className="male-torso-modal-body">
        <section className="male-torso-preview-panel" aria-label="Prévia somente do tronco">
          <header><span><i /> PRÉVIA · SOMENTE O TRONCO</span><div className="male-torso-preview-tools"><label title="Cor de fundo da prévia">Fundo<input aria-label="Cor de fundo da prévia do tronco" type="color" value={previewBackground} onChange={(event) => setPreviewBackground(event.target.value)} /></label><small>{Math.round(part.width)} × {Math.round(part.height)}</small></div></header>
          <nav className="male-torso-editor-toolbar" aria-label="Ferramentas da cópia masculina">
            <button className={`model-tool-button male-torso-deform-button${deforming && deformationTool === 'brush' ? ' active' : ''}`} type="button" aria-pressed={deforming && deformationTool === 'brush'} disabled={saving || (deforming && !warpReady)} onClick={() => { setError(''); setDeformationTool('brush'); setRadius(44); if (!deforming) setDeforming(true) }}><Icon name="move" />Pincel livre</button>
            <button className={`model-tool-button male-torso-deform-button${deforming && deformationTool === 'contour' ? ' active' : ''}`} type="button" aria-pressed={deforming && deformationTool === 'contour'} disabled={saving || (deforming && !warpReady)} onClick={() => { setError(''); setDeformationTool('contour'); setRadius(18); if (!deforming) setDeforming(true) }}><Icon name="move" />Puxar contorno</button>
            {deforming && <button className="model-tool-button" type="button" disabled={saving || !warpReady} onClick={finishDeformation}>Concluir deformação</button>}
            <button className="model-tool-button" type="button" disabled={saving || !lastDeformation || deforming} onClick={undoDeformation}><Icon name="undo" />Desfazer deformação</button>
            <button className="model-tool-button" type="button" disabled={saving || deforming} onClick={restoreOriginal}><Icon name="undo" />Restaurar cópia feminina</button>
          </nav>
          <div className="male-torso-stage" style={{ backgroundColor: previewBackground }}>
            <div className="male-torso-artboard" ref={boardRef} style={{ width: `${part.width * previewScale}px`, height: `${part.height * previewScale}px` }}>
              {!deforming && <img className="male-torso-part-preview" src={part.dataUrl} alt="Cópia do tronco para o modelo masculino" style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `rotate(${part.rotation}deg)` }} />}
              {deforming && !warpReady && <img className="male-torso-part-preview" src={part.dataUrl} alt="Prévia atualizada do tronco masculino" style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `rotate(${part.rotation}deg)` }} />}
              {deforming && <canvas ref={canvasRef} className="male-torso-warp-canvas" aria-label="Pincel para deformar o tronco" onPointerDown={beginWarp} onPointerMove={moveWarp} onPointerUp={finishWarp} onPointerCancel={finishWarp} onPointerLeave={leaveWarpPreview} style={{ visibility: warpReady ? 'visible' : 'hidden' }} />}
              {deforming && <div ref={brushCursorRef} className="male-torso-brush-cursor" aria-hidden="true" />}
            </div>
          </div>
          {deforming && <><WardrobeDeformationBrushControls active ready={warpReady} radius={radius} strength={strength} onRadiusChange={setRadius} onStrengthChange={setStrength} /><p className="male-torso-tool-hint">{deformationTool === 'contour' ? 'Clique perto da borda do tronco e arraste para puxar o contorno.' : 'Arraste sobre o tronco para deformar a região sob o pincel.'}</p></>}
        </section>
      </div>
      {error && <p className="male-torso-error" role="alert">{error}</p>}
      <footer className="male-torso-modal-footer"><small>{deforming ? 'Cada traço atualiza o tamanho da prévia. Conclua a ferramenta antes de salvar.' : 'A cópia só passa ao catálogo quando você salvar.'}</small><div><button className="quiet-button" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" type="button" disabled={saving || deforming} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar tronco masculino'}</button></div></footer>
    </section>
  </div>
}
