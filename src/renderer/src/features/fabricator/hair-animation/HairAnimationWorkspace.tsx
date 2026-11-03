import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { FabricatorProject, FabricatorSlotSummary, HairStyle, HairStyleSummary } from '../../../../../shared/fabricator'
import type { CustomizerCharacter } from '../../../../../shared/customizer'
import { projectForOriginalPreview } from '../../../../../shared/fabricatorModelViews'
import { Icon } from '../../../ui/components/Icon'
import { usePreviewBackground } from '../../../ui/hooks/usePreviewBackground'
import { useModelAppearanceTarget, useModelPartAppearancePreview } from '../ModelAppearanceContext'
import { headPart, initialTransform, type HairSide } from '../hairWorkspaceModel'
import { hairAnimationGeometry } from './hairAnimationGeometry'
import { HairMotionMesh } from './HairMotionMesh'
import { HairAnimationCharacter } from './HairAnimationCharacter'
import { HAIR_MOTION_PRESET_KEY, parseHairMotionPresets, type HairMotionPreset } from './hairMotionPresets'
import type { HairMotionSettings } from './hairMotionPhysics'
import './hair-animation.css'

const sides: Array<{ id: HairSide; label: string }> = [
  { id: 'back', label: 'Traseiro' }, { id: 'front', label: 'Posterior' }, { id: 'fringe', label: 'Franja' }
]
const emptySelection: Record<HairSide, string> = { back: '', front: '', fringe: '' }
const defaultEnabled: Record<HairSide, boolean> = { back: true, front: true, fringe: true }
const defaultIntensity: Record<HairSide, number> = { back: 100, front: 75, fringe: 40 }
const presets = {
  brisa: { wind: 20, gust: 28, stiffness: 42, damping: 52, responsiveness: 55, anchor: 14, speed: 100 },
  vento: { wind: 65, gust: 55, stiffness: 30, damping: 42, responsiveness: 65, anchor: 12, speed: 115 },
  suave: { wind: 0, gust: 5, stiffness: 48, damping: 65, responsiveness: 35, anchor: 18, speed: 85 },
  solto: { wind: 8, gust: 20, stiffness: 16, damping: 28, responsiveness: 95, anchor: 8, speed: 100 }
} satisfies Record<string, Omit<HairMotionSettings, 'enabled'>>

export function HairAnimationWorkspace({ baseModelSlot }: { baseModelSlot: number }) {
  const [slot, setSlot] = useState(baseModelSlot)
  const [models, setModels] = useState<FabricatorSlotSummary[]>([])
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const [characterId, setCharacterId] = useState('')
  const selectedCharacter = characters.find((character) => character.id === characterId) ?? null
  const [model, setModel] = useState<FabricatorProject | null>(null)
  const [summaries, setSummaries] = useState<HairStyleSummary[]>([])
  const [selection, setSelection] = useState<Record<HairSide, string>>(emptySelection)
  const [styles, setStyles] = useState<Record<string, HairStyle>>({})
  const [enabled, setEnabled] = useState<Record<HairSide, boolean>>(defaultEnabled)
  const [intensity, setIntensity] = useState<Record<HairSide, number>>(defaultIntensity)
  const [physics, setPhysics] = useState(presets.brisa)
  const [impulse, setImpulse] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [headPosition, setHeadPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const headX = useRef(0)
  const drag = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const [playing, setPlaying] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingStyles, setLoadingStyles] = useState(false)
  const [error, setError] = useState('')
  const [presetStorage] = useState(() => {
    try { return { slots: parseHairMotionPresets(window.localStorage.getItem(HAIR_MOTION_PRESET_KEY)), error: '' } }
    catch { return { slots: Array<HairMotionPreset | null>(5).fill(null), error: 'Não foi possível ler os presets salvos. Os dados existentes foram preservados.' } }
  })
  const [presetSlots, setPresetSlots] = useState(presetStorage.slots)
  const [presetMessage, setPresetMessage] = useState(presetStorage.error)
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
    void window.desktop.customizer.listCustomizerCharacters().then((items) => { if (!cancelled) setCharacters(items) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os personagens.') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setModel(null); setSummaries([]); setSelection(emptySelection); setStyles({}); headX.current = 0; setHeadPosition({ x: 0, y: 0 })
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

  const centerHead = () => { headX.current = 0; setHeadPosition({ x: 0, y: 0 }) }
  const loadPreset = (preset: HairMotionPreset) => { setPhysics({ ...preset.physics }); setEnabled({ ...preset.enabled }); setIntensity({ ...preset.intensity }); setPlaying(true); setResetToken((value) => value + 1); setPresetMessage('') }
  const savePreset = (index: number) => {
    if (presetStorage.error) return
    const next = presetSlots.map((preset, i) => i === index ? { physics: { ...physics }, enabled: { ...enabled }, intensity: { ...intensity } } : preset)
    try { window.localStorage.setItem(HAIR_MOTION_PRESET_KEY, JSON.stringify(next)); setPresetSlots(next); setPresetMessage(`Preset ${index + 1} salvo.`) }
    catch { setPresetMessage('Não foi possível salvar o preset. Tente novamente.') }
  }
  const resetControls = () => { setPhysics(presets.brisa); setEnabled(defaultEnabled); setIntensity(defaultIntensity); setPlaying(true); centerHead(); setResetToken((value) => value + 1) }
  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (!head && !selectedCharacter)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: headPosition.x, startY: headPosition.y }
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const panX = bounds.width * (.3 + Math.max(0, zoom - 1) / 2)
    const panY = bounds.height * (.2 + Math.max(0, zoom - 1) / 2)
    const x = Math.max(-panX, Math.min(panX, active.startX + event.clientX - active.x))
    const y = Math.max(-panY, Math.min(panY, active.startY + event.clientY - active.y))
    headX.current = x / Math.max(1, bounds.width)
    setHeadPosition({ x, y })
  }
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointerId === event.pointerId) drag.current = null }
  const renderHair = (side: HairSide) => {
    if (!head) return null
    const style = styles[selection[side]]
    const asset = style?.[side]
    if (!asset) return null
    const transform = style.transforms[side] ?? initialTransform(side, head, asset)
    const phase = side === 'back' ? 0 : side === 'front' ? 1.2 : 2.4
    const frame: CSSProperties = {
      ...hairAnimationGeometry(head, asset, transform),
      zIndex: side === 'back' ? 1 : side === 'front' ? 3 : 4
    }
    return <div key={side} className="hair-animation-piece" style={frame}><HairMotionMesh source={asset.dataUrl} name={`cabelo ${sides.find((item) => item.id === side)?.label.toLowerCase()}`} settings={{ ...physics, enabled: enabled[side] }} intensity={intensity[side]} playing={playing} headX={headX} impulse={impulse} resetToken={resetToken} phase={phase} flipped={Boolean(transform.flipX)} /></div>
  }

  return <section className="hair-animation-workspace" aria-label="Animação Cabelo Dev">
    <header className="hair-animation-header"><div><small>FABRICADOR · EXPERIMENTAL</small><h2>Animação Cabelo Dev</h2><p>Experimente vento, elasticidade e movimento secundário em cada camada.</p></div><span>Área de teste</span></header>
    <div className="hair-animation-layout">
      <aside className="hair-animation-panel">
        <section><h3>Modelo e cabelos</h3><label>Personagem<select value={characterId} onChange={(event) => { const id = event.target.value; setCharacterId(id); const character = characters.find((item) => item.id === id); if (character) setSlot(character.customization.modelSlot ?? 1) }}><option value="">Cabeça do modelo</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label>Modelo<select value={slot} onChange={(event) => { setCharacterId(''); setSlot(Number(event.target.value)) }}>{models.filter((item): item is NonNullable<FabricatorSlotSummary> => Boolean(item)).map((item) => <option key={item.slot} value={item.slot}>{String(item.slot).padStart(2, '0')} · {item.name}</option>)}</select></label>
          {!selectedCharacter && sides.map(({ id, label }) => <label key={id}>{label}<select value={selection[id]} disabled={loading || !head} onChange={(event) => setSelection((current) => ({ ...current, [id]: event.target.value }))}><option value="">Nenhum</option>{summaries.filter((item) => Boolean(item[id])).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
          {selectedCharacter && <p className="hair-animation-hint">A prévia usa os cabelos e cores salvos neste personagem.</p>}
          {!selectedCharacter && !loading && !summaries.length && <p className="hair-animation-hint">Salve um cabelo em Cabelos Dev para escolhê-lo aqui.</p>}
        </section>
        <section><h3>Presets salvos</h3><div className="hair-animation-preset-slots">{presetSlots.map((preset, index) => <div className="hair-animation-preset-slot" key={index}><button type="button" disabled={!preset} onClick={() => { if (preset) loadPreset(preset) }}>Preset {index + 1}{preset ? '' : ' · vazio'}</button><button type="button" disabled={Boolean(presetStorage.error)} aria-label={`Salvar configuração no preset ${index + 1}`} onClick={() => savePreset(index)}>Salvar</button></div>)}</div>{presetMessage && <p className="hair-animation-hint" role="status">{presetMessage}</p>}</section>
        <section><h3>Movimento</h3><div className="hair-animation-presets">{([['brisa', 'Brisa'], ['vento', 'Ventania'], ['suave', 'Suave'], ['solto', 'Solto']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => { setPhysics(presets[key]); setPlaying(true) }}>{label}</button>)}</div>
          {([['wind', 'Vento', -100, 100], ['gust', 'Rajadas', 0, 100], ['speed', 'Velocidade', 25, 250], ['stiffness', 'Rigidez', 0, 100], ['damping', 'Amortecimento', 0, 100], ['responsiveness', 'Reação à cabeça', 0, 100], ['anchor', 'Raiz fixa', 0, 85]] as const).map(([key, label, min, max]) => <label key={key} className="hair-animation-range"><span>{label}<output>{physics[key]}{key === 'wind' ? '' : '%'}</output></span><input type="range" min={min} max={max} value={physics[key]} onChange={(event) => setPhysics((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
          <div className="hair-animation-layers"><span>Força por camada</span>{sides.map(({ id, label }) => <div className="hair-animation-layer" key={id}><label><input type="checkbox" checked={enabled[id]} onChange={(event) => setEnabled((current) => ({ ...current, [id]: event.target.checked }))} />{label}</label><input aria-label={`Força da camada ${label.toLowerCase()}`} type="range" min="0" max="150" value={intensity[id]} disabled={!enabled[id]} onChange={(event) => setIntensity((current) => ({ ...current, [id]: Number(event.target.value) }))} /><output>{intensity[id]}%</output></div>)}</div><div className="hair-animation-actions"><button type="button" onClick={resetControls}>Restaurar controles</button></div></section>
        <p className="hair-animation-note">Os presets ficam salvos neste computador. O movimento é experimental e fica nesta prévia.</p>
      </aside>
      <div className="hair-animation-preview"><div className="hair-animation-preview-header"><strong>{selectedCharacter ? 'PRÉVIA DO PERSONAGEM' : 'PRÉVIA DA CABEÇA'}</strong><div className="hair-animation-transport"><button className="primary" type="button" onClick={() => setPlaying((value) => !value)}>{playing ? 'Pausar' : 'Reproduzir'}</button><button type="button" onClick={() => { setImpulse((value) => value + 1); setPlaying(true) }}>Sacudir cabelo</button><button type="button" onClick={centerHead}>Centralizar</button><div className="hair-animation-zoom" role="group" aria-label="Zoom da prévia"><button type="button" aria-label="Diminuir zoom" disabled={zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, Math.round((value - .1) * 10) / 10))}>−</button><button type="button" aria-label="Restaurar zoom" title="Restaurar zoom para 100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 5} onClick={() => setZoom((value) => Math.min(5, Math.round((value + .1) * 10) / 10))}>+</button></div><label>Fundo <input aria-label="Cor do fundo das prévias" type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label></div></div><div className="hair-animation-stage" style={{ backgroundColor: background }} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
        {selectedCharacter ? <HairAnimationCharacter key={selectedCharacter.id} character={selectedCharacter} physics={physics} enabled={enabled} intensity={intensity} playing={playing} headX={headX} impulse={impulse} resetToken={resetToken} position={headPosition} zoom={zoom} /> : head ? <div className="hair-animation-head" style={{ aspectRatio: `${head.width} / ${head.height}`, transform: `translate(${headPosition.x}px, ${headPosition.y}px) scale(${zoom})` }}>{renderHair('back')}<img className="hair-animation-head-image" src={appearanceForPart(head)} alt="Cabeça do modelo" draggable={false} />{renderHair('front')}{renderHair('fringe')}</div> : <p>{loading ? 'Carregando modelo…' : 'Selecione um modelo com cabeça para começar.'}</p>}
        {!selectedCharacter && head && !selectedIds.length && <div className="hair-animation-overlay">Escolha um cabelo no painel para testar o movimento.</div>}{!selectedCharacter && loadingStyles && <div className="hair-animation-overlay" role="status">Carregando cabelo…</div>}
      </div><footer><Icon name="sparkles" /> Arraste a cabeça ou use “Sacudir cabelo” para testar a reação.</footer></div>
    </div>{error && <div className="hair-animation-error" role="alert">{error}</div>}
  </section>
}
