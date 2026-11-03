import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { FabricatorProject, FabricatorSlotSummary, HairStyle, HairStyleSummary } from '../../../../../shared/fabricator'
import { projectForOriginalPreview } from '../../../../../shared/fabricatorModelViews'
import { Icon } from '../../../ui/components/Icon'
import { usePreviewBackground } from '../../../ui/hooks/usePreviewBackground'
import { useModelAppearanceTarget, useModelPartAppearancePreview } from '../ModelAppearanceContext'
import { headPart, initialTransform, type HairSide } from '../hairWorkspaceModel'
import { hairAnimationGeometry } from './hairAnimationGeometry'
import './hair-animation.css'

const sides: Array<{ id: HairSide; label: string }> = [
  { id: 'back', label: 'Traseiro' }, { id: 'front', label: 'Posterior' }, { id: 'fringe', label: 'Franja' }
]
const emptySelection: Record<HairSide, string> = { back: '', front: '', fringe: '' }
const defaultEnabled: Record<HairSide, boolean> = { back: true, front: true, fringe: true }

export function HairAnimationWorkspace({ baseModelSlot }: { baseModelSlot: number }) {
  const [slot, setSlot] = useState(baseModelSlot)
  const [models, setModels] = useState<FabricatorSlotSummary[]>([])
  const [model, setModel] = useState<FabricatorProject | null>(null)
  const [summaries, setSummaries] = useState<HairStyleSummary[]>([])
  const [selection, setSelection] = useState<Record<HairSide, string>>(emptySelection)
  const [styles, setStyles] = useState<Record<string, HairStyle>>({})
  const [enabled, setEnabled] = useState<Record<HairSide, boolean>>(defaultEnabled)
  const [amplitude, setAmplitude] = useState(6)
  const [duration, setDuration] = useState(2.8)
  const [anchor, setAnchor] = useState(15)
  const [playing, setPlaying] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingStyles, setLoadingStyles] = useState(false)
  const [error, setError] = useState('')
  const [background, setBackground] = usePreviewBackground()
  useModelAppearanceTarget(slot)
  const appearanceForPart = useModelPartAppearancePreview(slot)
  const head = useMemo(() => headPart(model), [model])

  useEffect(() => {
    let cancelled = false
    void window.desktop.fabricator.listFabricatorSlots().then((items) => { if (!cancelled) setModels(items) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os modelos.') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setModel(null); setSummaries([]); setSelection(emptySelection); setStyles({})
    void Promise.all([window.desktop.fabricator.loadFabricatorSlot(slot), window.desktop.fabricator.listHairStyles(slot)])
      .then(([project, items]) => {
        if (cancelled) return
        setModel(projectForOriginalPreview(project)); setSummaries(items)
      }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os cabelos deste modelo.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slot])

  const selectedIds = useMemo(() => [...new Set(Object.values(selection).filter(Boolean))], [selection])
  const selectionKey = selectedIds.join('|')
  useEffect(() => {
    let cancelled = false
    if (!selectedIds.length) { setStyles({}); setLoadingStyles(false); return }
    setLoadingStyles(true); setStyles({})
    void Promise.all(selectedIds.map(async (id) => {
      const style = await window.desktop.fabricator.loadHairStyle(slot, id)
      if (!style) throw new Error('Um dos cabelos selecionados não está mais disponível.')
      return style
    })).then((loaded) => { if (!cancelled) { setStyles(Object.fromEntries(loaded.map((style) => [style.id, style]))); setError('') } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o cabelo.') })
      .finally(() => { if (!cancelled) setLoadingStyles(false) })
    return () => { cancelled = true }
  }, [slot, selectionKey])

  const resetControls = () => { setAmplitude(6); setDuration(2.8); setAnchor(15); setEnabled(defaultEnabled); setPlaying(true) }
  const renderHair = (side: HairSide) => {
    if (!head) return null
    const style = styles[selection[side]]
    const asset = style?.[side]
    if (!asset) return null
    const transform = style.transforms[side] ?? initialTransform(side, head, asset)
    const phase = side === 'back' ? 0 : side === 'front' ? -.12 : -.24
    const frame: CSSProperties = {
      ...hairAnimationGeometry(head, asset, transform),
      zIndex: side === 'back' ? 1 : side === 'front' ? 3 : 4
    }
    const animated: CSSProperties = {
      '--hair-sway': `${enabled[side] ? amplitude : 0}deg`, '--hair-anchor': `${anchor}%`,
      animationDuration: `${duration}s`, animationDelay: `${duration * phase}s`, animationPlayState: playing ? 'running' : 'paused'
    } as CSSProperties
    return <div key={side} className="hair-animation-piece" style={frame}><img className="hair-animation-sway" style={animated} src={asset.dataUrl} alt={`Cabelo ${sides.find((item) => item.id === side)?.label.toLowerCase()}`} draggable={false} /></div>
  }

  return <section className="hair-animation-workspace" aria-label="Animação Cabelo Dev">
    <header className="hair-animation-header"><div><small>FABRICADOR · EXPERIMENTAL</small><h2>Animação Cabelo Dev</h2><p>Experimente um balanço nas camadas de cabelo do modelo.</p></div><span>Área de teste</span></header>
    <div className="hair-animation-layout">
      <aside className="hair-animation-panel">
        <section><h3>Modelo e cabelos</h3><label>Modelo<select value={slot} onChange={(event) => setSlot(Number(event.target.value))}>{models.filter((item): item is NonNullable<FabricatorSlotSummary> => Boolean(item)).map((item) => <option key={item.slot} value={item.slot}>{String(item.slot).padStart(2, '0')} · {item.name}</option>)}</select></label>
          {sides.map(({ id, label }) => <label key={id}>{label}<select value={selection[id]} disabled={loading || !head} onChange={(event) => setSelection((current) => ({ ...current, [id]: event.target.value }))}><option value="">Nenhum</option>{summaries.filter((item) => Boolean(item[id])).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
          {!loading && !summaries.length && <p className="hair-animation-hint">Salve um cabelo em Cabelos Dev para escolhê-lo aqui.</p>}
        </section>
        <section><h3>Movimento</h3><label className="hair-animation-range"><span>Intensidade <output>{amplitude}°</output></span><input type="range" min="0" max="25" value={amplitude} onChange={(event) => setAmplitude(Number(event.target.value))} /></label><label className="hair-animation-range"><span>Duração do ciclo <output>{duration.toFixed(1)} s</output></span><input type="range" min="0.6" max="8" step="0.1" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label className="hair-animation-range"><span>Ponto de fixação <output>{anchor}%</output></span><input type="range" min="0" max="100" value={anchor} onChange={(event) => setAnchor(Number(event.target.value))} /></label><div className="hair-animation-layers"><span>Animar camadas</span>{sides.map(({ id, label }) => <label key={id}><input type="checkbox" checked={enabled[id]} onChange={(event) => setEnabled((current) => ({ ...current, [id]: event.target.checked }))} />{label}</label>)}</div><div className="hair-animation-actions"><button className="primary" type="button" onClick={() => setPlaying((value) => !value)}>{playing ? 'Pausar' : 'Reproduzir'}</button><button type="button" onClick={resetControls}>Restaurar controles</button></div></section>
        <p className="hair-animation-note">Experimento temporário: as escolhas e o movimento ficam nesta prévia.</p>
      </aside>
      <div className="hair-animation-preview"><div className="hair-animation-preview-header"><strong>PRÉVIA DA CABEÇA</strong><label>Fundo <input aria-label="Cor do fundo das prévias" type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label></div><div className="hair-animation-stage" style={{ backgroundColor: background }}>
        {head ? <div className="hair-animation-head" style={{ aspectRatio: `${head.width} / ${head.height}` }}>{renderHair('back')}<img className="hair-animation-head-image" src={appearanceForPart(head)} alt="Cabeça do modelo" draggable={false} />{renderHair('front')}{renderHair('fringe')}</div> : <p>{loading ? 'Carregando modelo…' : 'Selecione um modelo com cabeça para começar.'}</p>}
        {head && !selectedIds.length && <div className="hair-animation-overlay">Escolha um cabelo no painel para testar o movimento.</div>}{loadingStyles && <div className="hair-animation-overlay" role="status">Carregando cabelo…</div>}
      </div><footer><Icon name="sparkles" /> O movimento é uma simulação por camada, com a raiz como ponto de apoio.</footer></div>
    </div>{error && <div className="hair-animation-error" role="alert">{error}</div>}
  </section>
}
