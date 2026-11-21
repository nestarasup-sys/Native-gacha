import { lazy, Suspense, useLayoutEffect, useRef } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ExportContentEndFrame } from '../../../../shared/editorV6Export'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import { prepareEditorV6HairMotionBundle } from './editorV6HairMotionPreparation'
import { EditorV6HairPresetEditor } from './EditorV6HairPresetEditor'
import { EditorV6ExportActivity } from './EditorV6ExportActivity'
import { EditorV6ExportAudioSettings } from './EditorV6ExportAudioSettings'
import { editorV6ExportFramesToSeconds, editorV6ExportSecondsToFrames } from './editorV6ExportTime'
import { isEditorV6ExportFinished } from './editorV6ExportStatusPolling'
import { useEditorV6ExportPanelController } from './useEditorV6ExportPanelController'
const EditorV6AudioLibraryPicker = lazy(async () => ({
  default: (await import('./EditorV6AudioLibraryPicker')).EditorV6AudioLibraryPicker
}))

export function EditorV6ExportPanel({ project, open, characterSourceRefreshRequired, onClose, onExitEditor, onChange, onActivity, trackOperation, prepareHair = prepareEditorV6HairMotionBundle }: { project: EditorV6Document; open: boolean; characterSourceRefreshRequired: boolean; onClose: () => void; onExitEditor: () => void; onChange: (update: (project: EditorV6Document) => EditorV6Document) => void; onActivity?: (active: boolean) => void; trackOperation: <T,>(operation: () => Promise<T>) => Promise<T>; prepareHair?: typeof prepareEditorV6HairMotionBundle }) {
  const dialog = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    const previous = document.activeElement
    dialog.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [open])
  const {
    job, exportFolder, options, setOptions, simplifiedAnimation, setSimplifiedAnimation, hairPresetSlot, setHairPresetSlot, hairPresets, presetDraft, setPresetDraft,
    editingHairPreset, setEditingHairPreset, hairPresetMessage, setHairPresetMessage, preparingHair, startingExport,
    exportStartedAt, busy, audioPickerOpen, setAudioPickerOpen, error, setError, active, updateAudio, linkAudio,
    chooseExportFolder, clearExportFolder, selectedHairPreset, beginEditingHairPreset, saveHairPreset, start, cancel
  } = useEditorV6ExportPanelController({ project, open, characterSourceRefreshRequired, onChange, onActivity, trackOperation, prepareHair })
  const contentEndFrame = editorV6ExportContentEndFrame(project)
  if (!open) return null
  return <div className="v6-export-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialog} tabIndex={-1} className="v6-export-panel" role="dialog" aria-modal="true" aria-labelledby="v6-export-title">
      <header className="v6-export-header"><div className="v6-export-heading"><span className="v6-export-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6.5h10.5A2.5 2.5 0 0 1 17 9v9H6.5A2.5 2.5 0 0 1 4 15.5z" /><path d="m17 10 4-2v9l-4-2M7 4v2.5M11 4v2.5M7 18v2" /></svg></span><div><small>EDITOR V6 <i /> ESTÚDIO DE EXPORTAÇÃO</small><h2 id="v6-export-title">Exportar vídeo</h2><p>Configure a saída e acompanhe a renderização em tempo real.</p></div></div><button className="v6-export-close" type="button" onClick={onClose} disabled={busy} aria-label="Fechar exportador">×</button></header>
      {startingExport || job ? <EditorV6ExportActivity job={startingExport ? null : job} starting={startingExport} preparingHair={preparingHair} startedAt={exportStartedAt} /> : <section className="v6-export-overview" aria-label="Resumo da exportação configurada"><div className="v6-export-overview-art" aria-hidden="true"><svg viewBox="0 0 220 120"><path d="M0 83c18 0 18-46 36-46s18 45 37 45 18-61 37-61 18 77 37 77 18-42 36-42 19 27 37 27" /></svg><span className="v6-export-overview-format">MP4 <i /> {options.fps ?? 30} FPS</span></div><div className="v6-export-overview-copy"><small>PRONTO PARA RENDERIZAR</small><strong>Seu vídeo, quadro a quadro</strong><p>As configurações abaixo serão usadas para criar e validar o arquivo final.</p><div className="v6-export-overview-stats"><span><small>RESOLUÇÃO</small><b>{options.width} × {options.height}</b></span><span><small>DURAÇÃO</small><b>{frameTimecode(Math.max(0, options.endFrame - options.startFrame))}</b></span><span><small>MODO</small><b>{options.turbo ? 'Turbo' : 'Seguro'}</b></span></div></div></section>}
      {!active && !startingExport && characterSourceRefreshRequired && <p className="v6-export-warning" role="status">Atualizando os personagens do Customizador. A exportação ficará disponível quando os snapshots estiverem sincronizados.</p>}
      <div className="v6-export-settings-grid">
        <fieldset className="v6-export-video-settings" disabled={busy || active}><legend>Exportação padrão</legend><div className="v6-export-grid">
          <label>Do início (s)<input type="number" min={0} max={editorV6ExportFramesToSeconds(contentEndFrame)} step={1 / 30} value={editorV6ExportFramesToSeconds(options.startFrame)} onChange={(event) => setOptions({ ...options, startFrame: editorV6ExportSecondsToFrames(event.target.value, contentEndFrame) })} /></label>
          <label>Até (s)<input type="number" min={1 / 30} max={editorV6ExportFramesToSeconds(contentEndFrame)} step={1 / 30} value={editorV6ExportFramesToSeconds(options.endFrame)} onChange={(event) => setOptions({ ...options, endFrame: editorV6ExportSecondsToFrames(event.target.value, contentEndFrame) })} /></label>
        </div><small>{frameTimecode(options.startFrame)} → {frameTimecode(options.endFrame)} · {Math.max(0, options.endFrame - options.startFrame)} quadros na timeline</small>
          <label>FPS do MP4<select value={options.fps ?? 30} onChange={(event) => setOptions({ ...options, fps: event.target.value === '24' ? 24 : 30 })}><option value={30}>30 FPS</option><option value={24}>24 FPS</option></select></label>
          <p><strong>Destino do MP4</strong><br /><small>{exportFolder ?? 'Perguntar onde salvar a cada exportação'}</small></p>
          <button type="button" onClick={() => void chooseExportFolder()}>{exportFolder ? 'Mudar pasta fixa' : 'Escolher pasta fixa'}</button>
          {exportFolder && <button type="button" onClick={() => void clearExportFolder()}>Voltar a perguntar onde salvar</button>}
          <p><strong>{options.encoder === 'amf' ? '1080p · 1920 × 1080 · AMD AMF H.264' : '1080p · 1920 × 1080 · CPU H.264'}</strong></p>
          <p><strong>Turbo obrigatório</strong><br /><small>Se o Turbo falhar, a exportação será interrompida e mostrará o erro.</small></p>
          <label className="v6-export-check"><input type="checkbox" checked={simplifiedAnimation} onChange={(event) => setSimplifiedAnimation(event.target.checked)} /><span><strong>Usar só piscadas e transições de pose e expressão</strong><small>Desativa o movimento da boca e do cabelo.</small></span></label>
          <button type="button" aria-pressed={options.nativeRenderer === true} onClick={() => setOptions({ ...options, nativeRenderer: options.nativeRenderer !== true })}>
            {options.nativeRenderer === true ? 'Renderizador nativo em C++ · selecionado' : 'Renderizador nativo em C++'}
          </button>
          {options.nativeRenderer === true && <small>Experimental: usa um processo nativo separado para compor imagens. Texto é rasterizado pelo Chromium; compare o resultado visual antes de usar em um projeto final.</small>}
          <label>Codificador<select value={options.encoder} onChange={(event) => setOptions({ ...options, encoder: event.target.value as 'cpu' | 'amf' })}><option value="cpu">CPU · H.264</option><option value="amf">AMD AMF · H.264</option></select></label>
          {options.encoder === 'amf' && <small>AMF usa somente h264_amf, sem fallback. A disponibilidade depende do driver AMD.</small>}
          {!simplifiedAnimation && <><p><strong>Cabelo posterior animado após cada troca de pose</strong><br /><small>Uma reação por troca, sem loop; o cabelo volta à posição original. A animação é exclusiva do MP4.</small></p>
          <label>Preset de cabelo<select value={hairPresetSlot} onChange={(event) => { setHairPresetSlot(Number(event.target.value)); setPresetDraft(null); setEditingHairPreset(false); setHairPresetMessage('') }}>{hairPresets.map((preset, index) => <option key={index} value={index + 1}>Preset {index + 1}{preset ? '' : ' · vazio'}</option>)}</select></label>
          {!selectedHairPreset && <small role="status">O preset selecionado está vazio. Crie ou selecione um preset para exportar.</small>}
          <button type="button" aria-expanded={editingHairPreset} onClick={() => editingHairPreset ? setEditingHairPreset(false) : beginEditingHairPreset()}>{editingHairPreset ? 'Recolher controles' : selectedHairPreset ? 'Editar preset no Editor V6' : 'Criar preset neste slot'}</button>
          {editingHairPreset && presetDraft?.slot === hairPresetSlot && <EditorV6HairPresetEditor slot={hairPresetSlot} preset={presetDraft.value}
            onChange={(value) => { setPresetDraft({ slot: hairPresetSlot, value }); setHairPresetMessage('') }}
            onSave={saveHairPreset}
            onDiscard={() => { setPresetDraft(null); setEditingHairPreset(false); setHairPresetMessage('') }} />}
          {hairPresetMessage && <small role="status">{hairPresetMessage}</small>}</>}
          {!simplifiedAnimation && <label className="v6-export-mouth-cycle">Ciclo da animação da boca<select value={options.mouthLoopCycleFrames ?? 30} onChange={(event) => setOptions({ ...options, mouthLoopCycleFrames: Number(event.target.value) })}><option value={30}>1 segundo</option><option value={60}>2 segundos</option><option value={90}>3 segundos</option><option value={180}>6 segundos</option></select></label>}
        </fieldset>
        <EditorV6ExportAudioSettings
          clips={project.exportAudio ?? []}
          disabled={busy || active}
          onUpdate={updateAudio}
          onRemove={(id) => onChange((document) => ({ ...document, exportAudio: document.exportAudio?.filter((item) => item.id !== id), updatedAt: new Date().toISOString() }))}
          onChooseFromLibrary={() => setAudioPickerOpen(true)}
        />
      </div>
      {job && active && <p className="v6-export-keep-open">Você pode fechar este painel. Mantenha o aplicativo aberto até a exportação terminar.</p>}
      {job && isEditorV6ExportFinished(job) && <div className="v6-export-result-actions"><span>{job.state === 'completed' ? `MP4 pronto${job.totalExportMilliseconds !== undefined ? ` · ${(job.totalExportMilliseconds / 1000).toFixed(2).replace('.', ',')} s com preparo` : ''}` : 'Relatório da exportação disponível'}</span><button type="button" onClick={() => void window.desktop.editorV6.revealEditorV6Export(job.id).catch((reason: unknown) => setError(String(reason)))}>{job.state === 'completed' ? 'Mostrar MP4 e relatório' : 'Mostrar relatório'}</button></div>}
      {error && <p role="alert" className="v6-export-error">{error}</p>}
      <footer>{active ? <button type="button" disabled={busy} onClick={() => void cancel()}>Cancelar exportação</button> : <button className="v6-export-primary" type="button" disabled={busy || characterSourceRefreshRequired} onClick={() => void start()}>{busy ? 'Abrindo exportação…' : options.nativeRenderer ? 'EXPORTAR MP4 · RENDERIZADOR NATIVO C++' : 'EXPORTAR MP4'}</button>}<button type="button" disabled={busy} onClick={onClose}>Fechar painel</button>{job && isEditorV6ExportFinished(job) && <button type="button" disabled={busy} onClick={onExitEditor}>Voltar aos projetos</button>}</footer>
    </section>
    {audioPickerOpen && <Suspense fallback={<span role="status">Abrindo biblioteca de áudio…</span>}><EditorV6AudioLibraryPicker onClose={() => setAudioPickerOpen(false)} onSelect={linkAudio} /></Suspense>}
  </div>
}
