import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { studioElementSize } from '../../../../shared/studioSceneModel'
import type { StudioDocument } from '../../../../shared/studio'

type StudioSceneCanvasProps = {
  studio: StudioDocument
  sceneRef: { current: HTMLDivElement | null }
  selectedElementId: string | null
  fullView: boolean
  onCanvasPointerDown: () => void
  onStartDrag: (event: ReactPointerEvent<HTMLElement>, id: string) => void
  onMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void
  onEndDrag: (event: ReactPointerEvent<HTMLElement>) => void
  onExitFullView: () => void
  children?: ReactNode
}

const imageStyle = (x: number, y: number, width: number, height: number, rotation: number, flipX = false) => ({
  left: `calc(50% + ${x}%)`, top: `calc(50% + ${y}%)`, width: `${width}%`, height: `${height}%`,
  transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1})`
})

export function StudioSceneCanvas({ studio, sceneRef, selectedElementId, fullView, onCanvasPointerDown, onStartDrag, onMoveDrag, onEndDrag, onExitFullView, children }: StudioSceneCanvasProps) {
  const backgroundAsset = studio.assets.find((asset) => asset.id === studio.backgroundAssetId)

  return <section className="studio-scene-area" aria-label="Prévia da cena">
    <div className="studio-scene-canvas" ref={sceneRef} style={{ backgroundColor: studio.backgroundColor }} onPointerDown={onCanvasPointerDown}>
      {backgroundAsset && <img className={`studio-canvas-background${selectedElementId === 'background' && !fullView ? ' selected' : ''}`} src={backgroundAsset.dataUrl} alt="" style={imageStyle(studio.backgroundX, studio.backgroundY, studio.backgroundWidth, studio.backgroundHeight, studio.backgroundRotation)} onPointerDown={(event) => onStartDrag(event, 'background')} onPointerMove={onMoveDrag} onPointerUp={onEndDrag} onPointerCancel={onEndDrag} />}
      {[...studio.elements].sort((left, right) => left.zIndex - right.zIndex).map((element) => {
        const asset = element.assetId ? studio.assets.find((item) => item.id === element.assetId) : undefined
        const size = studioElementSize(element)
        return <div key={element.id} className={`studio-canvas-element studio-element-${element.kind}${selectedElementId === element.id && !fullView ? ' selected' : ''}`} style={{ ...imageStyle(element.x, element.y, size.width, size.height, element.rotation, element.kind === 'character' && element.flipX === true), zIndex: element.zIndex + 1 }} onPointerDown={(event) => onStartDrag(event, element.id)} onPointerMove={onMoveDrag} onPointerUp={onEndDrag} onPointerCancel={onEndDrag}>
          {(element.kind === 'image' || element.kind === 'character') && asset ? <img src={asset.dataUrl} alt={asset.name} draggable={false} /> : <span>{element.text}</span>}
        </div>
      })}
      {fullView && <button className="studio-exit-view" onClick={onExitFullView} type="button">Sair da visualização <kbd>Esc</kbd></button>}
      {!fullView && <span className="studio-scene-title">{studio.title}</span>}
      {children}
    </div>
  </section>
}
