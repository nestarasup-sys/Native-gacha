import { SceneElementControls } from '../../ui/components/SceneElementControls'
import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'

type Props = Pick<EditorV6PropertyPanelProps,
  'selectedElement' | 'characterNameColor' | 'balloonScalePercent' | 'balloonOffsetY' | 'control' |
  'onUpdateElement' | 'onUpdateCharacterNameColor' | 'onUpdateBalloonScale' | 'onUpdateBalloonOffsetY' |
  'onRecordHistory' | 'onDeleteSelected'> & {
    selectedElement: NonNullable<EditorV6PropertyPanelProps['selectedElement']>
  }

/** Properties for the selected character, image, narrator or balloon. */
export function EditorV6SelectedElementPropertyPanel({
  selectedElement,
  characterNameColor,
  balloonScalePercent,
  balloonOffsetY,
  control,
  onUpdateElement,
  onUpdateCharacterNameColor,
  onUpdateBalloonScale,
  onUpdateBalloonOffsetY,
  onRecordHistory,
  onDeleteSelected
}: Props) {
  return <div className="studio-side-content">
    <h2>{selectedElement.kind === 'character' ? selectedElement.text : selectedElement.kind === 'image' ? 'Objeto selecionado' : selectedElement.kind === 'narrator' ? 'Narrador' : selectedElement.kind === 'speech' ? 'Balão de fala' : 'Balão de pensamento'}</h2>
    {(selectedElement.kind === 'speech' || selectedElement.kind === 'thought') && <div className="studio-balloon-scale-control"><div className="studio-controls-grid">{control('Escala dos balões', balloonScalePercent, (value) => onUpdateBalloonScale(value), 100, 250, '%')}{control('Posição vertical', balloonOffsetY, (value) => onUpdateBalloonOffsetY(value), -100, 100, '%')}</div><small>Aplica a escala e a posição vertical a todas as falas e pensamentos. Valor negativo sobe; positivo desce.</small></div>}
    {selectedElement.kind === 'character' && selectedElement.characterId && characterNameColor && <label className="studio-color-control">Cor do nome nos balões<input type="color" value={characterNameColor} onPointerDown={onRecordHistory} onKeyDown={(event) => { if (!event.repeat && ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) onRecordHistory() }} onChange={(event) => onUpdateCharacterNameColor(selectedElement.characterId!, event.target.value)} /></label>}
    {selectedElement.kind !== 'image' && selectedElement.kind !== 'character' && <label className="studio-text-control">Texto<textarea value={selectedElement.text} onChange={(event) => onUpdateElement(selectedElement.id, { text: event.target.value })} rows={3} /></label>}
    <SceneElementControls element={selectedElement} update={(values, record) => onUpdateElement(selectedElement.id, values, record)} remove={onDeleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />
  </div>
}
