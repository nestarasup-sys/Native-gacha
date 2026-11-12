import { Icon } from '../../ui/components/Icon'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'

type Props = {
  playbackFrame: number
  durationFrames: number
  playing: boolean
  snap: boolean
  compact: boolean
  canSplit: boolean
  onPlay: () => void
  onToggleSnap: () => void
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
  onToggleCompact: () => void
  onSplit: () => void
}

export function EditorV6TimelineToolbar({ playbackFrame, durationFrames, playing, snap, compact, canSplit, onPlay, onToggleSnap, onZoomOut, onZoomIn, onFit, onToggleCompact, onSplit }: Props) {
  return <header className="editor-v6-timeline-toolbar">
    <div className="editor-v6-timeline-title"><strong>Timeline</strong><span>{frameTimecode(playbackFrame)} / {frameTimecode(durationFrames)}</span><small>30 FPS</small></div>
    <div className="editor-v6-timeline-actions">
      <button type="button" onClick={onPlay} title="Reproduzir / Pausar (Espaço)" aria-label={playing ? 'Pausar' : 'Reproduzir'}><Icon name={playing ? 'pause' : 'play'} /></button>
      <button type="button" className={snap ? 'active' : ''} aria-pressed={snap} onClick={onToggleSnap} title="Magnetismo (S). Alt ignora temporariamente.">Snap</button>
      <button type="button" onClick={onZoomOut} title="Diminuir zoom (-)" aria-label="Diminuir zoom"><Icon name="zoomOut" /></button><button type="button" onClick={onZoomIn} title="Aumentar zoom (+)" aria-label="Aumentar zoom"><Icon name="zoomIn" /></button>
      <button type="button" onClick={onFit} title="Encaixar timeline / restaurar zoom (Shift+Z)">Fit</button>
      <button type="button" onClick={onToggleCompact} title="Compactar nomes das faixas" aria-label="Compactar nomes das faixas" aria-pressed={compact}><Icon name={compact ? 'expand' : 'compact'} /></button>
      <button type="button" disabled={!canSplit} onClick={onSplit} title="Dividir bloco no cursor (Ctrl+K)"><Icon name="split" />Dividir</button>
    </div>
  </header>
}
