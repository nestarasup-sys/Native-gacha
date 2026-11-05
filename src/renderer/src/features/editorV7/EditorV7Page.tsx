import { useEffect, useMemo, useState } from 'react'
import { createEditorV7Document, editorV7FrameToTick, editorV7TickToFrame, resolveEditorV7Scene, type EditorV7Document, type EditorV7ExportStatus, type EditorV7Transform } from '../../../../shared/editorV7'
import { renderEditorV7SceneSvg } from '../../../../shared/editorV7Svg'

function newDocument(): EditorV7Document {
  return createEditorV7Document(crypto.randomUUID(), 'Meu projeto V7', { width: 1920, height: 1080, fps: 30, durationFrames: 300 })
}

export function EditorV7Page() {
  const [document, setDocument] = useState(newDocument)
  const [playhead, setPlayhead] = useState(0)
  const [status, setStatus] = useState<EditorV7ExportStatus | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const frameCount = editorV7TickToFrame(document.durationTicks, document.frameRate)
  const tick = editorV7FrameToTick(playhead, document.frameRate)
  const previewSvg = useMemo(() => renderEditorV7SceneSvg(document, tick), [document, tick])
  const selectedLayer = document.layers.find((layer) => layer.id === selectedLayerId)
  const selectedTransform = selectedLayer ? resolveEditorV7Scene(document, tick).layers.find((layer) => layer.id === selectedLayer.id)?.transform ?? selectedLayer.transform : null

  useEffect(() => {
    if (!jobId) return
    let active = true
    const stop = window.desktop.editorV7.onExportProgress((next) => {
      if (active && next.id === jobId) { setStatus(next); if (['completed', 'failed', 'cancelled'].includes(next.state)) setBusy(false) }
    })
    const poll = window.setInterval(() => {
      void window.desktop.editorV7.getExportStatus(jobId).then((next) => {
        if (active) { setStatus(next); if (['completed', 'failed', 'cancelled'].includes(next.state)) setBusy(false) }
      }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    }, 900)
    return () => { active = false; stop(); window.clearInterval(poll) }
  }, [jobId])

  const importImage = async (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('O V7 aceita PNG, JPEG e WebP nesta primeira versão.'); return }
    if (file.size > 48 * 1024 * 1024) { setError('A imagem excede o limite de 48 MiB.'); return }
    setError(null)
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1500 / bitmap.width, 840 / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale))
    bitmap.close()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler a imagem.'))
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('A imagem não pôde ser convertida.'))
      reader.readAsDataURL(file)
    })
    const assetId = crypto.randomUUID()
    const layerId = crypto.randomUUID()
    setDocument((current) => ({
      ...current,
      assets: [...current.assets, { id: assetId, name: file.name.slice(0, 240), mimeType: file.type as 'image/png' | 'image/jpeg' | 'image/webp', dataUrl }],
      layers: [...current.layers, { id: layerId, name: file.name.slice(0, 240), assetId, startTick: 0, endTick: current.durationTicks, transform: { x: Math.round((current.width - width) / 2), y: Math.round((current.height - height) / 2), width, height, rotation: 0, opacity: 1, flipX: false }, visible: true, zIndex: current.layers.length }]
    }))
    setSelectedLayerId(layerId)
  }

  const startExport = async () => {
    setError(null)
    setBusy(true)
    try {
      const id = await window.desktop.editorV7.startExport(document)
      if (id) { setJobId(id); setStatus({ id, state: 'preparing', frames: 0, totalFrames: frameCount, message: 'Preparando exportação…' }) }
      else setBusy(false)
    } catch (reason) { setBusy(false); setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const cancelExport = async () => {
    if (!jobId) return
    try { await window.desktop.editorV7.cancelExport(jobId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const updateSelectedTransform = (key: keyof EditorV7Transform, value: number | boolean) => {
    if (!selectedLayer) return
    setDocument((current) => ({ ...current, layers: current.layers.map((layer) => {
      if (layer.id !== selectedLayer.id) return layer
      if (!layer.keyframes?.length) return { ...layer, transform: { ...layer.transform, [key]: value } as EditorV7Transform }
      const frameTransform = { ...selectedTransform!, [key]: value } as EditorV7Transform
      return { ...layer, keyframes: [...layer.keyframes.filter((keyframe) => keyframe.tick !== tick), { tick, transform: frameTransform }].sort((left, right) => left.tick - right.tick) }
    }) }))
  }

  const addKeyframe = () => {
    if (!selectedLayer || !selectedTransform || tick < selectedLayer.startTick || tick >= selectedLayer.endTick) return
    setDocument((current) => ({ ...current, layers: current.layers.map((layer) => layer.id !== selectedLayer.id ? layer : {
      ...layer,
      keyframes: [...(layer.keyframes ?? []).filter((keyframe) => keyframe.tick !== tick), { tick, transform: { ...selectedTransform } }].sort((left, right) => left.tick - right.tick)
    }) }))
  }

  return <main className="editor-v7-page">
    <header className="editor-v7-header">
      <div><span className="editor-v7-kicker">NOVA ARQUITETURA · NÚCLEO V1</span><h1>Editor V7</h1><p>Prévia SVG determinística · composição libvips · codificação H.264</p></div>
      <div className="editor-v7-actions">
        <label className="editor-v7-button">Adicionar imagem<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importImage(event.currentTarget.files?.[0]).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); event.currentTarget.value = '' }} /></label>
        <button className="editor-v7-button primary" type="button" disabled={busy || !document.layers.length} onClick={() => void startExport()}>{busy ? 'Exportando…' : 'Exportar MP4'}</button>
      </div>
    </header>
    {error && <div className="editor-v7-error" role="alert">{error}</div>}
    <section className="editor-v7-workspace">
      <div className="editor-v7-preview-panel">
        <div className="editor-v7-preview-toolbar"><strong>Prévia da cena</strong><span>{document.width} × {document.height} · {document.frameRate.numerator} FPS</span></div>
        <div className="editor-v7-preview-frame" dangerouslySetInnerHTML={{ __html: previewSvg }} />
        {!document.layers.length && <div className="editor-v7-empty">Adicione uma imagem para montar a primeira cena e exportar um MP4.</div>}
      </div>
      <aside className="editor-v7-inspector">
        <span className="editor-v7-kicker">DOCUMENTO</span>
        <label>Nome<input value={document.title} maxLength={120} onChange={(event) => setDocument((current) => ({ ...current, title: event.target.value || 'Projeto V7' }))} /></label>
        <label>Fundo<input type="color" value={document.background.color} onChange={(event) => setDocument((current) => ({ ...current, background: { color: event.target.value } }))} /></label>
        <div className="editor-v7-inspector-title"><span className="editor-v7-kicker">CAMADAS</span><strong>{document.layers.length}</strong></div>
        <ol className="editor-v7-layer-list">{document.layers.slice().sort((a, b) => b.zIndex - a.zIndex).map((layer) => <li className={selectedLayerId === layer.id ? 'selected' : ''} key={layer.id}><button className="editor-v7-layer-select" type="button" onClick={() => setSelectedLayerId(layer.id)}>{layer.name}</button><button type="button" aria-label={`Remover ${layer.name}`} onClick={() => { setDocument((current) => ({ ...current, layers: current.layers.filter((item) => item.id !== layer.id), assets: current.assets.filter((asset) => asset.id !== layer.assetId) })); if (selectedLayerId === layer.id) setSelectedLayerId(null) }}>×</button></li>)}</ol>
        {selectedLayer && selectedTransform && <section className="editor-v7-transform-controls" aria-label="Transformação da camada selecionada">
          <div className="editor-v7-inspector-title"><span className="editor-v7-kicker">TRANSFORMAR</span><small>{selectedLayer.keyframes?.length ?? 0} keyframes</small></div>
          {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key) => <label key={key}>{({ x: 'X', y: 'Y', width: 'Largura', height: 'Altura', rotation: 'Rotação' })[key]}<input type="number" value={Math.round(selectedTransform[key] * 100) / 100} onChange={(event) => updateSelectedTransform(key, Number(event.target.value) || 0)} /></label>)}
          <label>Opacidade<input type="number" min={0} max={1} step={0.05} value={selectedTransform.opacity} onChange={(event) => updateSelectedTransform('opacity', Math.min(1, Math.max(0, Number(event.target.value) || 0)))} /></label>
          <label className="editor-v7-flip-control"><input type="checkbox" checked={selectedTransform.flipX} onChange={(event) => updateSelectedTransform('flipX', event.target.checked)} /> Espelhar horizontalmente</label>
          <button className="editor-v7-keyframe-button" type="button" onClick={addKeyframe}>＋ Keyframe no quadro {playhead + 1}</button>
        </section>}
        <label>Duração (segundos)<input type="number" min={1} max={600} value={frameCount / document.frameRate.numerator} onChange={(event) => {
          const seconds = Math.min(600, Math.max(1, Number(event.target.value) || 1))
          const durationTicks = editorV7FrameToTick(Math.round(seconds * document.frameRate.numerator), document.frameRate)
          setDocument((current) => ({ ...current, durationTicks, layers: current.layers.map((layer) => ({ ...layer, endTick: durationTicks, ...(layer.keyframes ? { keyframes: layer.keyframes.filter((keyframe) => keyframe.tick < durationTicks) } : {}) })) }))
          setPlayhead((frame) => Math.min(frame, seconds * document.frameRate.numerator - 1))
        }} /></label>
      </aside>
    </section>
    <section className="editor-v7-timeline-panel" aria-label="Timeline V7">
      <div><strong>Timeline</strong><span>Tempo absoluto · quadro {playhead + 1} / {frameCount}</span></div>
      <input aria-label="Posição na timeline" type="range" min={0} max={Math.max(0, frameCount - 1)} value={Math.min(playhead, frameCount - 1)} onChange={(event) => setPlayhead(Number(event.target.value))} />
      <div className="editor-v7-timeline-layers">{document.layers.map((layer) => <button className={selectedLayerId === layer.id ? 'selected' : ''} type="button" key={layer.id} title={layer.name} onClick={() => setSelectedLayerId(layer.id)}><span>{layer.name}</span><small>{layer.keyframes?.length ?? 0} KF</small></button>)}</div>
    </section>
    {status && <footer className="editor-v7-status" role="status"><span>{status.message}</span>{status.state === 'rendering' && <button type="button" onClick={() => void cancelExport()}>Cancelar</button>}{status.state === 'completed' && <><span>{status.encoder} · {(status.milliseconds! / 1000).toFixed(2)} s</span><button type="button" onClick={() => void window.desktop.editorV7.revealExport(status.id)}>Mostrar MP4</button></>}</footer>}
  </main>
}
