import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { EditorV6Document, EditorV6MediaAsset } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { EditorV6VideoPropertyPanel } from '../../src/renderer/src/features/editorV6/EditorV6VideoPropertyPanel'
import { NumericRangeField } from '../../src/renderer/src/ui/components/NumericRangeField'
import { SceneVideoLayer } from '../../src/renderer/src/features/editorV6/SceneVideoLayer'
import { createEditorV6DocumentCommands } from '../../src/renderer/src/features/editorV6/editorV6DocumentCommands'
import { useEditorV6Store } from '../../src/renderer/src/features/editorV6/editorV6Store'

const media: EditorV6MediaAsset = {
  id: 'video', fileName: 'video.mp4', name: 'Vídeo', kind: 'video', mimeType: 'video/mp4',
  sourceFrames: 180, width: 1920, height: 1080, hasAudio: true, sizeBytes: 10
}
const date = new Date().toISOString()
const fixture: EditorV6Document = {
  id: 'width-test', schemaVersion: 1, title: 'Teste de largura', color: '#ffffff', createdAt: date, updatedAt: date,
  backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
  backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, media: [media], assets: [], elements: [],
  timeline: { fps: 30, durationFrames: 180, tracks: [
    { id: 'hidden', name: 'Oculto', kind: 'video', hidden: true, locked: false, muted: false, blocks: [
      { id: 'hidden-clip', mediaId: media.id, label: 'Oculto', startFrame: 120, durationFrames: 60 }
    ] },
    { id: 'visible', name: 'Visível', kind: 'video', locked: false, muted: false, blocks: [
      { id: 'source', mediaId: media.id, label: 'Origem', startFrame: 0, durationFrames: 60,
        mediaLayout: { x: 0, y: 0, width: 35, height: 50, rotation: 0 } },
      { id: 'target', mediaId: media.id, label: 'Destino', startFrame: 60, durationFrames: 60,
        mediaLayout: { x: 8, y: -5, width: 80, height: 65, rotation: 12 }, gain: .4, audioEnabled: false, mediaInFrame: 6 }
    ] }
  ] }
}
useEditorV6Store.getState().setActiveProject(fixture)

function Harness() {
  const project = useEditorV6Store(state => state.activeProject)!
  const [selection, select] = useState({ id: 'source', frame: 0 })
  const store = useEditorV6Store.getState()
  const commands = createEditorV6DocumentCommands({
    activeProject: project, activeProjectId: project.id, activeProjectIdRef: { current: project.id },
    selectedElementId: null, selectedTimelineBlockId: selection.id, updateActiveProject: store.updateActiveProject,
    setActiveProject: store.setActiveProject, upsertSummary: store.upsertSummary, getFrame: () => selection.frame,
    now: () => new Date().toISOString(), writeDocumentInOrder: async () => {},
    setSelectedElementId: () => {}, markUnsaved: () => {}, setSaved: () => {},
    setError: () => {}, setCanUndo: () => {}, setCanRedo: () => {}, bumpHistoryVersion: () => {}
  })
  const scene = resolveEditorV6SceneAtFrame(project, selection.frame)
  const block = project.timeline.tracks.flatMap(track => track.blocks).find(item => item.id === selection.id)!
  return <>
    <button onClick={() => select({ id: 'target', frame: 60 })}>Selecionar destino</button>
    <EditorV6VideoPropertyPanel selectedVideoBlock={block} selectedVideo={media}
      onUpdateVideoBlock={commands.updateVideoBlock} onApplyVideoWidthToAll={commands.applyVideoWidthToAll}
      onDeleteSelected={() => {}} onRecordHistory={commands.recordHistory}
      control={(label, value, onChange, min, max, suffix) => <NumericRangeField key={label} label={label}
        value={value} onChange={onChange} onStart={commands.recordHistory} disabled={false} min={min} max={max} suffix={suffix ?? '%'} />} />
    <svg viewBox="0 0 1920 1080" width="640"><SceneVideoLayer scene={scene} selectedId={selection.id} playing={false} /></svg>
    <output id="timeline">{JSON.stringify(project.timeline)}</output>
  </>
}

createRoot(document.getElementById('root')!).render(<Harness />)
