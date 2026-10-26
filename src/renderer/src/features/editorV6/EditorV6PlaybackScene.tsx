import { useMemo } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { frameTimecode, resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6Timeline'
import { SceneSurface, type SceneSurfaceInteraction } from './SceneSurface'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'

export function EditorV6PlaybackScene({ project, selectedId, interaction, playing, fullView }: {
  project: EditorV6Document
  selectedId: string | null
  interaction?: SceneSurfaceInteraction
  playing: boolean
  fullView: boolean
}) {
  const frame = useEditorV6PlaybackFrame()
  const scene = useMemo(() => resolveEditorV6SceneAtFrame(project, frame), [project, frame])
  return <>
    <SceneSurface scene={scene} assets={project.assets} selectedId={fullView ? null : selectedId} interaction={interaction} playing={playing} />
    {!fullView && <span className="v6-preview-time" aria-live="off">{playing ? 'Reproduzindo' : 'Pausado'} · {frameTimecode(frame)}</span>}
  </>
}
