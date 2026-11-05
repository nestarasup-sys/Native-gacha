import { memo, useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import type { EditorV6Asset, EditorV6Element, EditorV6SceneElement } from '../../../../shared/editorV6'
import { editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import type { EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'
import { createSpeechBalloonPath, createThoughtBalloonPath, createThoughtBalloonSketchPath, speechBalloonFillColor } from './speechBalloonPath'

export type ScenePointerEvent = ReactPointerEvent<SVGElement>
export type SceneSurfaceInteraction = {
  start: (event: ScenePointerEvent, id: string) => void
  move: (event: ScenePointerEvent) => void
  end: (event: ScenePointerEvent) => void
}
const FONT = 'Arial, sans-serif'
let measurement: CanvasRenderingContext2D | null = null
function measure(text: string, fontSize: number): number {
  if (!measurement && typeof document !== 'undefined') measurement = document.createElement('canvas').getContext('2d')
  if (!measurement) return Array.from(text).length * fontSize * .55
  measurement.font = `600 ${fontSize}px ${FONT}`
  return measurement.measureText(text).width
}

/** All wrapping is explicit SVG text, so preview and captured frames have identical layout. */
export function wrapSceneText(text: string, width: number, fontSize: number, maxLines: number): string[] {
  const lines: string[] = []
  let overflow = false
  const push = (line: string) => { if (lines.length < maxLines) lines.push(line); else overflow = true }
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`, fontSize) <= width) { line += ` ${word}`; continue }
      if (line) { push(line); line = '' }
      for (const character of Array.from(word)) {
        if (line && measure(line + character, fontSize) > width) { push(line); line = '' }
        line += character
      }
    }
    push(line)
  }
  if (overflow && lines.length) {
    let last = lines[lines.length - 1]
    while (last && measure(`${last}…`, fontSize) > width) last = Array.from(last).slice(0, -1).join('')
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

const transform = (x: number, y: number, rotation: number) => `translate(${(50 + x) * 19.2} ${(50 + y) * 10.8}) rotate(${rotation})`
const Selection = ({ width, height }: { width: number; height: number }) => <rect x={-width / 2 - 2} y={-height / 2 - 2} width={width + 4} height={height + 4} fill="none" stroke="#e84f88" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />

const SceneVideoLayer = memo(function SceneVideoLayer({ scene, playing, selectedId, interaction }: { scene: EditorV6ResolvedScene; playing: boolean; selectedId: string | null; interaction?: SceneSurfaceInteraction }) {
  const ref = useRef<HTMLVideoElement>(null)
  const media = scene.mediaVideo
  useEffect(() => {
    const video = ref.current
    if (!video || !media) return
    video.volume = 1
    const target = (media.sourceInFrame + scene.frame - media.startFrame) / 30
    if (!playing) {
      video.pause()
      if (Math.abs(video.currentTime - target) > .015) { try { video.currentTime = target } catch { /* loadedmetadata will retry the paused seek */ } }
      return
    }
    if (video.paused) {
      if (Math.abs(video.currentTime - target) > .25) { try { video.currentTime = target } catch { /* loadedmetadata will retry the playback seek */ } }
      void video.play().catch(() => {})
    } else if (Math.abs(video.currentTime - target) > .18) {
      try { video.currentTime = target } catch { /* The browser will recover at the next timeline update. */ }
    }
  }, [media?.mediaId, media?.startFrame, media?.sourceInFrame, media?.gain, scene.frame, playing])
  if (!media) return null
  const width = media.layout.width * 19.2, height = media.layout.height * 10.8
  const x = (50 + media.layout.x) * 19.2, y = (50 + media.layout.y) * 10.8
  return <>
    <foreignObject x={x - width / 2} y={y - height / 2} width={width} height={height} transform={`rotate(${media.layout.rotation} ${x} ${y})`} data-editor-v6-video={media.mediaId}
      style={{ cursor: interaction ? 'move' : undefined, touchAction: 'none' }}
      onPointerDown={interaction ? (event) => interaction.start(event, `media-video:${media.blockId}`) : undefined} onPointerMove={interaction?.move} onPointerUp={interaction?.end} onPointerCancel={interaction?.end}>
    <video ref={ref} src={media.url} muted playsInline preload="auto" data-media-id={media.mediaId} data-target-time={(media.sourceInFrame + scene.frame - media.startFrame) / 30} onLoadedMetadata={(event) => {
      const video = event.currentTarget, target = Number(video.dataset.targetTime)
      try { video.currentTime = target } catch { /* The browser will seek when it is ready. */ }
      if (playing) void video.play().catch(() => {})
    }} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
    </foreignObject>
    {selectedId === media.blockId && <rect x={x - width / 2} y={y - height / 2} width={width} height={height} transform={`rotate(${media.layout.rotation} ${x} ${y})`} fill="none" stroke="#e84f88" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
  </>
})

type SceneLayerProps = { element: EditorV6SceneElement; asset?: EditorV6Asset; mouthAsset?: EditorV6Asset; rasterCanvas?: HTMLCanvasElement; rasterFrame?: number; selected: boolean; interaction?: SceneSurfaceInteraction; onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void }
function ExportRasterCanvas({ canvas, frame }: { canvas: HTMLCanvasElement; frame: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' })
    if (mount.firstChild !== canvas) mount.replaceChildren(canvas)
  }, [canvas, frame])
  return <div ref={mountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}
function sameMotionSprite(left: EditorV6Element['motionSprite'], right: EditorV6Element['motionSprite']): boolean {
  if (left === right) return true
  return Boolean(left && right && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
    && left.atlasWidth === right.atlasWidth && left.atlasHeight === right.atlasHeight)
}
function sameMouthPatch(left: EditorV6Element['mouthPatch'], right: EditorV6Element['mouthPatch']): boolean {
  if (left === right) return true
  return Boolean(left && right && left.assetId === right.assetId && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
    && left.replace === right.replace && left.replaceBounds?.x === right.replaceBounds?.x && left.replaceBounds?.y === right.replaceBounds?.y
    && left.replaceBounds?.width === right.replaceBounds?.width && left.replaceBounds?.height === right.replaceBounds?.height && sameMotionSprite(left.sprite, right.sprite))
}

/** Timeline resolution creates new state objects each frame; skip SVG layers whose visual inputs are unchanged.
 * Assets and nested element fields follow the Editor V6 Immer/immutable update contract, so replacing pixels
 * replaces the asset object; motionSprite's six fields fully define its crop within that asset. */
export function sceneLayerPropsEqual(previous: SceneLayerProps, next: SceneLayerProps): boolean {
  if (typeof window !== 'undefined' && (window as Window & { __editorV6DisableSceneLayerMemo?: boolean }).__editorV6DisableSceneLayerMemo) return false
  if (previous.asset !== next.asset || previous.mouthAsset !== next.mouthAsset || previous.rasterCanvas !== next.rasterCanvas || previous.rasterFrame !== next.rasterFrame || previous.selected !== next.selected || previous.interaction !== next.interaction || previous.onImageLoad !== next.onImageLoad) return false
  const left = previous.element, right = next.element
  const keys = Object.keys(left) as Array<keyof EditorV6Element>
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => key === 'motionSprite' ? sameMotionSprite(left.motionSprite, right.motionSprite)
    : key === 'mouthPatch' ? sameMouthPatch(left.mouthPatch, right.mouthPatch)
      : Object.is(left[key], right[key]))
}

const SceneLayer = memo(function SceneLayer({ element, asset, mouthAsset, rasterCanvas, rasterFrame = 0, selected, interaction, onImageLoad }: SceneLayerProps) {
  const size = editorV6ElementSize(element), width = size.width * 19.2, height = size.height * 10.8
  const image = element.kind === 'image' || element.kind === 'character'
  const fontSize = Math.max(8, Math.min(32, height * .3, width / 2)), lineHeight = fontSize * 1.22
  const speakerName = !image && (element.kind === 'speech' || element.kind === 'thought') ? element.speakerName?.trim() : undefined
  const speakerFontSize = speakerName ? fontSize : 0
  const speakerMaxChars = speakerName ? Math.max(4, Math.floor((width - 32) / (speakerFontSize * .62))) : 0
  const speakerLabel = speakerName && speakerName.length > speakerMaxChars ? `${speakerName.slice(0, Math.max(1, speakerMaxChars - 1))}…` : speakerName
  const maxTextLines = Math.max(1, Math.floor((height - (speakerName ? speakerFontSize + 28 : 18)) / lineHeight))
  const lines = useMemo(() => image ? [] : wrapSceneText(element.text, Math.max(1, width - 32), fontSize, maxTextLines), [element.text, image, width, fontSize, maxTextLines])
  const clipId = `v6-text-${element.id}`
  const faceReplacementMaskId = `v6-face-replacement-${element.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const fill = speakerName ? speechBalloonFillColor(element.speakerColor) : element.kind === 'thought' ? '#fffafd' : '#ffffff'
  return <g transform={transform(element.x, element.y, element.rotation)} data-element-id={element.id} aria-label={`${speakerName ? `${speakerName}: ` : ''}${element.text || asset?.name || 'Objeto'}`} role={interaction ? 'button' : undefined}
    style={{ cursor: interaction ? element.positionLocked ? 'default' : 'move' : undefined, touchAction: 'none' }}
    onPointerDown={interaction ? (event) => interaction.start(event, element.id) : undefined} onPointerMove={interaction?.move} onPointerUp={interaction?.end} onPointerCancel={interaction?.end}>
    {image && (asset || rasterCanvas) ? <g transform={element.flipX ? 'scale(-1 1)' : undefined}>
      {element.mouthPatch?.replace && mouthAsset && <defs><mask id={faceReplacementMaskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={-width * 2} y={-height * 2} width={width * 4} height={height * 4}>
        <rect x={-width * 2} y={-height * 2} width={width * 4} height={height * 4} fill="#fff" />
        <rect x={-width / 2 + (element.mouthPatch.x + (element.mouthPatch.replaceBounds?.x ?? 0) * element.mouthPatch.width) * width} y={-height / 2 + (element.mouthPatch.y + (element.mouthPatch.replaceBounds?.y ?? 0) * element.mouthPatch.height) * height} width={(element.mouthPatch.replaceBounds?.width ?? 1) * element.mouthPatch.width * width} height={(element.mouthPatch.replaceBounds?.height ?? 1) * element.mouthPatch.height * height} fill="#000" />
      </mask></defs>}
      <g mask={element.mouthPatch?.replace && mouthAsset ? `url(#${faceReplacementMaskId})` : undefined}>
      {rasterCanvas ? <foreignObject x={-width / 2} y={-height / 2} width={width} height={height}><ExportRasterCanvas canvas={rasterCanvas} frame={rasterFrame} /></foreignObject>
        : element.motionSprite ? <svg x={-width / 2} y={-height / 2} width={width} height={height} viewBox={`${element.motionSprite.x} ${element.motionSprite.y} ${element.motionSprite.width} ${element.motionSprite.height}`} preserveAspectRatio="none" overflow="hidden"><image href={asset!.dataUrl} onLoad={onImageLoad} x={0} y={0} width={element.motionSprite.atlasWidth} height={element.motionSprite.atlasHeight} /></svg>
          : <image href={asset!.dataUrl} onLoad={onImageLoad} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio={element.kind === 'character' ? 'none' : 'xMidYMid meet'} />}
      </g>
      {element.mouthPatch && mouthAsset && <svg x={-width / 2 + element.mouthPatch.x * width} y={-height / 2 + element.mouthPatch.y * height} width={element.mouthPatch.width * width} height={element.mouthPatch.height * height} viewBox={`${element.mouthPatch.sprite.x} ${element.mouthPatch.sprite.y} ${element.mouthPatch.sprite.width} ${element.mouthPatch.sprite.height}`} preserveAspectRatio="none" overflow="hidden"><image href={mouthAsset.dataUrl} onLoad={onImageLoad} x={0} y={0} width={element.mouthPatch.sprite.atlasWidth} height={element.mouthPatch.sprite.atlasHeight} /></svg>}
    </g> : !image && <>
      {element.kind === 'speech' ? <path d={createSpeechBalloonPath(width, height)} fill={fill} fillOpacity={.96} stroke="#111111" strokeWidth={5} strokeLinejoin="round" /> : element.kind === 'thought' ? <><path d={createThoughtBalloonPath(width, height)} fill={fill} stroke="#111111" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /><path d={createThoughtBalloonSketchPath(width, height)} fill="none" stroke="#111111" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" opacity={.9} /></> : <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={16} fill={fill} fillOpacity={.94} stroke="#624d5b" strokeWidth={2} />}
      <defs><clipPath id={clipId}><rect x={-width / 2 + 10} y={-height / 2 + 8} width={Math.max(0, width - 20)} height={Math.max(0, height - 16)} /></clipPath></defs>
      {speakerLabel && <text x={0} y={-height / 2 + 8 + speakerFontSize / 2} fontFamily={FONT} fontSize={speakerFontSize} fontWeight={750} textAnchor="middle" dominantBaseline="middle" fill={element.speakerColor ?? '#624d5b'} clipPath={`url(#${clipId})`}>{speakerLabel}</text>}
      <text fontFamily={FONT} fontSize={fontSize} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill="#352d35" clipPath={`url(#${clipId})`}>
        {lines.map((line, index) => <tspan key={index} x={0} y={speakerName ? -height / 2 + 12 + speakerFontSize + lineHeight * (.5 + index) : (index - (lines.length - 1) / 2) * lineHeight}>{line}</tspan>)}
      </text>
    </>}
    {interaction && <rect x={-width / 2} y={-height / 2} width={width} height={height} fill="transparent" pointerEvents="all" />}
    {selected && <Selection width={width} height={height} />}
  </g>
}, sceneLayerPropsEqual)

/** Shared scene drawing for the live Chromium preview and sequential frame captures. */
export const SceneSurface = memo(function SceneSurface({ scene, assets, selectedId = null, interaction, playing = false, outputWidth = 1920, outputHeight = 1080, renderLayer = 'all', onImageLoad, rasterCanvases }: { scene: EditorV6ResolvedScene; assets: readonly EditorV6Asset[]; selectedId?: string | null; interaction?: SceneSurfaceInteraction; playing?: boolean; outputWidth?: number; outputHeight?: number; renderLayer?: 'all' | 'background' | 'foreground'; onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void; rasterCanvases?: ReadonlyMap<string, HTMLCanvasElement> }) {
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const background = scene.background, asset = background.backgroundAssetId ? assetsById.get(background.backgroundAssetId) : undefined
  const width = background.backgroundWidth * 19.2, height = background.backgroundHeight * 10.8
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width={outputWidth} height={outputHeight} className="v6-scene-surface" data-frame={scene.frame} aria-label={`Cena no quadro ${scene.frame}`} style={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none', textRendering: 'geometricPrecision', WebkitFontSmoothing: 'antialiased' }}>
    {renderLayer !== 'foreground' && <rect width="1920" height="1080" fill={background.backgroundColor} />}
    {renderLayer !== 'foreground' && asset && <g transform={transform(background.backgroundX, background.backgroundY, background.backgroundRotation)} aria-label="Fundo" style={{ cursor: interaction ? 'move' : undefined, touchAction: 'none' }} onPointerDown={interaction ? (event) => interaction.start(event, 'background') : undefined} onPointerMove={interaction?.move} onPointerUp={interaction?.end} onPointerCancel={interaction?.end}>
      <image href={asset.dataUrl} onLoad={onImageLoad} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio="none" />
      {selectedId === 'background' && <Selection width={width} height={height} />}
    </g>}
    {renderLayer === 'all' && <SceneVideoLayer scene={scene} playing={playing} selectedId={selectedId} interaction={interaction} />}
    {renderLayer !== 'background' && scene.elements.map((element) => {
      const rasterCanvas = rasterCanvases?.get(element.id)
      return <SceneLayer key={element.id} element={element} asset={element.assetId ? assetsById.get(element.assetId) : undefined} mouthAsset={element.mouthPatch ? assetsById.get(element.mouthPatch.assetId) : undefined} rasterCanvas={rasterCanvas} rasterFrame={rasterCanvas ? scene.frame : undefined} selected={selectedId === element.id} interaction={interaction} onImageLoad={onImageLoad} />
    })}
  </svg>
})
