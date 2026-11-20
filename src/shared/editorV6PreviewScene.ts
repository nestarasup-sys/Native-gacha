import type { EditorV6Document } from './editorV6'
import { resolveEditorV6SceneAtFrame } from './editorV6TimelineScene'

/**
 * Editor V6 authoring preview: static authored states, media playback and automatic blinks only.
 * Pose interpolation, speech-mouth animation and hair physics belong to the MP4 export pipeline.
 * Keep this policy separate from the full-motion export resolver.
 */
export function resolveEditorV6PreviewSceneAtFrame(project: EditorV6Document, frame: number) {
  return resolveEditorV6SceneAtFrame(project, frame, {
    includeMotion: false,
    includeSpeechMouth: false
  })
}
