import type { ReactNode } from 'react'
import type { CustomizerFaceAppearance } from '../../../shared/customizer'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceSheetKind } from '../../../shared/fabricator'
import type { SceneFaceMode } from '../../../shared/sceneFaceValidation'
import type { SceneFaceCategory } from './sceneFaceSelection'

const FACE_CATEGORIES: Array<{ id: SceneFaceCategory; label: string }> = [
  { id: 'eyes', label: 'Olhos' },
  { id: 'eyebrows', label: 'Sobrancelhas' },
  { id: 'nose', label: 'Nariz' },
  { id: 'mouth', label: 'Boca' }
]

type SceneFaceCatalogPanelProps = {
  category: SceneFaceCategory
  sheetKind: FaceSheetKind
  selectedItemId?: string | null
  catalogItems: readonly FaceCatalogItemSummary[]
  activeItem: FaceCatalogItem | null
  appearance?: CustomizerFaceAppearance
  faceMode: SceneFaceMode
  faceBusy: boolean
  expressionBusy: boolean
  catalogLoading: boolean
  detailsLoading?: boolean
  talkAvailable: boolean
  emptyEyesMessage: string
  onCategoryChange: (category: SceneFaceCategory) => void
  onFaceModeChange: (mode: 'idle' | 'talk') => void
  onSheetSelect: (summary: FaceCatalogItemSummary) => void
  onAppearanceChange: (patch: Partial<CustomizerFaceAppearance>) => void
  children?: ReactNode
}

function renderEyePair(pieces: FaceCatalogItem['pieces']) {
  return pieces.slice(0, 2).map((piece) => <img key={piece.id} src={piece.dataUrl} alt="" />)
}

/** Shared catalog and variant controls; each editor keeps its own cache and render/save path. */
export function SceneFaceCatalogPanel({
  category,
  sheetKind,
  selectedItemId,
  catalogItems,
  activeItem,
  appearance,
  faceMode,
  faceBusy,
  expressionBusy,
  catalogLoading,
  detailsLoading = false,
  talkAvailable,
  emptyEyesMessage,
  onCategoryChange,
  onFaceModeChange,
  onSheetSelect,
  onAppearanceChange,
  children
}: SceneFaceCatalogPanelProps) {
  const sheetLabel = category === 'eyes' ? 'Folha de olhos'
    : category === 'eyebrows' ? 'Folha de sobrancelhas'
      : category === 'nose' ? 'Folha de nariz' : 'Folha de boca'
  const displayedEyeState = faceMode === 'blink' ? 2 : appearance?.eyeState === 1 ? 1 : 0

  return <div className="studio-custom-face">
    <div className="studio-custom-face-categories" aria-label="Categorias do rosto">
      {FACE_CATEGORIES.map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => onCategoryChange(item.id)} type="button">{item.label}</button>)}
    </div>
    {category === 'mouth' && <div className="studio-custom-mouth-tabs"><button className={faceMode !== 'talk' ? 'active' : ''} onClick={() => onFaceModeChange('idle')} disabled={!appearance || faceBusy || expressionBusy} type="button">Fechada</button><button className={faceMode === 'talk' ? 'active' : ''} onClick={() => onFaceModeChange('talk')} disabled={!appearance || faceBusy || expressionBusy || !talkAvailable} type="button">Aberta</button></div>}
    <label className="studio-custom-eye-sheet-select"><span>{sheetLabel}</span><select value={selectedItemId ?? ''} onChange={(event) => { const summary = catalogItems.find((item) => item.id === event.target.value); if (summary) onSheetSelect(summary) }} disabled={faceBusy || catalogLoading}><option value="">Selecione uma folha</option>{catalogItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {catalogLoading && <p className="studio-custom-hint">Carregando catálogo facial…</p>}
    {detailsLoading && <p className="studio-custom-hint">Carregando imagens da folha facial selecionada…</p>}
    {category === 'eyebrows' && appearance?.eyebrowCatalogId && <button className={`studio-custom-toggle${appearance.eyebrows ? ' active' : ''}`} onClick={() => onAppearanceChange({ eyebrows: !appearance.eyebrows })} disabled={faceBusy} type="button">{appearance.eyebrows ? 'Ocultar sobrancelhas' : 'Mostrar sobrancelhas'}</button>}
    {sheetKind === 'eyes' && <>
      {activeItem ? <div className="studio-custom-face-variants">{[0, 1, 2].map((index) => {
        const pieces = activeItem.pieces.filter((piece) => piece.index === index)
        const labels = ['Direita', 'Esquerda', 'Fechados']
        return <button className={displayedEyeState === index ? 'selected' : ''} key={index} onClick={() => onAppearanceChange({ eyeState: index as 0 | 1 | 2 })} disabled={faceBusy} type="button"><span>{renderEyePair(pieces)}</span><b>{labels[index]}</b></button>
      })}</div> : <p className="studio-custom-hint">{emptyEyesMessage}</p>}
    </>}
    {activeItem && <>
      {sheetKind === 'nose' && <div className="studio-custom-face-variants studio-custom-face-grid">{activeItem.pieces.map((piece) => <button className={appearance?.noseIndex === piece.index ? 'selected' : ''} key={piece.id} onClick={() => onAppearanceChange({ noseIndex: piece.index })} disabled={faceBusy} type="button"><span><img src={piece.dataUrl} alt="" /></span><b>{piece.index + 1}</b></button>)}</div>}
      {sheetKind.startsWith('mouth') && <div className="studio-custom-face-variants studio-custom-face-grid">{activeItem.pieces.map((piece) => <button className={appearance?.expressionIndex === piece.index ? 'selected' : ''} key={piece.id} onClick={() => onAppearanceChange({ expressionIndex: piece.index })} disabled={faceBusy} type="button"><span><img src={piece.dataUrl} alt="" /></span><b>{String(piece.index + 1).padStart(2, '0')}</b></button>)}</div>}
    </>}
    {children}
  </div>
}
