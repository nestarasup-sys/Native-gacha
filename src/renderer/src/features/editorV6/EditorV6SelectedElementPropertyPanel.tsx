import { SceneElementControls } from '../../ui/components/SceneElementControls'
import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'
import type { ComponentProps, ReactNode } from 'react'

type Props = Pick<EditorV6PropertyPanelProps,
  'selectedElement' | 'characterNameColor' | 'balloonScalePercent' | 'balloonOffsetY' | 'control' |
  'onUpdateElement' | 'onUpdateCharacterNameColor' | 'onUpdateBalloonScale' | 'onUpdateBalloonOffsetY' | 'onResetBalloonPosition' |
  'onRecordHistory' | 'onDeleteSelected'> & {
    selectedElement: NonNullable<EditorV6PropertyPanelProps['selectedElement']>
    extra?: ReactNode
    characterControls?: Pick<ComponentProps<typeof SceneElementControls>, 'characterReset' | 'characterLayerMax' | 'positionNote'>
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
  onResetBalloonPosition,
  onRecordHistory,
  onDeleteSelected,
  extra,
  characterControls
}: Props) {
  return <div className="studio-side-content">
    <h2>{selectedElement.kind === 'character' ? selectedElement.text : selectedElement.kind === 'image' ? 'Objeto selecionado' : selectedElement.kind === 'narrator' ? 'Narrador' : selectedElement.kind === 'speech' ? 'Balão de fala' : 'Balão de pensamento'}</h2>
    {(selectedElement.kind === 'speech' || selectedElement.kind === 'thought') && <div className="studio-balloon-scale-control"><div className="studio-controls-grid">{control('Escala dos balões', balloonScalePercent, (value) => onUpdateBalloonScale(value), 100, 250, '%')}{control('Posição vertical', balloonOffsetY, (value) => onUpdateBalloonOffsetY(value), -100, 100, '%')}</div><small>Aplica a escala e a posição vertical a todas as falas e pensamentos. Valor negativo sobe; positivo desce.</small></div>}
    {(selectedElement.kind === 'speech' || selectedElement.kind === 'thought') && <button type="button" className="pose-button secondary" disabled={!selectedElement.characterId && !selectedElement.attachedCharacterElementId} onClick={() => onResetBalloonPosition(selectedElement.id)}>Reposicionar no personagem</button>}
    {selectedElement.kind === 'character' && selectedElement.characterId && characterNameColor && <label className="studio-color-control">Cor do nome nos balões<input type="color" value={characterNameColor} onPointerDown={onRecordHistory} onKeyDown={(event) => { if (!event.repeat && ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) onRecordHistory() }} onChange={(event) => onUpdateCharacterNameColor(selectedElement.characterId!, event.target.value)} /></label>}
    {selectedElement.englishText !== undefined && <label className="studio-text-control">Inglês<textarea value={selectedElement.englishText} onChange={(event) => onUpdateElement(selectedElement.id, { englishText: event.target.value })} rows={3} /></label>}
    {selectedElement.kind !== 'image' && selectedElement.kind !== 'character' && <label className="studio-text-control">{selectedElement.englishText === undefined ? 'Texto' : 'Português'}<textarea value={selectedElement.text} onChange={(event) => onUpdateElement(selectedElement.id, { text: event.target.value })} rows={3} /></label>}
    <SceneElementControls element={selectedElement} update={(values, record) => onUpdateElement(selectedElement.id, values, record)} remove={onDeleteSelected} control={control} positionNote="Posição, tamanho, rotação, espelhamento e camada são compartilhados por todos os blocos deste personagem." {...characterControls} />
    {extra}
  </div>
}
