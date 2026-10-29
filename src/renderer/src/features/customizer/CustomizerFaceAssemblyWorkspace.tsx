import type { Dispatch, SetStateAction } from 'react'
import type { CustomizerFaceAppearance, FaceComponentPartId, HairColorOverrides, HairColorRole } from '../../../../shared/customizer'
import type { FaceComponentAsset, FaceComponentAssetSummary } from '../../../../shared/fabricator'
import { isRightFaceAsset } from '../../../../shared/faceLibrarySelection'
import { Icon } from '../../ui/components/Icon'
import { HairAssetPreview } from './CustomizerAssetPreviews'
import { PiecePaletteStrip } from './CustomizerAppearanceControls'
import { customizerFaceParts, facePartCatalogId, facePartColorControls, facePartSourceId, sameFaceAssetPair, wrapSlotIndex } from './customizerFaceCatalogModel'
import type { CustomizerFaceCatalogModel, FaceLibraryPartId } from './customizerFaceCatalogModel'

type Props = {
  selectedModelSlot: number | null
  loading: boolean
  selectedPart: FaceLibraryPartId | null
  selectedPage: number
  faceCatalogModel: CustomizerFaceCatalogModel
  faceComponentAssets: FaceComponentAssetSummary[]
  faceComponentDetails: Record<string, FaceComponentAsset>
  appearance?: CustomizerFaceAppearance
  hasCharacter: boolean
  onSelectPart: Dispatch<SetStateAction<FaceLibraryPartId | null>>
  onSelectPage: Dispatch<SetStateAction<number>>
  onChoosePart: (part: FaceLibraryPartId, summary: FaceComponentAssetSummary) => void | Promise<void>
  onClearPart: (part: FaceLibraryPartId) => void | Promise<void>
  onSetColor: (part: FaceComponentPartId, role: HairColorRole, value: string) => void | Promise<void>
  onApplyPalette: (part: FaceComponentPartId, colors: HairColorOverrides) => void | Promise<void>
  onResetColors: (part: FaceLibraryPartId) => void | Promise<void>
}

export function CustomizerFaceAssemblyWorkspace({
  selectedModelSlot, loading, selectedPart, selectedPage, faceCatalogModel, faceComponentAssets,
  faceComponentDetails, appearance, hasCharacter, onSelectPart, onSelectPage, onChoosePart,
  onClearPart, onSetColor, onApplyPalette, onResetColors
}: Props) {
  const renderParts = () => <div className="customizer-hair-layout customizer-face-layout">
    {customizerFaceParts.map((part) => {
      const options = faceCatalogModel.optionsForCategory(part.category)
      const selectedId = facePartCatalogId(appearance, part)
      const selectedAsset = selectedId ? faceComponentAssets.find((summary) => summary.id === selectedId) : undefined
      const selectedOption = selectedAsset && isRightFaceAsset(selectedAsset)
        ? options.find((summary) => sameFaceAssetPair(summary, selectedAsset, faceComponentDetails))
        : selectedAsset
      const selectedIndex = options.findIndex((summary) => summary.id === selectedOption?.id)
      const selected = selectedIndex >= 0 ? options[selectedIndex] : null
      const piece = selectedId ? faceComponentDetails[selectedId] : null
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = options.length + 1
      const colorPartId = facePartSourceId(part)
      const componentAppearance = appearance?.components?.[colorPartId]
      const colors = componentAppearance?.colors ?? {}
      const hasLocalColors = Object.keys(colors).length > 0
      const chooseAt = (index: number) => {
        if (!hasCharacter) return
        const slot = wrapSlotIndex(index, slotCount)
        if (slot === 0) void onClearPart(part.id)
        else void onChoosePart(part.id, options[slot - 1])
      }

      return <article className={`customizer-hair-piece customizer-face-piece customizer-face-piece-${part.id}`} key={part.id}>
        <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{hasLocalColors && <button className="customizer-hair-reset" onClick={() => void onResetColors(colorPartId)} title={'Restaurar cores de ' + part.label} type="button">Restaurar</button>}</header>
        <div className="customizer-hair-piece-selector">
          <button aria-label={'Peça anterior: ' + part.label} onClick={() => chooseAt(selectedSlot - 1)} disabled={!options.length || !hasCharacter} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={'Abrir biblioteca de ' + part.label} title={'Abrir biblioteca de ' + part.label} onClick={() => { onSelectPage(0); onSelectPart(part.id) }} type="button">
            {piece ? <HairAssetPreview source={piece.dataUrl} colors={colors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: componentAppearance?.manualColorRoles }} alt={selected?.name ?? ''} flipX={part.side === 'right'} /> : null}
          </button>
          <button aria-label={'Próxima peça: ' + part.label} onClick={() => chooseAt(selectedSlot + 1)} disabled={!options.length || !hasCharacter} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={'Cores de ' + part.label}>
            {facePartColorControls.map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={color.label + ' de ' + part.label}>
              <input type="color" aria-label={color.label + ' de ' + part.label} value={colors[color.id] ?? color.fallback} disabled={!hasCharacter || !piece} onChange={(event) => void onSetColor(part.id, color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <PiecePaletteStrip label={part.label} colors={colors} disabled={!hasCharacter || !piece} onSelect={(palette) => void onApplyPalette(part.id, palette)} />
      </article>
    })}
  </div>

  const renderLibrary = () => {
    if (!selectedPart) return null
    const part = customizerFaceParts.find((entry) => entry.id === selectedPart)
    if (!part) return null
    const options = faceCatalogModel.optionsForCategory(part.category)
    const pageSize = 20
    const slots: Array<FaceComponentAssetSummary | null> = [null, ...options]
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(selectedPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const selectedId = facePartCatalogId(appearance, part)
    const selectedAsset = selectedId ? faceComponentAssets.find((summary) => summary.id === selectedId) : undefined
    const selectedOption = selectedAsset && isRightFaceAsset(selectedAsset)
      ? options.find((summary) => sameFaceAssetPair(summary, selectedAsset, faceComponentDetails))
      : selectedAsset
    const selectedIndex = options.findIndex((summary) => summary.id === selectedOption?.id)
    const selectedFacePart = appearance?.components?.[facePartSourceId(part)]
    const selectedColors = selectedFacePart?.colors

    return <section className="customizer-hair-library" aria-labelledby="customizer-face-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={() => void onClearPart(part.id)} disabled={!selectedId} aria-label={'Remover ' + part.label + ' do personagem'} title={'Remover ' + part.label + ' do personagem'}><Icon name="trash" /></button>
        <h2 id="customizer-face-library-title">{part.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => onSelectPart(null)} aria-label="Voltar aos controles dos olhos">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={'Biblioteca de ' + part.label}>
        {visible.map((summary) => {
          if (!summary) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={() => void onClearPart(part.id)} />
          const piece = faceComponentDetails[summary.id]
          const selected = summary.id === selectedOption?.id
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={summary.id} title={summary.name} aria-label={'Selecionar ' + summary.name} aria-pressed={selected} type="button" onClick={() => void onChoosePart(part.id, summary)}>
            {piece ? <HairAssetPreview source={piece.dataUrl} colors={selectedColors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: selectedFacePart?.manualColorRoles }} alt="" flipX={part.side === 'right'} /> : <span className="customizer-hair-library-placeholder"><Icon name="face" /></span>}
          </button>
        })}
        {!options.length && <p className="customizer-hair-library-empty">Nenhum asset salvo para {part.label}. Importe esta peça no Rosto Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => onSelectPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => onSelectPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  return <section className="customizer-hair-workspace customizer-face-workspace" aria-label="Personalização dos olhos e sobrancelhas">
    {selectedPart ? renderLibrary()
      : selectedModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para carregar olhos e sobrancelhas do Fabricador Dev.</div>
      : loading ? <div className="customizer-catalog-empty">Carregando catálogo facial…</div>
        : renderParts()}
  </section>
}
