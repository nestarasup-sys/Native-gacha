import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'
import { editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { Icon } from '../../ui/components/Icon'

type Props = Pick<EditorV6PropertyPanelProps,
  'selectedVideoBlock' | 'selectedVideo' | 'control' | 'onUpdateVideoBlock' | 'onRecordHistory' | 'onDeleteSelected'>

/** Inspector controls for a selected timeline video and its linked audio. */
export function EditorV6VideoPropertyPanel({
  selectedVideoBlock: block,
  selectedVideo,
  control,
  onUpdateVideoBlock,
  onRecordHistory,
  onDeleteSelected
}: Props) {
  if (!block || !selectedVideo) return null
  const layout = block.mediaLayout ?? editorV6DefaultVideoLayout(selectedVideo.width, selectedVideo.height)
  const setLayout = (values: Partial<typeof layout>, record: boolean) => onUpdateVideoBlock(block.id, { mediaLayout: { ...layout, ...values } }, record)

  return <div className="studio-side-content">
    <h2>Vídeo selecionado</h2><p>{selectedVideo.name}</p>
    <div className="studio-controls-grid">
      {control('X', layout.x, (value, record) => setLayout({ x: value }, record ?? true), -200, 200)}
      {control('Y', layout.y, (value, record) => setLayout({ y: value }, record ?? true), -200, 200)}
      {control('Largura', layout.width, (value, record) => setLayout({ width: value }, record ?? true), 1, 200)}
      {control('Altura', layout.height, (value, record) => setLayout({ height: value }, record ?? true), 1, 200)}
      {control('Rotação', layout.rotation, (value, record) => setLayout({ rotation: value }, record ?? true), -180, 180, '°')}
      {control('Início da mídia', block.mediaInFrame ?? 0, (value, record) => onUpdateVideoBlock(block.id, { mediaInFrame: Math.round(value) }, record), 0, Math.max(0, selectedVideo.sourceFrames - 1), ' quadros')}
      {selectedVideo.hasAudio && control('Volume', Math.min(1, block.gain ?? 1), (value, record) => onUpdateVideoBlock(block.id, { gain: value }, record ?? true), 0, 1, '×')}
    </div>
    {selectedVideo.hasAudio && <label className="studio-color-control">Áudio do vídeo<input type="checkbox" checked={block.audioEnabled !== false} onChange={(event) => { onRecordHistory(); onUpdateVideoBlock(block.id, { audioEnabled: event.target.checked }, false) }} /></label>}
    <small>Duração na timeline: {(block.durationFrames / 30).toFixed(2)} s · o quadro é renderizado centralizado proporcionalmente.</small>
    <button className="studio-side-danger" type="button" onClick={onDeleteSelected}><Icon name="trash" />Remover vídeo da timeline</button>
  </div>
}
