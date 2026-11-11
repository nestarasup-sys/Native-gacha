import { memo, useLayoutEffect, useMemo, useRef, type SyntheticEvent } from 'react'
import type { EditorV6Asset } from '../../../../shared/editorV6'
import { editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import type { EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'
import { editorV6ElementsWithBalloonsOnTop } from './editorV6SceneLayerOrder'
import { SceneVideoLayer, type SceneSurfaceInteraction } from './SceneVideoLayer'
import { sceneLayerPropsEqual, type SceneLayerProps } from './sceneLayerMemo'
import { SceneTextContent } from './SceneTextContent'

export type { ScenePointerEvent, SceneSurfaceInteraction } from './SceneVideoLayer'
export { sceneLayerPropsEqual } from './sceneLayerMemo'
export { wrapSceneText } from './sceneTextLayout'

const transform = (x: number, y: number, rotation: number) => `translate(${(50 + x) * 19.2} ${(50 + y) * 10.8}) rotate(${rotation})`
const Selection = ({ width, height }: { width: number; height: number }) => <rect x={-width / 2 - 2} y={-height / 2 - 2} width={width + 4} height={height + 4} fill="none" stroke="#e84f88" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />

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
const SceneLayer = memo(function SceneLayer({ element, asset, mouthAsset, rasterCanvas, rasterFrame = 0, selected, interaction, onImageLoad }: SceneLayerProps) {
  const size = editorV6ElementSize(element)
  const balloonScale = element.kind === 'speech' || element.kind === 'thought' ? Math.max(1, Math.min(2.5, (element.balloonScalePercent ?? 100) / 100)) : 1
  const width = size.width * 19.2 * balloonScale, height = size.height * 10.8 * balloonScale
  const image = element.kind === 'image' || element.kind === 'character'
  const isBalloon = element.kind === 'speech' || element.kind === 'thought'
  const displayY = element.y + (isBalloon ? element.balloonOffsetY ?? 0 : 0)
  const speakerName = isBalloon ? element.speakerName?.trim() : undefined
  const faceReplacementMaskId = `v6-face-replacement-${element.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  return <g transform={transform(element.x, displayY, element.rotation)} data-element-id={element.id} aria-label={`${speakerName ? `${speakerName}: ` : ''}${element.text || asset?.name || 'Objeto'}`} role={interaction ? 'button' : undefined}
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
    </g> : !image && <SceneTextContent element={element} width={width} height={height} />}
    {interaction && <rect x={-width / 2} y={-height / 2} width={width} height={height} fill="transparent" pointerEvents="all" />}
    {selected && <Selection width={width} height={height} />}
  </g>
}, sceneLayerPropsEqual)

/** Shared scene drawing for the live Chromium preview and sequential frame captures. */
export const SceneSurface = memo(function SceneSurface({ scene, assets, selectedId = null, interaction, playing = false, outputWidth = 1920, outputHeight = 1080, renderLayer = 'all', onImageLoad, rasterCanvases }: { scene: EditorV6ResolvedScene; assets: readonly EditorV6Asset[]; selectedId?: string | null; interaction?: SceneSurfaceInteraction; playing?: boolean; outputWidth?: number; outputHeight?: number; renderLayer?: 'all' | 'background' | 'foreground'; onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void; rasterCanvases?: ReadonlyMap<string, HTMLCanvasElement> }) {
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const renderElements = useMemo(() => editorV6ElementsWithBalloonsOnTop(scene.elements), [scene.elements])
  const background = scene.background, asset = background.backgroundAssetId ? assetsById.get(background.backgroundAssetId) : undefined
  const width = background.backgroundWidth * 19.2, height = background.backgroundHeight * 10.8
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width={outputWidth} height={outputHeight} className="v6-scene-surface" data-frame={scene.frame} aria-label={`Cena no quadro ${scene.frame}`} style={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none', textRendering: 'geometricPrecision', WebkitFontSmoothing: 'antialiased' }}>
    {renderLayer !== 'foreground' && <rect width="1920" height="1080" fill={background.backgroundColor} />}
    {renderLayer !== 'foreground' && asset && <g transform={transform(background.backgroundX, background.backgroundY, background.backgroundRotation)} aria-label="Fundo" style={{ cursor: interaction ? 'move' : undefined, touchAction: 'none' }} onPointerDown={interaction ? (event) => interaction.start(event, 'background') : undefined} onPointerMove={interaction?.move} onPointerUp={interaction?.end} onPointerCancel={interaction?.end}>
      <image href={asset.dataUrl} onLoad={onImageLoad} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio="none" />
      {selectedId === 'background' && <Selection width={width} height={height} />}
    </g>}
    {renderLayer === 'all' && <SceneVideoLayer scene={scene} playing={playing} selectedId={selectedId} interaction={interaction} />}
    {renderLayer !== 'background' && renderElements.map((element) => {
      const rasterCanvas = rasterCanvases?.get(element.id)
      return <SceneLayer key={element.id} element={element} asset={element.assetId ? assetsById.get(element.assetId) : undefined} mouthAsset={element.mouthPatch ? assetsById.get(element.mouthPatch.assetId) : undefined} rasterCanvas={rasterCanvas} rasterFrame={rasterCanvas ? scene.frame : undefined} selected={selectedId === element.id} interaction={interaction} onImageLoad={onImageLoad} />
    })}
  </svg>
})
