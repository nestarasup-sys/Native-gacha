import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'
import { Icon } from '../../ui/components/Icon'

type SelectedProps = Pick<EditorV6PropertyPanelProps,
  'background' | 'selectedBackgroundAsset' | 'control' | 'onBackgroundChange' | 'onDeleteSelected'> & {
    selectedBackgroundAsset: NonNullable<EditorV6PropertyPanelProps['selectedBackgroundAsset']>
    mode: 'selected'
  }
type LibraryProps = Pick<EditorV6PropertyPanelProps,
  'background' | 'selectedElementId' | 'selectedBackgroundAsset' | 'sharedBackgrounds' | 'control' |
  'onBackgroundChange' | 'onImportImage' | 'onSelectBackground' | 'onLinkSharedBackground' | 'onDeleteSelected'> & {
    project: NonNullable<EditorV6PropertyPanelProps['project']>
    mode: 'library'
  }
type Props = SelectedProps | LibraryProps

/** Background catalog and selected-background controls for the V6 Inspector. */
export function EditorV6BackgroundPropertyPanel(props: Props) {
  if (props.mode === 'selected') {
    const { background, selectedBackgroundAsset, control, onBackgroundChange, onDeleteSelected } = props
    return <div className="studio-side-content">
      <h2>Imagem de fundo</h2><p>{selectedBackgroundAsset.name}</p>
      <BackgroundTransformControls background={background} control={control} onChange={onBackgroundChange} />
      <button className="studio-side-danger" type="button" onClick={onDeleteSelected}><Icon name="trash" />Remover fundo</button>
    </div>
  }

  const { project, background, selectedElementId, selectedBackgroundAsset, sharedBackgrounds, control,
    onBackgroundChange, onImportImage, onSelectBackground, onLinkSharedBackground, onDeleteSelected } = props

  return <div className="studio-side-content">
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
}

function BackgroundTransformControls({
  background,
  control,
  onChange
}: {
  background: EditorV6PropertyPanelProps['background']
  control: EditorV6PropertyPanelProps['control']
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
