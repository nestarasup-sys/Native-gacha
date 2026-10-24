import { useLayoutEffect, useRef, type CSSProperties, type PointerEventHandler } from 'react'
import type { StudioElement } from '../../../../shared/studio'
import { videoCharacterElementSize, videoStageCssTransform } from '../../../../shared/videoStageGeometry'
import { matchingVideoVisualPlugin } from './videoVisualPluginRegistry'

export type VideoStudioDomElementProps = Readonly<{
  element: StudioElement
  imageDataUrl?: string
  canvasImage?: HTMLCanvasElement | ImageBitmap
  assetName?: string
  speakerName?: string
  speakerColor?: string
  selected?: boolean
  interactive?: boolean
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
}>

/** Paint an immutable Gacha Canvas/ImageBitmap snapshot into the DOM layer. */
export function VideoStudioCanvasRaster({ source, label }: { source: HTMLCanvasElement | ImageBitmap; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, source.width, source.height)
    context.drawImage(source, 0, 0)
  }, [source])
  return <canvas ref={ref} role="img" aria-label={label} width={source.width} height={source.height} />
}

/** Exact DOM/CSS visual primitive used by the production preview and the parity oracle. */
export function VideoStudioDomElement({
  element,
  imageDataUrl,
  canvasImage,
  assetName,
  speakerName,
  speakerColor,
  selected = false,
  interactive = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: VideoStudioDomElementProps) {
  const plugin = matchingVideoVisualPlugin({ element, imageDataUrl })
  const extension = plugin?.renderDom?.({ element, imageDataUrl })
  if (extension) return <>{extension}</>

  const size = videoCharacterElementSize(element)
  const style: CSSProperties = {
    ...videoStageCssTransform(
      element.x,
      element.y,
      size.width,
      size.height,
      element.rotation,
      element.kind === 'character' && element.flipX === true,
    ),
    zIndex: Math.max(0, element.zIndex) + 2,
    ...(speakerName && speakerColor ? { '--speaker-color': speakerColor } as CSSProperties : {}),
  }
  return (
    <div
      className={`video-studio-canvas-element video-studio-element-${element.kind}${selected ? ' selected' : ''}`}
      data-transition-visual={canvasImage ? 'gacha-rig-canvas' : undefined}
      style={style}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? onPointerCancel : undefined}
    >
      {element.kind === 'character' && canvasImage
          ? <VideoStudioCanvasRaster source={canvasImage} label={assetName ?? element.text} />
        : (element.kind === 'image' || element.kind === 'character') && imageDataUrl
          ? <img src={imageDataUrl} alt={assetName ?? element.text} draggable={false} />
        : element.kind === 'speech' || element.kind === 'thought'
          ? <span>{speakerName && <strong className="video-studio-balloon-speaker">{speakerName}</strong>}<span className="video-studio-balloon-text">{element.text}</span></span>
          : <span>{element.text}</span>}
    </div>
  )
}
