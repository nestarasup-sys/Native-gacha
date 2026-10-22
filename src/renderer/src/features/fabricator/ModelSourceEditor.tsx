import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { FabricatorProject } from '../../../../shared/fabricator'
import { composeModelSource, sourceRect, validateModelSourceDimensions, type ModelSourceDimensions, type ModelSourceResult } from './models/modelSource'

type Props = {
  project: FabricatorProject
  onClose: () => void
  onPublish: (result: ModelSourceResult) => Promise<void>
}

const card: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', padding: 9, borderRadius: 9, cursor: 'pointer', color: 'inherit', background: '#202635', border: '1px solid #3c4554', textAlign: 'left' }
const field: CSSProperties = { width: '100%', color: '#f7f8fa', background: '#1b2230', border: '1px solid #64748b', borderRadius: 7, padding: 8 }

export function ModelSourceEditor({ project, onClose, onPublish }: Props) {
  const [selectedId, setSelectedId] = useState(project.parts[0]?.id ?? '')
  const [dimensions, setDimensions] = useState<ModelSourceDimensions>({})
  const [preview, setPreview] = useState<string>('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = project.parts.find(p => p.id === selectedId)
  const edited = Boolean(Object.keys(dimensions).length)
  const selectedRect = selected ? sourceRect(selected, dimensions[selected.id]) : null
  const baseline = selected ? sourceRect(selected) : null
  const effectiveSize = useMemo(() => project.parts.map(p => ({ id: p.id, ...sourceRect(p, dimensions[p.id]) })), [project, dimensions])
  const selection = effectiveSize.find(p => p.id === selectedId)

  useEffect(() => {
    let active = true
    if (!edited) { setPreview(project.sourceDataUrl); setError(''); return () => { active = false } }
    const handle = window.setTimeout(() => {
      void composeModelSource(project, dimensions).then(result => {
        if (active) { setPreview(result.sourceDataUrl); setError('') }
      }).catch(reason => {
        if (active) { setError(reason instanceof Error ? reason.message : 'Prévia inválida.'); setPreview('') }
      })
    }, 180)
    return () => { active = false; window.clearTimeout(handle) }
  }, [project, dimensions, edited])

  const setDimension = (axis: 'width' | 'height', raw: number) => {
    if (!selected || !baseline) return
    const current = sourceRect(selected, dimensions[selected.id])
    const next = { width: axis === 'width' ? raw : current.width, height: axis === 'height' ? raw : current.height }
    setDimensions(state => {
      const copy = { ...state }
      if (next.width === baseline.width && next.height === baseline.height) delete copy[selected.id]
      else copy[selected.id] = next
      return copy
    })
  }

  const save = async () => {
    if (!edited || saving) return
    setSaving(true)
    try {
      validateModelSourceDimensions(project, dimensions)
      const next = await composeModelSource(project, dimensions)
      if (!window.confirm('Publicar este Model Source como imagem oficial? As peças editadas e a folha serão substituídas no aplicativo. O histórico anterior de montagem será encerrado; uma cópia de segurança ficará guardada.')) {
        setSaving(false)
        return
      }
      await onPublish(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível publicar o Model Source.')
    } finally {
      setSaving(false)
    }
  }

  const previewScale = Math.min(1, 620 / project.width, 430 / project.height)
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <section role="dialog" aria-modal="true" aria-label="Editar imagem original — Model Source" style={{ width: 'min(1180px, 97vw)', maxHeight: '94vh', background: '#111824', color: '#f4f6fa', border: '1px solid #516078', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 80px rgba(0,0,0,.5)' }}>
        <header style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #303c4c' }}>
          <div><strong style={{ fontSize: 18 }}>Editar imagem original · Model Source</strong><p style={{ margin: '5px 0 0', color: '#abb7c7', fontSize: 12 }}>Edite o tamanho real das peças antes da montagem. Poses DEV continua usando o modelo montado.</p></div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Fechar editor" style={{ ...field, width: 40, cursor: 'pointer' }}>✕</button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) 220px', gap: 15, padding: 18, minHeight: 0, overflowY: 'auto' }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }} aria-label="Peças do modelo">
            <strong style={{ fontSize: 13, paddingBottom: 7 }}>Peças ({project.parts.length})</strong>
            {project.parts.map(part => (
              <button key={part.id} type="button" style={{ ...card, borderColor: part.id === selectedId ? '#64a5ff' : '#3c4554' }} onClick={() => setSelectedId(part.id)}>
                <img src={part.dataUrl} alt="" style={{ objectFit: 'contain', width: 38, height: 40 }} />
                <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{part.name}</b><small style={{ color: '#a9b5c4' }}>{dimensions[part.id] ? 'Modificada · ' : ''}{Math.round(sourceRect(part, dimensions[part.id]).width)} × {Math.round(sourceRect(part, dimensions[part.id]).height)}</small></span>
              </button>
            ))}
          </aside>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, borderRadius: 10, background: '#242b39', overflow: 'auto' }}>
            <div style={{ width: project.width * previewScale, height: project.height * previewScale, flexShrink: 0, position: 'relative', background: '#00ff00' }}>
              {preview && <img src={preview} alt="Prévia da imagem original editada" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />}
              {selection && <div aria-label="Peça selecionada" style={{ position: 'absolute', left: selection.x * previewScale, top: selection.y * previewScale, width: selection.width * previewScale, height: selection.height * previewScale, border: '2px dashed #3b89ff', boxSizing: 'border-box', pointerEvents: 'none' }} />}
            </div>
          </div>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <strong style={{ fontSize: 13 }}>{selected?.name ?? 'Nenhuma peça'}</strong>
            {selected && selectedRect && baseline && <>
              <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Largura (pixels)
                <input style={field} type="number" min={1} max={8192} step={1} value={selectedRect.width} disabled={saving} onChange={event => setDimension('width', Number(event.target.value))} />
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Altura (pixels)
                <input style={field} type="number" min={1} max={8192} step={1} value={selectedRect.height} disabled={saving} onChange={event => setDimension('height', Number(event.target.value))} />
              </label>
              <small style={{ color: '#a9b5c4' }}>Base anterior: {Math.round(baseline.width)} × {Math.round(baseline.height)} px</small>
              <button style={{ ...field, cursor: 'pointer' }} type="button" disabled={saving} onClick={() => setDimensions(current => { const copy = { ...current }; delete copy[selected.id]; return copy })}>Restaurar tamanho desta peça</button>
            </>}
            <p style={{ fontSize: 11, lineHeight: 1.6, color: '#c9d3df' }}>A folha salva vira a nova fonte do Fabricador. O PNG anterior sai do catálogo ativo, mas fica em backup interno recuperável.</p>
          </aside>
        </div>
        {error && <p role="alert" style={{ color: '#ffc5c5', margin: '0 18px 12px' }}>{error}</p>}
        <footer style={{ padding: '14px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #303c4c' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ ...field, width: 'auto', cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={!edited || saving || Boolean(error)} style={{ ...field, width: 'auto', background: '#1d66bd', cursor: 'pointer', opacity: !edited || saving || error ? .55 : 1 }}>{saving ? 'Publicando…' : 'Salvar imagem definitiva'}</button>
        </footer>
      </section>
    </div>
  )
}
