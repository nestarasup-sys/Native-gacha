import { useRef, type Dispatch, type SetStateAction } from 'react'
import type { CustomizerCharacter, HairColorOverrides, HairColorRole, HairPartId } from '../../../../shared/customizer'
import type { HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import { hairStyleSupportsCategory } from '../../../../shared/hairCategories'
import { customizerHairParts, resolvedHairColors } from '../../characters/characterRenderer'
import { hairColorControls, hairPalettePresets, PiecePaletteStrip } from './CustomizerAppearanceControls'
import { HairAssetPreview } from './CustomizerAssetPreviews'
import { Icon } from '../../ui/components/Icon'
import { hairAppearancePartStyleId } from './customizerHairAppearanceModel'
import { wrapSlotIndex } from './customizerFaceCatalogModel'

type HairAppearance = NonNullable<CustomizerCharacter['customization']['hairAppearance']>
type HairLibraryPageView = {
  options: HairStyleSummary[]
  visible: Array<HairStyleSummary | null>
  pageCount: number
  page: number
}

export function CustomizerHairWorkspace({
  modelSlot, hasCharacter, loading, appearance, styles, details,
  libraryPart, libraryPageLoading, libraryPageView,
  activeColorRole, onActiveColorRoleChange,
  onSetLibraryPart, onSetLibraryPage,
  onChooseStyle, onResetPartColors, onSetPartColor, onApplyPartPalette,
  onSetColor, onApplyPalette, onRestoreColors
}: {
  modelSlot: number | null
  hasCharacter: boolean
  loading: boolean
  appearance?: HairAppearance
  styles: HairStyleSummary[]
  details: Record<string, HairStyle>
  libraryPart: HairPartId | null
  libraryPageLoading: boolean
  libraryPageView: HairLibraryPageView
  activeColorRole: HairColorRole
  onActiveColorRoleChange: (role: HairColorRole) => void
  onSetLibraryPart: (part: HairPartId | null) => void
  onSetLibraryPage: Dispatch<SetStateAction<number>>
  onChooseStyle: (part: HairPartId, style: HairStyleSummary | null) => void | Promise<void>
  onResetPartColors: (part: HairPartId) => void | Promise<void>
  onSetPartColor: (part: HairPartId, role: HairColorRole, value: string) => void | Promise<void>
  onApplyPartPalette: (part: HairPartId, colors: HairColorOverrides) => void | Promise<void>
  onSetColor: (role: HairColorRole, value: string) => void | Promise<void>
  onApplyPalette: (colors: HairColorOverrides) => void | Promise<void>
  onRestoreColors: () => void | Promise<void>
}) {
  const paletteStripRef = useRef<HTMLDivElement>(null)

  if (libraryPart) {
    const part = customizerHairParts.find((item) => item.id === libraryPart)
    if (!part) return null
    const { options, visible, pageCount, page } = libraryPageView
    const selectedId = hairAppearancePartStyleId(appearance, part.id)

    return <section className="customizer-hair-library" aria-labelledby="customizer-hair-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={() => void onChooseStyle(part.id, null)} disabled={!selectedId} aria-label={`Remover ${part.label} do personagem`} title={`Remover ${part.label} do personagem`}><Icon name="trash" /></button>
        <h2 id="customizer-hair-library-title">{part.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => onSetLibraryPart(null)} aria-label="Fechar biblioteca">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={`Peças disponíveis para ${part.label}`} aria-busy={libraryPageLoading}>
        {visible.map((summary) => {
          if (!summary) return <button className={`customizer-hair-library-item${!selectedId ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={!selectedId} type="button" onClick={() => void onChooseStyle(part.id, null)} />
          const asset = details[`${summary.modelSlot}:${summary.id}`]?.[part.side]
          const isSelected = summary.id === selectedId
          return <button className={`customizer-hair-library-item${isSelected ? ' selected' : ''}`} key={summary.id} title={summary.name} aria-label={`Selecionar ${summary.name}`} aria-pressed={isSelected} type="button" onClick={() => void onChooseStyle(part.id, summary)}>
            {asset ? <HairAssetPreview source={asset.dataUrl} colors={resolvedHairColors(appearance, part.id)} alt="" /> : <span className="customizer-hair-library-placeholder"><Icon name="bow" /></span>}
          </button>
        })}
        {!options.length && <p className="customizer-hair-library-empty">Nenhuma peça salva nesta categoria.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => onSetLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => onSetLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  if (modelSlot === null) return <section className="customizer-hair-workspace" aria-label="Personalização do cabelo"><div className="customizer-catalog-empty">Escolha um modelo para carregar os cabelos do Fabricador Dev.</div></section>
  if (loading) return <section className="customizer-hair-workspace" aria-label="Personalização do cabelo"><div className="customizer-catalog-empty">Carregando cabelos do Fabricador Dev…</div></section>

  const colorOverrides = appearance?.colors ?? {}
  const hasLocalPartColors = (partId: HairPartId) => Object.keys(appearance?.partColors?.[partId] ?? {}).length > 0

  return <section className="customizer-hair-workspace" aria-label="Personalização do cabelo">
    <div className="customizer-hair-layout">
      <div className="customizer-hair-color-controls" aria-label="Paleta geral dos cabelos">
        <div className="customizer-hair-palette-editor">
          <div className="customizer-hair-palette-title"><strong>Paleta geral</strong><span>Uma cor para os cinco cabelos</span><button type="button" onClick={() => void onRestoreColors()} disabled={!appearance || !Object.keys(colorOverrides).length && !Object.values(appearance.partColors ?? {}).some((colors) => Object.keys(colors ?? {}).length)} title="Restaurar as cores originais dos cinco cabelos">Restaurar</button></div>
          <div className="customizer-hair-palette-swatches">{hairColorControls.map((color) => <label className="customizer-hair-color-control" data-role={color.id} key={color.id} title={`${color.label} · aplica a todos os cabelos`}>
            <span>{color.label}</span><input className={activeColorRole === color.id ? 'active' : ''} type="color" aria-label={`${color.label} geral`} value={colorOverrides[color.id] ?? color.fallback} disabled={!hasCharacter} onFocus={() => onActiveColorRoleChange(color.id)} onChange={(event) => void onSetColor(color.id, event.target.value)} />
          </label>)}</div>
        </div>
        <aside className="customizer-hair-palette-presets" aria-label="Paletas prontas">
          <button className="customizer-hair-palette-scroll previous" aria-label="Ver paletas anteriores" onClick={() => paletteStripRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-palette-preset-list" ref={paletteStripRef}>{hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={!hasCharacter} aria-pressed={hairColorControls.every((color) => colorOverrides[color.id] === preset.colors[color.id])} onClick={() => void onApplyPalette(preset.colors)} title={`Aplicar a paleta ${preset.name} aos cinco cabelos`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}</div>
          <button className="customizer-hair-palette-scroll" aria-label="Ver próximas paletas" onClick={() => paletteStripRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
        </aside>
      </div>
      {customizerHairParts.map((part) => {
        const options = styles.filter((summary) => hairStyleSupportsCategory(summary, part.id))
        const selectedId = hairAppearancePartStyleId(appearance, part.id)
        const selectedIndex = options.findIndex((summary) => summary.id === selectedId)
        const selected = selectedIndex >= 0 ? options[selectedIndex] : null
        const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
        const slotCount = options.length + 1
        const asset = selected ? details[`${selected.modelSlot}:${selected.id}`]?.[part.side] : null
        const pieceColors = resolvedHairColors(appearance, part.id)
        const chooseAt = (index: number) => {
          const slot = wrapSlotIndex(index, slotCount)
          void onChooseStyle(part.id, slot === 0 ? null : options[slot - 1])
        }
        return <article className="customizer-hair-piece" key={part.id}>
          <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{hasLocalPartColors(part.id) && <button className="customizer-hair-reset" onClick={() => void onResetPartColors(part.id)} title={`Voltar ${part.label} à paleta geral`} type="button">Usar paleta geral</button>}</header>
          <div className="customizer-hair-piece-selector">
            <button aria-label={`Peça anterior: ${part.label}`} onClick={() => chooseAt(selectedSlot - 1)} disabled={!options.length || !hasCharacter} type="button"><Icon name="chevronRight" /></button>
            <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${part.label}`} title={`Abrir biblioteca de ${part.label}`} onClick={() => { onSetLibraryPage(0); onSetLibraryPart(part.id) }} type="button">
              {asset ? <HairAssetPreview source={asset.dataUrl} colors={pieceColors} alt={selected?.name ?? ''} /> : null}
            </button>
            <button aria-label={`Próxima peça: ${part.label}`} onClick={() => chooseAt(selectedSlot + 1)} disabled={!options.length || !hasCharacter} type="button"><Icon name="chevronRight" /></button>
            <div className="customizer-hair-piece-colors" aria-label={`Cores de ${part.label}`}>
              {hairColorControls.map((color) => <label key={color.id} className={appearance?.partColors?.[part.id]?.[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': pieceColors[color.id] ?? color.fallback } as import('react').CSSProperties} title={`${color.label} de ${part.label} · ${appearance?.partColors?.[part.id]?.[color.id] ? 'ajuste individual' : 'paleta geral'}`}>
                <input type="color" aria-label={`${color.label} de ${part.label}`} value={pieceColors[color.id] ?? color.fallback} disabled={!hasCharacter || !asset} onFocus={() => onActiveColorRoleChange(color.id)} onChange={(event) => void onSetPartColor(part.id, color.id, event.target.value)} />
                <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
              </label>)}
            </div>
          </div>
          <PiecePaletteStrip label={part.label} colors={appearance?.partColors?.[part.id]} disabled={!hasCharacter || !asset} onSelect={(colors) => void onApplyPartPalette(part.id, colors)} />
        </article>
      })}
    </div>
  </section>
}
