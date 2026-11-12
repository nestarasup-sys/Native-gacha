import { Icon } from '../../ui/components/Icon'
import { SceneElementControls } from '../../ui/components/SceneElementControls'
import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'

type Props = Pick<EditorV6PropertyPanelProps,
  'selectedElementId' | 'selectedElement' | 'sharedObjects' | 'control' | 'onImportImage' |
  'onLinkSharedObject' | 'onAddObject' | 'onUpdateElement' | 'onDeleteSelected'> & {
    project: NonNullable<EditorV6PropertyPanelProps['project']>
  }

/** Object catalog and placement controls for the V6 Inspector. */
export function EditorV6ObjectsPropertyPanel({
  project,
  selectedElementId,
  selectedElement,
  sharedObjects,
  control,
  onImportImage,
  onLinkSharedObject,
  onAddObject,
  onUpdateElement,
  onDeleteSelected
}: Props) {
  return <div className="studio-side-content">
    <h2>Objetos</h2><p>Objetos da Biblioteca V6 são compartilhados entre roteiros e vinculados pelo ID.</p>
    <button className="studio-side-primary" type="button" onClick={() => onImportImage('object')}><Icon name="plus" />Importar imagem</button>
    <div className="studio-asset-grid">{project.assets.filter((asset) => asset.category === 'object').map((asset) => <button key={asset.id} className="studio-asset-card" type="button" onClick={() => onAddObject(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
    {sharedObjects.some((item) => item.available && !project.assets.some((asset) => asset.libraryAssetId === item.id)) && <><h3>Objetos compartilhados</h3><div className="studio-asset-grid">{sharedObjects.filter((item) => item.available && !project.assets.some((asset) => asset.libraryAssetId === item.id)).map((item) => <button key={item.id} className="studio-asset-card" type="button" onClick={() => onLinkSharedObject(item)}><img src={item.previewUrl} alt="" /><span>{item.name}</span></button>)}</div></>}
    {selectedElementId && selectedElement && <SceneElementControls element={selectedElement} update={(values, record) => onUpdateElement(selectedElement.id, values, record)} remove={onDeleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />}
  </div>
}
