import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { isHeadPart } from './models/resize'
import { composeModelSource, sourceRect, validateModelSourceChroma, validateModelSourceDimensions, MAX_CHROMA_TOLERANCE, type ModelSourceDimensions, type ModelSourceResult } from './models/modelSource'

type Props = {
  project: FabricatorProject
  onClose: () => void
  onPublish: (result: ModelSourceResult) => Promise<void>
}
const card: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', padding: 9, borderRadius: 9, cursor: 'pointer', color: 'inherit', background: '#202635', border: '1px solid #3c4554', textAlign: 'left' }
const field: CSSProperties = { width: '100%', color: '#f7f8fa', background: '#1b2230', border: '1px solid #64748b', borderRadius: 7, padding: 8 }
const checker: CSSProperties = {
  backgroundColor: '#d2d8e2',
  backgroundImage: 'conic-gradient(#fff 25%, transparent 0 50%, #fff 0 75%, transparent 0)',
  backgroundSize: '20px 20px'
}

export function ModelSourceEditor({ project, onClose, onPublish }: Props) {
  const [selectedId, setSelectedId] = useState(project.parts[0]?.id ?? '')
  const [dimensions, setDimensions] = useState<ModelSourceDimensions>({})
  const [chromaTolerance, setChromaTolerance] = useState(project.tolerance)
  const [preview, setPreview] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadInfo, setDownloadInfo] = useState('')
  const drag = useRef<{ id: string; originX: number; originY: number; clientX: number; clientY: number } | null>(null)
  const selected = project.parts.find(part => part.id === selectedId)
  const isHead = Boolean(selected && isHeadPart(selected))
  const edited = Object.keys(dimensions).length > 0 || chromaTolerance !== project.tolerance
  const selectedRect = selected ? sourceRect(selected, dimensions[selected.id]) : null
  const baseline = selected ? sourceRect(selected) : null
  const effectiveSize = useMemo(() => project.parts.map(part => ({ id: part.id, ...sourceRect(part, dimensions[part.id]) })), [project, dimensions])
  const selection = effectiveSize.find(part => part.id === selectedId)
  const previewScale = Math.min(1, 620 / project.width, 430 / project.height)

  useEffect(() => {
    let active = true
    const handle = window.setTimeout(() => {
      void composeModelSource(project, dimensions, chromaTolerance).then(result => {
        if (active) { setPreview(result.previewDataUrl); setError('') }
      }).catch(reason => {
        if (active) { setError(reason instanceof Error ? reason.message : 'Prévia inválida.'); setPreview('') }
      })
    }, 180)
    return () => { active = false; window.clearTimeout(handle) }
  }, [project, dimensions, chromaTolerance])

  const setRect = (part: ModelPart, next: { x: number; y: number; width: number; height: number }) => {
    const original = sourceRect(part)
    setDimensions(current => {
      const state = { ...current }
      if (next.x === original.x && next.y === original.y && next.width === original.width && next.height === original.height) {
        delete state[part.id]
      } else {
        state[part.id] = { ...next }
      }
      return state
    })
    setDownloadInfo('')
  }
  const setNumber = (axis: 'width' | 'height' | 'x' | 'y', value: number) => {
    if (!selected || !selectedRect || !Number.isFinite(value) || busy || downloading) return
    if ((axis === 'x' || axis === 'y') && !isHeadPart(selected)) return
    setRect(selected, { ...selectedRect, [axis]: Math.round(value) })
  }
  const startHeadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected || !selectedRect || !isHead || busy || downloading || event.button !== 0) return
    drag.current = { id: selected.id, originX: selectedRect.x, originY: selectedRect.y, clientX: event.clientX, clientY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveHeadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !selected || selected.id !== drag.current.id || !isHead || busy) return
    const origin = drag.current
    const nextX = Math.max(0, Math.min(project.width - (selectedRect?.width ?? selected.width), Math.round(origin.originX + (event.clientX - origin.clientX) / previewScale)))
    const nextY = Math.max(0, Math.min(project.height - (selectedRect?.height ?? selected.height), Math.round(origin.originY + (event.clientY - origin.clientY) / previewScale)))
    setRect(selected, { ...sourceRect(selected, dimensions[selected.id]), x: nextX, y: nextY })
  }
  const stopHeadDrag = () => { drag.current = null }
  const restoreSelected = () => {
    if (!selected) return
    setDimensions(current => { const state = { ...current }; delete state[selected.id]; return state })
    setDownloadInfo('')
  }
  const compile = async (): Promise<ModelSourceResult> => {
    validateModelSourceChroma(chromaTolerance)
    validateModelSourceDimensions(project, dimensions)
    return composeModelSource(project, dimensions, chromaTolerance)
  }
  const save = async () => {
    if (!edited || busy || downloading) return
    setBusy(true)
    try {
      const result = await compile()
      if (!window.confirm('Salvar esta imagem como o Model Source oficial? A folha, os recortes e o Chroma Key serão atualizados. O histórico anterior será encerrado e um backup interno será mantido.')) return
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
      const path = await window.desktop.downloadFabricatorModelSource(project.slot, result.previewDataUrl)
      setDownloadInfo('PNG salvo em Downloads: ' + path)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar a imagem.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <section role="dialog" aria-modal="true" aria-label="Editar imagem original — Model Source" style={{ width: 'min(1180px, 97vw)', maxHeight: '94vh', background: '#111824', color: '#f4f6fa', border: '1px solid #516078', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 80px rgba(0,0,0,.5)' }}>
        <header style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #303c4c' }}>
          <div><strong style={{ fontSize: 18 }}>Editar imagem original · Model Source</strong><p style={{ margin: '5px 0 0', color: '#abb7c7', fontSize: 12 }}>Editar a fonte, ajustar chroma e mover a cabeça na folha. Poses DEV continua usando o modelo montado.</p></div>
          <button type="button" disabled={busy || downloading} onClick={onClose} aria-label="Fechar editor" style={{ ...field, width: 40, cursor: 'pointer' }}>✕</button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) 220px', gap: 15, padding: 18, minHeight: 0, overflowY: 'auto' }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }} aria-label="Peças do modelo">
            <strong style={{ fontSize: 13, paddingBottom: 7 }}>Peças ({project.parts.length})</strong>
            {project.parts.map(part => {
              const rect = sourceRect(part, dimensions[part.id])
              return (
                <button key={part.id} type="button" style={{ ...card, borderColor: part.id === selectedId ? '#64a5ff' : '#3c4554' }} disabled={busy || downloading} onClick={() => setSelectedId(part.id)}>
                  <img src={part.dataUrl} alt="" style={{ objectFit: 'contain', width: 38, height: 40 }} />
                  <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{part.name}</b><small style={{ color: '#a9b5c4' }}>{dimensions[part.id] ? 'Modificada · ' : ''}{Math.round(rect.width)} × {Math.round(rect.height)}</small></span>
                </button>
              )
            })}
          </aside>
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', justifyContent: 'center', gap: 10, minHeight: 300, borderRadius: 10, background: '#242b39', overflow: 'auto', padding: 12 }}>
            <small style={{ color: '#aabbd0' }}>Prévia PNG transparente • selecione a cabeça para arrastar</small>
            <div style={{ width: project.width * previewScale, height: project.height * previewScale, flexShrink: 0, position: 'relative', ...checker }}>
              {preview && <img src={preview} alt="Prévia da imagem original editada" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />}
              {selection && <div aria-label={isHead ? 'Arraste a cabeça para mover na folha original' : 'Peça selecionada'} onPointerDown={startHeadDrag} onPointerMove={moveHeadDrag} onPointerUp={stopHeadDrag} onPointerCancel={stopHeadDrag} style={{ position: 'absolute', left: selection.x * previewScale, top: selection.y * previewScale, width: selection.width * previewScale, height: selection.height * previewScale, border: '2px dashed #3b89ff', boxSizing: 'border-box', cursor: isHead ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }} />}
            </div>
          </div>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <input style={field} type="number" min={0} max={project.width} step={1} value={selectedRect.x} disabled={busy || downloading} onChange={event => setNumber('x', Number(event.target.value))} />
                </label>
                <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Y (pixels)
                  <input style={field} type="number" min={0} max={project.height} step={1} value={selectedRect.y} disabled={busy || downloading} onChange={event => setNumber('y', Number(event.target.value))} />
                </label>
              </>}
              <small style={{ color: '#a9b5c4' }}>Original: {Math.round(baseline.width)} × {Math.round(baseline.height)} px</small>
              <button style={{ ...field, cursor: 'pointer' }} type="button" disabled={busy || downloading} onClick={restoreSelected}>Restaurar esta peça</button>
            </>}
            <div style={{ display: 'grid', gap: 7, paddingTop: 9, borderTop: '1px solid #3c4554' }}>
              <label htmlFor="model-source-chroma" style={{ fontSize: 12, fontWeight: 600 }}>Chroma Key · tolerância: {chromaTolerance}</label>
              <input id="model-source-chroma" type="range" min={0} max={MAX_CHROMA_TOLERANCE} value={chromaTolerance} disabled={busy || downloading} onChange={event => { setChromaTolerance(Number(event.target.value)); setDownloadInfo('') }} />
              <button style={{ ...field, cursor: 'pointer' }} type="button" disabled={busy || downloading} onClick={() => setChromaTolerance(project.tolerance)}>Restaurar chroma</button>
              <small style={{ fontSize: 11, lineHeight: 1.4, color: '#a9b5c4' }}>O Chroma Key usa a mesma máscara/remoção de fundo do Fabricador.</small>
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
