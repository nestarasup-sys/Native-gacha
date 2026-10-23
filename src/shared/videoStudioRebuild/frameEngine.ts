import type { StudioDocument } from '../studio'
import { createVideoExportSnapshot } from '../videoExportSnapshot'
import { compileVideoScene, evaluateVideoSceneFrame, type VideoSceneFrame, type VideoSceneProgram } from '../videoSceneIR'

/**
 * New editor's immutable 60 fps scene evaluator; no React hooks, PNG encoding,
 * DOM, FFmpeg, or accumulated transitions. Every seek evaluates an absolute
 * frame without replaying preceding frames.
 */
export class VideoStudioFrameEngine {
  private readonly program: VideoSceneProgram
  readonly durationFrames: number

  constructor(studio: StudioDocument) {
    const snapshot = createVideoExportSnapshot(studio)
    this.program = compileVideoScene(snapshot, 'animated')
    this.durationFrames = snapshot.durationFrames
  }

  evaluate(frame: number): VideoSceneFrame {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= this.durationFrames) {
      throw new RangeError('Quadro fora dos limites do projeto.')
    }
    return evaluateVideoSceneFrame(this.program, frame)
  }
}
