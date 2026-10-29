import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import { planEditorV6Export, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../../shared/editorV6Export'

let rememberedJob: EditorV6ExportStatus | null = null
const finished = (job: EditorV6ExportStatus) => ['completed', 'cancelled', 'failed'].includes(job.state)
export function EditorV6ExportPanel({ project, open, onClose, onChange, onActivity, trackOperation }: { project: EditorV6Document; open: boolean; onClose: () => void; onChange: (update: (project: EditorV6Document) => EditorV6Document) => void; onActivity?: (active: boolean) => void; trackOperation: <T,>(operation: () => Promise<T>) => Promise<T> }) {
  const dialog = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    const previous = document.activeElement
    dialog.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [open])
  const [job, setJob] = useState(rememberedJob)
  const [options, setOptions] = useState<EditorV6ExportOptions>({ startFrame: 0, endFrame: project.timeline.durationFrames, width: 1920, height: 1080, turbo: true, encoder: 'auto', mouthLoop: false, mouthLoopCycleFrames: 30 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = Boolean(job && !finished(job))
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
  const start = async () => {
    setBusy(true); setError('')
    try { await trackOperation(async () => { planEditorV6Export(options, project.timeline.durationFrames); const value = await window.desktop.editorV6.startEditorV6Export(project, options); if (value) setStatus(value) }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!job) return
    setBusy(true)
    try { await window.desktop.editorV6.cancelEditorV6Export(job.id); setStatus(await window.desktop.editorV6.getEditorV6ExportStatus(job.id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const seconds = (value: number) => Number((value / 30).toFixed(4))
  const frames = (value: string, maximum = 1_000_000) => Math.max(0, Math.min(maximum, Math.round(Number(value) * 30) || 0))
  if (!open) return null
  return <div className="v6-export-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialog} tabIndex={-1} className="v6-export-panel" role="dialog" aria-modal="true" aria-labelledby="v6-export-title">
      <header><div><small>EDITOR V6 · MP4</small><h2 id="v6-export-title">Exportar vídeo</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar exportador">×</button></header>
      <p>Duas partes em paralelo no Turbo. O ganho de velocidade depende do computador e da cena.</p>
      <fieldset disabled={busy || active}><legend>Vídeo</legend><div className="v6-export-grid">
        <label>Do início (s)<input type="number" min={0} step={1 / 30} value={seconds(options.startFrame)} onChange={(event) => setOptions({ ...options, startFrame: frames(event.target.value, project.timeline.durationFrames) })} /></label>
        <label>Até (s)<input type="number" min={1 / 30} step={1 / 30} value={seconds(options.endFrame)} onChange={(event) => setOptions({ ...options, endFrame: frames(event.target.value, project.timeline.durationFrames) })} /></label>
        <label>Resolução<select value={options.height} onChange={(event) => setOptions({ ...options, height: Number(event.target.value), width: Number(event.target.value) * 16 / 9 })}><option value={1080}>1080p · 1920 × 1080</option><option value={720}>720p · 1280 × 720</option></select></label>
        <label>Codificação<select value={options.encoder} onChange={(event) => setOptions({ ...options, encoder: event.target.value as EditorV6ExportOptions['encoder'] })}><option value="auto">Automática · GPU se disponível</option><option value="libx264">CPU · H.264</option></select></label>
      </div><small>{frameTimecode(options.startFrame)} → {frameTimecode(options.endFrame)} · {Math.max(0, options.endFrame - options.startFrame)} quadros · 30 FPS</small><label className="v6-export-check"><input type="checkbox" checked={options.turbo} onChange={(event) => setOptions({ ...options, turbo: event.target.checked })} />Turbo 2× · duas partes paralelas, com recuperação pelo modo seguro</label>
        <label className="v6-export-check"><input type="checkbox" checked={Boolean(options.mouthLoop)} onChange={(event) => setOptions({ ...options, mouthLoop: event.target.checked })} />Teste: loop simples da boca · aumento de 5% durante a fala · só no MP4</label>
        <label>Ciclo da boca<select value={options.mouthLoopCycleFrames ?? 30} disabled={!options.mouthLoop} onChange={(event) => setOptions({ ...options, mouthLoopCycleFrames: Number(event.target.value) })}><option value={30}>1 segundo</option><option value={60}>2 segundos</option><option value={90}>3 segundos</option><option value={180}>6 segundos</option></select></label>
        <small>Usa três tamanhos de boca: 100%, 105% e 110,25% de largura e altura. Anima somente durante o balão de fala vinculado ao personagem.</small></fieldset>
      <fieldset disabled={busy || active}><legend>Trilha sonora da exportação</legend><p>Os arquivos são copiados para o projeto. A mixagem é aplicada uma única vez ao vídeo final.</p>
        <div className="v6-export-audio-list">{(project.exportAudio ?? []).map((clip) => <div className="v6-export-audio" key={clip.id}>
          <strong title={clip.name}>{clip.name}</strong>
          <label>Começa na edição (s)<input type="number" min={0} step={1 / 30} value={seconds(clip.startFrame)} onChange={(event) => updateAudio(clip.id, { startFrame: frames(event.target.value) })} /></label>
          <label>Início no arquivo (s)<input type="number" min={0} max={seconds(clip.sourceFrames - 1)} step={1 / 30} value={seconds(clip.sourceInFrame)} onChange={(event) => { const sourceInFrame = frames(event.target.value, clip.sourceFrames - 1); updateAudio(clip.id, { sourceInFrame, durationFrames: Math.min(clip.durationFrames, clip.sourceFrames - sourceInFrame) }) }} /></label>
          <label>Duração (s)<input type="number" min={1 / 30} max={seconds(clip.sourceFrames - clip.sourceInFrame)} step={1 / 30} value={seconds(clip.durationFrames)} onChange={(event) => updateAudio(clip.id, { durationFrames: Math.max(1, frames(event.target.value, clip.sourceFrames - clip.sourceInFrame)) })} /></label>
          <label>Volume (%)<input type="number" min={0} max={200} value={Math.round(clip.gain * 100)} onChange={(event) => updateAudio(clip.id, { gain: Math.min(2, Math.max(0, Number(event.target.value) / 100 || 0)) })} /></label>
          <label className="v6-export-check"><input type="checkbox" checked={clip.muted} onChange={(event) => updateAudio(clip.id, { muted: event.target.checked })} />Silenciar</label>
          <button type="button" onClick={() => onChange((document) => ({ ...document, exportAudio: document.exportAudio?.filter((item) => item.id !== clip.id), updatedAt: new Date().toISOString() }))}>Remover</button>
        </div>)}</div><button type="button" disabled={(project.exportAudio?.length ?? 0) >= 32} onClick={() => void importAudio()}>＋ Adicionar áudio</button>
      </fieldset>
      {job && <div className={`v6-export-progress state-${job.state}`} role="status"><strong>{job.message}</strong>{job.motionProgress && <span>Transições: {job.motionProgress.completed} / {job.motionProgress.total}</span>}<progress value={job.frames} max={job.totalFrames || 1} /><span>{job.frames} / {job.totalFrames} quadros{job.fallback ? ' · Recuperação pelo modo seguro' : ''}</span>{job.error && <p>{job.error}</p>}{active && <small>Você pode fechar este painel. Mantenha o aplicativo aberto até terminar.</small>}{finished(job) && <button type="button" onClick={() => void window.desktop.editorV6.revealEditorV6Export(job.id).catch((reason: unknown) => setError(String(reason)))}>{job.state === 'completed' ? 'Mostrar MP4 e relatório' : 'Mostrar relatório'}</button>}</div>}
      {error && <p role="alert" className="v6-export-error">{error}</p>}
      <footer>{active ? <button type="button" disabled={busy} onClick={() => void cancel()}>Cancelar exportação</button> : <button className="v6-export-primary" type="button" disabled={busy} onClick={() => void start()}>{busy ? 'Abrindo exportação…' : options.turbo ? 'EXPORTAR TURBO 2×' : 'EXPORTAR MP4'}</button>}<button type="button" disabled={busy} onClick={onClose}>Fechar painel</button></footer>
    </section>
  </div>
}
