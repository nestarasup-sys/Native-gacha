import type { HairMotionLoop, HairMotionState } from '../../../../shared/hairMotionEngine'
import type { EditorV6FrameTimings } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionBundle, EditorV6HairMotionLayer, EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { editorV6HairMotionLayerHeadPosition } from '../../../../shared/editorV6HairMotion'
import { createEditorV6ExportHairPieceMotionPreparer, prepareEditorV6ExportHairPieceMotion } from './exportHairPieceMotionState'

type SceneElement = ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]
type AnimationSettings = Pick<EditorV6HairMotionBundle, 'preset' | 'posteriorOnly' | 'poseReactionOnly' | 'loopFrames'>
type WarpHairTexture = (textureId: string, image: ImageBitmap, state: HairMotionState, settings: ReturnType<typeof prepareEditorV6ExportHairPieceMotion>['settings'], intensity: number, phase: number, timings: EditorV6FrameTimings) => HTMLCanvasElement
type PreparePieceMotion = typeof prepareEditorV6ExportHairPieceMotion

type Options = {
  animation: AnimationSettings
  textures: ReadonlyMap<string, ImageBitmap>
  states: Map<string, HairMotionState>
  loops: Map<string, HairMotionLoop>
  instancePhases: ReadonlyMap<string, number>
  poseReactionEnds: ReadonlyMap<string, readonly number[]>
  headXAtFrame: (elementId: string, frame: number) => number
  pieceFlipXAtFrame: (elementId: string, pieceId: string, frame: number, fallback: boolean) => boolean
  warpHairTexture: WarpHairTexture
  preparePieceMotion?: PreparePieceMotion
}

/** Draws one animated strand into the character surface using its authored rig and export motion state. */
export function createEditorV6ExportHairPieceDrawer(options: Options) {
  const compiledPieces = new WeakMap<EditorV6HairMotionLayer, Map<string, {
    prepare?: ReturnType<typeof createEditorV6ExportHairPieceMotionPreparer>
    headAtFrame: (frame: number) => number
  }>>()
  const preparedFor = (elementId: string, piece: EditorV6HairMotionLayer) => {
    let byElement = compiledPieces.get(piece)
    if (!byElement) { byElement = new Map(); compiledPieces.set(piece, byElement) }
    let prepared = byElement.get(elementId)
    if (!prepared) {
      prepared = {
        ...(!options.preparePieceMotion ? { prepare: createEditorV6ExportHairPieceMotionPreparer({
          animation: options.animation, elementId, piece, instancePhases: options.instancePhases
        }) } : {}),
        headAtFrame: (sample) => editorV6HairMotionLayerHeadPosition(
          options.headXAtFrame(elementId, sample),
          options.pieceFlipXAtFrame(elementId, piece.id, sample, piece.flipX)
        )
      }
      byElement.set(elementId, prepared)
    }
    return prepared
  }

  return (context: CanvasRenderingContext2D, rig: EditorV6HairMotionRig, piece: EditorV6HairMotionLayer, element: SceneElement, frame: number, timings: EditorV6FrameTimings): void => {
    const motionStateStarted = performance.now()
    const texture = options.textures.get(piece.textureId)
    if (!texture) throw Error('A exportação perdeu uma imagem do cabelo preparado.')
    const prepared = preparedFor(element.id, piece)
    const frameOptions = {
      frame,
      poseReactionEnds: options.poseReactionEnds.get(element.id) ?? [],
      motionStateStarted,
      states: options.states,
      loops: options.loops,
      headAtFrame: prepared.headAtFrame,
      timings
    }
    const motion = options.preparePieceMotion
      ? options.preparePieceMotion({
        animation: options.animation, elementId: element.id, piece, ...frameOptions,
        instancePhases: options.instancePhases
      })
      : prepared.prepare!(frameOptions)
    const { state, settings, phase, intensity } = motion
    const warped = options.warpHairTexture(piece.textureId, texture, state, settings, intensity, phase, timings)
    const layerDrawStarted = performance.now()
    context.save()
    context.translate(rig.outputWidth / 2, rig.outputHeight / 2)
    context.scale(rig.shapeScaleX, rig.shapeScaleY)
    context.translate(-rig.artworkWidth / 2, -rig.artworkHeight / 2)
    const headCenterX = rig.targetHead.x + rig.targetHead.width / 2
    const headCenterY = rig.targetHead.y + rig.targetHead.height / 2
    context.translate(headCenterX, headCenterY)
    context.rotate(rig.targetHead.rotation * Math.PI / 180)
    context.translate(piece.x, piece.y)
    context.rotate(piece.rotation * Math.PI / 180)
    context.scale(piece.flipX ? -1 : 1, 1)
    const drawWidth = piece.width * piece.scaleX
    const drawHeight = piece.height * piece.scaleY
    // The padded warp canvas holds the original image at (0.4w, 0.15h).
    // Center that original image on the same anchor used by the character renderer.
    context.drawImage(warped, -drawWidth * 0.9, -drawHeight * 0.65, drawWidth * 1.8, drawHeight * 1.3)
    context.restore()
    timings.hairLayerDrawMs = (timings.hairLayerDrawMs ?? 0) + performance.now() - layerDrawStarted
  }
}
