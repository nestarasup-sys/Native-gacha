import type { CustomizerCharacter, FaceComponentPartId } from '../../../../shared/customizer'
import { Icon } from '../../ui/components/Icon'
import { mirroredFaceThumbnailIds } from './customizerFaceCatalogModel'
import { hasHeadAdjustmentItem, headAdjustmentPreviewUrl } from './customizerHeadAdjustmentModel'
import type { HeadAdjustmentPreviewDetails } from './customizerHeadAdjustmentModel'
import type { HeadAdjustmentItem } from './customizerNavigation'

type HeadTransform = { x: number; y: number; scaleX: number; scaleY: number; rotation: number }

type Props = {
  character: CustomizerCharacter | null
  label: string
  items: readonly HeadAdjustmentItem[]
  selectedId: string | null
  details: HeadAdjustmentPreviewDetails
  onSelect: (id: string) => void
  onToggleHidden: () => void
  onTransform: (transform: HeadTransform) => void
}

export function CustomizerHeadAdjustmentPanel({
  character, label, items, selectedId, details, onSelect, onToggleHidden, onTransform
}: Props) {
  const selectedItem = items.find((item) => item.id === selectedId)
  const appliedItems = items.filter((item) => hasHeadAdjustmentItem(character, item.id))
  const previewFor = (id: string) => headAdjustmentPreviewUrl(id, character, details)
  const selectedWardrobeGroup = selectedId === 'oculos' || selectedId === 'acessorio-cabeca'
    ? [...(character?.customization.wardrobeGroups ?? [])].reverse().find((group) => group.category === selectedId)
    : undefined
  const selectedOverride = selectedId ? character?.customization.partOverrides?.[`head:${selectedId}`] : undefined
  const transform: HeadTransform = {
    x: selectedWardrobeGroup?.offsetX ?? selectedOverride?.x ?? 0,
    y: selectedWardrobeGroup?.offsetY ?? selectedOverride?.y ?? 0,
    scaleX: selectedWardrobeGroup?.scaleX ?? selectedOverride?.scaleX ?? 1,
    scaleY: selectedWardrobeGroup?.scaleY ?? selectedOverride?.scaleY ?? 1,
    rotation: selectedWardrobeGroup?.rotation ?? selectedOverride?.rotation ?? 0
  }
  const selectedDimmed = Boolean(selectedWardrobeGroup?.hidden ?? selectedOverride?.hidden)
  const changeTransform = (patch: Partial<HeadTransform>) => onTransform({ ...transform, ...patch })
  const moveBy = (x: number, y: number) => changeTransform({ x: transform.x + x, y: transform.y + y })
  const canAdjustSelected = Boolean(character && selectedItem && hasHeadAdjustmentItem(character, selectedItem.id))

  return <section className="customizer-adjust-picker customizer-clothes-adjust-detail" aria-label={`Ajustes de cabeça · ${label}`}>
    <header className="customizer-adjust-heading customizer-clothes-adjust-detail-heading">
      <button className={`customizer-adjust-reset ${selectedDimmed ? 'is-restore' : 'is-delete'}`} type="button"
        onClick={onToggleHidden} disabled={!canAdjustSelected}
        title={selectedDimmed ? 'Restaurar item selecionado' : 'Excluir item selecionado'}
        aria-label={selectedDimmed ? 'Restaurar item selecionado' : 'Excluir item selecionado'}>
        <Icon name={selectedDimmed ? 'undo' : 'trash'} /><span>{selectedDimmed ? 'RESTAURAR' : 'EXCLUIR'}</span>
      </button>
      <h2>Ajustar cabeça · {label}</h2>
    </header>
    {!character && <p className="customizer-adjust-hint">Selecione um personagem para ver os itens de cabeça.</p>}
    {character && <div className="customizer-clothes-adjust-workspace">
      <section className="customizer-clothes-adjust-parts" aria-label="Itens de cabeça aplicados">
        <header><strong>Itens da cabeça</strong><small>{appliedItems.length} item(ns)</small></header>
        {appliedItems.length ? <div className="customizer-clothes-adjust-part-grid">
          {appliedItems.map((item) => {
            const override = character.customization.partOverrides?.[`head:${item.id}`]
            const dimmed = Boolean(override?.hidden || character.customization.wardrobeGroups?.some((group) => group.category === item.id && group.hidden))
            const preview = previewFor(item.id)
            return <div key={item.id} className={`customizer-clothes-adjust-part${selectedId === item.id ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}>
              <button type="button" className="customizer-clothes-adjust-part-select" aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}>
                <span className="customizer-clothes-adjust-part-preview">{preview ? <img src={preview} alt="" style={{ transform: mirroredFaceThumbnailIds.has(item.id as FaceComponentPartId) ? 'scaleX(-1)' : undefined }} /> : <Icon name={item.icon} />}</span>
                <strong title={item.label}>{item.label}</strong><small>Somente neste personagem</small>
              </button>
            </div>
          })}
        </div> : <p className="customizer-clothes-adjust-empty">Nenhum item aplicado em <strong>{label}</strong> neste personagem. Escolha um item nesta categoria para ajustar separadamente.</p>}
      </section>
      {selectedItem && hasHeadAdjustmentItem(character, selectedItem.id) ? <section className="customizer-clothes-adjust-controls" aria-label="Controles do item de cabeça selecionado">
        <div className="customizer-clothes-adjust-position">
          <div className="customizer-clothes-adjust-pad" aria-label="Mover o item">
            <button type="button" aria-label="Mover para cima" onClick={() => moveBy(0, -1)}>↑</button><button type="button" aria-label="Mover para a esquerda" onClick={() => moveBy(-1, 0)}>←</button><span><Icon name="move" /></span><button type="button" aria-label="Mover para a direita" onClick={() => moveBy(1, 0)}>→</button><button type="button" aria-label="Mover para baixo" onClick={() => moveBy(0, 1)}>↓</button>
          </div>
        </div>
        <div className="customizer-clothes-adjust-axis-grid">{([{ key: 'scaleX', label: 'Largura' }, { key: 'scaleY', label: 'Altura' }] as const).map(({ key, label: axisLabel }) => <div className="customizer-clothes-adjust-axis" key={key}><strong>{axisLabel} <output>{Math.round(transform[key] * 100)}%</output></strong><button type="button" aria-label={`Diminuir ${axisLabel.toLowerCase()}`} onClick={() => changeTransform({ [key]: Math.max(.05, Number((transform[key] - .02).toFixed(2))) })}>−</button><button type="button" aria-label={`Aumentar ${axisLabel.toLowerCase()}`} onClick={() => changeTransform({ [key]: Math.min(5, Number((transform[key] + .02).toFixed(2))) })}>+</button></div>)}</div>
        <div className="customizer-clothes-adjust-rotation"><strong>Rotação <output>{Math.round(transform.rotation)}°</output></strong><button type="button" aria-label="Girar para a esquerda" onClick={() => changeTransform({ rotation: transform.rotation - 1 })}>↶</button><button type="button" aria-label="Girar para a direita" onClick={() => changeTransform({ rotation: transform.rotation + 1 })}>↷</button></div>
      </section> : <div className="customizer-clothes-adjust-empty-controls">Selecione um item aplicado na lista para ajustar.</div>}
    </div>}
  </section>
}
