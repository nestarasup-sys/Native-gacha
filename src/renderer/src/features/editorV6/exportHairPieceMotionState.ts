import { advanceHairMotionToFrame, applyHairMotionLoopHeadImpulse, buildHairMotionLoop, createHairMotionState, hairMotionLatestPoseEnd, hairMotionLoopOffsets, prewarmHairMotionState, sampleHairMotionPoseReaction, type HairMotionLoop, type HairMotionSettings, type HairMotionState } from '../../../../shared/hairMotionEngine'
import { editorV6HairMotionInstancePhase, type EditorV6HairMotionBundle, type EditorV6HairMotionLayer } from '../../../../shared/editorV6HairMotion'
import type { EditorV6FrameTimings } from '../../../../shared/editorV6Export'

type AnimationSettings = Pick<EditorV6HairMotionBundle, 'preset' | 'posteriorOnly' | 'poseReactionOnly' | 'loopFrames'>

type StaticOptions = {
  animation: AnimationSettings
  elementId: string
  piece: EditorV6HairMotionLayer
  instancePhases: ReadonlyMap<string, number>
}

type FrameOptions = {
  frame: number
  poseReactionEnds: readonly number[]
  motionStateStarted: number
  states: Map<string, HairMotionState>
  loops: Map<string, HairMotionLoop>
  headAtFrame: (frame: number) => number
  timings: EditorV6FrameTimings
}

type Options = StaticOptions & FrameOptions

/** Compile immutable per-strand settings once; only frame state changes during rendering. */
export function createEditorV6ExportHairPieceMotionPreparer({ animation, elementId, piece, instancePhases }: StaticOptions) {
  const settings: HairMotionSettings = {
    ...animation.preset.physics,
    enabled: animation.preset.enabled[piece.side]
  }
  if (animation.posteriorOnly && !piece.id.startsWith('rearHair:')) settings.enabled = false

  const stateKey = `${elementId}:${piece.id}`
  const phase = (instancePhases.get(elementId) ?? editorV6HairMotionInstancePhase(elementId)) + piece.phase
  const intensity = animation.preset.intensity[piece.side]

  return ({ frame, poseReactionEnds, motionStateStarted, states, loops, headAtFrame, timings }: FrameOptions) => {
    let state = states.get(stateKey)
    if (!state) { state = createHairMotionState(); states.set(stateKey, state) }
    if (animation.poseReactionOnly) {
      // Explicit part ID, not a side alias: rearHair is POSTERIOR; backHair is TRASEIRO.
      const transitionEnd = hairMotionLatestPoseEnd(poseReactionEnds, frame)
      const moving = piece.id.startsWith('rearHair:')
        ? sampleHairMotionPoseReaction(state.offsets, settings, frame, transitionEnd, phase)
        : (state.offsets.fill(0), false)
      state.time = moving ? 1 : 0 // Exact original pixels when the piece is at rest.
      state.frame = frame
    } else if (animation.loopFrames) {
      let loop = loops.get(stateKey)
      if (!loop) {
        const prewarmStarted = performance.now()
        loop = buildHairMotionLoop(settings, phase, animation.loopFrames)
        loops.set(stateKey, loop)
        timings.hairMotionPrewarmMs = (timings.hairMotionPrewarmMs ?? 0) + performance.now() - prewarmStarted
      }
      state.offsets.set(hairMotionLoopOffsets(loop, frame))
      // Authored head motion stays independent of the periodic breeze.
      const headDelta = frame > 0 ? headAtFrame(frame) - headAtFrame(frame - 1) : 0
      applyHairMotionLoopHeadImpulse(state.offsets, headDelta, settings)
      state.time = 1 // Keep mesh warping active; offsets are sampled by absolute frame.
      state.frame = frame
    } else {
      if (state.frame < 0 || frame < state.frame) {
        const prewarmStarted = performance.now()
        prewarmHairMotionState(state, settings, headAtFrame(0), phase)
        timings.hairMotionPrewarmMs = (timings.hairMotionPrewarmMs ?? 0) + performance.now() - prewarmStarted
      }
      advanceHairMotionToFrame(state, settings, frame, headAtFrame, phase)
    }
    timings.hairMotionStateMs = (timings.hairMotionStateMs ?? 0) + performance.now() - motionStateStarted

    return { state, settings, phase, intensity }
  }
}

/** Advances one strand's deterministic physics state for an absolute export frame. */
export function prepareEditorV6ExportHairPieceMotion(options: Options) {
  const preparer = createEditorV6ExportHairPieceMotionPreparer(options)
  return preparer(options)
}
