import type { ReactNode } from 'react'
import type { EditorV6Asset, EditorV6BackgroundState, EditorV6Document, EditorV6Element, EditorV6MediaAsset, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { Icon } from '../../ui/components/Icon'
import { SceneElementControls } from '../../ui/components/SceneElementControls'

type EditorV6BackgroundValues = Partial<Pick<EditorV6Document,
  'backgroundColor' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation'>>
type EditorV6VideoValues = Partial<Pick<EditorV6TimelineBlock, 'mediaLayout' | 'audioEnabled' | 'gain' | 'mediaInFrame'>>

export type EditorV6NumericControl = (
  label: string,
  value: number,
  onChange: (value: number, record?: boolean) => void,
  min: number,
  max: number,
  suffix?: string,
  onFinish?: () => void,
  disabled?: boolean
) => ReactNode

type EditorV6PropertyPanelProps = {
  project: EditorV6Document | null
  activeTool: 'background' | 'objects' | null
  background: EditorV6BackgroundState
  selectedElementId: string | null
  selectedElement: EditorV6Element | null
  selectedBackgroundAsset: EditorV6Asset | null
  selectedVideoBlock: EditorV6TimelineBlock | null
  selectedVideo: EditorV6MediaAsset | null
  control: EditorV6NumericControl
  onBackgroundChange: (values: EditorV6BackgroundValues, record?: boolean) => void
  onImportImage: (category: 'background' | 'object') => void
  onSelectBackground: (asset: EditorV6Asset) => void
  onAddObject: (asset: EditorV6Asset) => void
  onUpdateElement: (id: string, values: Partial<EditorV6Element>, record?: boolean) => void
  onUpdateVideoBlock: (id: string, values: EditorV6VideoValues, record?: boolean) => void
  onRecordHistory: () => void
  onDeleteSelected: () => void
}

/** Scene inspector panels; document mutations remain owned by EditorV6Page. */
export function EditorV6PropertyPanel({
  project,
  activeTool,
  background,
  selectedElementId,
  selectedElement,
  selectedBackgroundAsset,
  selectedVideoBlock,
  selectedVideo,
  control,
  onBackgroundChange,
  onImportImage,
  onSelectBackground,
  onAddObject,
  onUpdateElement,
  onUpdateVideoBlock,
  onRecordHistory,
  onDeleteSelected
}: EditorV6PropertyPanelProps) {
  if (!project) return null

  if (activeTool === 'background') return <div className="studio-side-content">
    <h2>Fundos</h2><p>Escolha um fundo salvo ou adicione uma imagem.</p>
    <label className="studio-color-control">Cor sólida<input type="color" value={background.backgroundColor} onChange={(event) => onBackgroundChange({ backgroundColor: event.target.value })} /></label>
    <button className="studio-side-primary" type="button" onClick={() => onImportImage('background')}><Icon name="plus" />Adicionar imagem</button>
    <div className="studio-asset-grid">{project.assets.filter((asset) => asset.category === 'background').map((asset) => <button key={asset.id} className={`studio-asset-card${background.backgroundAssetId === asset.id ? ' active' : ''}`} type="button" onClick={() => onSelectBackground(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
    {selectedBackgroundAsset && selectedElementId === 'background' && <>
      <BackgroundTransformControls background={background} control={control} onChange={onBackgroundChange} />
      <button className="studio-side-danger" type="button" onClick={onDeleteSelected}><Icon name="trash" />Remover fundo da cena</button>
    </>}
  </div>

  if (activeTool === 'objects') return <div className="studio-side-content">
    <h2>Objetos</h2><p>Imagens importadas ficam disponíveis neste Studio.</p>
    <button className="studio-side-primary" type="button" onClick={() => onImportImage('object')}><Icon name="plus" />Importar imagem</button>
    <div className="studio-asset-grid">{project.assets.filter((asset) => asset.category === 'object').map((asset) => <button key={asset.id} className="studio-asset-card" type="button" onClick={() => onAddObject(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
    {selectedElementId && selectedElement && <SceneElementControls element={selectedElement} update={(values, record) => onUpdateElement(selectedElement.id, values, record)} remove={onDeleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />}
  </div>

  if (selectedVideoBlock && selectedVideo && project) {
    const block = selectedVideoBlock
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

  if (selectedElement) return <div className="studio-side-content">
    <h2>{selectedElement.kind === 'character' ? selectedElement.text : selectedElement.kind === 'image' ? 'Objeto selecionado' : selectedElement.kind === 'narrator' ? 'Narrador' : selectedElement.kind === 'speech' ? 'Balão de fala' : 'Balão de pensamento'}</h2>
    {selectedElement.kind !== 'image' && selectedElement.kind !== 'character' && <label className="studio-text-control">Texto<textarea value={selectedElement.text} onChange={(event) => onUpdateElement(selectedElement.id, { text: event.target.value })} rows={3} /></label>}
    <SceneElementControls element={selectedElement} update={(values, record) => onUpdateElement(selectedElement.id, values, record)} remove={onDeleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />
  </div>

  if (selectedElementId === 'background' && selectedBackgroundAsset) return <div className="studio-side-content">
    <h2>Imagem de fundo</h2><p>{selectedBackgroundAsset.name}</p>
    <BackgroundTransformControls background={background} control={control} onChange={onBackgroundChange} />
    <button className="studio-side-danger" type="button" onClick={onDeleteSelected}><Icon name="trash" />Remover fundo</button>
  </div>

  return <div className="studio-side-content"><h2>Cena</h2><p>Escolha uma ferramenta à esquerda ou selecione um elemento na cena.</p><small>{project.elements.length} elemento(s)</small></div>
}

function BackgroundTransformControls({
  background,
  control,
  onChange
}: {
  background: EditorV6PropertyPanelProps['background']
  control: EditorV6NumericControl
  onChange: EditorV6PropertyPanelProps['onBackgroundChange']
}) {
  return <div className="studio-controls-grid">
    {control('X', background.backgroundX, (value, record) => onChange({ backgroundX: value }, record), -100, 100)}
    {control('Y', background.backgroundY, (value, record) => onChange({ backgroundY: value }, record), -100, 100)}
    {control('Largura', background.backgroundWidth, (value, record) => onChange({ backgroundWidth: value }, record), 1, 300)}
    {control('Altura', background.backgroundHeight, (value, record) => onChange({ backgroundHeight: value }, record), 1, 300)}
    {control('Rotação', background.backgroundRotation, (value, record) => onChange({ backgroundRotation: value }, record), -180, 180, '°')}
  </div>
}
