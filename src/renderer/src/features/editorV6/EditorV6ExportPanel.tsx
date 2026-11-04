import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import { EDITOR_V6_ENCODER_CHOICES, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../../shared/editorV6Export'
import { FIRST_HAIR_MOTION_PRESET, HAIR_MOTION_PRESET_KEY, hairMotionPosteriorOnlyPreset, parseHairMotionPresets, type HairMotionPreset } from '../../../../shared/hairMotionEngine'
import { prepareEditorV6HairMotionBundle } from './editorV6HairMotionPreparation'
import { EditorV6HairPresetEditor } from './EditorV6HairPresetEditor'
import { saveEditorV6HairPresetSlot } from './editorV6HairPresetStorage'
import { cancelEditorV6ExportCommand, runEditorV6ExportCommand } from './editorV6ExportCommands'
import { EditorV6ExportActivity } from './EditorV6ExportActivity'

const FORCE_TURBO_STORAGE_KEY = 'editor-v6-force-turbo-1080'
const readForceTurboPreference = () => {
  try { return window.localStorage.getItem(FORCE_TURBO_STORAGE_KEY) === 'true' } catch { return false }
}
let rememberedJob: EditorV6ExportStatus | null = null
const finished = (job: EditorV6ExportStatus) => ['completed', 'cancelled', 'failed'].includes(job.state)
export function EditorV6ExportPanel({ project, open, characterSourceRefreshRequired, onClose, onChange, onActivity, trackOperation }: { project: EditorV6Document; open: boolean; characterSourceRefreshRequired: boolean; onClose: () => void; onChange: (update: (project: EditorV6Document) => EditorV6Document) => void; onActivity?: (active: boolean) => void; trackOperation: <T,>(operation: () => Promise<T>) => Promise<T> }) {
  const dialog = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    const previous = document.activeElement
    dialog.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [open])
  const [job, setJob] = useState(rememberedJob)
  const [options, setOptions] = useState<EditorV6ExportOptions>({ startFrame: 0, endFrame: project.timeline.durationFrames, width: 1920, height: 1080, turbo: true, forceTurbo1080: readForceTurboPreference(), encoder: 'auto', mouthLoop: true, mouthLoopCycleFrames: 30 })
  useEffect(() => {
    try { window.localStorage.setItem(FORCE_TURBO_STORAGE_KEY, String(Boolean(options.forceTurbo1080))) } catch { /* Export remains usable when storage is unavailable. */ }
  }, [options.forceTurbo1080])
  const [hairAnimationEnabled, setHairAnimationEnabled] = useState(false)
  const [hairPosteriorOnly, setHairPosteriorOnly] = useState(false)
  const [hairPoseReactionOnly, setHairPoseReactionOnly] = useState(false)
  const [hairLoopMode, setHairLoopMode] = useState<0 | 90 | 120>(0)
  const [hairPresetSlot, setHairPresetSlot] = useState(1)
  const [hairPresets, setHairPresets] = useState<Array<ReturnType<typeof parseHairMotionPresets>[number]>>([structuredClone(FIRST_HAIR_MOTION_PRESET), null, null, null, null])
  const [presetDraft, setPresetDraft] = useState<{ slot: number; value: HairMotionPreset } | null>(null)
  const [editingHairPreset, setEditingHairPreset] = useState(false)
  const [hairPresetMessage, setHairPresetMessage] = useState('')
  const [preparingHair, setPreparingHair] = useState(false)
  const [startingExport, setStartingExport] = useState(false)
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = Boolean(job && !finished(job))
  useEffect(() => {
    if (!open) return
    try {
      setHairPresets(parseHairMotionPresets(window.localStorage.getItem(HAIR_MOTION_PRESET_KEY)))
      setPresetDraft(null)
      setEditingHairPreset(false)
      setHairPresetMessage('')
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Os presets de cabelo salvos estão inválidos.') }
  }, [open])
  useEffect(() => { onActivity?.(active || busy); return () => onActivity?.(false) }, [active, busy, onActivity])
  const setStatus = (value: EditorV6ExportStatus) => { rememberedJob = value; setJob(value) }
  useEffect(() => {
    if (!job || finished(job)) return
    let stopped = false, timer = 0
    const poll = async () => {
      try { const value = await window.desktop.editorV6.getEditorV6ExportStatus(job.id); if (!stopped) setStatus(value) }
      catch (reason) { if (!stopped) setError(reason instanceof Error ? reason.message : String(reason)) }
      if (!stopped) timer = window.setTimeout(() => { void poll() }, 500)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [job?.id, active])
  const updateAudio = (id: string, values: Partial<EditorV6ExportAudio>) => onChange((document) => ({ ...document, exportAudio: document.exportAudio?.map((clip) => clip.id === id ? { ...clip, ...values } : clip), updatedAt: new Date().toISOString() }))
  const importAudio = async () => {
    setBusy(true); setError('')
    try { await trackOperation(async () => { const clip = await window.desktop.editorV6.importEditorV6ExportAudio(project.id); if (clip) onChange((document) => ({ ...document, exportAudio: [...(document.exportAudio ?? []), clip], updatedAt: new Date().toISOString() })) }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const selectedHairPreset = presetDraft?.slot === hairPresetSlot ? presetDraft.value : hairPresets[hairPresetSlot - 1]
  const beginEditingHairPreset = () => {
    setPresetDraft({ slot: hairPresetSlot, value: structuredClone(selectedHairPreset ?? FIRST_HAIR_MOTION_PRESET) })
    setEditingHairPreset(true)
    setHairPresetMessage('')
  }
  const saveHairPreset = () => {
    const value = presetDraft?.slot === hairPresetSlot ? presetDraft.value : null
    if (!value) return
    try {
      setHairPresets(saveEditorV6HairPresetSlot(window.localStorage, hairPresetSlot, value))
      setHairPresetMessage(`Preset ${hairPresetSlot} salvo para Editor V6 e Fabricador DEV.`)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o preset.')
    }
  }
  const start = async () => {
    if (characterSourceRefreshRequired) { setError('Aguarde a sincronização da aparência do personagem com o Customizador antes de exportar.'); return }
    const preparedHairPreset = hairAnimationEnabled && selectedHairPreset
      ? hairPosteriorOnly || hairPoseReactionOnly ? hairMotionPosteriorOnlyPreset(selectedHairPreset) : selectedHairPreset
      : null
    if (hairAnimationEnabled && !preparedHairPreset) { setError('Escolha ou configure um preset de animação de cabelo.'); return }
    setExportStartedAt(Date.now()); setStartingExport(true)
    setBusy(true); setError('')
    try {
      const startedJob = await trackOperation(() => runEditorV6ExportCommand({
      project,
      options: { ...options, hairAnimationLoopFrames: hairAnimationEnabled && !hairPoseReactionOnly && hairLoopMode ? hairLoopMode : undefined, hairPoseReactionOnly: hairAnimationEnabled && hairPoseReactionOnly ? true : undefined, hairPosteriorOnly: hairAnimationEnabled && (hairPosteriorOnly || hairPoseReactionOnly) ? true : undefined },
      hairPresetSlot,
      hairPreset: preparedHairPreset,
      prepareHair: prepareEditorV6HairMotionBundle,
      startExport: (document, exportOptions, hairMotion) => window.desktop.editorV6.startEditorV6Export(document, exportOptions, hairMotion),
      onPreparingHair: setPreparingHair,
      onStatus: setStatus
      }))
      if (!startedJob) setExportStartedAt(null)
    } catch (reason) { setExportStartedAt(null); setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false); setPreparingHair(false); setStartingExport(false) }
  }
  const cancel = async () => {
    if (!job) return
    setBusy(true)
    try { await trackOperation(() => cancelEditorV6ExportCommand({
      job,
      cancel: (jobId) => window.desktop.editorV6.cancelEditorV6Export(jobId),
      getStatus: (jobId) => window.desktop.editorV6.getEditorV6ExportStatus(jobId),
      onStatus: setStatus
    })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const seconds = (value: number) => Number((value / 30).toFixed(4))
  const frames = (value: string, maximum = 1_000_000) => Math.max(0, Math.min(maximum, Math.round(Number(value) * 30) || 0))
  if (!open) return null
  return <div className="v6-export-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialog} tabIndex={-1} className="v6-export-panel" role="dialog" aria-modal="true" aria-labelledby="v6-export-title">
      <header className="v6-export-header"><div className="v6-export-heading"><span className="v6-export-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6.5h10.5A2.5 2.5 0 0 1 17 9v9H6.5A2.5 2.5 0 0 1 4 15.5z" /><path d="m17 10 4-2v9l-4-2M7 4v2.5M11 4v2.5M7 18v2" /></svg></span><div><small>EDITOR V6 <i /> ESTÚDIO DE EXPORTAÇÃO</small><h2 id="v6-export-title">Exportar vídeo</h2><p>Configure a saída e acompanhe a renderização em tempo real.</p></div></div><button className="v6-export-close" type="button" onClick={onClose} disabled={busy} aria-label="Fechar exportador">×</button></header>
      {startingExport || job ? <EditorV6ExportActivity job={startingExport ? null : job} starting={startingExport} preparingHair={preparingHair} startedAt={exportStartedAt} /> : <section className="v6-export-overview" aria-label="Resumo da exportação configurada"><div className="v6-export-overview-art" aria-hidden="true"><svg viewBox="0 0 220 120"><path d="M0 83c18 0 18-46 36-46s18 45 37 45 18-61 37-61 18 77 37 77 18-42 36-42 19 27 37 27" /></svg><span className="v6-export-overview-format">MP4 <i /> 30 FPS</span></div><div className="v6-export-overview-copy"><small>PRONTO PARA RENDERIZAR</small><strong>Seu vídeo, quadro a quadro</strong><p>As configurações abaixo serão usadas para criar e validar o arquivo final.</p><div className="v6-export-overview-stats"><span><small>RESOLUÇÃO</small><b>{options.width} × {options.height}</b></span><span><small>DURAÇÃO</small><b>{frameTimecode(Math.max(0, options.endFrame - options.startFrame))}</b></span><span><small>MODO</small><b>{options.turbo ? 'Turbo 2×' : 'Seguro'}</b></span></div></div></section>}
      {characterSourceRefreshRequired && <p className="v6-export-warning" role="status">Atualizando os personagens do Customizador. A exportação ficará disponível quando os snapshots estiverem sincronizados.</p>}
      <div className="v6-export-settings-grid">
        <fieldset className="v6-export-video-settings" disabled={busy || active}><legend>Vídeo</legend><div className="v6-export-grid">
          <label>Do início (s)<input type="number" min={0} step={1 / 30} value={seconds(options.startFrame)} onChange={(event) => setOptions({ ...options, startFrame: frames(event.target.value, project.timeline.durationFrames) })} /></label>
          <label>Até (s)<input type="number" min={1 / 30} step={1 / 30} value={seconds(options.endFrame)} onChange={(event) => setOptions({ ...options, endFrame: frames(event.target.value, project.timeline.durationFrames) })} /></label>
          <label>Resolução<select disabled={options.forceTurbo1080} value={options.height} onChange={(event) => setOptions({ ...options, height: Number(event.target.value), width: Number(event.target.value) * 16 / 9 })}><option value={1080}>1080p · 1920 × 1080</option><option value={720}>720p · 1280 × 720</option></select></label>
          <label>Codificação<select value={options.encoder} onChange={(event) => setOptions({ ...options, encoder: event.target.value as EditorV6ExportOptions['encoder'] })}>{EDITOR_V6_ENCODER_CHOICES.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>
        </div><small>{frameTimecode(options.startFrame)} → {frameTimecode(options.endFrame)} · {Math.max(0, options.endFrame - options.startFrame)} quadros · 30 FPS</small><label className="v6-export-check"><input type="checkbox" disabled={options.forceTurbo1080} checked={options.turbo} onChange={(event) => setOptions({ ...options, turbo: event.target.checked })} />{options.forceTurbo1080 ? 'Turbo 2× · duas partes paralelas' : 'Turbo 2× · duas partes paralelas, com recuperação pelo modo seguro'}</label>
          <label className="v6-export-check"><input type="checkbox" checked={options.forceTurbo1080 ?? false} onChange={(event) => setOptions({ ...options, forceTurbo1080: event.target.checked, ...(event.target.checked ? { turbo: true, width: 1920, height: 1080 } : {}) })} />Forçar Turbo em 1080p, sem modo seguro</label>
          <small>Se o Turbo falhar, a exportação será interrompida e mostrará o erro.</small>
          <label className="v6-export-mouth-cycle">Ciclo da animação da boca<select value={options.mouthLoopCycleFrames ?? 30} onChange={(event) => setOptions({ ...options, mouthLoop: true, mouthLoopCycleFrames: Number(event.target.value) })}><option value={30}>1 segundo</option><option value={60}>2 segundos</option><option value={90}>3 segundos</option><option value={180}>6 segundos</option></select></label>
          <small>A animação da boca é aplicada automaticamente durante a fala vinculada ao personagem. Ela não altera o restante da imagem.</small></fieldset>
        <fieldset className="v6-export-hair-settings" disabled={busy || active}><legend>Animação de cabelo <span>EXPERIMENTAL</span></legend>
          <label className="v6-export-check"><input type="checkbox" checked={hairAnimationEnabled} onChange={(event) => setHairAnimationEnabled(event.target.checked)} />Ativar animação de cabelo</label>
          <label className="v6-export-check"><input type="checkbox" checked={hairPosteriorOnly || hairPoseReactionOnly} disabled={!hairAnimationEnabled || hairPoseReactionOnly} onChange={(event) => setHairPosteriorOnly(event.target.checked)} />Animar apenas o cabelo posterior</label>
          <small>Neste modo, apenas a categoria Posterior (rearHair) é animada; Traseiro (backHair), rabo de cavalo, franja e ahoge continuam estáticos. O preset salvo não é alterado.</small>
          <label className="v6-export-check"><input type="checkbox" checked={hairPoseReactionOnly} disabled={!hairAnimationEnabled} onChange={(event) => { setHairPoseReactionOnly(event.target.checked); if (event.target.checked) setHairLoopMode(0) }} />Balançar só o cabelo posterior após trocar de pose</label>
          <small>Ativa automaticamente “apenas cabelo posterior”. Ao terminar uma troca real de pose, só o Posterior balança uma vez durante cerca de 1 segundo e volta à posição original. Alterações apenas de expressão não disparam.</small>
          <label>Preset<select disabled={!hairAnimationEnabled} value={hairPresetSlot} onChange={(event) => { setHairPresetSlot(Number(event.target.value)); setPresetDraft(null); setEditingHairPreset(false); setHairPresetMessage('') }}>{hairPresets.map((preset, index) => <option key={index} value={index + 1}>Preset {index + 1}{preset ? '' : ' · vazio'}</option>)}</select></label>
          <label>Movimento do cabelo<select value={hairLoopMode} disabled={!hairAnimationEnabled || hairPoseReactionOnly} onChange={(event) => setHairLoopMode(Number(event.target.value) as 0 | 90 | 120)}><option value={0}>Física contínua (atual)</option><option value={90}>Loop experimental · 3 segundos</option><option value={120}>Loop experimental · 4 segundos</option></select></label>
          <small>{hairPoseReactionOnly ? 'Reação única somente do Posterior: a física contínua e o loop ficam desligados nesta exportação.' : 'O loop prepara uma vez os deslocamentos das mechas e os repete no MP4. A preparação das poses continua necessária.'} A prévia normal do Editor V6 não muda.</small>
          <small>O preset usa a mesma chave do Fabricador DEV. O cabelo animado continua exclusivo do MP4.</small>
          <button type="button" disabled={!hairAnimationEnabled} aria-expanded={editingHairPreset} onClick={() => editingHairPreset ? setEditingHairPreset(false) : beginEditingHairPreset()}>{editingHairPreset ? 'Recolher controles' : selectedHairPreset ? 'Editar preset no Editor V6' : 'Criar preset neste slot'}</button>
          {hairAnimationEnabled && editingHairPreset && presetDraft?.slot === hairPresetSlot && <EditorV6HairPresetEditor slot={hairPresetSlot} preset={presetDraft.value}
            onChange={(value) => { setPresetDraft({ slot: hairPresetSlot, value }); setHairPresetMessage('') }}
            onSave={saveHairPreset}
            onDiscard={() => { setPresetDraft(null); setEditingHairPreset(false); setHairPresetMessage('') }} />}
          {hairPresetMessage && <small role="status">{hairPresetMessage}</small>}
        </fieldset>
        <fieldset className="v6-export-audio-settings" disabled={busy || active}><legend>Trilha sonora da exportação</legend><p>Os arquivos são copiados para o projeto. A mixagem é aplicada uma única vez ao vídeo final.</p>
          {(project.exportAudio?.length ?? 0) > 0 ? <div className="v6-export-audio-list">{(project.exportAudio ?? []).map((clip) => <div className="v6-export-audio" key={clip.id}>
            <strong title={clip.name}>{clip.name}</strong>
            <label>Começa na edição (s)<input type="number" min={0} step={1 / 30} value={seconds(clip.startFrame)} onChange={(event) => updateAudio(clip.id, { startFrame: frames(event.target.value) })} /></label>
            <label>Início no arquivo (s)<input type="number" min={0} max={seconds(clip.sourceFrames - 1)} step={1 / 30} value={seconds(clip.sourceInFrame)} onChange={(event) => { const sourceInFrame = frames(event.target.value, clip.sourceFrames - 1); updateAudio(clip.id, { sourceInFrame, durationFrames: Math.min(clip.durationFrames, clip.sourceFrames - sourceInFrame) }) }} /></label>
            <label>Duração (s)<input type="number" min={1 / 30} max={seconds(clip.sourceFrames - clip.sourceInFrame)} step={1 / 30} value={seconds(clip.durationFrames)} onChange={(event) => updateAudio(clip.id, { durationFrames: Math.max(1, frames(event.target.value, clip.sourceFrames - clip.sourceInFrame)) })} /></label>
            <label>Volume (%)<input type="number" min={0} max={200} value={Math.round(clip.gain * 100)} onChange={(event) => updateAudio(clip.id, { gain: Math.min(2, Math.max(0, Number(event.target.value) / 100 || 0)) })} /></label>
            <label className="v6-export-check"><input type="checkbox" checked={clip.muted} onChange={(event) => updateAudio(clip.id, { muted: event.target.checked })} />Silenciar</label>
            <button type="button" onClick={() => onChange((document) => ({ ...document, exportAudio: document.exportAudio?.filter((item) => item.id !== clip.id), updatedAt: new Date().toISOString() }))}>Remover</button>
          </div>)}</div> : <div className="v6-export-audio-empty"><span aria-hidden="true">♫</span><div><strong>Nenhuma trilha adicionada</strong><small>Adicione áudio para mixar no arquivo final.</small></div></div>}
          <button className="v6-export-add-audio" type="button" disabled={(project.exportAudio?.length ?? 0) >= 32} onClick={() => void importAudio()}>＋ Adicionar áudio</button>
        </fieldset>
      </div>
      {job && active && <p className="v6-export-keep-open">Você pode fechar este painel. Mantenha o aplicativo aberto até a exportação terminar.</p>}
      {job && finished(job) && <div className="v6-export-result-actions"><span>{job.state === 'completed' ? 'MP4 e relatório prontos' : 'Relatório da exportação disponível'}</span><button type="button" onClick={() => void window.desktop.editorV6.revealEditorV6Export(job.id).catch((reason: unknown) => setError(String(reason)))}>{job.state === 'completed' ? 'Mostrar MP4 e relatório' : 'Mostrar relatório'}</button></div>}
      {error && <p role="alert" className="v6-export-error">{error}</p>}
      <footer>{active ? <button type="button" disabled={busy} onClick={() => void cancel()}>Cancelar exportação</button> : <button className="v6-export-primary" type="button" disabled={busy || characterSourceRefreshRequired} onClick={() => void start()}>{busy ? 'Abrindo exportação…' : options.turbo ? 'EXPORTAR TURBO 2×' : 'EXPORTAR MP4'}</button>}<button type="button" disabled={busy} onClick={onClose}>Fechar painel</button></footer>
    </section>
  </div>
}
