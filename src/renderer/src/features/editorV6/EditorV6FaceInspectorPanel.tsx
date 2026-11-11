import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Element, EditorV6FaceTransform } from '../../../../shared/editorV6'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceSheetKind } from '../../../../shared/fabricator'
import { NumericRangeField } from '../../ui/components/NumericRangeField'
import { SceneFaceCatalogPanel } from '../../characters/SceneFaceCatalogPanel'
import { resolveSceneFaceTransform, type SceneFaceCategory } from '../../characters/sceneFaceSelection'
import type { SceneFaceMode } from '../../../../shared/sceneFaceValidation'

type TransformField = 'x' | 'y' | 'width' | 'height' | 'rotation'

export type EditorV6FaceInspectorPanelProps = {
  modelSlot: number
  category: SceneFaceCategory
  sheetKind: FaceSheetKind
  selectedItemId?: string
  items: readonly FaceCatalogItemSummary[]
  details: Readonly<Record<string, FaceCatalogItem>>
  appearance?: CustomizerFaceAppearance
  faceMode: SceneFaceMode
  faceBusy: boolean
  expressionBusy: boolean
  catalogLoading: boolean
  detailsLoading: boolean
  talkAvailable: boolean
  element: EditorV6Element
  onCategoryChange: (category: SceneFaceCategory) => void
  onFaceModeChange: (mode: 'idle' | 'talk') => void
  onSheetSelect: (summary: FaceCatalogItemSummary) => void
  onAppearanceChange: (patch: Partial<CustomizerFaceAppearance>) => void
  onUpdateTransform: (key: string, patch: Partial<EditorV6FaceTransform>, record: boolean | undefined, current: EditorV6FaceTransform) => void
  onFinishTransform: (key: string) => void
  onRecordHistory: () => void
}

/** Editor V6's face catalog and per-sheet placement controls for the selected actor. */
export function EditorV6FaceInspectorPanel({
  modelSlot, category, sheetKind, selectedItemId, items, details, appearance, faceMode,
  faceBusy, expressionBusy, catalogLoading, detailsLoading, talkAvailable, element,
  onCategoryChange, onFaceModeChange, onSheetSelect, onAppearanceChange,
  onUpdateTransform, onFinishTransform, onRecordHistory
}: EditorV6FaceInspectorPanelProps) {
  const catalogItems = items.filter(item => item.modelSlot === modelSlot && item.category === sheetKind)
  const activeItem = selectedItemId ? details[`${modelSlot}:${selectedItemId}`] ?? null : null
  const { transformKey, transform } = resolveSceneFaceTransform(category, sheetKind, selectedItemId, appearance, element.faceTransforms)
  const control = (label: string, field: TransformField, min: number, max: number, suffix = '%') => (
    <NumericRangeField key={label} label={label} value={transform[field]} onChange={(value, record) => onUpdateTransform(transformKey, { [field]: value }, record, transform)} onStart={onRecordHistory} onFinish={() => onFinishTransform(transformKey)} disabled={faceBusy} min={min} max={max} suffix={suffix} />
  )

  return <SceneFaceCatalogPanel
    category={category} sheetKind={sheetKind} selectedItemId={selectedItemId}
    catalogItems={catalogItems} activeItem={activeItem} appearance={appearance}
    faceMode={faceMode} faceBusy={faceBusy} expressionBusy={expressionBusy}
    catalogLoading={catalogLoading} detailsLoading={detailsLoading} talkAvailable={talkAvailable}
    emptyEyesMessage={selectedItemId ? 'A folha de olhos selecionada ainda não está disponível.' : 'Escolha uma folha de olhos para ver as três variantes.'}
    onCategoryChange={onCategoryChange} onFaceModeChange={onFaceModeChange}
    onSheetSelect={onSheetSelect} onAppearanceChange={onAppearanceChange}
  >
    <div className="studio-controls-grid studio-custom-eye-controls">
      {control('X', 'x', -100, 100)}
      {control('Y', 'y', -100, 100)}
      {control('Largura', 'width', 1, 300)}
      {control('Altura', 'height', 1, 300)}
      {control('Rotação', 'rotation', -180, 180, '°')}
    </div>
    {faceBusy && <p className="studio-custom-hint" role="status">Atualizando personagem…</p>}
  </SceneFaceCatalogPanel>
}
