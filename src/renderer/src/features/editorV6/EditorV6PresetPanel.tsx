import { Icon } from '../../ui/components/Icon'
import type { EditorV6Element, EditorV6FaceMode } from '../../../../shared/editorV6'
import type { FaceExpressionCollection, FaceExpressionPresetSummary, FabricatorPoseSummary } from '../../../../shared/fabricator'

export type EditorV6PresetCategory = 'pose' | 'expression'

export function editorV6ExpressionPresetsForCollection(
  presets: FaceExpressionPresetSummary[],
  collectionId: string
): FaceExpressionPresetSummary[] {
  return presets
    .filter((preset) => preset.collectionId === collectionId && Number.isInteger(preset.expressionIndex))
    .sort((left, right) => left.expressionIndex! - right.expressionIndex!)
}

type Props = {
  characterAvailable: boolean
  element: EditorV6Element | null
  category: EditorV6PresetCategory
  onCategoryChange: (category: EditorV6PresetCategory) => void
  poseSlots: Array<NonNullable<FabricatorPoseSummary>>
  poseThumbnails: Record<number, string>
  poseDimensions: Record<number, { width: number; height: number }>
  selectedPoseSlot: number | null
  faceBusy: boolean
  onPoseSelect: (slot: number) => void
  expressionLoading: boolean
  expressionBusy: boolean
  faceAppearanceAvailable: boolean
  talkAvailable: boolean
  faceMode: EditorV6FaceMode
  onFaceModeSelect: (mode: 'idle' | 'blink' | 'talk') => void
  collections: FaceExpressionCollection[]
  selectedCollectionId: string | null
  collectionMenuOpen: boolean
  onToggleCollectionMenu: () => void
  onCollectionSelect: (id: string) => void
  presets: FaceExpressionPresetSummary[]
  onApplyBaseExpression: () => void
  onApplyExpressionPreset: (preset: FaceExpressionPresetSummary, gaze?: 'right' | 'left') => void
}

const presetCategories = [
  { id: 'pose', label: 'Pose', icon: 'frame' },
  { id: 'expression', label: 'Expressão', icon: 'face' },
  { id: 'reserved-1', label: 'Em breve', icon: 'sparkles' },
  { id: 'reserved-2', label: 'Em breve', icon: 'sparkles' },
  { id: 'reserved-3', label: 'Em breve', icon: 'sparkles' },
  { id: 'reserved-4', label: 'Em breve', icon: 'sparkles' }
] as const

const expressionModes = [
  { id: 'idle', label: 'Idle' },
  { id: 'blink', label: 'Blink' },
  { id: 'talk', label: 'Talk' }
] as const

export function EditorV6PresetPanel({
  characterAvailable,
  element,
  category,
  onCategoryChange,
  poseSlots,
  poseThumbnails,
  poseDimensions,
  selectedPoseSlot,
  faceBusy,
  onPoseSelect,
  expressionLoading,
  expressionBusy,
  faceAppearanceAvailable,
  talkAvailable,
  faceMode,
  onFaceModeSelect,
  collections,
  selectedCollectionId,
  collectionMenuOpen,
  onToggleCollectionMenu,
  onCollectionSelect,
  presets,
  onApplyBaseExpression,
  onApplyExpressionPreset
}: Props) {
  if (!characterAvailable || element?.kind !== 'character') return <div className="studio-custom-empty"><strong>Presets</strong><span>Selecione um personagem na cena para ver poses e expressões.</span></div>

  const selectedCollection = [{ id: 'standard', name: 'Padrão' }, ...collections].find((item) => item.id === selectedCollectionId)
  const expressions = selectedCollectionId ? editorV6ExpressionPresetsForCollection(presets, selectedCollectionId) : []

  return <div className="studio-presets-panel">
    <div className="studio-preset-buttons" aria-label="Categorias de presets">
      {presetCategories.map((option) => {
        const reserved = option.id.startsWith('reserved')
        return <button key={option.id} className={`studio-preset-button${option.id === category ? ' active' : ''}${reserved ? ' reserved' : ''}`} disabled={reserved} onClick={() => {
          if (option.id === 'pose' || option.id === 'expression') onCategoryChange(option.id)
        }} type="button"><Icon name={option.icon} /><span>{option.label}</span></button>
      })}
    </div>
    {category === 'pose' && <section className="studio-preset-catalog" aria-label="Catálogo de poses">
      <h3>Poses do modelo</h3>
      <div className="studio-preset-list">
        {poseSlots.map((pose) => {
          const dimensions = poseDimensions[pose.slot]
          return <button className={`studio-pose-option${selectedPoseSlot === pose.slot ? ' selected' : ''}`} key={pose.slot} onClick={() => onPoseSelect(pose.slot)} disabled={faceBusy} aria-label={`Selecionar pose ${pose.name}`} title={pose.name} style={dimensions ? { aspectRatio: `${dimensions.width}/${dimensions.height}` } : undefined} type="button">{poseThumbnails[pose.slot] ? <img src={poseThumbnails[pose.slot]} alt="" /> : <span className="studio-pose-thumb-placeholder" />}</button>
        })}
        {!poseSlots.length && <p className="studio-custom-hint">Este modelo ainda não tem poses salvas.</p>}
      </div>
    </section>}
    {category === 'expression' && <section className="studio-expression-catalog" aria-label="Presets do Expressão Dev">
      {expressionLoading ? <p className="studio-custom-hint">Carregando conjuntos de expressão…</p> : <>
        <div className="studio-expression-modes" role="group" aria-label="Estado facial do personagem">
          {expressionModes.map((mode) => <button key={mode.id} className={`studio-expression-mode${faceMode === mode.id ? ' active' : ''}`} type="button" aria-pressed={faceMode === mode.id} disabled={expressionBusy || faceBusy || !faceAppearanceAvailable || mode.id === 'talk' && !talkAvailable} onClick={() => onFaceModeSelect(mode.id)}>{mode.label}</button>)}
        </div>
        <div className="studio-expression-collections" aria-label="Selecionar conjunto de expressão">
          <button className="studio-expression-collection-button" type="button" aria-expanded={collectionMenuOpen} onClick={onToggleCollectionMenu}>
            <strong>{selectedCollection?.name ?? 'Escolher conjunto'}</strong><Icon name="chevronDown" />
          </button>
          {collectionMenuOpen && <div className="studio-expression-collection-options" role="listbox" aria-label="Conjuntos disponíveis">
            {[{ id: 'standard', name: 'Padrão' }, ...collections].map((collection) => {
              const selected = selectedCollectionId === collection.id
              return <button className={`studio-expression-collection-option${selected ? ' selected' : ''}`} key={collection.id} type="button" role="option" aria-selected={selected} onClick={() => onCollectionSelect(collection.id)}>
                <span>{collection.name}</span>{selected && <Icon name="check" />}
              </button>
            })}
          </div>}
        </div>
        {selectedCollectionId ? <div className="studio-expression-selected">
          <div className="studio-expression-list">
            <button className={`studio-expression-option${!element.activeExpressionPresetId ? ' selected' : ''}`} type="button" onClick={onApplyBaseExpression} disabled={expressionBusy || faceBusy} aria-pressed={!element.activeExpressionPresetId}><b>•</b><span>Base</span></button>
            {expressions.map((preset) => <div className="studio-expression-row" key={preset.id}>
              <button className={`studio-expression-option${element.activeExpressionPresetId === preset.id && element.activeExpressionGaze !== 'left' ? ' selected' : ''}`} type="button" aria-pressed={element.activeExpressionPresetId === preset.id} onClick={() => onApplyExpressionPreset(preset)} disabled={expressionBusy || faceBusy}>
                <b>{String((preset.expressionIndex ?? 0) + 1).padStart(2, '0')}</b><span>{preset.name}</span>
              </button>
              <button className="studio-expression-look-left" type="button" aria-pressed={element.activeExpressionPresetId === preset.id && element.activeExpressionGaze === 'left'} title={`Aplicar ${preset.name} com as pupilas voltadas à esquerda`} aria-label={`Pupilas à esquerda: ${preset.name}`} onClick={() => onApplyExpressionPreset(preset, 'left')} disabled={expressionBusy || faceBusy}>pt</button>
            </div>)}
            {!expressions.length && <p className="studio-custom-hint">Nenhuma expressão salva neste conjunto. Salve expressões no Expressão Dev para listá-las aqui.</p>}
          </div>
        </div> : <p className="studio-custom-hint">Selecione um conjunto para ver as expressões disponíveis.</p>}
        {(expressionBusy || faceBusy) && <p className="studio-custom-hint" role="status">Aplicando expressão…</p>}
      </>}
    </section>}
  </div>
}
