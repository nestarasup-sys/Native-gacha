import { useLayoutEffect, useRef, type SyntheticEvent } from 'react'
import type { EditorV6Asset, EditorV6SceneElement } from '../../../../shared/editorV6'

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

/** Renders an image, character raster, or motion atlas and its optional facial overlay. */
export function SceneImageContent({ element, asset, mouthAsset, rasterCanvas, rasterFrame = 0, width, height, onImageLoad }: {
  element: EditorV6SceneElement
  asset?: EditorV6Asset
  mouthAsset?: EditorV6Asset
  rasterCanvas?: HTMLCanvasElement
  rasterFrame?: number
  width: number
  height: number
  onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void
}) {
  const faceReplacementMaskId = `v6-face-replacement-${element.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  return <g transform={element.flipX ? 'scale(-1 1)' : undefined}>
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
  </g>
}
