import type { EditorV6Document } from '../../../../shared/editorV6'
import type { EditorV6WorkerPayload } from '../../../../shared/editorV6Export'
import type { createEditorV6ExportWorkerHairResources } from './exportWorkerHairResources'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { createEditorV6ExportHairMotionPlanIndex } from './exportHairMotionPlanIndex'
import { createEditorV6ExportHairRigAtFrame } from './exportHairRigAtFrame'
import { createEditorV6HairHeadPathTimeline } from './exportHairHeadPathTimeline'
import { createEditorV6ExportHairFrameComposer } from './exportHairFrameComposer'
import { createEditorV6ExportHairPieceDrawer } from './exportHairPieceDrawing'
import { createEditorV6ExportHairSceneComposer } from './exportHairSceneComposition'
import { createEditorV6ExportMouthLoopResolver } from './exportMouthLoop'

type HairResources = Awaited<ReturnType<typeof createEditorV6ExportWorkerHairResources>>

/** Owns per-export hair indexes and frame-scoped timeline state for the renderer worker. */
export function createEditorV6ExportWorkerHairRuntime(
  project: EditorV6Document,
  hairAnimation: EditorV6WorkerPayload['hairAnimation'],
  resources: HairResources,
  mouthLoops?: EditorV6WorkerPayload['mouthLoops'],
  includeSpeechMouth = true
) {
  const {
    hairSurfaces, hairSurfaceDataById, hairTextures, hairMotionStates, hairMotionLoops, hairMotionInstancePhases,
    hairFrameCanvases, motionHairFrameSurfaces, animatedElementIds, warpHairTexture
  } = resources
  const planIndex = createEditorV6ExportHairMotionPlanIndex(project, hairAnimation, includeSpeechMouth)
  const { hairTransitionIndex, hairPoseReactionEnds } = planIndex
  const { hairRigAtFrame } = createEditorV6ExportHairRigAtFrame(planIndex)
  let resolvedFrame = -1
  let resolvedRawScene: ReturnType<typeof resolveEditorV6SceneAtFrame> | undefined
  const resolveRawSceneAtFrame = (frame: number) => {
    if (resolvedFrame !== frame || !resolvedRawScene) {
      resolvedRawScene = resolveEditorV6SceneAtFrame(project, frame, { includeVideo: false, includeSpeechMouth })
      resolvedFrame = frame
    }
    return resolvedRawScene
  }
  const { headXAtFrame, pieceFlipXAtFrame } = createEditorV6HairHeadPathTimeline({
    animatedElementIds,
    hasHairAnimation: Boolean(hairAnimation),
    resolveScene: frame => frame === resolvedFrame && resolvedRawScene
      // Mouth overlays must not change the physical rig used by head-path inertia.
      ? resolvedRawScene
      : resolveEditorV6SceneAtFrame(project, frame, { includeVideo: false, includeSpeechMouth }),
    getTransitionSample: (elementId, frame) => {
      const indexed = hairTransitionIndex.get(elementId, frame)
      return indexed ? { transition: indexed.transition, poseSample: indexed.poseSample } : undefined
    },
    hairRigAtFrame
  })
  const drawHairPiece = createEditorV6ExportHairPieceDrawer({
    animation: hairAnimation!, textures: hairTextures, states: hairMotionStates, loops: hairMotionLoops,
    instancePhases: hairMotionInstancePhases, poseReactionEnds: hairPoseReactionEnds,
    headXAtFrame, pieceFlipXAtFrame, warpHairTexture
  })
  const { composeHairFrame, composeMotionHairFrame } = createEditorV6ExportHairFrameComposer({
    hairSurfaces, hairFrameCanvases, motionHairFrameSurfaces, drawHairPiece
  })
  const { applyMouthLoop, hairSourceAssetId, facePatchSourceCrop } = createEditorV6ExportMouthLoopResolver(project, mouthLoops, hairPoseReactionEnds)
  // Background and foreground captures of one frame share the exact same
  // speech timeline state. Do not resolve face schedules/patches twice.
  let mouthSceneInput: ReturnType<typeof resolveEditorV6SceneAtFrame> | undefined
  let mouthSceneFrame = -1
  let mouthSceneResult: ReturnType<typeof resolveEditorV6SceneAtFrame> | undefined
  const resolveMouthScene = (scene: ReturnType<typeof resolveEditorV6SceneAtFrame>, frame: number) => {
    if (mouthSceneInput === scene && mouthSceneFrame === frame && mouthSceneResult) return mouthSceneResult
    const resolved = applyMouthLoop(scene, frame)
    mouthSceneInput = scene
    mouthSceneFrame = frame
    mouthSceneResult = resolved
    return resolved
  }
  const hairScene = createEditorV6ExportHairSceneComposer({
    animation: hairAnimation, planIndex, hairRigAtFrame, hairSourceAssetId, facePatchSourceCrop, composeHairFrame, composeMotionHairFrame
  })

  return {
    hairPoseReactionEnds,
    resolveRawSceneAtFrame,
    applyMouthLoop: resolveMouthScene,
    hasAnimatedHair: hairScene.hasAnimatedHair,
    composeHairScene: hairScene.compose,
    hairSurfaceDataById
  }
}
