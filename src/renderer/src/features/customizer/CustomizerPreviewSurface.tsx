import type { CSSProperties, PointerEvent, PointerEventHandler, ReactNode, RefObject } from 'react'
import { Icon } from '../../ui/components/Icon'

type CustomizerPreviewSurfaceProps = {
  style: CSSProperties
  stageRef: RefObject<HTMLDivElement | null>
  artworkUrl: string | null
  artworkLabel: string
  previewLoading: boolean
  previewBackground: string
  emptyArtworkMessage?: string
  wardrobeUrl: string | null
  faceUrl: string | null
  frontHairUrl: string | null
  wardrobeAboveHairUrl: string | null
  identity?: ReactNode
  backButton?: { label: string; onClick: () => void }
  onPreviewBackgroundChange: (color: string) => void
  onBeginPan: (event: PointerEvent<HTMLDivElement>, hasArtwork: boolean) => void
  onMovePan: PointerEventHandler<HTMLDivElement>
  onEndPan: PointerEventHandler<HTMLDivElement>
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

/** Shared preview surface for the main Customizer view and its module workspace. */
export function CustomizerPreviewSurface({
  style,
  stageRef,
  artworkUrl,
  artworkLabel,
  previewLoading,
  previewBackground,
  emptyArtworkMessage,
  wardrobeUrl,
  faceUrl,
  frontHairUrl,
  wardrobeAboveHairUrl,
  identity,
  backButton,
  onPreviewBackgroundChange,
  onBeginPan,
  onMovePan,
  onEndPan,
  onZoomIn,
  onZoomOut,
  onResetZoom
}: CustomizerPreviewSurfaceProps) {
  function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement === stage) void document.exitFullscreen()
    else void stage.requestFullscreen()
  }

  return (
    <div className="stage-scene customizer-preview-pan-surface" style={style}
      onPointerDown={(event) => onBeginPan(event, Boolean(artworkUrl))}
      onPointerMove={onMovePan} onPointerUp={onEndPan} onPointerCancel={onEndPan}>
      {identity}
      {backButton && <button className="customizer-back-button customizer-preview-back" onClick={backButton.onClick} aria-label={backButton.label} title={backButton.label} type="button"><Icon name="close" /></button>}
      <div className="customizer-preview-controls" aria-label="Controles da prévia">
        <label className="preview-scene-color" title="Mudar a cor do fundo da prévia">
          <span className="preview-color-swatch" style={{ backgroundColor: previewBackground }} />
          <input type="color" aria-label="Cor do fundo da prévia" value={previewBackground} onChange={(event) => onPreviewBackgroundChange(event.target.value)} />
        </label>
        <button aria-label="Tela cheia" title="Tela cheia" onClick={() => void toggleFullscreen()} type="button"><Icon name="expand" /></button>
        <button aria-label="Afastar" title="Afastar" onClick={onZoomOut} type="button"><Icon name="zoomOut" /></button>
        <button aria-label="Aproximar" title="Aproximar" onClick={onZoomIn} type="button"><Icon name="zoomIn" /></button>
        <button aria-label="Restaurar zoom" title="Restaurar zoom" onClick={onResetZoom} type="button"><Icon name="reset" /></button>
      </div>
      {artworkUrl ? <img className="customizer-selected-artwork" src={artworkUrl} alt={artworkLabel} /> : !previewLoading && emptyArtworkMessage && <div className="customizer-no-artwork"><Icon name="body" /><span>{emptyArtworkMessage}</span></div>}
      {wardrobeUrl && artworkUrl && <img className="customizer-wardrobe-overlay" src={wardrobeUrl} alt="Roupas do personagem" draggable={false} />}
      {faceUrl && artworkUrl && <img className="customizer-face-overlay" src={faceUrl} alt="Rosto do personagem" draggable={false} />}
      {frontHairUrl && artworkUrl && <img className="customizer-front-hair-overlay" src={frontHairUrl} alt="Cabelo posterior e franja frontal" draggable={false} />}
      {wardrobeAboveHairUrl && artworkUrl && <img className="customizer-wardrobe-above-hair-overlay" src={wardrobeAboveHairUrl} alt="Óculos e acessórios de cabeça por cima dos cabelos" draggable={false} />}
      {previewLoading && <div className="customizer-preview-loading">Carregando prévia…</div>}
    </div>
  )
}
