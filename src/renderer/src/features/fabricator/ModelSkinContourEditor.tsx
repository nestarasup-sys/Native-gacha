import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { ModelPart, ModelSkinContourPoint, ModelSkinContourStroke } from '../../../../shared/fabricator'
import { countModelSkinContourPoints, MAX_MODEL_SKIN_CONTOUR_POINTS, MAX_MODEL_SKIN_CONTOUR_STROKES } from '../../../../shared/modelSkinContours'
import { Icon } from '../../ui/components/Icon'
import { createModelBodyAppearancePreview, isModelSkinPart } from './models/modelSkinTone'

type Props = {
  parts: ModelPart[]
  skinTone?: string
  outlineColor?: string
  onClose: () => void
  onSave: (contoursByPart: Record<string, ModelSkinContourStroke[]>) => void
}

type DrawingStroke = { pointerId: number; start: ModelSkinContourPoint }
// Keep the invisible recoloring barrier wider than its subtle editor overlay.
const GUIDE_WIDTH_PIXELS = 5
const GUIDE_PREVIEW_WIDTH_PIXELS = 1.25
const GUIDE_PREVIEW_OPACITY = 0.38
const GUIDE_ENDPOINT_RADIUS_PIXELS = 2

function strokePoints(points: ModelSkinContourPoint[], width: number, height: number): string {
  return points.map(point => `${point.x * width},${point.y * height}`).join(' ')
}

export function ModelSkinContourEditor({ parts, skinTone, outlineColor, onClose, onSave }: Props) {
  const bodyParts = useMemo(() => parts.filter(isModelSkinPart), [parts])
  const [selectedId, setSelectedId] = useState(bodyParts[0]?.id ?? '')
  const [draftByPart, setDraftByPart] = useState<Record<string, ModelSkinContourStroke[]>>(() =>
    Object.fromEntries(bodyParts.map(part => [part.id, part.fakeSkinContours ?? []]))
  )
  const [currentStroke, setCurrentStroke] = useState<ModelSkinContourPoint[]>([])
  const [limitMessage, setLimitMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const drawingRef = useRef<DrawingStroke | null>(null)
  const selectedPart = bodyParts.find(part => part.id === selectedId) ?? bodyParts[0]
  const selectedContours = selectedPart ? draftByPart[selectedPart.id] ?? [] : []
  const contourKey = JSON.stringify(selectedContours)

  useEffect(() => {
    if (!selectedPart) { setPreviewUrl(null); return }
    let active = true
    const draftPart = { ...selectedPart, fakeSkinContours: selectedContours }
    void createModelBodyAppearancePreview(draftPart, skinTone, outlineColor)
      .then(result => { if (active) setPreviewUrl(result) })
      .catch(() => { if (active) setPreviewUrl(null) })
    return () => { active = false }
  }, [selectedPart, contourKey, skinTone, outlineColor])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const imageWidth = selectedPart?.width ?? 1
  const imageHeight = selectedPart?.height ?? 1
  const previewMaxWidth = Math.min(620, 540 * imageWidth / imageHeight)

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>): ModelSkinContourPoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
    }
  }

  const beginStroke = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !selectedPart) return
    event.preventDefault()
    event.stopPropagation()
    const start = pointFromEvent(event)
    drawingRef.current = { pointerId: event.pointerId, start }
    event.currentTarget.setPointerCapture(event.pointerId)
    setLimitMessage('')
    setCurrentStroke([start])
  }

  const continueStroke = (event: PointerEvent<SVGSVGElement>) => {
    const drawing = drawingRef.current
    if (!drawing || drawing.pointerId !== event.pointerId) return
    setCurrentStroke([drawing.start, pointFromEvent(event)])
  }

  const finishStroke = (event: PointerEvent<SVGSVGElement>) => {
    const drawing = drawingRef.current
    if (!drawing || drawing.pointerId !== event.pointerId) return
    drawingRef.current = null
    setCurrentStroke([])
    if (!selectedPart) return
    const end = pointFromEvent(event)
    const points = [drawing.start, end]
    if (Math.hypot((end.x - drawing.start.x) * imageWidth, (end.y - drawing.start.y) * imageHeight) < 1.5) return
    const saved = draftByPart[selectedPart.id] ?? []
    if (saved.length >= MAX_MODEL_SKIN_CONTOUR_STROKES || countModelSkinContourPoints(saved) + points.length > MAX_MODEL_SKIN_CONTOUR_POINTS) {
      setLimitMessage('Esta peça atingiu o limite de traços. Apague um traço para continuar.')
      return
    }
    setLimitMessage('')
    const width = Math.min(0.12, Math.max(0.001, GUIDE_WIDTH_PIXELS / Math.max(1, Math.min(imageWidth, imageHeight))))
    setDraftByPart(current => ({
      ...current,
      [selectedPart.id]: [...(current[selectedPart.id] ?? []), { points, width }]
    }))
  }

  const cancelStroke = (event: PointerEvent<SVGSVGElement>) => {
    if (drawingRef.current?.pointerId !== event.pointerId) return
    drawingRef.current = null
    setCurrentStroke([])
  }

  const undoStroke = () => {
    if (!selectedPart) return
    setDraftByPart(current => ({
      ...current,
      [selectedPart.id]: (current[selectedPart.id] ?? []).slice(0, -1)
    }))
  }

  const clearPart = () => {
    if (!selectedPart) return
    setLimitMessage('')
    setDraftByPart(current => ({ ...current, [selectedPart.id]: [] }))
  }

  const save = () => {
    onSave(draftByPart)
    onClose()
  }

  return <div className="model-skin-contour-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="model-skin-contour-modal" role="dialog" aria-modal="true" aria-labelledby="model-skin-contour-title">
      <header className="model-skin-contour-header">
        <div><h2 id="model-skin-contour-title">Contorno artificial para colorir</h2><p>Desenhe uma linha-guia entre as bordas da junta aberta. Ela fecha a área para a recoloração e não aparece na arte final.</p></div>
        <button className="model-skin-contour-close" type="button" aria-label="Fechar editor" onClick={onClose}>×</button>
      </header>
      <div className="model-skin-contour-content">
        <aside className="model-skin-contour-parts" aria-label="Peças do modelo">
          <strong>Peças ({bodyParts.length})</strong>
          <div className="model-skin-contour-part-list">
            {bodyParts.map(part => {
              const count = (draftByPart[part.id] ?? []).length
              return <button key={part.id} type="button" className={part.id === selectedPart?.id ? 'selected' : ''} onClick={() => { drawingRef.current = null; setCurrentStroke([]); setSelectedId(part.id) }}>
                <span className="model-skin-contour-thumb"><img src={part.dataUrl} alt="" /></span>
                <span><b>{part.name}</b><small>{count ? `${count} traço${count === 1 ? '' : 's'}` : 'Sem guia'}</small></span>
              </button>
            })}
          </div>
        </aside>
        <main className="model-skin-contour-main">
          {selectedPart ? <>
            <div className="model-skin-contour-selected"><strong>{selectedPart.name}</strong><span>{Math.round(imageWidth)} × {Math.round(imageHeight)} px</span></div>
            <div className="model-skin-contour-stage-wrap">
              <div className="model-skin-contour-stage" style={{ width: `min(100%, ${previewMaxWidth}px)`, aspectRatio: `${imageWidth} / ${imageHeight}` }}>
                <img src={previewUrl ?? selectedPart.dataUrl} alt={`Prévia de ${selectedPart.name}`} draggable={false} />
                <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} preserveAspectRatio="none" aria-label={`Desenhe o contorno artificial em ${selectedPart.name}`} onPointerDown={beginStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={cancelStroke}>
                  {selectedContours.map((stroke, index) => <g key={index} pointerEvents="none">
                    <polyline points={strokePoints(stroke.points, imageWidth, imageHeight)} fill="none" stroke="#00a8ff" strokeOpacity={GUIDE_PREVIEW_OPACITY} strokeWidth={GUIDE_PREVIEW_WIDTH_PIXELS} strokeLinecap="round" strokeLinejoin="round" />
                  </g>)}
                  {currentStroke.length > 0 && <g pointerEvents="none">
                    {currentStroke.length > 1 && <>
                      <polyline points={strokePoints(currentStroke, imageWidth, imageHeight)} fill="none" stroke="#00a8ff" strokeOpacity={GUIDE_PREVIEW_OPACITY} strokeWidth={GUIDE_PREVIEW_WIDTH_PIXELS} strokeLinecap="round" strokeLinejoin="round" />
                    </>}
                    {currentStroke.map((point, index) => <g key={index}>
                      <circle cx={point.x * imageWidth} cy={point.y * imageHeight} r={GUIDE_ENDPOINT_RADIUS_PIXELS} fill="#00a8ff" fillOpacity={GUIDE_PREVIEW_OPACITY} />
                    </g>)}
                  </g>}
                </svg>
              </div>
            </div>
            <p className="model-skin-contour-hint">Clique na primeira borda, arraste até a outra e solte. O guia será uma linha reta entre os pontos.</p>
            {limitMessage && <p className="model-skin-contour-limit" role="status">{limitMessage}</p>}
          </> : <p className="model-skin-contour-empty">Este modelo não tem peças anatômicas para editar.</p>}
        </main>
        <aside className="model-skin-contour-tools" aria-label="Ferramentas do contorno artificial">
          <strong>Guias da peça</strong>
          <p>Os traços azuis são barreiras invisíveis usadas somente pelo preenchimento da pele.</p>
          <button type="button" onClick={undoStroke} disabled={!selectedContours.length}>Desfazer último traço</button>
          <button type="button" onClick={clearPart} disabled={!selectedContours.length}>Limpar esta peça</button>
          <small>Espessura fixa: {GUIDE_WIDTH_PIXELS} px</small>
        </aside>
      </div>
      <footer className="model-skin-contour-footer">
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" onClick={save} disabled={!bodyParts.length}><Icon name="check" />Salvar contornos</button>
      </footer>
    </section>
  </div>
}
