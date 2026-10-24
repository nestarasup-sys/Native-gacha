import type { StudioDocument } from '../studio'
import type { VideoExportSnapshot } from '../videoExportSnapshot'
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
    // Preview may reference many encoded Gacha artworks and media manifest
    // strings. Unlike an export job, it MUST NOT structuredClone/deepFreeze
    // the entire StudioDocument, which temporarily duplicates everything.
    // Editor commands replace the document immutably; a new controller is
    // compiled after every authorized edit, while the old program is dropped.
    const timeline = studio.videoTimeline
    if (studio.schemaVersion !== 1 || !timeline || timeline.schemaVersion !== 1
      || timeline.frameRate !== 60 || !Number.isSafeInteger(timeline.durationFrames)
      || timeline.durationFrames < 1 || timeline.durationFrames > 24*3600*60)
      throw new Error('Documento Video Studio incompatível com o SceneEvaluator novo.')
    const snapshot: VideoExportSnapshot = Object.freeze({
      studio, timeline, frameRate:60, durationFrames:timeline.durationFrames
    })
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
