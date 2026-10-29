import type { PointerEvent as ReactPointerEvent, PointerEventHandler, CSSProperties } from 'react'
import type { FaceComponentAsset as FaceAsset, FaceComponentKind, ModelPart } from '../../../../../shared/fabricator'
import type { FacePartId } from './faceComponentImportModel'
import { createFacePartPreviewModel } from './facePartPreviewModel'

type BeginPreviewDrag = (
  event: ReactPointerEvent<HTMLImageElement>,
  key: string,
  invertX?: boolean,
  pupil?: boolean,
  rotation?: number
) => void

export function FacePartPreview({
  id,
  mirror,
  overrides,
  selectedAssets,
  details,
  linked,
  head,
  eyeMasks,
  activePreviewKey,
  dragging,
  onBeginDrag,
  onMoveDrag,
  onEndDrag
}: {
  id: FacePartId
  mirror: boolean
  overrides: Partial<Record<FacePartId, string>>
  selectedAssets: Partial<Record<FacePartId, string>>
  details: Readonly<Record<string, FaceAsset>>
  linked: Readonly<Record<FaceComponentKind, boolean>>
  head: ModelPart | null
  eyeMasks: Readonly<Record<string, string | undefined>>
  activePreviewKey: string | null
  dragging: boolean
  onBeginDrag: BeginPreviewDrag
  onMoveDrag: PointerEventHandler<HTMLImageElement>
  onEndDrag: PointerEventHandler<HTMLImageElement>
}) {
  if (!head) return null
  const model = createFacePartPreviewModel({
    id,
    mirror,
    overrides,
    selectedAssets,
    details,
    linked,
    head,
    eyeMasks,
    activePreviewKey
  })
  if (!model) return null

  if (model.pupilMask) {
    const maskClass = `face-component-pupil-mask${model.canDrag ? ` face-component-pupil-mask-draggable${dragging ? ' is-dragging' : ''}` : ''}`
    return <div key={model.key} className={maskClass} style={model.pupilMask.style as CSSProperties}>
      <img
        className="face-component-pupil-image"
        src={model.imageAsset.dataUrl}
        alt={model.label}
        style={model.pupilMask.pupilStyle as CSSProperties}
        draggable={false}
        title={model.canDrag ? 'Arraste a pupila dentro do olho' : undefined}
        onPointerDown={model.canDrag ? (event) => onBeginDrag(event, `${id}:${model.assetId}`, model.pupilMask!.drag.invertX, true, model.pupilMask!.drag.rotation) : undefined}
        onPointerMove={model.canDrag ? onMoveDrag : undefined}
        onPointerUp={model.canDrag ? onEndDrag : undefined}
        onPointerCancel={model.canDrag ? onEndDrag : undefined}
        onLostPointerCapture={model.canDrag ? onEndDrag : undefined}
      />
    </div>
  }

  const layerClass = `face-component-layer${model.canDrag ? ` face-component-layer-draggable${dragging ? ' is-dragging' : ''}` : ''}`
  return <img
    key={model.key}
    className={layerClass}
    src={model.imageAsset.dataUrl}
    alt={model.label}
    style={model.style as CSSProperties}
    draggable={false}
    title={model.canDrag ? 'Arraste para mover esta peça' : undefined}
    onPointerDown={model.canDrag ? (event) => onBeginDrag(event, `${id}:${model.assetId}`, model.drag.invertX, model.drag.pupil, model.drag.rotation) : undefined}
    onPointerMove={model.canDrag ? onMoveDrag : undefined}
    onPointerUp={model.canDrag ? onEndDrag : undefined}
    onPointerCancel={model.canDrag ? onEndDrag : undefined}
    onLostPointerCapture={model.canDrag ? onEndDrag : undefined}
  />
}
