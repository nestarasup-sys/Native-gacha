import type { RefObject } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { EditorV6PlaybackScene } from './EditorV6PlaybackScene'
import type { SceneSurfaceInteraction } from './SceneSurface'

type Props = {
  project: EditorV6Document
  sceneRef: RefObject<HTMLDivElement | null>
  backgroundColor: string
  selectedId: string | null
  interaction?: SceneSurfaceInteraction
  playing: boolean
  fullView: boolean
  onCanvasPointerDown: () => void
  onExitFullView: () => void
}

/** Owns the scene canvas and its floating controls; editing state stays in the page. */
export function EditorV6StageSurface({
  project,
  sceneRef,
  backgroundColor,
  selectedId,
  interaction,
  playing,
  fullView,
  onCanvasPointerDown,
  onExitFullView
}: Props) {
  return <section className="studio-scene-area v6-scene-area" aria-label="Prévia da cena">
    <div className="studio-scene-canvas v6-scene-canvas" ref={sceneRef} style={{ backgroundColor }} onPointerDown={onCanvasPointerDown}>
      <EditorV6PlaybackScene project={project} selectedId={selectedId} interaction={fullView ? undefined : interaction} playing={playing} fullView={fullView} />
      {fullView && <button className="studio-exit-view" onClick={onExitFullView} type="button">Sair da visualização <kbd>Esc</kbd></button>}
      {!fullView && <span className="studio-scene-title">{project.title}</span>}
    </div>
  </section>
}
