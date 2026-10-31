import { useRef } from 'react'
import { normalizeCharacterColorOverrides } from '../../../../shared/customizer'
import type { CharacterColorOverrides, CharacterPaletteOverrides, CharacterPaletteRole, CustomizerFaceAppearance, CustomizerWardrobeGroup, CustomizerWardrobePaletteKey } from '../../../../shared/customizer'
import { Icon } from '../../ui/components/Icon'
import { characterWardrobePresetSwatchGradient, hairColorControls, hairPalettePresets } from './CustomizerAppearanceControls'
import { WardrobePanelCandidatePreview } from './CustomizerAssetPreviews'
import { isWardrobePanelCandidateSelected } from './wardrobePanelModel'
import type { WardrobePanel, WardrobePanelCandidate } from './wardrobePanelModel'

type WardrobePanelCandidateIndex = ReadonlyMap<WardrobePanel['id'], readonly WardrobePanelCandidate[]>
type WardrobePaletteMap = Partial<Record<CustomizerWardrobePaletteKey, CharacterColorOverrides>>
const wardrobePresetColorRoles = ['outline', 'shadow', 'base'] as const

export function CustomizerWardrobeCatalogWorkspace({
  loading,
  catalogError,
  unavailableWardrobeSetCount,
  repairingUnavailableLinks,
  section,
  page,
  pageTwo,
  panels,
  libraryPanel,
  libraryPage,
  candidatesByPanel,
  selectedModelSlot,
  hasCharacter,
  wardrobeGroups,
  faceAppearance,
  wardrobePalettes,
  onRemoveUnavailableLinks,
  onSetLibraryPanel,
  onSetLibraryPage,
  onApplyPanel,
  onSetPieceColor,
  onApplyPalette,
  onResetPieceColors
}: {
  loading: boolean
  catalogError: string | null
  unavailableWardrobeSetCount: number
  repairingUnavailableLinks: boolean
  section: 'Superior' | 'Inferior'
  page: number
  pageTwo: boolean
  panels: readonly WardrobePanel[]
  libraryPanel: WardrobePanel | null
  libraryPage: number
  candidatesByPanel: WardrobePanelCandidateIndex
  selectedModelSlot: number | null
  hasCharacter: boolean
  wardrobeGroups: CustomizerWardrobeGroup[]
  faceAppearance?: CustomizerFaceAppearance
  wardrobePalettes?: WardrobePaletteMap
  onRemoveUnavailableLinks: () => void | Promise<void>
  onSetLibraryPanel: (panel: WardrobePanel | null) => void
  onSetLibraryPage: (update: number | ((current: number) => number)) => void
  onApplyPanel: (panel: WardrobePanel, candidate: WardrobePanelCandidate | null) => void | Promise<void>
  onSetPieceColor: (panel: WardrobePanel, candidate: WardrobePanelCandidate, role: CharacterPaletteRole, value: string) => void | Promise<void>
  onApplyPalette: (panel: WardrobePanel, candidate: WardrobePanelCandidate, colors: CharacterPaletteOverrides) => void | Promise<void>
  onResetPieceColors: (panel: WardrobePanel, setId: string, componentIds: string[]) => void | Promise<void>
}) {
  const paletteStripRefs = useRef<Record<string, HTMLDivElement | null>>({})

  function renderLibrary() {
    if (!libraryPanel) return null
    const candidates = candidatesByPanel.get(libraryPanel.id) ?? []
    const slots: Array<(typeof candidates)[number] | null> = [null, ...candidates]
    const pageSize = 20
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const currentPage = Math.min(libraryPage, pageCount - 1)
    const visible = slots.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    const selectedIndex = candidates.findIndex((candidate) => isWardrobePanelCandidateSelected(candidate, libraryPanel, wardrobeGroups, faceAppearance))
    const clearPanel = () => void onApplyPanel(libraryPanel, null)

    return <section className="customizer-hair-library" aria-labelledby="customizer-upper-wardrobe-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={clearPanel} disabled={selectedIndex < 0} aria-label={`Remover ${libraryPanel.label} do personagem`} title={`Remover ${libraryPanel.label} do personagem`}><Icon name="trash" /></button>
        <h2 id="customizer-upper-wardrobe-library-title">{libraryPanel.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => onSetLibraryPanel(null)} aria-label="Fechar biblioteca">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={`Biblioteca de ${libraryPanel.label}`}>
        {visible.map((entry) => {
          if (!entry) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${libraryPanel.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={clearPanel} />
          const selected = entry.summary.id === candidates[selectedIndex]?.summary.id && entry.component.id === candidates[selectedIndex]?.component.id
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={`${entry.summary.modelSlot}:${entry.summary.id}:${entry.component.id}`} title={entry.component.name} aria-label={`Selecionar ${entry.component.name}`} aria-pressed={selected} type="button" onClick={() => { void onApplyPanel(libraryPanel, entry); onSetLibraryPanel(null) }}>
            <WardrobePanelCandidatePreview candidate={entry} />
          </button>
        })}
        {!candidates.length && <p className="customizer-hair-library-empty">Nenhuma peça salva para {libraryPanel.label}. Importe e classifique uma peça no Fabricador Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => onSetLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{currentPage + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={currentPage >= pageCount - 1} onClick={() => onSetLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  function renderPanels() {
    return <div className={`customizer-hair-layout customizer-upper-wardrobe-layout${section === 'Superior' && pageTwo ? ' page-two' : ''}${section === 'Inferior' && pageTwo ? ' lower-page-two' : ''}`} aria-label={`Peças de roupa ${section.toLowerCase()} · página ${page}`}>
      {panels.map((panel) => {
        const candidates = candidatesByPanel.get(panel.id) ?? []
        const selectedIndex = candidates.findIndex((candidate) => isWardrobePanelCandidateSelected(candidate, panel, wardrobeGroups, faceAppearance))
        const currentCandidate = selectedIndex >= 0 ? candidates[selectedIndex] : null
        const currentGroup = currentCandidate ? wardrobeGroups.find((group) => group.modelSlot === currentCandidate.summary.modelSlot && group.setId === currentCandidate.summary.id && group.category === panel.category && group.componentId === currentCandidate.component.id) : undefined
        const wardrobePalette = wardrobePalettes?.[panel.id]
        const colors: CharacterColorOverrides | undefined = wardrobePalette || currentGroup?.colors
          ? { ...wardrobePalette, ...currentGroup?.colors }
          : undefined
        const displayColors = normalizeCharacterColorOverrides(colors)
        const hasLocalColors = Object.keys(colors ?? {}).length > 0
        const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
        const slotCount = candidates.length + 1
        const move = (direction: -1 | 1) => {
          const nextSlot = (selectedSlot + direction + slotCount) % slotCount
          void onApplyPanel(panel, nextSlot === 0 ? null : candidates[nextSlot - 1])
        }

        return <article className={`customizer-hair-piece customizer-upper-wardrobe-piece customizer-wardrobe-piece-${panel.id}`} key={panel.id} aria-label={panel.label}>
          <header><strong>{panel.label} {selectedSlot + 1}/{candidates.length + 1}</strong>{hasLocalColors && currentCandidate && <button className="customizer-hair-reset" type="button" onClick={() => void onResetPieceColors(panel, currentCandidate.summary.id, currentCandidate.components.map((component) => component.id))}>Restaurar</button>}</header>
          <div className="customizer-hair-piece-selector customizer-upper-wardrobe-selector">
            <button aria-label={`Peça anterior: ${panel.label}`} onClick={() => move(-1)} disabled={!candidates.length || !hasCharacter || selectedModelSlot === null} type="button"><Icon name="chevronRight" /></button>
            <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${panel.label}`} title={`Abrir biblioteca de ${panel.label}`} onClick={() => { onSetLibraryPage(0); onSetLibraryPanel(panel) }} type="button">
              {currentCandidate ? <WardrobePanelCandidatePreview candidate={currentCandidate} colors={colors} /> : <span>Escolha uma peça</span>}
            </button>
            <button aria-label={`Próxima peça: ${panel.label}`} onClick={() => move(1)} disabled={!candidates.length || !hasCharacter || selectedModelSlot === null} type="button"><Icon name="chevronRight" /></button>
            <div className="customizer-hair-piece-colors" aria-label={`Cores de ${panel.label}`}>
              {hairColorControls.map((color) => <label key={color.id} className={displayColors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': displayColors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${panel.label}`}>
                <input type="color" aria-label={`${color.label} de ${panel.label}`} value={displayColors[color.id] ?? color.fallback} disabled={!hasCharacter || !currentCandidate} onChange={(event) => currentCandidate && void onSetPieceColor(panel, currentCandidate, color.id, event.target.value)} />
                <span aria-hidden="true">{color.id === 'detail' ? 'D' : color.id === 'light' ? 'CS' : color.id === 'shadow' ? 'S' : color.id === 'outline' ? 'C' : 'B'}</span>
              </label>)}
            </div>
          </div>
          <div className="customizer-upper-piece-colors" aria-label={`Paletas de ${panel.label}`}>
            <div className="customizer-upper-piece-colors-heading"><strong>{currentCandidate?.component.name ?? 'Paleta da peça'}</strong></div>
            <div className="customizer-hair-palette-presets customizer-upper-piece-palette-presets">
              <button className="customizer-hair-palette-scroll previous" aria-label={`Ver paletas anteriores de ${panel.label}`} onClick={() => paletteStripRefs.current[panel.id]?.scrollBy({ left: -180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
              <div className="customizer-hair-palette-preset-list" ref={(node) => { paletteStripRefs.current[panel.id] = node }}>
                {hairPalettePresets.map((preset) => {
                  const presetColors = {
                    ...displayColors,
                    outline: preset.colors.outline,
                    shadow: preset.colors.shadow,
                    base: preset.colors.base
                  }
                  const presetSelected = wardrobePresetColorRoles.every((role) => displayColors[role] === preset.colors[role])
                  return <button key={preset.name} type="button" disabled={!hasCharacter || !currentCandidate} aria-pressed={presetSelected} onClick={() => currentCandidate && void onApplyPalette(panel, currentCandidate, presetColors)} title={`Aplicar ${preset.name} ao contorno, sombra e cor base de ${panel.label}`}><span style={{ background: characterWardrobePresetSwatchGradient(preset.colors) }} />{preset.name}</button>
                })}
              </div>
              <button className="customizer-hair-palette-scroll" aria-label={`Ver próximas paletas de ${panel.label}`} onClick={() => paletteStripRefs.current[panel.id]?.scrollBy({ left: 180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
            </div>
          </div>
        </article>
      })}
    </div>
  }

  return <div className="customizer-wardrobe-catalog">
    {loading ? <div className="customizer-catalog-empty">Carregando roupas…</div> : <>
      {catalogError && <p className="customizer-catalog-error" role="alert">{catalogError}</p>}
      {unavailableWardrobeSetCount > 0 && <div className="customizer-wardrobe-reference-notice" role="status"><span>{unavailableWardrobeSetCount} conjunto(s) de roupa não estão disponíveis. Os vínculos foram preservados, mas essas roupas não podem aparecer.</span><button type="button" disabled={repairingUnavailableLinks} onClick={() => void onRemoveUnavailableLinks()}>{repairingUnavailableLinks ? 'Salvando…' : 'Remover vínculos indisponíveis'}</button></div>}
      {libraryPanel ? renderLibrary() : renderPanels()}
    </>}
  </div>
}
