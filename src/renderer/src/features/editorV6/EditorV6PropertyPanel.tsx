import { Icon } from '../../ui/components/Icon'
import { SceneElementControls } from '../../ui/components/SceneElementControls'
import { EditorV6VideoPropertyPanel } from './EditorV6VideoPropertyPanel'
import type { EditorV6NumericControl, EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'

export type { EditorV6NumericControl } from './editorV6PropertyPanelTypes'

/** Scene inspector panels; document mutations remain owned by EditorV6Page. */
export function EditorV6PropertyPanel({
  project,
  activeTool,
  background,
  selectedElementId,
  selectedElement,
  characterNameColor,
  balloonScalePercent,
  balloonOffsetY,
  selectedBackgroundAsset,
  sharedBackgrounds,
  sharedObjects,
  selectedVideoBlock,
  selectedVideo,
  control,
  onBackgroundChange,
  onImportImage,
  onSelectBackground,
  onLinkSharedBackground,
  onLinkSharedObject,
  onAddObject,
  onUpdateElement,
  onUpdateCharacterNameColor,
  onUpdateBalloonScale,
  onUpdateBalloonOffsetY,
  onUpdateVideoBlock,
  onRecordHistory,
  onDeleteSelected
}: EditorV6PropertyPanelProps) {
  if (!project) return null

  if (activeTool === 'background') return <div className="studio-side-content">
    <h2>Fundos</h2><p>Os fundos vêm da Biblioteca V6 e são vinculados pelo ID.</p>
    <label className="studio-color-control">Cor sólida<input type="color" value={background.backgroundColor} onChange={(event) => onBackgroundChange({ backgroundColor: event.target.value })} /></label>
    <button className="studio-side-primary" type="button" onClick={() => onImportImage('background')}><Icon name="plus" />Adicionar imagem</button>
    <div className="studio-asset-grid">{project.assets.filter((asset) => asset.category === 'background').map((asset) => <button key={asset.id} className={`studio-asset-card${background.backgroundAssetId === asset.id ? ' active' : ''}`} type="button" onClick={() => onSelectBackground(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
    {sharedBackgrounds.some((item) => item.available && !project.assets.some((asset) => asset.libraryAssetId === item.id || asset.libraryBackgroundId === item.id)) && <><h3>Fundos compartilhados</h3><div className="studio-asset-grid">{sharedBackgrounds.filter((item) => item.available && !project.assets.some((asset) => asset.libraryAssetId === item.id || asset.libraryBackgroundId === item.id)).map((item) => <button key={item.id} className="studio-asset-card" type="button" onClick={() => onLinkSharedBackground(item)}><img src={`gacha-background://library/${item.id}`} alt="" /><span>{item.name}</span></button>)}</div></>}
    {selectedBackgroundAsset && selectedElementId === 'background' && <>
      <BackgroundTransformControls background={background} control={control} onChange={onBackgroundChange} />
      <button className="studio-side-danger" type="button" onClick={onDeleteSelected}><Icon name="trash" />Remover fundo da cena</button>
    </>}
  </div>

  if (activeTool === 'objects') return <div className="studio-side-content">
    <h2>Objetos</h2><p>Objetos da Biblioteca V6 são compartilhados entre roteiros e vinculados pelo ID.</p>
    <button className="studio-side-primary" type="button" onClick={() => onImportImage('object')}><Icon name="plus" />Importar imagem</button>
    <div className="studio-asset-grid">{project.assets.filter((asset) => asset.category === 'object').map((asset) => <button key={asset.id} className="studio-asset-card" type="button" onClick={() => onAddObject(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
    {sharedObjects.some((item) => item.available && !project.assets.some((asset) => asset.libraryAssetId === item.id)) && <><h3>Objetos compartilhados</h3><div className="studio-asset-grid">{sharedObjects.filter((item) => item.available && !project.assets.some((asset) => asset.libraryAssetId === item.id)).map((item) => <button key={item.id} className="studio-asset-card" type="button" onClick={() => onLinkSharedObject(item)}><img src={item.previewUrl} alt="" /><span>{item.name}</span></button>)}</div></>}
    {selectedElementId && selectedElement && <SceneElementControls element={selectedElement} update={(values, record) => onUpdateElement(selectedElement.id, values, record)} remove={onDeleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />}
  </div>

  if (selectedVideoBlock && selectedVideo) return <EditorV6VideoPropertyPanel
    selectedVideoBlock={selectedVideoBlock}
    selectedVideo={selectedVideo}
    control={control}
    onUpdateVideoBlock={onUpdateVideoBlock}
    onRecordHistory={onRecordHistory}
    onDeleteSelected={onDeleteSelected}
  />

  if (selectedElement) return <div className="studio-side-content">
    <h2>{selectedElement.kind === 'character' ? selectedElement.text : selectedElement.kind === 'image' ? 'Objeto selecionado' : selectedElement.kind === 'narrator' ? 'Narrador' : selectedElement.kind === 'speech' ? 'Balão de fala' : 'Balão de pensamento'}</h2>
    {(selectedElement.kind === 'speech' || selectedElement.kind === 'thought') && <div className="studio-balloon-scale-control"><div className="studio-controls-grid">{control('Escala dos balões', balloonScalePercent, (value) => onUpdateBalloonScale(value), 100, 250, '%')}{control('Posição vertical', balloonOffsetY, (value) => onUpdateBalloonOffsetY(value), -100, 100, '%')}</div><small>Aplica a escala e a posição vertical a todas as falas e pensamentos. Valor negativo sobe; positivo desce.</small></div>}
    {selectedElement.kind === 'character' && selectedElement.characterId && characterNameColor && <label className="studio-color-control">Cor do nome nos balões<input type="color" value={characterNameColor} onPointerDown={onRecordHistory} onKeyDown={(event) => { if (!event.repeat && ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) onRecordHistory() }} onChange={(event) => onUpdateCharacterNameColor(selectedElement.characterId!, event.target.value)} /></label>}
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
