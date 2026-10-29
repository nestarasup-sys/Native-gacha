import { Fragment, type Dispatch, type SetStateAction } from 'react'
import type { CustomizerFaceAppearance, FacePalettePartId, HairColorOverrides, HairColorRole } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAssetSummary, FaceDetailKind } from '../../../../shared/fabricator'
import { Icon } from '../../ui/components/Icon'
import { HairAssetPreview } from './CustomizerAssetPreviews'
import { MouthBlushControls, NoseOpacityControl, NoseSkinTonePalette, PiecePaletteStrip } from './CustomizerAppearanceControls'
import { customizerFaceCatalogLayoutParts, facePartColorControls, skinTonePresets, wrapSlotIndex } from './customizerFaceCatalogModel'
import type { CustomizerFaceCatalogModel, FaceCatalogChoice, FaceCatalogLayoutPart } from './customizerFaceCatalogModel'
import type { CustomizerMouthBlushPatch } from './customizerFaceAppearanceModel'

type Props = {
  selectedModelSlot: number | null
  loading: boolean
  selectedPart: FaceCatalogLayoutPart | null
  selectedPage: number
  faceCatalogModel: CustomizerFaceCatalogModel
  faceCatalogDetails: Record<string, FaceCatalogItem>
  appearance?: CustomizerFaceAppearance
  hasCharacter: boolean
  effectiveModelSkinTone?: string
  originalSkinTone: string | null
  onSelectPart: Dispatch<SetStateAction<FaceCatalogLayoutPart | null>>
  onSelectPage: Dispatch<SetStateAction<number>>
  onChooseCatalogItem: (summary: FaceCatalogItemSummary, variantIndex?: number) => void | Promise<void>
  onChooseDetail: (kind: FaceDetailKind, summary: FaceComponentAssetSummary) => void | Promise<void>
  onClearPart: (part: 'nose' | 'mouth' | FaceDetailKind) => void | Promise<void>
  onSetVariant: (patch: Partial<CustomizerFaceAppearance>) => void | Promise<void>
  onSetColor: (part: FacePalettePartId, role: HairColorRole, value: string) => void | Promise<void>
  onApplyPalette: (part: FacePalettePartId, colors: HairColorOverrides) => void | Promise<void>
  onMouthBlushChange: (patch: CustomizerMouthBlushPatch) => void | Promise<void>
  onNoseOpacityChange: (value: number) => void
  onNoseSkinToneChange: (value: string) => void
}

export function CustomizerFaceCatalogWorkspace({
  selectedModelSlot, loading, selectedPart, selectedPage, faceCatalogModel, faceCatalogDetails, appearance,
  hasCharacter, effectiveModelSkinTone, originalSkinTone, onSelectPart, onSelectPage, onChooseCatalogItem,
  onChooseDetail, onClearPart, onSetVariant, onSetColor, onApplyPalette, onMouthBlushChange,
  onNoseOpacityChange, onNoseSkinToneChange
}: Props) {
  const chooseChoice = (part: FaceCatalogLayoutPart, choice: FaceCatalogChoice) => {
    if (choice.type === 'detail') void onChooseDetail(part as FaceDetailKind, choice.summary)
    else void onChooseCatalogItem(choice.summary, choice.piece.index)
  }

  const renderMouthBlushToggle = () => <label className="customizer-mouth-blush-toggle" title="Controla o blush na expressão base e nos presets do Studio">
    <input type="checkbox" checked={Boolean(appearance?.mouthBlushEnabled)} disabled={!hasCharacter || selectedModelSlot === null} onChange={(event) => void onMouthBlushChange({ mouthBlushEnabled: event.target.checked })} />
    <span>Blush na boca</span>
  </label>

  const renderMouthBlushControls = () => <MouthBlushControls
    color={appearance?.mouthBlushColor ?? '#e86388'}
    opacity={appearance?.mouthBlushOpacity ?? .38}
    disabled={!hasCharacter || selectedModelSlot === null}
    onChange={(patch) => void onMouthBlushChange(patch)}
  />

  const renderCard = (part: typeof customizerFaceCatalogLayoutParts[number]) => {
    const choices = faceCatalogModel.choicesForPart(part.id)
    const selectedId = faceCatalogModel.selectedIdForPart(part.id)
    const selectedIndex = choices.findIndex((choice) => faceCatalogModel.isChoiceSelected(part.id, choice))
    const selected = selectedIndex >= 0 ? choices[selectedIndex] : null
    const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
    const slotCount = choices.length + 1
    const colors = appearance?.facePalettes?.[part.id] ?? {}
    const skinTone = appearance?.noseSkinTone ?? effectiveModelSkinTone
    const catalogOpacity = selected?.type === 'catalog' ? faceCatalogDetails[`${selected.summary.modelSlot}:${selected.summary.id}`]?.opacity ?? 1 : 1
    const chooseAt = (index: number) => {
      if (!hasCharacter) return
      const slot = wrapSlotIndex(index, slotCount)
      if (slot === 0) void onClearPart(part.id)
      else chooseChoice(part.id, choices[slot - 1])
    }
    const isMouth = part.id === 'mouth'
    return <article className={`customizer-hair-piece customizer-face-piece customizer-face-layout-piece customizer-face-layout-piece-${part.id}${isMouth ? ' customizer-face-layout-mouth' : ''}`} key={part.id}>
      <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{isMouth && <span className="customizer-mouth-blush-group">{renderMouthBlushToggle()}{renderMouthBlushControls()}</span>}<button className="customizer-hair-reset" type="button" disabled={!selectedId} onClick={() => void onClearPart(part.id)}>Remover</button></header>
      {isMouth && <nav className="customizer-face-layout-mode" aria-label="Tipo de boca">
        <button className={!appearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={!appearance?.mouthOpen} onClick={() => void onSetVariant({ mouthOpen: false })}>Fechada</button>
        <button className={appearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={Boolean(appearance?.mouthOpen)} onClick={() => void onSetVariant({ mouthOpen: true })}>Aberta</button>
      </nav>}
      <div className="customizer-hair-piece-selector customizer-face-layout-selector">
        <button aria-label={`Peça anterior: ${part.label}`} onClick={() => chooseAt(selectedSlot - 1)} disabled={!choices.length || !hasCharacter} type="button"><Icon name="chevronRight" /></button>
        <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${part.label}`} title={`Abrir biblioteca de ${part.label}`} type="button" onClick={() => { onSelectPage(0); onSelectPart(part.id) }}>
          {selected && <HairAssetPreview source={selected.type === 'catalog' ? selected.piece.dataUrl : selected.asset.dataUrl} colors={colors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: appearance?.facePaletteManualRoles?.[part.id] }} skinTone={part.id === 'nose' ? skinTone : undefined} opacity={part.id === 'nose' ? appearance?.noseOpacity ?? catalogOpacity : 1} alt={selected.summary.name} />}
        </button>
        <button aria-label={`Próxima peça: ${part.label}`} onClick={() => chooseAt(selectedSlot + 1)} disabled={!choices.length || !hasCharacter} type="button"><Icon name="chevronRight" /></button>
        <div className={`customizer-hair-piece-colors${part.id === 'nose' ? ' customizer-nose-piece-colors' : ''}`} aria-label={`Cores de ${part.label}`}>
          {facePartColorControls.map((color, index) => <Fragment key={color.id}>
            <label className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${part.label}`}>
            <input type="color" aria-label={`${color.label} de ${part.label}`} value={colors[color.id] ?? color.fallback} disabled={!hasCharacter || !selected} onChange={(event) => void onSetColor(part.id, color.id, event.target.value)} />
            <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>
            {part.id === 'nose' && index === 2 && <NoseOpacityControl value={appearance?.noseOpacity ?? catalogOpacity} disabled={!hasCharacter || !selected} onChange={onNoseOpacityChange} />}
          </Fragment>)}
        </div>
      </div>
      {part.id === 'nose'
        ? <NoseSkinTonePalette value={skinTone ?? originalSkinTone ?? skinTonePresets[0].id} disabled={!hasCharacter || !selected} onSelect={onNoseSkinToneChange} />
        : <PiecePaletteStrip label={part.label} colors={colors} disabled={!hasCharacter || !selected} onSelect={(palette) => void onApplyPalette(part.id, palette)} />}
    </article>
  }

  const renderLibrary = () => {
    if (!selectedPart) return null
    const part = customizerFaceCatalogLayoutParts.find((entry) => entry.id === selectedPart)
    if (!part) return null
    const choices = faceCatalogModel.choicesForPart(part.id)
    const pageSize = 20
    const slots: Array<FaceCatalogChoice | null> = [null, ...choices]
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(selectedPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const selectedId = faceCatalogModel.selectedIdForPart(part.id)
    const selectedIndex = choices.findIndex((choice) => faceCatalogModel.isChoiceSelected(part.id, choice))
    return <section className={`customizer-hair-library customizer-face-layout-library${part.id === 'mouth' ? ' customizer-face-layout-library-mouth' : ''}`} aria-labelledby="customizer-face-layout-library-title">
      <header className={`customizer-hair-library-heading${part.id === 'mouth' ? ' customizer-hair-library-heading-mouth' : ''}`}>
        <button className="customizer-hair-library-remove" type="button" onClick={() => void onClearPart(part.id)} disabled={!selectedId} aria-label={`Remover ${part.label}`} title={`Remover ${part.label}`}><Icon name="trash" /></button>
        <h2 id="customizer-face-layout-library-title">{part.label}</h2>
        {part.id === 'mouth' && <span className="customizer-mouth-blush-group">{renderMouthBlushToggle()}{renderMouthBlushControls()}</span>}
        <button className="customizer-hair-library-close" type="button" onClick={() => onSelectPart(null)} aria-label="Voltar às peças do rosto">×</button>
      </header>
      {part.id === 'mouth' && <nav className="customizer-face-layout-mode customizer-face-layout-library-mode" aria-label="Tipo de boca">
        <button className={!appearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={!appearance?.mouthOpen} onClick={() => { onSelectPage(0); void onSetVariant({ mouthOpen: false }) }}>Fechada</button>
        <button className={appearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={Boolean(appearance?.mouthOpen)} onClick={() => { onSelectPage(0); void onSetVariant({ mouthOpen: true }) }}>Aberta</button>
      </nav>}
      <div className="customizer-hair-library-grid" aria-label={`Biblioteca de ${part.label}`}>
        {visible.map((choice) => {
          if (!choice) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={() => { void onClearPart(part.id); onSelectPart(null) }} />
          const selected = faceCatalogModel.isChoiceSelected(part.id, choice)
          const itemId = choice.type === 'catalog' ? `${choice.summary.id}:${choice.piece.id}` : choice.summary.id
          const imageUrl = choice.type === 'catalog' ? choice.piece.dataUrl : choice.asset.dataUrl
          const itemIndex = choice.type === 'catalog' ? ` · ${choice.piece.index + 1}` : ''
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={itemId} title={`${choice.summary.name}${itemIndex}`} aria-label={`Selecionar ${part.label}${itemIndex}`} aria-pressed={selected} type="button" onClick={() => { chooseChoice(part.id, choice); onSelectPart(null) }}><img src={imageUrl} alt="" /></button>
        })}
        {!choices.length && <p className="customizer-hair-library-empty">Nenhuma outra peça de {part.label.toLowerCase()} salva no Fabricador Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => onSelectPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => onSelectPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  return <section className="customizer-hair-workspace customizer-face-catalog-workspace" aria-label="Personalização do rosto">
    {selectedModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para ver as peças faciais.</div>
      : loading ? <div className="customizer-catalog-empty">Carregando catálogo facial…</div>
        : selectedPart ? renderLibrary()
          : <div className="customizer-hair-layout customizer-face-layout customizer-face-layout-catalog">{customizerFaceCatalogLayoutParts.map(renderCard)}</div>}
  </section>
}
