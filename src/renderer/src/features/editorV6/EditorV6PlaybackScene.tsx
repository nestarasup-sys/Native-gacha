import { Profiler, useEffect, useMemo, useState } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { SceneSurface, type SceneSurfaceInteraction } from './SceneSurface'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { measureEditorV6SceneResolution, recordUiCommit } from '../../ui/performanceDiagnostics'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'

export function EditorV6PlaybackScene({ project, selectedId, interaction, playing, fullView }: {
  project: EditorV6Document
  selectedId: string | null
  interaction?: SceneSurfaceInteraction
  playing: boolean
  fullView: boolean
}) {
  const frame = useEditorV6PlaybackFrame()
  const scene = useMemo(() => measureEditorV6SceneResolution(() => resolveEditorV6SceneAtFrame(project, frame)), [project, frame])
  const hasFaceReplacement = scene.elements.some((element) => element.mouthPatch?.replace)
  const [faceComposition, setFaceComposition] = useState<{ source: typeof scene; scene: typeof scene; assets: EditorV6Document['assets']; error?: string } | null>(null)
  useEffect(() => {
    if (!hasFaceReplacement) return
    let cancelled = false
    void composeEditorV6FaceReplacements(scene, project.assets).then((result) => {
      if (!cancelled) setFaceComposition({ source: scene, scene: result.scene, assets: result.assets })
    }, (reason: unknown) => {
      if (!cancelled) setFaceComposition({ source: scene, scene, assets: project.assets, error: reason instanceof Error ? reason.message : String(reason) })
    })
    return () => { cancelled = true }
  }, [scene, project.assets, hasFaceReplacement])
  const readyComposition = faceComposition?.source === scene ? faceComposition : null
  const surfaceScene = hasFaceReplacement && !readyComposition
    ? { ...scene, elements: scene.elements.map((element) => element.mouthPatch?.replace ? { ...element, mouthPatch: undefined } : element) }
    : readyComposition?.scene ?? scene
  const surfaceAssets = readyComposition?.assets ?? project.assets
  return <>
    <Profiler id="/editor-v6/surface" onRender={recordUiCommit}><SceneSurface scene={surfaceScene} assets={surfaceAssets} selectedId={fullView ? null : selectedId} interaction={interaction} playing={playing} /></Profiler>
    {readyComposition?.error && <span role="alert" className="v6-face-composition-error">Falha ao preparar a expressão: {readyComposition.error}</span>}
    {!fullView && <span className="v6-preview-time" aria-live="off">{playing ? 'Reproduzindo' : 'Pausado'} · {frameTimecode(frame)}</span>}
  </>
}
