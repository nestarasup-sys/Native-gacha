import { Profiler, useMemo } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { SceneSurface, type SceneSurfaceInteraction } from './SceneSurface'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { measureEditorV6SceneResolution, recordUiCommit } from '../../ui/performanceDiagnostics'

export function EditorV6PlaybackScene({ project, selectedId, interaction, playing, fullView }: {
  project: EditorV6Document
  selectedId: string | null
  interaction?: SceneSurfaceInteraction
  playing: boolean
  fullView: boolean
}) {
  const frame = useEditorV6PlaybackFrame()
  const scene = useMemo(() => measureEditorV6SceneResolution(() => resolveEditorV6SceneAtFrame(project, frame, { includeMotion: false })), [project, frame])
  return <>
    <Profiler id="/editor-v6/surface" onRender={recordUiCommit}><SceneSurface scene={scene} assets={project.assets} selectedId={fullView ? null : selectedId} interaction={interaction} playing={playing} /></Profiler>
    {!fullView && <span className="v6-preview-time" aria-live="off">{playing ? 'Reproduzindo' : 'Pausado'} · {frameTimecode(frame)}</span>}
  </>
}
