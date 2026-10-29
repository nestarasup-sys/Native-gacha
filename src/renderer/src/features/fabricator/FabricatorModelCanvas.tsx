import type { CSSProperties, MouseEvent, PointerEvent, Ref } from 'react'
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import type { FabricatorJointMarker } from './models/jointMarkerModel'
import { modelRigSegmentKind } from '../../../../shared/modelRig.ts'
import type { createFabricatorCanvasInteraction } from './canvasInteraction'
import { Icon } from '../../ui/components/Icon'
import { TemporaryThighWarpPreview } from './TemporaryThighWarpPreview'

type CanvasInteraction = ReturnType<typeof createFabricatorCanvasInteraction>

export type FabricatorModelCanvasProps = {
  project: FabricatorProject
  stageRef: Ref<HTMLDivElement>
  previewBackground: string
  canvasParts: ModelPart[]
  hiddenPartIds: string[]
  selectedIds: string[]
  connectFromId: string | null
  jointMarkers: FabricatorJointMarker[]
  scale: number
  pan: { x: number; y: number }
  zoom: number
  panning: boolean
  mixerActive: boolean
  mixerPainting: boolean
  thighDeformationActive: boolean
  showJointPivots: boolean
  thighDeformationRadius: number
  thighDeformationStrength: number
  temporaryThighResetToken: number
  canvasInteraction: CanvasInteraction
  partPreviewSource: (part: ModelPart) => string
  toModelPoint: (clientX: number, clientY: number) => { x: number; y: number } | null
  onPartClick: (partId: string, toggle: boolean) => void
  onSelectPart: (partId: string) => void
  onWarpStateChange: (partId: string, warped: boolean) => void
  onWarpError: (message: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onCenter: () => void
}

export function FabricatorModelCanvas({
  project,
  stageRef,
  previewBackground,
  canvasParts,
  hiddenPartIds,
  selectedIds,
  connectFromId,
  jointMarkers,
  scale,
  pan,
  zoom,
  panning,
  mixerActive,
  mixerPainting,
  thighDeformationActive,
  showJointPivots,
  thighDeformationRadius,
  thighDeformationStrength,
  temporaryThighResetToken,
  canvasInteraction,
  partPreviewSource,
  toModelPoint,
  onPartClick,
  onSelectPart,
  onWarpStateChange,
  onWarpError,
  onZoomIn,
  onZoomOut,
  onCenter
}: FabricatorModelCanvasProps) {
  const hiddenIds = new Set(hiddenPartIds)
  const stageClassName = [
    'model-stage',
    panning && 'panning',
    mixerActive && 'mixer-active',
    mixerPainting && 'mixer-painting',
    thighDeformationActive && 'thigh-deform-active'
  ].filter(Boolean).join(' ')

  return (
    <section className="model-canvas-column" aria-label="Prévia e montagem">
      <div className="model-canvas-topline"><span><i /> CANVAS DE MONTAGEM</span><span>{project.width} × {project.height}</span></div>
      <div
        ref={stageRef}
        className={stageClassName}
        style={{ '--preview-background': previewBackground } as CSSProperties}
        onPointerDown={canvasInteraction.beginPan}
        onPointerMove={canvasInteraction.onPointerMove}
        onPointerUp={canvasInteraction.onPointerUp}
        onPointerCancel={canvasInteraction.onPointerCancel}
      >
        <div className="model-artboard" style={{
          width: `${project.width * scale}px`,
          height: `${project.height * scale}px`,
          left: `calc(50% + ${pan.x}px)`,
          top: `calc(50% + ${pan.y}px)`
        }}>
          {canvasParts.filter((part) => !hiddenIds.has(part.id)).map((part) => {
            const className = `model-canvas-part${selectedIds.includes(part.id) ? ' selected' : ''}${connectFromId === part.id ? ' connect-source' : ''}`
            const style: CSSProperties = {
              left: part.x * scale,
              top: part.y * scale,
              width: part.width * scale,
              height: part.height * scale,
              transform: `rotate(${part.rotation}deg)`
            }
            const onClick = (event: MouseEvent<HTMLElement>) => {
              event.stopPropagation()
              if (!mixerActive && !thighDeformationActive) onPartClick(part.id, event.ctrlKey || event.metaKey)
            }
            const selectPart = () => onSelectPart(part.id)
            const onPointerDown = (event: PointerEvent<HTMLElement>) => {
              if (thighDeformationActive) {
                if (modelRigSegmentKind(part.name) === 'thigh') selectPart()
                return
              }
              canvasInteraction.beginPartDrag(event, part)
            }

            if (modelRigSegmentKind(part.name) === 'thigh') {
              return <TemporaryThighWarpPreview
                key={`${project.slot}:${part.id}`}
                part={part}
                sourceUrl={partPreviewSource(part)}
                className={className}
                style={style}
                active={thighDeformationActive}
                radius={thighDeformationRadius}
                strength={thighDeformationStrength}
                resetToken={temporaryThighResetToken}
                toModelPoint={toModelPoint}
                onWarpStateChange={onWarpStateChange}
                onWarpStart={selectPart}
                onError={onWarpError}
                onClick={onClick}
                onPointerDown={onPointerDown}
              />
            }
            return <img
              key={part.id}
              className={className}
              src={partPreviewSource(part)}
              alt={part.name}
              draggable={false}
              onClick={onClick}
              onPointerDown={onPointerDown}
              style={style}
            />
          })}
          <svg className="model-joint-layer" viewBox={`0 0 ${project.width} ${project.height}`} preserveAspectRatio="none" aria-label="Conexões entre as peças">
            {showJointPivots && !thighDeformationActive && jointMarkers.map(({ part, anchor, offset, fixed, selected }) => (
              <circle
                key={part.id}
                className={`model-joint-anchor${fixed ? ' fixed' : selected ? ' selected' : ''}`}
                cx={anchor.x + offset / scale}
                cy={anchor.y}
                r={Math.max(selected ? 11 : 8, (selected ? 13 : 10) / scale)}
                aria-label={`Pivô de ${part.name}`}
                onPointerDown={(event) => canvasInteraction.beginAnchorDrag(event, part.id, offset)}
              />
            ))}
          </svg>
        </div>
        <div className="model-stage-tools">
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={onZoomIn} title="Aumentar zoom" type="button"><Icon name="zoomIn" /></button>
          <button onClick={onZoomOut} title="Diminuir zoom" type="button"><Icon name="zoomOut" /></button>
          <button onClick={onCenter} title="Centralizar prévia" type="button"><Icon name="frame" /></button>
        </div>
      </div>
      <div className="model-canvas-footer">
        <span>
          {thighDeformationActive
            ? <><kbd>Deformação temporária</kbd> arraste sobre as coxas; use ↶ para voltar ao normal</>
            : mixerActive
              ? <><kbd>Misturador ativo</kbd> passe sobre a junta; ele afeta a camada visível mais alta</>
              : <><kbd>Arraste o fundo</kbd> para mover a prévia <i /> <kbd>Arraste a peça</kbd> para posicionar <i /> <kbd>Ctrl</kbd> + clique para selecionar várias</>}
        </span>
        <span>{project.parts.length} peças <i /> {project.joints.length} conexões</span>
      </div>
    </section>
  )
}
