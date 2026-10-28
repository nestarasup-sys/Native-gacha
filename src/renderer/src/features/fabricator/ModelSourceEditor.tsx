import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { isHeadPart } from './models/resize'
import { normalizePartAnchors } from './models/rig'
import { composeModelSource, sourceRect, validateModelSourceChroma, validateModelSourceDimensions, MAX_CHROMA_TOLERANCE, type ModelSourceDimensions, type ModelSourceResult } from './models/modelSource'
import { cropModelSourcePart, eraseModelSourceBrush, splitModelSourcePart, worldPointInsideCrop, worldPointToPart, type ModelSourceCrop, type ModelSourcePoint } from './models/modelSourceEditing'

type Props = {
  project: FabricatorProject
  onClose: () => void
  onPublish: (result: ModelSourceResult) => Promise<void>
}
type PreviewMode = 'part' | 'sheet'
type EditTool = 'select' | 'erase' | 'crop' | 'split' | 'outline'
type DrawingGesture = { tool: Exclude<EditTool, 'select'>; start: ModelSourcePoint; current: ModelSourcePoint; points: ModelSourcePoint[] }
type UndoSnapshot = { project: FabricatorProject; dimensions: ModelSourceDimensions; tolerance: number; selectedId: string }
type MutationResult = { project: FabricatorProject; selectedId: string; status: string }

const card: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', padding: 9, borderRadius: 9, cursor: 'pointer', color: 'inherit', background: '#202635', border: '1px solid #3c4554', textAlign: 'left' }
const field: CSSProperties = { width: '100%', color: '#f7f8fa', background: '#1b2230', border: '1px solid #64748b', borderRadius: 7, padding: 8 }
const checker: CSSProperties = {
  backgroundColor: '#d2d8e2',
  backgroundImage: 'conic-gradient(#fff 25%, transparent 0 50%, #fff 0 75%, transparent 0)',
  backgroundSize: '20px 20px'
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const toolButton = (active: boolean, disabled: boolean): CSSProperties => ({
  ...field,
  width: 'auto',
  padding: '7px 10px',
  fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: active ? '#24558b' : '#1b2230',
  opacity: disabled ? .5 : 1
})

function cropFromGesture(gesture: DrawingGesture): ModelSourceCrop {
  const x = Math.floor(Math.min(gesture.start.x, gesture.current.x))
  const y = Math.floor(Math.min(gesture.start.y, gesture.current.y))
  const right = Math.ceil(Math.max(gesture.start.x, gesture.current.x))
  const bottom = Math.ceil(Math.max(gesture.start.y, gesture.current.y))
  return { x, y, width: right - x, height: bottom - y }
}

function orderAfterSplit(order: string[] | undefined, originalId: string, retainedId: string, newId: string): string[] | undefined {
  if (!order) return undefined
  const next = [...order]
  const index = next.indexOf(originalId)
  if (index < 0) return [...next, retainedId, newId]
  next.splice(index, 1, retainedId, newId)
  return next
}

export function ModelSourceEditor({ project, onClose, onPublish }: Props) {
  const [draft, setDraft] = useState(project)
  const [selectedId, setSelectedId] = useState(project.parts[0]?.id ?? '')
  const [dimensions, setDimensions] = useState<ModelSourceDimensions>({})
  const [chromaTolerance, setChromaTolerance] = useState(project.tolerance)
  const [preview, setPreview] = useState('')
  const [previewParts, setPreviewParts] = useState<ModelPart[]>([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadInfo, setDownloadInfo] = useState('')
  const [mode, setMode] = useState<PreviewMode>('part')
  const [tool, setTool] = useState<EditTool>('select')
  const [zoom, setZoom] = useState(1)
  const [brushSize, setBrushSize] = useState(18)
  const [gesture, setGesture] = useState<DrawingGesture | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const drag = useRef<{ id: string; originX: number; originY: number; clientX: number; clientY: number } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<DrawingGesture | null>(null)
  const undoStack = useRef<UndoSnapshot[]>([])

  const selected = draft.parts.find(part => part.id === selectedId)
  const selectedRect = selected ? sourceRect(selected, dimensions[selected.id]) : null
  const baseline = selected ? sourceRect(selected) : null
  const isHead = Boolean(selected && isHeadPart(selected))
  const edited = draft !== project || Object.keys(dimensions).length > 0 || chromaTolerance !== project.tolerance
  const structureChanged = draft.parts.length !== project.parts.length
    || project.parts.some(part => !draft.parts.some(item => item.id === part.id))
  const logicalWidth = mode === 'part' ? selectedRect?.width ?? 1 : draft.width
  const logicalHeight = mode === 'part' ? selectedRect?.height ?? 1 : draft.height
  const fitScale = Math.min(1, 620 / Math.max(1, logicalWidth), 430 / Math.max(1, logicalHeight))
  const previewScale = fitScale * zoom
  const surfaceWidth = Math.max(1, logicalWidth * previewScale)
  const surfaceHeight = Math.max(1, logicalHeight * previewScale)
  const previewPart = previewParts.find(part => part.id === selectedId) ?? selected

  useEffect(() => {
    let active = true
    const handle = window.setTimeout(() => {
      void composeModelSource(draft, dimensions, chromaTolerance).then(result => {
        if (!active) return
        setPreview(result.previewDataUrl)
        setPreviewParts(result.parts)
        setError('')
      }).catch(reason => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Prévia inválida.')
        setPreview('')
        setPreviewParts([])
      })
    }, 180)
    return () => { active = false; window.clearTimeout(handle) }
  }, [draft, dimensions, chromaTolerance])

  const setRect = (part: ModelPart, next: { x: number; y: number; width: number; height: number }) => {
    const original = sourceRect(part)
    setDimensions(current => {
      const state = { ...current }
      if (next.x === original.x && next.y === original.y && next.width === original.width && next.height === original.height) delete state[part.id]
      else state[part.id] = { ...next }
      return state
    })
    setDownloadInfo('')
  }
  const setNumber = (axis: 'width' | 'height' | 'x' | 'y', value: number) => {
    if (!selected || !selectedRect || !Number.isFinite(value) || busy || downloading) return
    if ((axis === 'x' || axis === 'y') && !isHead) return
    setRect(selected, { ...selectedRect, [axis]: Math.round(value) })
  }
  const startHeadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected || !selectedRect || mode !== 'sheet' || !isHead || busy || downloading || event.button !== 0) return
    drag.current = { id: selected.id, originX: selectedRect.x, originY: selectedRect.y, clientX: event.clientX, clientY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveHeadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !selected || selected.id !== drag.current.id || !isHead || busy) return
    const origin = drag.current
    const nextX = Math.max(0, Math.min(draft.width - (selectedRect?.width ?? selected.width), Math.round(origin.originX + (event.clientX - origin.clientX) / previewScale)))
    const nextY = Math.max(0, Math.min(draft.height - (selectedRect?.height ?? selected.height), Math.round(origin.originY + (event.clientY - origin.clientY) / previewScale)))
    setRect(selected, { ...sourceRect(selected, dimensions[selected.id]), x: nextX, y: nextY })
  }
  const stopHeadDrag = () => { drag.current = null }
  const restoreSelected = () => {
    if (!selected) return
    setDimensions(current => { const state = { ...current }; delete state[selected.id]; return state })
    setDownloadInfo('')
    setStatus('Dimensões e posição desta peça restauradas.')
  }
  const compile = async (): Promise<ModelSourceResult> => {
    validateModelSourceChroma(chromaTolerance)
    validateModelSourceDimensions(draft, dimensions)
    return composeModelSource(draft, dimensions, chromaTolerance)
  }
  const saveUndoSnapshot = () => {
    undoStack.current = [...undoStack.current, { project: draft, dimensions, tolerance: chromaTolerance, selectedId }].slice(-8)
    setUndoCount(undoStack.current.length)
  }
  const undo = () => {
    const snapshot = undoStack.current.pop()
    if (!snapshot) return
    setDraft(snapshot.project)
    setDimensions(snapshot.dimensions)
    setChromaTolerance(snapshot.tolerance)
    setSelectedId(snapshot.project.parts.some(part => part.id === snapshot.selectedId) ? snapshot.selectedId : snapshot.project.parts[0]?.id ?? '')
    setUndoCount(undoStack.current.length)
    setGesture(null)
    gestureRef.current = null
    setError('')
    setStatus('Última edição desfeita.')
    setDownloadInfo('')
  }
  const runMutation = async (mutate: (materialized: FabricatorProject, result: ModelSourceResult) => Promise<MutationResult | null>) => {
    if (busy || downloading) return
    setBusy(true)
    setError('')
    try {
      const result = await compile()
      const materialized: FabricatorProject = {
        ...draft,
        sourceDataUrl: result.sourceDataUrl,
        parts: result.parts,
        tolerance: result.tolerance,
        joints: result.joints,
        layerOrder: result.layerOrder,
        hiddenPartIds: result.hiddenPartIds
      }
      const mutation = await mutate(materialized, result)
      if (!mutation) return
      saveUndoSnapshot()
      setDraft(mutation.project)
      setDimensions({})
      setChromaTolerance(result.tolerance)
      setSelectedId(mutation.selectedId)
      setGesture(null)
      gestureRef.current = null
      setStatus(mutation.status)
      setDownloadInfo('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível editar a peça.')
    } finally {
      setBusy(false)
    }
  }
  const scalePointToPart = (point: ModelSourcePoint, part: ModelPart, width: number, height: number): ModelSourcePoint => ({
    x: point.x * part.width / Math.max(1, width),
    y: point.y * part.height / Math.max(1, height)
  })
  const pointsForPart = (points: ModelSourcePoint[], part: ModelPart, width: number, height: number) =>
    points.map(point => scalePointToPart(point, part, width, height))
  const pointerPoint = (event: ReactPointerEvent<HTMLDivElement>): ModelSourcePoint | null => {
    const bounds = surface.current?.getBoundingClientRect()
    if (!bounds || !bounds.width || !bounds.height) return null
    return {
      x: clamp((event.clientX - bounds.left) * logicalWidth / bounds.width, 0, logicalWidth),
      y: clamp((event.clientY - bounds.top) * logicalHeight / bounds.height, 0, logicalHeight)
    }
  }
  const startDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== 'part' || tool === 'select' || !selected || busy || downloading || event.button !== 0) return
    const point = pointerPoint(event)
    if (!point) return
    setError('')
    const next: DrawingGesture = { tool, start: point, current: point, points: [point] }
    gestureRef.current = next
    setGesture(next)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current
    if (!current) return
    const point = pointerPoint(event)
    if (!point) return
    let points = current.points
    if (current.tool === 'erase' || current.tool === 'outline') {
      const last = points[points.length - 1]
      if (Math.hypot(point.x - last.x, point.y - last.y) >= 1) points = [...points.slice(-2999), point]
    } else points = [current.start, point]
    const next = { ...current, current: point, points }
    gestureRef.current = next
    setGesture(next)
  }
  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current
    if (!current) return
    const point = pointerPoint(event) ?? current.current
    const points = current.tool === 'erase' || current.tool === 'outline'
      ? [...current.points, point]
      : [current.start, point]
    const finished = { ...current, current: point, points }
    gestureRef.current = null
    setGesture(finished)
  }
  const cancelDrawing = () => {
    gestureRef.current = null
    setGesture(null)
  }
  const setEditTool = (next: EditTool) => {
    setTool(next)
    cancelDrawing()
  }
  const applyCrop = () => {
    if (!selected || !selectedRect || gesture?.tool !== 'crop') return
    const drawnCrop = cropFromGesture(gesture)
    if (drawnCrop.width < 2 || drawnCrop.height < 2) {
      setError('Arraste uma área maior para cortar a peça.')
      return
    }
    void runMutation(async materialized => {
      const part = materialized.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const crop = {
        x: drawnCrop.x * part.width / Math.max(1, selectedRect.width),
        y: drawnCrop.y * part.height / Math.max(1, selectedRect.height),
        width: drawnCrop.width * part.width / Math.max(1, selectedRect.width),
        height: drawnCrop.height * part.height / Math.max(1, selectedRect.height)
      }
      const nextPart = await cropModelSourcePart(part, crop)
      const attachedJoint = materialized.joints.find(joint => joint.parentPartId === part.id || joint.childPartId === part.id)
      const attachedAnchor = attachedJoint
        ? attachedJoint.parentPartId === part.id ? attachedJoint.parentAnchor : attachedJoint.childAnchor
        : undefined
      const previousAnchor = part.jointAnchor ?? attachedAnchor
      const anchorKept = previousAnchor ? worldPointInsideCrop(part, previousAnchor, crop) : true
      const center = { x: nextPart.x + nextPart.width / 2, y: nextPart.y + nextPart.height / 2 }
      const croppedPart = previousAnchor
        ? { ...nextPart, jointAnchor: anchorKept ? previousAnchor : center }
        : nextPart
      const updatedParts = materialized.parts.map(item => item.id === part.id ? croppedPart : item)
      const rig = normalizePartAnchors(updatedParts, materialized.joints)
      return {
        project: { ...materialized, parts: rig.parts, joints: rig.joints },
        selectedId: part.id,
        status: attachedJoint && !anchorKept
          ? 'Corte aplicado. A conexão foi mantida e o pivô reposicionado dentro da peça.'
          : attachedJoint
            ? 'Corte aplicado; a conexão e o pivô foram preservados.'
          : 'Corte aplicado à peça selecionada.'
      }
    })
  }
  const applySplit = () => {
    if (!selected || !selectedRect || gesture?.tool !== 'split') return
    void runMutation(async materialized => {
      const part = materialized.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const points = pointsForPart(gesture.points, part, selectedRect.width, selectedRect.height)
      const start = points[0]
      const end = points[points.length - 1]
      const connectedJoint = materialized.joints.find(joint => joint.parentPartId === part.id || joint.childPartId === part.id)
      const attachedAnchor = connectedJoint
        ? connectedJoint.parentPartId === part.id ? connectedJoint.parentAnchor : connectedJoint.childAnchor
        : undefined
      const reference = part.jointAnchor
        ? worldPointToPart(part, part.jointAnchor)
        : attachedAnchor ? worldPointToPart(part, attachedAnchor) : { x: part.width / 2, y: part.height / 2 }
      const split = await splitModelSourcePart(part, start, end, reference)
      const retained = split.parts[split.retainedSide]
      const created = split.parts[1 - split.retainedSide]
      const parts = materialized.parts.flatMap(item => item.id === part.id ? [retained, created] : [item])
      const rig = normalizePartAnchors(parts, materialized.joints)
      const validIds = new Set(parts.map(item => item.id))
      const hidden = new Set(materialized.hiddenPartIds ?? [])
      if (hidden.has(part.id)) hidden.add(created.id)
      return {
        project: {
          ...materialized,
          parts: rig.parts,
          joints: rig.joints,
          layerOrder: orderAfterSplit(materialized.layerOrder, part.id, retained.id, created.id),
          hiddenPartIds: [...hidden].filter(id => validIds.has(id))
        },
        selectedId: retained.id,
        status: connectedJoint
          ? 'Peça dividida. A conexão foi mantida no lado que conserva o ID original; o novo lado ficou sem conexão.'
          : 'Peça dividida em duas.'
      }
    })
  }
  const applyBrush = (outlineOnly: boolean) => {
    if (!selected || !selectedRect || !gesture || gesture.tool !== (outlineOnly ? 'outline' : 'erase')) return
    void runMutation(async materialized => {
      const part = materialized.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const points = pointsForPart(gesture.points, part, selectedRect.width, selectedRect.height)
      const result = await eraseModelSourceBrush(part, points, brushSize * part.width / Math.max(1, selectedRect.width), outlineOnly)
      if (!result.removedPixels) {
        setStatus(outlineOnly ? 'O pincel não encontrou contorno escuro/contrastado neste traço.' : 'O pincel não alcançou pixels visíveis.')
        return null
      }
      return {
        project: { ...materialized, parts: materialized.parts.map(item => item.id === part.id ? result.part : item) },
        selectedId: part.id,
        status: outlineOnly
          ? 'Contorno contrastado removido sob o pincel; a base do Chroma também foi atualizada.'
          : 'Área apagada; a base do Chroma também foi atualizada.'
      }
    })
  }
  const deleteSelected = () => {
    if (!selected || draft.parts.length <= 1) return
    void runMutation(async materialized => {
      const index = materialized.parts.findIndex(part => part.id === selected.id)
      if (index < 0) throw new Error('A peça selecionada não está mais no modelo.')
      const parts = materialized.parts.filter(part => part.id !== selected.id)
      const layerOrder = materialized.layerOrder?.filter(id => id !== selected.id)
      const hiddenPartIds = materialized.hiddenPartIds?.filter(id => id !== selected.id)
      return {
        project: {
          ...materialized,
          parts,
          joints: materialized.joints.filter(joint => joint.parentPartId !== selected.id && joint.childPartId !== selected.id),
          layerOrder,
          hiddenPartIds
        },
        selectedId: parts[Math.min(index, parts.length - 1)]?.id ?? '',
        status: 'Peça excluída. A ação pode ser desfeita pelo botão Desfazer.'
      }
    })
  }
  const restoreChroma = () => {
    setChromaTolerance(project.tolerance)
    setDownloadInfo('')
    setStatus('Tolerância original do Chroma restaurada.')
  }
  const save = async () => {
    if (!edited || busy || downloading) return
    setBusy(true)
    try {
      const result = await compile()
      let message = 'Salvar esta imagem como o Model Source oficial? A folha, as peças e o Chroma Key serão atualizados. O histórico anterior será encerrado e um backup interno será mantido.'
      message += '\n\nPoses e roupas já salvas podem manter imagens ou vínculos anteriores; revise as que usam as peças editadas.'
      if (structureChanged) message += '\n\nA estrutura mudou. Uma divisão conserva o ID original e mantém as juntas nesse lado; o lado novo começa sem conexões. Uma exclusão limpa suas juntas e camadas deste modelo.'
      if (!window.confirm(message)) return
      await onPublish(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar imagem definitiva.')
    } finally {
      setBusy(false)
    }
  }
  const download = async () => {
    if (busy || downloading) return
    setDownloading(true)
    setDownloadInfo('')
    try {
      const result = await compile()
      const path = await window.desktop.downloadFabricatorModelSource(draft.slot, result.previewDataUrl)
      setDownloadInfo('PNG salvo em Downloads: ' + path)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar a imagem.')
    } finally {
      setDownloading(false)
    }
  }
  const changeZoom = (value: number) => setZoom(clamp(value, .5, 4))
  const handlePreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    changeZoom(zoom * (event.deltaY < 0 ? 1.12 : .89))
  }

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <section role="dialog" aria-modal="true" aria-label="Editar imagem original — Model Source" style={{ width: 'min(1320px, 98vw)', maxHeight: '94vh', background: '#111824', color: '#f4f6fa', border: '1px solid #516078', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 80px rgba(0,0,0,.5)' }}>
        <header style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #303c4c' }}>
          <div><strong style={{ fontSize: 18 }}>Editar imagem original · Model Source</strong><p style={{ margin: '5px 0 0', color: '#abb7c7', fontSize: 12 }}>Selecione uma peça para isolá-la, ampliar e editar. Poses DEV continua usando o modelo montado.</p></div>
          <button type="button" disabled={busy || downloading} onClick={onClose} aria-label="Fechar editor" style={{ ...field, width: 40, cursor: 'pointer' }}>✕</button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 235px', gap: 12, padding: 14, minHeight: 0, overflowY: 'auto' }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 540, overflowY: 'auto' }} aria-label="Peças do modelo">
            <strong style={{ fontSize: 13, paddingBottom: 7 }}>Peças ({draft.parts.length})</strong>
            {draft.parts.map(part => {
              const rect = sourceRect(part, dimensions[part.id])
              return (
              <button key={part.id} type="button" style={{ ...card, borderColor: part.id === selectedId ? '#64a5ff' : '#3c4554' }} disabled={busy || downloading} onClick={() => { setSelectedId(part.id); setMode('part'); setTool('select'); cancelDrawing(); setError('') }}>
                  <img src={part.dataUrl} alt="" style={{ objectFit: 'contain', width: 38, height: 40 }} />
                  <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{part.name}</b><small style={{ color: '#a9b5c4' }}>{dimensions[part.id] ? 'Modificada · ' : ''}{Math.round(rect.width)} × {Math.round(rect.height)}</small></span>
                </button>
              )
            })}
          </aside>
          <main style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" style={toolButton(mode === 'part', busy || downloading)} disabled={busy || downloading} onClick={() => { setMode('part'); cancelDrawing() }}>Peça selecionada</button>
              <button type="button" style={toolButton(mode === 'sheet', busy || downloading)} disabled={busy || downloading} onClick={() => { setMode('sheet'); setTool('select'); cancelDrawing() }}>Folha completa</button>
              <span style={{ color: '#a9b5c4', fontSize: 12, marginLeft: 'auto' }}>Zoom</span>
              <button type="button" aria-label="Diminuir zoom" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => changeZoom(zoom - .25)}>−</button>
              <input aria-label="Zoom da prévia" type="range" min={.5} max={4} step={.1} value={zoom} disabled={busy || downloading} onChange={event => changeZoom(Number(event.target.value))} style={{ width: 110 }} />
              <button type="button" aria-label="Aumentar zoom" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => changeZoom(zoom + .25)}>+</button>
              <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}% · Ajustar</button>
            </div>
            {mode === 'part' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} aria-label="Ferramentas da peça">
              <button type="button" style={toolButton(tool === 'select', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('select')}>Selecionar</button>
              <button type="button" style={toolButton(tool === 'erase', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('erase')}>Apagar</button>
              <button type="button" style={toolButton(tool === 'crop', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('crop')}>Cortar</button>
              <button type="button" style={toolButton(tool === 'split', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('split')}>Dividir com linha</button>
              <button type="button" style={toolButton(tool === 'outline', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('outline')}>Apagar contorno</button>
              {(tool === 'erase' || tool === 'outline') && <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a9b5c4' }}>Pincel {brushSize}px
                <input aria-label="Tamanho do pincel" type="range" min={4} max={80} step={1} value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} disabled={busy || downloading} />
              </label>}
            </div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 20, gap: 8 }}>
              <small style={{ color: '#aabbd0' }}>
                {mode === 'sheet'
                  ? 'Folha PNG transparente · selecione a cabeça para mover'
                  : tool === 'crop' ? 'Arraste um retângulo sobre a peça e aplique o corte.'
                    : tool === 'split' ? 'Trace uma linha; ela será prolongada até as bordas da peça.'
                      : tool === 'erase' ? 'Pinte a área que deseja apagar.'
                        : tool === 'outline' ? 'Pinte sobre o contorno escuro para removê-lo automaticamente.'
                          : 'Prévia isolada · Ctrl + roda do mouse também altera o zoom'}
              </small>
              {mode === 'part' && gesture && <div style={{ display: 'flex', gap: 5 }}>
                {gesture.tool === 'crop' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={applyCrop}>Aplicar corte</button>}
                {gesture.tool === 'split' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={applySplit}>Dividir peça</button>}
                {gesture.tool === 'erase' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => applyBrush(false)}>Aplicar borracha</button>}
                {gesture.tool === 'outline' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => applyBrush(true)}>Remover contorno</button>}
                <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={cancelDrawing}>Cancelar traço</button>
              </div>}
            </div>
            <div onWheel={handlePreviewWheel} style={{ flex: '0 0 400px', minHeight: 260, maxHeight: 500, width: '100%', borderRadius: 10, background: '#242b39', overflow: 'auto', padding: 10, boxSizing: 'border-box' }}>
              <div style={{ width: 'max-content', height: 'max-content', margin: '0 auto' }}>
                <div
                  ref={surface}
                  onPointerDown={startDrawing}
                  onPointerMove={moveDrawing}
                  onPointerUp={finishDrawing}
                  onPointerCancel={cancelDrawing}
                  style={{ position: 'relative', flex: '0 0 auto', width: surfaceWidth, height: surfaceHeight, ...checker, cursor: mode === 'part' && tool !== 'select' ? 'crosshair' : 'default', touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}
                >
                  {mode === 'sheet'
                    ? preview && <img src={preview} alt="Prévia da imagem original editada" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />
                    : previewPart && <img src={previewPart.dataUrl} alt={'Prévia isolada: ' + previewPart.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />}
                  {mode === 'sheet' && selectedRect && <div aria-label={isHead ? 'Arraste a cabeça para mover na folha original' : 'Peça selecionada'} onPointerDown={startHeadDrag} onPointerMove={moveHeadDrag} onPointerUp={stopHeadDrag} onPointerCancel={stopHeadDrag} style={{ position: 'absolute', left: selectedRect.x * previewScale, top: selectedRect.y * previewScale, width: selectedRect.width * previewScale, height: selectedRect.height * previewScale, border: '2px dashed #3b89ff', boxSizing: 'border-box', cursor: isHead ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }} />}
                  {mode === 'part' && gesture && <svg aria-hidden="true" width="100%" height="100%" viewBox={'0 0 ' + logicalWidth + ' ' + logicalHeight} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
                    {gesture.tool === 'crop' && <rect x={Math.min(gesture.start.x, gesture.current.x)} y={Math.min(gesture.start.y, gesture.current.y)} width={Math.abs(gesture.current.x - gesture.start.x)} height={Math.abs(gesture.current.y - gesture.start.y)} fill="rgba(59,137,255,.18)" stroke="#61a5ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                    {gesture.tool === 'split' && <line x1={gesture.start.x} y1={gesture.start.y} x2={gesture.current.x} y2={gesture.current.y} stroke="#ff6677" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
                    {(gesture.tool === 'erase' || gesture.tool === 'outline') && <polyline points={gesture.points.map(point => point.x + ',' + point.y).join(' ')} fill="none" stroke={gesture.tool === 'outline' ? '#ffc857' : '#ff6677'} strokeWidth={brushSize} strokeLinecap="round" strokeLinejoin="round" opacity=".75" vectorEffect="non-scaling-stroke" />}
                  </svg>}
                </div>
              </div>
            </div>
            {status && <small role="status" style={{ color: '#b2f4d5', lineHeight: 1.4 }}>{status}</small>}
          </main>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong style={{ fontSize: 13 }}>{selected?.name ?? 'Nenhuma peça'}</strong>
            {selected && selectedRect && baseline && <>
              <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Largura (pixels)
                <input style={field} type="number" min={1} max={8192} step={1} value={selectedRect.width} disabled={busy || downloading} onChange={event => setNumber('width', Number(event.target.value))} />
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Altura (pixels)
                <input style={field} type="number" min={1} max={8192} step={1} value={selectedRect.height} disabled={busy || downloading} onChange={event => setNumber('height', Number(event.target.value))} />
              </label>
              {isHead && <>
                <strong style={{ fontSize: 12 }}>Posição da cabeça na imagem</strong>
                <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>X (pixels)
                  <input style={field} type="number" min={0} max={draft.width} step={1} value={selectedRect.x} disabled={busy || downloading} onChange={event => setNumber('x', Number(event.target.value))} />
                </label>
                <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Y (pixels)
                  <input style={field} type="number" min={0} max={draft.height} step={1} value={selectedRect.y} disabled={busy || downloading} onChange={event => setNumber('y', Number(event.target.value))} />
                </label>
              </>}
              <small style={{ color: '#a9b5c4' }}>Original desta peça: {Math.round(baseline.width)} × {Math.round(baseline.height)} px</small>
              <button style={{ ...field, cursor: 'pointer' }} type="button" disabled={busy || downloading} onClick={restoreSelected}>Restaurar dimensões</button>
            </>}
            {draft.parts.length > 1 && <button style={{ ...field, cursor: 'pointer', borderColor: '#a95562' }} type="button" disabled={!selected || busy || downloading} onClick={deleteSelected}>Excluir peça selecionada</button>}
            <button style={{ ...field, width: 'auto', cursor: 'pointer' }} type="button" disabled={undoCount === 0 || busy || downloading} onClick={undo}>Desfazer edição ({undoCount})</button>
            <div style={{ display: 'grid', gap: 7, paddingTop: 9, borderTop: '1px solid #3c4554' }}>
              <label htmlFor="model-source-chroma" style={{ fontSize: 12, fontWeight: 600 }}>Chroma Key · tolerância: {chromaTolerance}</label>
              <input id="model-source-chroma" type="range" min={0} max={MAX_CHROMA_TOLERANCE} value={chromaTolerance} disabled={busy || downloading} onChange={event => { setChromaTolerance(Number(event.target.value)); setDownloadInfo('') }} />
              <button style={{ ...field, cursor: 'pointer' }} type="button" disabled={busy || downloading} onClick={restoreChroma}>Restaurar chroma</button>
              <small style={{ fontSize: 11, lineHeight: 1.4, color: '#a9b5c4' }}>A borracha de contorno também atualiza a base usada para recalcular o Chroma.</small>
            </div>
          </aside>
        </div>
        {error && <p role="alert" style={{ color: '#ffc5c5', margin: '0 18px 12px' }}>{error}</p>}
        {downloadInfo && <p role="status" style={{ color: '#b2f4d5', margin: '0 18px 12px', fontSize: 12, overflowWrap: 'anywhere' }}>{downloadInfo}</p>}
        <footer style={{ padding: '14px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #303c4c' }}>
          <button type="button" onClick={onClose} disabled={busy || downloading} style={{ ...field, width: 'auto', cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={() => void download()} disabled={busy || downloading || Boolean(error)} style={{ ...field, width: 'auto', cursor: 'pointer', background: '#344865' }}>{downloading ? 'Exportando…' : 'Baixar PNG em Downloads'}</button>
          <button type="button" onClick={() => void save()} disabled={!edited || busy || downloading || Boolean(error)} style={{ ...field, width: 'auto', background: '#1d66bd', cursor: 'pointer', opacity: !edited || busy || downloading || error ? .55 : 1 }}>{busy ? 'Publicando…' : 'Salvar imagem definitiva'}</button>
        </footer>
      </section>
    </div>
  )
}
