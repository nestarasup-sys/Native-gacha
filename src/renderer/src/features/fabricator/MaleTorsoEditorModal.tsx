import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { Icon } from '../../ui/components/Icon'
import { applyWardrobeWarpBrush, createWardrobeWarpMesh, drawWardrobeWarp, type WardrobeWarpMesh, type WardrobeWarpPoint } from './wardrobe/wardrobeMeshWarp'
import { WardrobeDeformationBrushControls } from './wardrobe/WardrobePreviewControls'

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

export function MaleTorsoEditorModal({ project, baseTorso, savedTorso, onClose, onSave }: Props) {
  const [part, setPart] = useState<ModelPart>(() => savedTorso ?? copiedTorso(baseTorso))
  const [deforming, setDeforming] = useState(false)
  const [warpReady, setWarpReady] = useState(false)
  const [radius, setRadius] = useState(44)
  const [strength, setStrength] = useState(70)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const boardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const meshRef = useRef<WardrobeWarpMesh>(createWardrobeWarpMesh())
  const dragRef = useRef<{ pointerId: number; last: WardrobeWarpPoint; originalX: Float32Array; originalY: Float32Array; changed: boolean } | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastPointRef = useRef<WardrobeWarpPoint | null>(null)

  useEffect(() => {
    if (!deforming) { setWarpReady(false); imageRef.current = null; return }
    let active = true
    setWarpReady(false)
    meshRef.current = createWardrobeWarpMesh()
    void loadImage(part.dataUrl).then((image) => {
      if (!active) return
      imageRef.current = image
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
    const scale = board.clientWidth / project.width
    const result = drawWardrobeWarp(canvas, image, meshRef.current)
    const padX = result.padding * part.width / image.naturalWidth
    const padY = result.padding * part.height / image.naturalHeight
    canvas.style.left = `${(part.x - padX) * scale}px`
    canvas.style.top = `${(part.y - padY) * scale}px`
    canvas.style.width = `${result.width * part.width / image.naturalWidth * scale}px`
    canvas.style.height = `${result.height * part.height / image.naturalHeight * scale}px`
    canvas.style.transform = `rotate(${part.rotation}deg)`
    return { result, padX, padY, scale }
  }

  useEffect(() => {
    if (!deforming || !warpReady) return
    const frame = requestAnimationFrame(drawWarp)
    return () => cancelAnimationFrame(frame)
  }, [deforming, warpReady, part.x, part.y, part.width, part.height, part.rotation, project.width])

  const scheduleDraw = () => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; drawWarp() })
  }

  const modelPoint = (event: ReactPointerEvent<HTMLCanvasElement>): WardrobeWarpPoint | null => {
    const board = boardRef.current
    if (!board) return null
    const bounds = board.getBoundingClientRect()
    const scale = bounds.width / project.width
    if (scale <= 0) return null
    const world = { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale }
    const radians = -part.rotation * Math.PI / 180
    const centerX = part.x + part.width / 2
    const centerY = part.y + part.height / 2
    const dx = world.x - centerX
    const dy = world.y - centerY
    return { x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians), y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians) }
  }

  const beginWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!warpReady || event.button !== 0) return
    const point = modelPoint(event)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, last: point, originalX: new Float32Array(meshRef.current.offsetX), originalY: new Float32Array(meshRef.current.offsetY), changed: false }
    lastPointRef.current = point
  }

  const moveWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = modelPoint(event)
    if (!point) return
    lastPointRef.current = point
    const drag = dragRef.current
    const image = imageRef.current
    if (!drag || drag.pointerId !== event.pointerId || !image) return
    event.preventDefault()
    const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y }
    applyWardrobeWarpBrush(meshRef.current, image, { x: part.x, y: part.y, width: part.width, height: part.height, rotation: part.rotation }, point, delta, radius, strength / 100)
    drag.last = point
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
    const dataUrl = canvas.toDataURL('image/png')
    const widthScale = part.width / image.naturalWidth
    const heightScale = part.height / image.naturalHeight
    setPart((current) => ({
      ...current,
      dataUrl,
      fakeSkinContours: undefined,
      x: current.x - layout.padX,
      y: current.y - layout.padY,
      width: (layout.result.width) * widthScale,
      height: (layout.result.height) * heightScale
    }))
    setDeforming(false)
    setError('')
  }

  const updateDimension = (key: 'x' | 'y' | 'width' | 'height' | 'rotation', value: number) => {
    if (!Number.isFinite(value)) return
    setPart((current) => ({ ...current, [key]: key === 'width' || key === 'height' ? Math.max(1, value) : value }))
  }

  const restoreOriginal = () => {
    setPart(copiedTorso(baseTorso))
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

  return <div className="male-torso-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="male-torso-modal" role="dialog" aria-modal="true" aria-labelledby="male-torso-title">
      <header className="male-torso-modal-header"><div><small>MODELOS DEV · CÓPIA INDEPENDENTE</small><h2 id="male-torso-title">Tronco masculino · Modelo {String(project.slot).padStart(2, '0')}</h2><p>Edite e deforme esta cópia. O tronco feminino original continua intacto.</p></div><button type="button" aria-label="Fechar editor" disabled={saving} onClick={onClose}>×</button></header>
      <div className="male-torso-modal-body">
        <section className="male-torso-preview-panel" aria-label="Prévia somente do tronco">
          <header><span><i /> PRÉVIA · SOMENTE O TRONCO</span><small>{Math.round(part.width)} × {Math.round(part.height)}</small></header>
          <div className="male-torso-stage">
            <div className="male-torso-artboard" ref={boardRef} style={{ aspectRatio: `${project.width} / ${project.height}` }}>
              {!deforming && <img className="male-torso-part-preview" src={part.dataUrl} alt="Cópia do tronco para o modelo masculino" style={{ left: `${part.x / project.width * 100}%`, top: `${part.y / project.height * 100}%`, width: `${part.width / project.width * 100}%`, height: `${part.height / project.height * 100}%`, transform: `rotate(${part.rotation}deg)` }} />}
              {deforming && <canvas ref={canvasRef} className="male-torso-warp-canvas" aria-label="Pincel para deformar o tronco" onPointerDown={beginWarp} onPointerMove={moveWarp} onPointerUp={finishWarp} onPointerCancel={finishWarp} />}
            </div>
          </div>
          {deforming && <WardrobeDeformationBrushControls active ready={warpReady} radius={radius} strength={strength} onRadiusChange={setRadius} onStrengthChange={setStrength} />}
        </section>
        <aside className="male-torso-edit-panel" aria-label="Ajustes do tronco masculino">
          <strong>Ajustes da cópia</strong>
          <p>A imagem e os ajustes pertencem somente à versão masculina deste slot.</p>
          {([['x', 'Posição X'], ['y', 'Posição Y'], ['width', 'Largura'], ['height', 'Altura'], ['rotation', 'Rotação']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" step={key === 'rotation' ? 1 : 2} value={Number(part[key].toFixed(1))} onChange={(event) => updateDimension(key, Number(event.target.value))} /></label>)}
          <button className={`model-tool-button male-torso-deform-button${deforming ? ' active' : ''}`} type="button" aria-pressed={deforming} disabled={saving} onClick={() => { setError(''); setDeforming((value) => !value) }}><Icon name="move" />{deforming ? 'Concluir deformação' : 'Deformar tronco'}</button>
          <button className="model-tool-button" type="button" disabled={saving} onClick={restoreOriginal}><Icon name="undo" />Restaurar cópia feminina original</button>
          {error && <p className="male-torso-error" role="alert">{error}</p>}
        </aside>
      </div>
      <footer className="male-torso-modal-footer"><small>{deforming ? 'Arraste sobre o tronco para deformar. Conclua a deformação antes de salvar.' : 'A cópia só passa ao catálogo quando você salvar.'}</small><div><button className="quiet-button" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" type="button" disabled={saving || deforming} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar tronco masculino'}</button></div></footer>
    </section>
  </div>
}
