import { compilePortableExpression, resolvePresetPupilGaze, type ExpressionMetrics } from '../../../../shared/portableExpression'
import { pupilDeltaFromDrag, pupilSourceMirrored } from '../../../../shared/facePupilGeometry'
import { faceExpressionDefaults as defaultTransforms } from '../../../../shared/faceExpressionDefaults'
import { FACE_COMPONENT_SELECTION_STORAGE_KEY, pickFaceLibraryBase, savedFaceLibraryParts } from '../../../../shared/faceLibrarySelection'
import { ExpressionCharacterPreview } from './ExpressionCharacterPreview'
import { projectForOriginalPreview } from '../../../../shared/fabricatorModelViews'
import { useModelSourceRefresh } from './models/useModelSourceRefresh'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSummary, FaceExpressionCollection, FaceExpressionPreset, FaceExpressionPresetSummary, FaceExpressionEffects, FaceExpressionTransforms, FaceExpressionWorkspaceDraft, FaceExpressionWorkspaceEntry, FaceTransform, FabricatorProject } from '../../../../shared/fabricator'
import { Icon, type IconName } from '../../ui/components/Icon'
import { eyeInteriorMask } from './face/eyeInteriorMask'

type Side = 'left' | 'right'
type PickerCategory = 'eyes' | 'pupils' | 'eyebrows' | 'nose' | 'mouth'
type ComponentKind = 'eye' | 'pupil' | 'eyebrow'
type PairedLayerKind = ComponentKind
type ComponentOption = { key: string; kind: ComponentKind; name: string; leftId: string; rightId: string; ids: string[] }
type CatalogOption = { key: string; item: FaceCatalogItemSummary; ids: string[] }
type ExpressionWorkingCopy = { id: string; composition: ExpressionComposition; transforms: FaceExpressionTransforms; noseOpacity: number; effects: FaceExpressionEffects }
type ExpressionComposition = {
  eyes: Record<Side, string | null>
  pupils: Record<Side, string | null>
  eyebrows: Record<Side, string | null>
  nose: { catalogId: string; index: number } | null
  mouth: { catalogId: string; kind: 'mouth-closed' | 'mouth-open'; index: number } | null
}
type LayerKey = keyof FaceExpressionTransforms
type PreviewLayerMapping = { layer: LayerKey; startX: number; startY: number; mirroredX: boolean; rotation: number }
type PreviewLayerDrag = {
  pointerId: number
  clientX: number
  clientY: number
  modelPerPixelX: number
  modelPerPixelY: number
  mappings: PreviewLayerMapping[]
}
type PreviewEffectDrag = { pointerId: number; clientX: number; clientY: number; offsetX: number; offsetY: number }
const presetLayerPairs: Array<{ kind: PairedLayerKind; label: string; keys: [LayerKey, LayerKey]; labels: [string, string] }> = [
  { kind: 'eye', label: 'Olhos', keys: ['eyeLeft', 'eyeRight'], labels: ['Olho esquerdo', 'Olho direito'] },
  { kind: 'pupil', label: 'Pupilas', keys: ['pupilLeft', 'pupilRight'], labels: ['Pupila esquerda', 'Pupila direita'] },
  { kind: 'eyebrow', label: 'Sobrancelhas', keys: ['browLeft', 'browRight'], labels: ['Sobrancelha esquerda', 'Sobrancelha direita'] }
]
const presetSingleLayers: Array<{ key: LayerKey; label: string; icon: IconName }> = [
  { key: 'nose', label: 'Nariz', icon: 'face' }, { key: 'mouth', label: 'Boca', icon: 'message' }
]
const EXPRESSION_COLLECTION_ID = 'standard'
const expressionWorkingCopyKey = (collectionId: string, index: number) => `${collectionId}:${index}`
const expressionWorkspaceDraftStorageKey = (modelSlot: number) => `fabricator.expression-workspace-draft.v1.model-${modelSlot}`
const toWorkspaceEntry = (copy: ExpressionWorkingCopy): FaceExpressionWorkspaceEntry => ({
  id: copy.id, selections: structuredClone(copy.composition), transforms: cloneTransforms(copy.transforms),
  noseOpacity: copy.noseOpacity, effects: cloneEffects(copy.effects)
})
const fromWorkspaceEntry = (entry: FaceExpressionWorkspaceEntry): ExpressionWorkingCopy => ({
  id: entry.id, composition: structuredClone(entry.selections), transforms: cloneTransforms(entry.transforms),
  noseOpacity: entry.noseOpacity, effects: cloneEffects(entry.effects)
})
function isWorkspaceDraftForModel(value: unknown, modelSlot: number): value is FaceExpressionWorkspaceDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<FaceExpressionWorkspaceDraft>
  const validEntry = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as FaceExpressionWorkspaceEntry
    const transformKeys: Array<keyof FaceExpressionTransforms> = ['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'browLeft', 'browRight', 'nose', 'mouth']
    return typeof candidate.id === 'string' && !!candidate.selections && typeof candidate.selections === 'object'
      && !!candidate.transforms && transformKeys.every((key) => {
        const transform = candidate.transforms[key]
        return !!transform && [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      }) && Number.isFinite(candidate.noseOpacity) && candidate.noseOpacity >= 0 && candidate.noseOpacity <= 1
      && !!candidate.effects && typeof candidate.effects === 'object'
  }
  return draft.schemaVersion === 1 && draft.modelSlot === modelSlot && typeof draft.selectedCollectionId === 'string'
    && Number.isInteger(draft.selectedExpressionIndex) && Number(draft.selectedExpressionIndex) >= 0 && Number(draft.selectedExpressionIndex) <= 999
    && validEntry(draft.current) && !!draft.workingCopies && typeof draft.workingCopies === 'object'
    && Object.values(draft.workingCopies).every(validEntry)
    && !!draft.customExpressionNames && typeof draft.customExpressionNames === 'object'
    && Object.values(draft.customExpressionNames).every((name) => typeof name === 'string')
    && typeof draft.updatedAt === 'string' && Number.isFinite(Date.parse(draft.updatedAt))
}
const STANDARD_EXPRESSIONS = [
  'Aliviada', 'Animada', 'Apaixonada', 'Cansada', 'Ciumenta', 'Confusa', 'Decepcionada',
  'Desconfiada', 'Envergonhada', 'Impressionada', 'Indignada', 'Irritada', 'Nojo', 'Normal',
  'Orgulhosa', 'Preocupada', 'Séria', 'Sorrindo de canto', 'Sorriso maligno', 'Surpresa', 'Triste/magoada'
] as const
const defaultExpressionEffects = (): FaceExpressionEffects => ({ shadow: { enabled: false, color: '#4b3542', opacity: .38, softness: .55, size: .42, offsetY: 0 }, blush: { enabled: false, color: '#f0789c', opacity: .48, softness: .72, size: .68, offsetX: 0, offsetY: .04, aspectRatio: .52, style: 'cheeks' }, mouthBlush: { enabled: false, color: '#e86388', opacity: .38, softness: .78, size: .12, width: .12, height: .0624, rotation: 0, offsetY: 0, aspectRatio: .52 } })
const cloneEffects = (effects?: FaceExpressionEffects): FaceExpressionEffects => structuredClone(effects ?? defaultExpressionEffects())
const identityTransform = (): FaceTransform => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
const emptyTransforms = (): FaceExpressionTransforms => ({ eyeLeft: identityTransform(), eyeRight: identityTransform(), pupilLeft: identityTransform(), pupilRight: identityTransform(), browLeft: identityTransform(), browRight: identityTransform(), nose: identityTransform(), mouth: identityTransform() })
const cloneTransforms = (transforms: FaceExpressionTransforms): FaceExpressionTransforms => structuredClone(transforms)
const layerKey = (kind: 'eye' | 'pupil' | 'eyebrow', side: Side): LayerKey => kind === 'eye' ? side === 'left' ? 'eyeLeft' : 'eyeRight' : kind === 'pupil' ? side === 'left' ? 'pupilLeft' : 'pupilRight' : side === 'left' ? 'browLeft' : 'browRight'
const pairedLayerKeys: Partial<Record<LayerKey, LayerKey>> = { eyeLeft: 'eyeRight', eyeRight: 'eyeLeft', pupilLeft: 'pupilRight', pupilRight: 'pupilLeft', browLeft: 'browRight', browRight: 'browLeft' }
const pairedKindForLayer = (layer: LayerKey): PairedLayerKind | null => layer.startsWith('eye') ? 'eye' : layer.startsWith('pupil') ? 'pupil' : layer.startsWith('brow') ? 'eyebrow' : null

function rebaseTransform(transform: FaceTransform, reference: FaceTransform, nextReference: FaceTransform): FaceTransform {
  const rebased: FaceTransform = {
    ...nextReference,
    x: nextReference.x + transform.x - reference.x,
    y: nextReference.y + transform.y - reference.y,
    scaleX: Math.max(.02, Math.min(20, nextReference.scaleX * transform.scaleX / reference.scaleX)),
    scaleY: Math.max(.02, Math.min(20, nextReference.scaleY * transform.scaleY / reference.scaleY)),
    rotation: nextReference.rotation + transform.rotation - reference.rotation
  }
  if (Boolean(transform.flipX) !== Boolean(reference.flipX)) {
    const flipX = !Boolean(nextReference.flipX)
    if (flipX) rebased.flipX = true
    else delete rebased.flipX
  }
  return rebased
}

/** Metrics are captured when authoring, never read from the original PNG to apply a preset later. */
function authoredMetrics(composition: ExpressionComposition, components: Record<string,FaceComponentAsset>, catalogs: Record<string,FaceCatalogItem>): ExpressionMetrics {
  const metrics: ExpressionMetrics = {}
  for(const side of ['left','right'] as const){
    const suffix=side==='left'?'Left':'Right'
    const eye=composition.eyes[side] ? components[composition.eyes[side]!] : undefined
    const brow=composition.eyebrows[side] ? components[composition.eyebrows[side]!] : undefined
    if(eye){
      metrics[`eye${suffix}`]={width:eye.width,height:eye.height,mirrored:side==='right' && !eye.rightSidePositioned}
      // Pupil offsets use eye dimensions but the PUPIL's own mirror orientation.
      const pupilId=composition.pupils[side]
      const pupil=pupilId ? components[pupilId] : undefined
      metrics[`pupil${suffix}`]={width:eye.width,height:eye.height,mirrored:side==='right' && !pupil?.rightSidePositioned}
    }
    if(brow)metrics[`brow${suffix}`]={width:brow.width,height:brow.height,mirrored:side==='right' && !brow.rightSidePositioned}
  }
  if(composition.nose){
    const piece=catalogs[composition.nose.catalogId]?.pieces.find(item=>item.sheet==='nose' && item.index===composition.nose?.index)
    if(piece)metrics.nose={width:piece.width,height:piece.height}
  }
  if(composition.mouth){
    const piece=catalogs[composition.mouth.catalogId]?.pieces.find(item=>item.sheet===composition.mouth?.kind && item.index===composition.mouth?.index)
    if(piece)metrics.mouth={width:piece.width,height:piece.height}
  }
  return metrics
}

function motionForPublishedPreset(
  transforms: FaceExpressionTransforms,
  reference: FaceExpressionTransforms,
  selection: ExpressionComposition,
  components: Record<string,FaceComponentAsset>,
  catalogs: Record<string,FaceCatalogItem>,
  previous?: FaceExpressionPreset | null
) {
  const compiled=compilePortableExpression(transforms,reference,authoredMetrics(selection,components,catalogs))
  const old=previous && JSON.stringify(previous.selections)===JSON.stringify(selection)
    ? previous.portableMotion?.layers : undefined
  const layers={...old,...compiled.layers}
  return Object.keys(layers).length ? {version:1 as const,layers} : undefined
}

function rebaseExpressionTransforms(
  transforms: FaceExpressionTransforms,
  reference: FaceExpressionTransforms,
  nextReference: FaceExpressionTransforms
): FaceExpressionTransforms {
  const keys: LayerKey[] = ['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'browLeft', 'browRight', 'nose', 'mouth']
  return Object.fromEntries(keys.map((key) => [key, rebaseTransform(transforms[key], reference[key], nextReference[key])])) as FaceExpressionTransforms
}

function compositionForExpression(composition: ExpressionComposition, index: number, catalogs: Record<string, FaceCatalogItem>): ExpressionComposition {
  const next = structuredClone(composition)
  if (next.nose) {
    const nose = catalogs[next.nose.catalogId]
    if (nose && !nose.pieces.some((piece) => piece.index === next.nose!.index)) next.nose.index = nose.pieces[0]?.index ?? 0
  }
  if (next.mouth) {
    const mouth = catalogs[next.mouth.catalogId]
    if (mouth?.pieces.some((piece) => piece.index === index)) next.mouth.index = index
    else if (mouth && !mouth.pieces.some((piece) => piece.index === next.mouth!.index)) next.mouth.index = mouth.pieces[0]?.index ?? 0
  }
  return next
}

const emptyComposition: ExpressionComposition = {
  eyes: { left: null, right: null }, pupils: { left: null, right: null }, eyebrows: { left: null, right: null }, nose: null, mouth: null
}

function componentSide(asset: FaceComponentAssetSummary): Side {
  return asset.rightSidePositioned || /direit[oa]$/i.test(asset.name) ? 'right' : 'left'
}

function findPairedAsset(asset: FaceComponentAssetSummary, assets: FaceComponentAssetSummary[]): FaceComponentAssetSummary | undefined {
  return assets.find((candidate) => candidate.id !== asset.id && candidate.kind === asset.kind && componentSide(candidate) === 'right'
    && Boolean(asset.pairId && candidate.pairId === asset.pairId))
    ?? assets.find((candidate) => candidate.id !== asset.id && candidate.kind === asset.kind && componentSide(candidate) === 'right'
    && candidate.name.replace(/\s*[·-]\s*(?:Olho|Pupila|Sobrancelha)\s*(?:esquerd[oa]|direit[oa])$/i, '') === asset.name.replace(/\s*[·-]\s*(?:Olho|Pupila|Sobrancelha)\s*(?:esquerd[oa]|direit[oa])$/i, ''))
}

function componentBaseName(name: string): string {
  return name.replace(/\s*[·-]\s*(?:Olho(?: aberto| fechado)?|Pupila|Sobrancelha)\s*(?:esquerd[oa]|direit[oa])$/i, '').trim()
}

function buildComponentOptions(kind: ComponentKind, summaries: FaceComponentAssetSummary[], details: Record<string, FaceComponentAsset>): ComponentOption[] {
  const remaining = summaries.filter((asset) => asset.kind === kind)
  const groups: FaceComponentAssetSummary[][] = []
  while (remaining.length) {
    const group = [remaining.shift()!]
    let expanded = true
    while (expanded) {
      expanded = false
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index]
        const connected = group.some((member) => {
          const memberDetail = details[member.id]
          const candidateDetail = details[candidate.id]
          const sharedPair = Boolean(member.pairId && candidate.pairId && member.pairId === candidate.pairId)
          const sameImage = Boolean(memberDetail?.dataUrl && candidateDetail?.dataUrl && memberDetail.dataUrl === candidateDetail.dataUrl)
          const pairedNames = componentSide(member) !== componentSide(candidate) && componentBaseName(member.name) === componentBaseName(candidate.name)
          return sharedPair || sameImage || pairedNames
        })
        if (connected) { group.push(remaining.splice(index, 1)[0]); expanded = true }
      }
    }
    groups.push(group)
  }

  return groups.map((group) => {
    const right = group.find((asset) => componentSide(asset) === 'right')
    const left = group.find((asset) => componentSide(asset) === 'left') ?? group.find((asset) => asset.id !== right?.id) ?? right!
    const rightAsset = right ?? left
    const uniqueName = componentBaseName(left.name) || componentBaseName(rightAsset.name) || left.name
    return { key: group.map((asset) => asset.id).sort().join(':'), kind, name: uniqueName, leftId: left.id, rightId: rightAsset.id, ids: group.map((asset) => asset.id) }
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function buildCatalogOptions(summaries: FaceCatalogItemSummary[], items: Record<string, FaceCatalogItem>): CatalogOption[] {
  const groups: Array<{ key: string; item: FaceCatalogItemSummary; ids: string[]; detail?: FaceCatalogItem }> = []
  for (const summary of summaries) {
    const item = items[summary.id]
    const sortedPieces = item?.pieces.slice().sort((a, b) => a.index - b.index)
    const duplicate = item && sortedPieces ? groups.find((group) => {
      const otherPieces = group.detail?.pieces.slice().sort((a, b) => a.index - b.index)
      return group.detail?.category === item.category && Boolean(otherPieces && otherPieces.length === sortedPieces.length
        && otherPieces.every((piece, index) => piece.dataUrl === sortedPieces[index].dataUrl))
    }) : undefined
    const key = `${summary.category}:${summary.id}`
    if (duplicate) duplicate.ids.push(summary.id)
    else groups.push({ key, item: summary, ids: [summary.id], detail: item })
  }
  return groups.map(({ key, item, ids }) => ({ key, item, ids })).sort((a, b) => a.item.name.localeCompare(b.item.name, 'pt-BR'))
}

export function ExpressionPresetWorkspace({ modelSlot }: { modelSlot: number }) {
  const [project, setProject] = useState<FabricatorProject | null>(null)
  useModelSourceRefresh(modelSlot, fresh => setProject(projectForOriginalPreview(fresh)))
  const [componentSummaries, setComponentSummaries] = useState<FaceComponentAssetSummary[]>([])
  const [componentAssets, setComponentAssets] = useState<Record<string, FaceComponentAsset>>({})
  const [catalogSummaries, setCatalogSummaries] = useState<FaceCatalogItemSummary[]>([])
  const [catalogItems, setCatalogItems] = useState<Record<string, FaceCatalogItem>>({})
  const [eyeMasks, setEyeMasks] = useState<Record<string, string>>({})
  const [composition, setComposition] = useState<ExpressionComposition>(emptyComposition)
  const [draft, setDraft] = useState<ExpressionComposition>(emptyComposition)
  const [transforms, setTransforms] = useState<FaceExpressionTransforms>(emptyTransforms())
  const [draftTransforms, setDraftTransforms] = useState<FaceExpressionTransforms>(emptyTransforms())
  const [baseComposition, setBaseComposition] = useState<ExpressionComposition>(emptyComposition)
  const [baseTransforms, setBaseTransforms] = useState<FaceExpressionTransforms>(emptyTransforms())
  const [noseOpacity, setNoseOpacity] = useState(1)
  const [effects, setEffects] = useState<FaceExpressionEffects>(defaultExpressionEffects)
  const [draftNoseOpacity, setDraftNoseOpacity] = useState(1)
  const [baseNoseOpacity, setBaseNoseOpacity] = useState(1)
  const [presets, setPresets] = useState<FaceExpressionPresetSummary[]>([])
  const [collections, setCollections] = useState<FaceExpressionCollection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState(EXPRESSION_COLLECTION_ID)
  const [presetId, setPresetId] = useState<string>(() => crypto.randomUUID())
  const [selectedExpressionIndex, setSelectedExpressionIndex] = useState(0)
  const [previewGaze, setPreviewGaze] = useState<'right'|'left'>('right')
  const [characterComparisonOpen,setCharacterComparisonOpen] = useState(false)
  const [customExpressionNames, setCustomExpressionNames] = useState<Record<string, string>>({})
  const [workingCopies, setWorkingCopies] = useState<Record<string, ExpressionWorkingCopy>>({})
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState<'saving' | 'saved' | 'failed'>('saved')
  const [switchingExpression, setSwitchingExpression] = useState(false)
  const [selectedLayer, setSelectedLayer] = useState<LayerKey>('eyeLeft')
  const [linkedLayerPairs, setLinkedLayerPairs] = useState<Record<PairedLayerKind, boolean>>({ eye: false, pupil: false, eyebrow: false })
  const previewLayerDrag = useRef<PreviewLayerDrag | null>(null)
  const previewEffectDrag = useRef<PreviewEffectDrag | null>(null)
  const previewCanvas = useRef<HTMLDivElement | null>(null)
  const workspaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestWorkspaceDraft = useRef<FaceExpressionWorkspaceDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<PickerCategory>('eyes')
  const [mouthKind, setMouthKind] = useState<'mouth-closed' | 'mouth-open'>('mouth-closed')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setWorkspaceReady(false)
    setProject(null)
    setComponentAssets({})
    setCatalogItems({})
    setComposition(emptyComposition)
    setPresets([])
    setSelectedExpressionIndex(0)
    setPreviewGaze('right')
    setWorkingCopies({})
    latestWorkspaceDraft.current = null
    setSwitchingExpression(false)
    setPresetId(crypto.randomUUID())
    void Promise.all([
      window.desktop.loadFabricatorSlot(modelSlot),
      Promise.all([window.desktop.listFaceComponentAssets(modelSlot, 'eye'), window.desktop.listFaceComponentAssets(modelSlot, 'pupil'), window.desktop.listFaceComponentAssets(modelSlot, 'eyebrow')]).then((lists) => lists.flat()),
      window.desktop.listFaceCatalog(modelSlot),
      window.desktop.listFaceExpressionPresets(modelSlot),
      window.desktop.listFaceExpressionCollections(modelSlot),
      window.desktop.loadFaceExpressionWorkspaceDraft(modelSlot)
    ]).then(async ([model, components, catalogs, savedPresets, savedCollections, diskWorkspaceDraft]) => {
      const facialCatalogs = catalogs.filter((item) => item.category === 'nose' || item.category === 'mouth-closed' || item.category === 'mouth-open')
      const [loadedComponents, loadedCatalogs] = await Promise.all([
        Promise.all(components.map((asset) => window.desktop.loadFaceComponentAsset(modelSlot, asset.id))),
        Promise.all(facialCatalogs.map((item) => window.desktop.loadFaceCatalogItem(modelSlot, item.id)))
      ])
      if (cancelled) return
      const readyComponents = loadedComponents.filter((asset): asset is FaceComponentAsset => Boolean(asset))
      const readyCatalogs = loadedCatalogs.filter((item): item is FaceCatalogItem => Boolean(item))
      setProject(projectForOriginalPreview(model))
      setComponentSummaries(components)
      setComponentAssets(Object.fromEntries(readyComponents.map((asset) => [asset.id, asset])))
      setCatalogSummaries(facialCatalogs)
      setCatalogItems(Object.fromEntries(readyCatalogs.map((item) => [item.id, item])))
      const loadedPresets = savedPresets
      setCollections(savedCollections)
      setSelectedCollectionId(EXPRESSION_COLLECTION_ID)
      setCustomExpressionNames(Object.fromEntries(savedPresets
        .filter((preset) => typeof preset.collectionId === 'string' && Number.isInteger(preset.expressionIndex) && preset.expressionIndex! >= STANDARD_EXPRESSIONS.length)
        .map((preset) => [expressionWorkingCopyKey(preset.collectionId!, preset.expressionIndex!), preset.name])))

      // A NEW set must start from the exact assets currently chosen in Olhos
      // DEV, including each asset's saved defaultTransform. Existing presets,
      // drafts and published transforms always take precedence below.
      let preferredParts = {} as ReturnType<typeof savedFaceLibraryParts>
      try { preferredParts = savedFaceLibraryParts(localStorage.getItem(FACE_COMPONENT_SELECTION_STORAGE_KEY),modelSlot) }
      catch { /* Missing storage: fall back to the first available pair. */ }
      const choose=(kind: 'eye'|'pupil'|'eyebrow',side:Side,left?:FaceComponentAsset) =>
        pickFaceLibraryBase(kind,side,preferredParts,readyComponents,left)
      const leftEye = choose('eye','left')
      const leftPupil = choose('pupil','left')
      const leftBrow = choose('eyebrow','left')
      const rightEye = choose('eye','right',leftEye)
        ?? (leftEye ? findPairedAsset(leftEye,components) : undefined)
      const rightPupil = choose('pupil','right',leftPupil)
        ?? (leftPupil ? findPairedAsset(leftPupil,components) : undefined)
      const rightBrow = choose('eyebrow','right',leftBrow)
        ?? (leftBrow ? findPairedAsset(leftBrow,components) : undefined)
      const nose = readyCatalogs.find((item) => item.category === 'nose')
      const mouth = readyCatalogs.find((item) => item.category === 'mouth-closed') ?? readyCatalogs.find((item) => item.category === 'mouth-open')
      const initial: ExpressionComposition = {
        eyes: { left: leftEye?.id ?? null, right: rightEye?.id ?? leftEye?.id ?? null },
        pupils: { left: leftPupil?.id ?? null, right: rightPupil?.id ?? leftPupil?.id ?? null },
        eyebrows: { left: leftBrow?.id ?? null, right: rightBrow?.id ?? leftBrow?.id ?? null },
        nose: nose ? { catalogId: nose.id, index: nose.pieces[0]?.index ?? 0 } : null,
        mouth: mouth ? { catalogId: mouth.id, kind: mouth.category as 'mouth-closed' | 'mouth-open', index: mouth.pieces[0]?.index ?? 0 } : null
      }
      const initialTransforms = defaultTransforms(initial, Object.fromEntries(readyComponents.map((asset) => [asset.id, asset])), Object.fromEntries(readyCatalogs.map((item) => [item.id, item])))
      // Do not auto-generate legacy pixel offsets when a new model has fewer
      // than 21 expressions: those offsets are unrelated to Olhos DEV
      // calibration and used to overwrite saved slots with the same ID.
      // Existing published presets and drafts remain untouched; empty slots
      // start from the selected Olhos DEV asset defaults on first edit.
      setPresets(loadedPresets)
      const firstPresetSummary = loadedPresets.find((preset) => preset.collectionId === EXPRESSION_COLLECTION_ID && preset.expressionIndex === 0)
      const selectedPreset = firstPresetSummary ? await window.desktop.loadFaceExpressionPreset(modelSlot, firstPresetSummary.id) : null
      if (cancelled) return
      setBaseComposition(initial)
      setBaseTransforms(initialTransforms)
      setBaseNoseOpacity(nose?.opacity ?? 1)
      let localWorkspaceDraft: FaceExpressionWorkspaceDraft | null = null
      try {
        const stored = localStorage.getItem(expressionWorkspaceDraftStorageKey(modelSlot))
        if (stored) {
          const parsed: unknown = JSON.parse(stored)
          if (isWorkspaceDraftForModel(parsed, modelSlot)) localWorkspaceDraft = parsed
        }
      } catch { /* Um rascunho local incompleto não impede a abertura do editor. */ }
      const availableCollections = new Set([EXPRESSION_COLLECTION_ID, ...savedCollections.map((collection) => collection.id)])
      const candidates = [diskWorkspaceDraft, localWorkspaceDraft]
        .filter((candidate): candidate is FaceExpressionWorkspaceDraft => isWorkspaceDraftForModel(candidate, modelSlot)
          && availableCollections.has(candidate.selectedCollectionId))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      const restoredWorkspaceDraft = candidates[0] ?? null
      const savedCustomNames = Object.fromEntries(loadedPresets
        .filter((preset) => typeof preset.collectionId === 'string' && Number.isInteger(preset.expressionIndex) && preset.expressionIndex! >= STANDARD_EXPRESSIONS.length)
        .map((preset) => [expressionWorkingCopyKey(preset.collectionId!, preset.expressionIndex!), preset.name]))
      if (restoredWorkspaceDraft) {
        const current = fromWorkspaceEntry(restoredWorkspaceDraft.current)
        setSelectedCollectionId(restoredWorkspaceDraft.selectedCollectionId)
        setSelectedExpressionIndex(restoredWorkspaceDraft.selectedExpressionIndex)
        setPresetId(current.id)
        setComposition(current.composition)
        setTransforms(current.transforms)
        setNoseOpacity(current.noseOpacity)
        setEffects(current.effects)
        setWorkingCopies(Object.fromEntries(Object.entries(restoredWorkspaceDraft.workingCopies).map(([key, entry]) => [key, fromWorkspaceEntry(entry)])))
        setCustomExpressionNames({ ...savedCustomNames, ...restoredWorkspaceDraft.customExpressionNames })
      } else if (selectedPreset) {
        setSelectedCollectionId(EXPRESSION_COLLECTION_ID)
        setSelectedExpressionIndex(0)
        setPresetId(selectedPreset.id); setComposition(selectedPreset.selections); setTransforms(selectedPreset.transforms); setNoseOpacity(selectedPreset.noseOpacity); setEffects(cloneEffects(selectedPreset.effects))
        setWorkingCopies({})
        setCustomExpressionNames(savedCustomNames)
      } else {
        setSelectedCollectionId(EXPRESSION_COLLECTION_ID)
        setSelectedExpressionIndex(0)
        setPresetId(crypto.randomUUID()); setComposition(initial); setTransforms(initialTransforms); setNoseOpacity(nose?.opacity ?? 1); setEffects(defaultExpressionEffects())
        setWorkingCopies({})
        setCustomExpressionNames(savedCustomNames)
      }
      setWorkspaceReady(true)
      setError(null)
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os itens faciais deste modelo.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [modelSlot])

  useEffect(() => {
    if (!workspaceReady || loading || switchingExpression) return
    const workspaceDraft: FaceExpressionWorkspaceDraft = {
      schemaVersion: 1,
      modelSlot,
      selectedCollectionId,
      selectedExpressionIndex,
      current: toWorkspaceEntry({ id: presetId, composition, transforms, noseOpacity, effects }),
      workingCopies: Object.fromEntries(Object.entries(workingCopies).map(([key, copy]) => [key, toWorkspaceEntry(copy)])),
      customExpressionNames: { ...customExpressionNames },
      updatedAt: new Date().toISOString()
    }
    latestWorkspaceDraft.current = workspaceDraft
    setWorkspaceSaveStatus('saving')
    try {
      localStorage.setItem(expressionWorkspaceDraftStorageKey(modelSlot), JSON.stringify(workspaceDraft))
    } catch (reason) {
      setWorkspaceSaveStatus('failed')
      setError(reason instanceof Error ? `Não foi possível guardar o rascunho local: ${reason.message}` : 'Não foi possível guardar o rascunho local.')
    }
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current)
    workspaceSaveTimer.current = setTimeout(() => {
      workspaceSaveTimer.current = null
      void window.desktop.saveFaceExpressionWorkspaceDraft(modelSlot, workspaceDraft).then(() => {
        if (latestWorkspaceDraft.current?.updatedAt === workspaceDraft.updatedAt) setWorkspaceSaveStatus('saved')
      }).catch((reason) => {
        if (latestWorkspaceDraft.current?.updatedAt === workspaceDraft.updatedAt) {
          setWorkspaceSaveStatus('failed')
          setError(reason instanceof Error ? `Falha ao gravar o rascunho no disco: ${reason.message}` : 'Falha ao gravar o rascunho no disco.')
        }
      })
    }, 120)
    return () => {
      if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current)
      workspaceSaveTimer.current = null
    }
  }, [workspaceReady, loading, switchingExpression, modelSlot, selectedCollectionId, selectedExpressionIndex, presetId, composition, transforms, noseOpacity, effects, workingCopies, customExpressionNames])

  useEffect(() => () => {
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current)
    workspaceSaveTimer.current = null
    const latest = latestWorkspaceDraft.current
    if (latest?.modelSlot === modelSlot) void window.desktop.saveFaceExpressionWorkspaceDraft(modelSlot, latest).catch(() => undefined)
  }, [modelSlot])

  useEffect(() => {
    let cancelled = false
    const eyes = Object.values(componentAssets).filter((asset) => asset.kind === 'eye')
    void Promise.all(eyes.map(async (asset) => [asset.id, await eyeInteriorMask(asset.dataUrl)] as const)).then((entries) => {
      if (cancelled) return
      setEyeMasks((current) => ({ ...current, ...Object.fromEntries(entries) }))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [componentAssets])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDraft(composition); setDraftTransforms(cloneTransforms(transforms)); setDraftNoseOpacity(noseOpacity); setOpen(false) } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, composition, transforms, noseOpacity])

  const head = useMemo(() => project?.parts.find((part) => /cabe[çc]a|head/i.test(part.name)) ?? null, [project])
  const visibleComposition = open ? draft : composition
  const visibleTransforms = useMemo(() => {
    const raw=open ? draftTransforms : transforms
    if (open || previewGaze==='right')return raw
    // Normal edit mode MUST exactly display the saved Olhos DEV coordinates.
    // PT is strictly read-only and never participates in mouse drag or save.
    // PT is a strictly read-only alternate preview. Neither draft autosave nor
    // published presets include the gaze variation.
    const next=cloneTransforms(raw)
    for(const side of ['left','right'] as const){
      const eyeId=composition.eyes[side],pupilId=composition.pupils[side]
      const eye=eyeId ? componentAssets[eyeId] : undefined
      const pupil=pupilId ? componentAssets[pupilId] : undefined
      if(!eye || !pupil)continue
      const eyeKey=side==='left'?'eyeLeft':'eyeRight'
      const key=side==='left'?'pupilLeft':'pupilRight'
      next[key].x=resolvePresetPupilGaze(raw[key].x,baseTransforms[key].x,eye.width,raw[eyeKey].scaleX,side,
        pupil.rightSidePositioned===true,previewGaze,
        Boolean(raw[eyeKey].flipX)!==(side==='right' && eye.rightSidePositioned!==true))
    }
    return next
  },[open,draftTransforms,transforms,previewGaze,composition,baseTransforms,componentAssets])
  const comparisonPreset = useMemo((): FaceExpressionPreset => {
    const portable=compilePortableExpression(transforms,baseTransforms,authoredMetrics(composition,componentAssets,catalogItems))
    return { schemaVersion:1,id:presetId,modelSlot,name:'Prévia do Presets DEV',
      collectionId:selectedCollectionId,expressionIndex:selectedExpressionIndex,
      selections:composition,transforms,referenceTransforms:baseTransforms,
      ...(Object.keys(portable.layers).length ? {portableMotion:portable} : {}),
      noseOpacity,effects,updatedAt:new Date(0).toISOString() }
  },[transforms,baseTransforms,composition,componentAssets,catalogItems,presetId,modelSlot,selectedCollectionId,selectedExpressionIndex,noseOpacity,effects])
  const visibleNoseOpacity = open ? draftNoseOpacity : noseOpacity
  const collectionExpressionNames = useMemo(() => Object.fromEntries(Object.entries(customExpressionNames)
    .filter(([key]) => key.startsWith(`${selectedCollectionId}:`))
    .map(([key, name]) => [Number(key.slice(selectedCollectionId.length + 1)), name])), [customExpressionNames, selectedCollectionId])
  const customExpressionIndices = useMemo(() => [...new Set([
    ...Object.keys(collectionExpressionNames).map(Number),
    ...presets.filter((preset) => preset.collectionId === selectedCollectionId && Number.isInteger(preset.expressionIndex) && preset.expressionIndex! >= STANDARD_EXPRESSIONS.length).map((preset) => preset.expressionIndex!)
  ])].sort((a, b) => a - b), [collectionExpressionNames, presets, selectedCollectionId])
  const activeExpressionName = STANDARD_EXPRESSIONS[selectedExpressionIndex] ?? collectionExpressionNames[selectedExpressionIndex] ?? `Nova expressão ${selectedExpressionIndex - STANDARD_EXPRESSIONS.length + 1}`
  const expressionPresetByIndex = useMemo(() => new Map(presets
    .filter((preset) => preset.collectionId === selectedCollectionId && Number.isInteger(preset.expressionIndex))
    .map((preset) => [preset.expressionIndex!, preset])), [presets, selectedCollectionId])
  const selectedCatalog = category === 'nose'
    ? catalogItems[draft.nose?.catalogId ?? '']
    : category === 'mouth' && draft.mouth?.kind === mouthKind ? catalogItems[draft.mouth.catalogId] : undefined
  const filteredCatalogOptions = useMemo(() => buildCatalogOptions(
    catalogSummaries.filter((item) => category === 'nose' ? item.category === 'nose' : item.category === mouthKind),
    catalogItems
  ), [catalogSummaries, catalogItems, category, mouthKind])
  const componentOptions = useMemo(() => ({
    eye: buildComponentOptions('eye', componentSummaries, componentAssets),
    pupil: buildComponentOptions('pupil', componentSummaries, componentAssets),
    eyebrow: buildComponentOptions('eyebrow', componentSummaries, componentAssets)
  }), [componentSummaries, componentAssets])
  const selectedOptionKind: ComponentKind | null = category === 'eyes' ? 'eye' : category === 'pupils' ? 'pupil' : category === 'eyebrows' ? 'eyebrow' : null
  const selectedOptionKey = selectedOptionKind ? componentOptions[selectedOptionKind].find((option) => {
    const field = selectedOptionKind === 'eye' ? draft.eyes : selectedOptionKind === 'pupil' ? draft.pupils : draft.eyebrows
    return Boolean(field.left && field.right && option.ids.includes(field.left) && option.ids.includes(field.right))
  })?.key : undefined
  const visibleComponentOptions = selectedOptionKind ? componentOptions[selectedOptionKind] : []
  const setComponentChoice = (option: ComponentOption) => {
    const field = option.kind === 'eye' ? 'eyes' : option.kind === 'pupil' ? 'pupils' : 'eyebrows'
    const leftKey = layerKey(option.kind, 'left')
    const rightKey = layerKey(option.kind, 'right')
    const leftAsset = componentAssets[option.leftId]
    const rightAsset = componentAssets[option.rightId]
    setDraft((current) => ({ ...current, [field]: { left: option.leftId, right: option.rightId } }))
    setDraftTransforms((current) => ({ ...current,
      ...(leftAsset ? { [leftKey]: { ...leftAsset.defaultTransform } } : {}),
      ...(rightAsset ? { [rightKey]: { ...rightAsset.defaultTransform } } : {})
    }))
  }

  const chooseCatalog = (summary: FaceCatalogItemSummary) => {
    const item = catalogItems[summary.id]
    if (!item) return
    if (category === 'nose') {
      setDraft((current) => ({ ...current, nose: { catalogId: item.id, index: item.pieces[0]?.index ?? 0 } }))
      if (item.transforms.nose) setDraftTransforms((current) => ({ ...current, nose: { ...item.transforms.nose! } }))
      setDraftNoseOpacity(item.opacity ?? 1)
    } else {
      const expressionPiece = item.pieces.find((piece) => piece.index === selectedExpressionIndex) ?? item.pieces[0]
      setDraft((current) => ({ ...current, mouth: { catalogId: item.id, kind: item.category as 'mouth-closed' | 'mouth-open', index: expressionPiece?.index ?? 0 } }))
      if (item.transforms.mouth) setDraftTransforms((current) => ({ ...current, mouth: { ...item.transforms.mouth! } }))
    }
  }

  const beginChoosing = () => { setDraft(composition); setDraftTransforms(cloneTransforms(transforms)); setDraftNoseOpacity(noseOpacity); setCategory('eyes'); setOpen(true) }
  const applyComposition = async () => {
    if (saving || switchingExpression) return
    setSaving(true); setError(null)
    try {
      const nextBaseTransforms = defaultTransforms(draft, componentAssets, catalogItems)
      const keys = new Set<number>(Array.from({ length: STANDARD_EXPRESSIONS.length }, (_, index) => index))
      if (selectedExpressionIndex >= STANDARD_EXPRESSIONS.length) keys.add(selectedExpressionIndex)
      const existingByIndex = new Map(presets
        .filter((preset) => preset.collectionId === selectedCollectionId && Number.isInteger(preset.expressionIndex))
        .map((preset) => [preset.expressionIndex!, preset]))
      const now = new Date().toISOString()
      const nextPresets: FaceExpressionPreset[] = []
      const nextCopies: Record<string, ExpressionWorkingCopy> = {}

      for (const index of keys) {
        const key = expressionWorkingCopyKey(selectedCollectionId, index)
        const summary = existingByIndex.get(index)
        const saved = summary ? await window.desktop.loadFaceExpressionPreset(modelSlot, summary.id) : null
        const workingCopy = index === selectedExpressionIndex
          ? { id: presetId, composition, transforms, noseOpacity, effects }
          : workingCopies[key]
        const sourceComposition = workingCopy?.composition ?? saved?.selections ?? baseComposition
        const sourceTransforms = workingCopy?.transforms ?? saved?.transforms ?? defaultTransforms(sourceComposition, componentAssets, catalogItems)
        const sourceReferenceTransforms = {
          ...defaultTransforms(saved?.selections ?? sourceComposition, componentAssets, catalogItems),
          ...(saved?.referenceTransforms ?? {})
        }
        const selections = compositionForExpression(draft, index, catalogItems)
        const rebasedTransforms = rebaseExpressionTransforms(sourceTransforms, sourceReferenceTransforms, nextBaseTransforms)
        const id = workingCopy?.id ?? saved?.id ?? summary?.id ?? crypto.randomUUID()
        const name = saved?.name ?? customExpressionNames[key] ?? STANDARD_EXPRESSIONS[index] ?? `Nova expressão ${index - STANDARD_EXPRESSIONS.length + 1}`
        const nextPreset: FaceExpressionPreset = {
          ...saved,
          schemaVersion: 1, id, modelSlot, name, collectionId: selectedCollectionId, expressionIndex: index,
          selections, transforms: rebasedTransforms, referenceTransforms: cloneTransforms(nextBaseTransforms),
          portableMotion: motionForPublishedPreset(rebasedTransforms,nextBaseTransforms,selections,componentAssets,catalogItems,saved),
          noseOpacity: draftNoseOpacity, effects: cloneEffects(workingCopy?.effects ?? saved?.effects), updatedAt: now
        }
        nextPresets.push(nextPreset)
        nextCopies[key] = { id, composition: selections, transforms: rebasedTransforms, noseOpacity: draftNoseOpacity, effects: cloneEffects(nextPreset.effects) }
      }

      // One server-side transaction: all preset JSONs commit together, or the
      // durable journal restores and verifies the previous bytes on reopening.
      // Never attempt parallel best-effort rollbacks from the React renderer.
      await window.desktop.saveFaceExpressionPresetBatch(modelSlot, nextPresets)

      setBaseComposition(draft); setBaseTransforms(nextBaseTransforms); setBaseNoseOpacity(draftNoseOpacity)
      setWorkingCopies((current) => ({ ...current, ...nextCopies }))
      const active = nextCopies[expressionWorkingCopyKey(selectedCollectionId, selectedExpressionIndex)]
      if (active) {
        setPresetId(active.id); setComposition(active.composition); setTransforms(active.transforms); setNoseOpacity(active.noseOpacity); setEffects(active.effects)
      }
      setPresets(await window.desktop.listFaceExpressionPresets(modelSlot))
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a composição às expressões.')
    } finally { setSaving(false) }
  }
  const cancelChoosing = () => { setDraft(composition); setDraftTransforms(cloneTransforms(transforms)); setDraftNoseOpacity(noseOpacity); setOpen(false) }
  const updateLayerTransform = (key: LayerKey, patch: Partial<FaceTransform>) => {
    if(previewGaze==='left' && !open)return // PT is read-only, keep authored pose untouched.
    const pairKind = pairedKindForLayer(key)
    const pairedKey = pairedLayerKeys[key]
    const linkPair = Boolean(pairKind && pairedKey && linkedLayerPairs[pairKind])
    const usesMirroredX = (layer: LayerKey) => {
      if (!layer.endsWith('Right')) return false
      const side = 'right'
      const assetId = layer.startsWith('eye') ? composition.eyes[side] : layer.startsWith('pupil') ? composition.pupils[side] : composition.eyebrows[side]
      return componentAssets[assetId ?? '']?.rightSidePositioned !== true
    }
    setTransforms((current) => {
      const sourceBefore = current[key]
      const sourceAfter = { ...sourceBefore, ...patch }
      if (!linkPair || !pairedKey) return { ...current, [key]: sourceAfter }
      const pairedBefore = current[pairedKey]
      const pairedAfter = { ...pairedBefore }
      if (patch.x !== undefined) {
        const direction = (usesMirroredX(key) ? -1 : 1) / (usesMirroredX(pairedKey) ? -1 : 1)
        pairedAfter.x = pairedBefore.x + (sourceAfter.x - sourceBefore.x) * direction
      }
      if (patch.y !== undefined) pairedAfter.y = pairedBefore.y + (sourceAfter.y - sourceBefore.y)
      if (patch.scaleX !== undefined) pairedAfter.scaleX = Math.max(.02, Math.min(4, pairedBefore.scaleX * sourceAfter.scaleX / sourceBefore.scaleX))
      if (patch.scaleY !== undefined) pairedAfter.scaleY = Math.max(.02, Math.min(4, pairedBefore.scaleY * sourceAfter.scaleY / sourceBefore.scaleY))
      if (patch.rotation !== undefined) {
        pairedAfter.rotation = Math.max(-180, Math.min(180, pairedBefore.rotation - (sourceAfter.rotation - sourceBefore.rotation)))
      }
      if (patch.flipX !== undefined) pairedAfter.flipX = Boolean(pairedBefore.flipX) !== (Boolean(sourceBefore.flipX) !== Boolean(sourceAfter.flipX))
      return { ...current, [key]: sourceAfter, [pairedKey]: pairedAfter }
    })
  }
  const beginPreviewLayerDrag = (event: ReactPointerEvent<HTMLElement>, requestedMappings: Array<Omit<PreviewLayerMapping, 'startX' | 'startY'>>) => {
    if (!requestedMappings.some(({ layer }) => layer === selectedLayer) || !head || event.button !== 0 && event.pointerType === 'mouse') return
    const bounds = previewCanvas.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    // PT is a different view of the SAME preset, not an alternate authoring
    // coordinate system. Switching back to Normal is required to drag a pupil.
    if (previewGaze==='left' && requestedMappings.some(item=>item.layer.startsWith('pupil')))return
    const mappings: PreviewLayerMapping[] = requestedMappings.map((mapping) => ({
      ...mapping, startX: transforms[mapping.layer].x, startY: transforms[mapping.layer].y
    }))
    previewLayerDrag.current = {
      pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      modelPerPixelX: head.width / bounds.width, modelPerPixelY: head.height / bounds.height,
      mappings
    }
  }
  const movePreviewLayerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = previewLayerDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    setTransforms((current) => {
      const next = { ...current }
      for (const mapping of drag.mappings) {
        const rotatedPupil = mapping.layer === 'pupilLeft' || mapping.layer === 'pupilRight'
        const delta = pupilDeltaFromDrag(event.clientX-drag.clientX,event.clientY-drag.clientY,{
          rotationDegrees:rotatedPupil ? mapping.rotation : 0,mirrorSourceX:mapping.mirroredX,
          modelPerPixelX:drag.modelPerPixelX,modelPerPixelY:drag.modelPerPixelY
        })
        next[mapping.layer] = {
          ...current[mapping.layer],
          x: mapping.startX + delta.x,
          y: mapping.startY + delta.y
        }
      }
      return next
    })
  }
  const endPreviewLayerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (previewLayerDrag.current?.pointerId !== event.pointerId) return
    previewLayerDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const resetSelectedLayer = () => {
    if(previewGaze==='left')return
    const defaultForLayer = (layer: LayerKey) => {
      const assetId = layer === 'eyeLeft' ? composition.eyes.left : layer === 'eyeRight' ? composition.eyes.right
        : layer === 'pupilLeft' ? composition.pupils.left : layer === 'pupilRight' ? composition.pupils.right
          : layer === 'browLeft' ? composition.eyebrows.left : layer === 'browRight' ? composition.eyebrows.right : null
      const assetTransform = assetId ? componentAssets[assetId]?.defaultTransform : undefined
      const catalog = layer === 'nose' && composition.nose ? catalogItems[composition.nose.catalogId]
        : layer === 'mouth' && composition.mouth ? catalogItems[composition.mouth.catalogId] : undefined
      const catalogTransform = layer === 'nose' ? catalog?.transforms.nose : layer === 'mouth' ? catalog?.transforms.mouth : undefined
      return { ...(assetTransform ?? catalogTransform ?? identityTransform()) }
    }
    const pairKind = pairedKindForLayer(selectedLayer)
    const pairedKey = pairedLayerKeys[selectedLayer]
    setTransforms((current) => ({
      ...current,
      [selectedLayer]: defaultForLayer(selectedLayer),
      ...(pairKind && pairedKey && linkedLayerPairs[pairKind] ? { [pairedKey]: defaultForLayer(pairedKey) } : {})
    }))
    if (selectedLayer === 'nose') setNoseOpacity(composition.nose ? catalogItems[composition.nose.catalogId]?.opacity ?? 1 : 1)
  }
  const updateEffect = (key: keyof FaceExpressionEffects, patch: Partial<FaceExpressionEffects[keyof FaceExpressionEffects]>) => setEffects((current) => ({ ...current, [key]: { ...current[key], ...patch } }))
  const beginBlushDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const bounds = previewCanvas.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    previewEffectDrag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, offsetX: effects.blush.offsetX ?? 0, offsetY: effects.blush.offsetY }
  }
  const moveBlushDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = previewEffectDrag.current
    const bounds = previewCanvas.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return
    event.preventDefault()
    event.stopPropagation()
    updateEffect('blush', {
      offsetX: Math.max(-.5, Math.min(.5, drag.offsetX + (event.clientX - drag.clientX) / bounds.width)),
      offsetY: Math.max(-.5, Math.min(.5, drag.offsetY + (event.clientY - drag.clientY) / bounds.height))
    })
  }
  const endBlushDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (previewEffectDrag.current?.pointerId !== event.pointerId) return
    previewEffectDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const nudgeBlush = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const delta = event.shiftKey ? .05 : .01
    const movement = event.key === 'ArrowLeft' ? { offsetX: (effects.blush.offsetX ?? 0) - delta }
      : event.key === 'ArrowRight' ? { offsetX: (effects.blush.offsetX ?? 0) + delta }
        : event.key === 'ArrowUp' ? { offsetY: effects.blush.offsetY - delta }
          : event.key === 'ArrowDown' ? { offsetY: effects.blush.offsetY + delta } : null
    if (!movement) return
    event.preventDefault()
    updateEffect('blush', movement.offsetX !== undefined
      ? { offsetX: Math.max(-.5, Math.min(.5, movement.offsetX)) }
      : { offsetY: Math.max(-.5, Math.min(.5, movement.offsetY!)) })
  }
  const resetCurrentExpression = () => {
    if(previewGaze==='left')return
    setTransforms(defaultTransforms(composition, componentAssets, catalogItems))
    setNoseOpacity(composition.nose ? catalogItems[composition.nose.catalogId]?.opacity ?? 1 : 1)
    setEffects(defaultExpressionEffects())
  }
  const selectExpression = async (index: number, pupilsLeft = false) => {
    if (switchingExpression || saving) return
    // The ordinary expression and PT share one saved set of transforms.
    setPreviewGaze(pupilsLeft?'left':'right')
    if (index === selectedExpressionIndex) return
    setSwitchingExpression(true)
    setError(null)
    const currentKey = expressionWorkingCopyKey(selectedCollectionId, selectedExpressionIndex)
    const targetKey = expressionWorkingCopyKey(selectedCollectionId, index)
    setWorkingCopies((current) => ({ ...current, [currentKey]: {
      id: presetId, composition: structuredClone(composition), transforms: cloneTransforms(transforms), noseOpacity, effects: cloneEffects(effects)
    } }))
    setSelectedExpressionIndex(index)
    try {
      const workingCopy = workingCopies[targetKey]
      if (workingCopy) {
        setPresetId(workingCopy.id); setComposition(workingCopy.composition); setTransforms(cloneTransforms(workingCopy.transforms)); setNoseOpacity(workingCopy.noseOpacity); setEffects(cloneEffects(workingCopy.effects))
        return
      }
      const summary = expressionPresetByIndex.get(index)
      const saved = summary ? await window.desktop.loadFaceExpressionPreset(modelSlot, summary.id) : null
      if (saved) {
        setPresetId(saved.id); setComposition(saved.selections); setTransforms(cloneTransforms(saved.transforms)); setNoseOpacity(saved.noseOpacity); setEffects(cloneEffects(saved.effects))
        return
      }
      const nextComposition = structuredClone(baseComposition)
      if (nextComposition.mouth) {
        const mouth = catalogItems[nextComposition.mouth.catalogId]
        if (mouth?.pieces.some((piece) => piece.index === index)) nextComposition.mouth.index = index
      }
      setPresetId(crypto.randomUUID()); setComposition(nextComposition); setTransforms(cloneTransforms(baseTransforms)); setNoseOpacity(baseNoseOpacity); setEffects(defaultExpressionEffects())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta expressão.')
    } finally {
      setSwitchingExpression(false)
    }
  }
  const createExpression = () => {
    if (loading || switchingExpression || saving) return
    setPreviewGaze('right')
    const nextIndex = Math.max(STANDARD_EXPRESSIONS.length - 1, ...customExpressionIndices) + 1
    const name = `Nova expressão ${nextIndex - STANDARD_EXPRESSIONS.length + 1}`
    const nextId = crypto.randomUUID()
    const currentKey = expressionWorkingCopyKey(selectedCollectionId, selectedExpressionIndex)
    const nextKey = expressionWorkingCopyKey(selectedCollectionId, nextIndex)
    const nextCopy: ExpressionWorkingCopy = { id: nextId, composition: structuredClone(composition), transforms: cloneTransforms(transforms), noseOpacity, effects: cloneEffects(effects) }
    setWorkingCopies((current) => ({
      ...current,
      [currentKey]: { id: presetId, composition: structuredClone(composition), transforms: cloneTransforms(transforms), noseOpacity, effects: cloneEffects(effects) },
      [nextKey]: nextCopy
    }))
    setCustomExpressionNames((current) => ({ ...current, [nextKey]: name }))
    setPresetId(nextId)
    setSelectedExpressionIndex(nextIndex)
    setError(null)
  }
  const saveCurrentPreset = async () => {
    setSaving(true); setError(null)
    try {
      const existing = await window.desktop.loadFaceExpressionPreset(modelSlot, presetId)
      const sameComposition = existing && JSON.stringify(existing.selections) === JSON.stringify(composition)
      const referenceTransforms = sameComposition && existing.referenceTransforms
        ? existing.referenceTransforms
        : defaultTransforms(composition, componentAssets, catalogItems)
      const saved: FaceExpressionPreset = {
        schemaVersion: 1, id: presetId, modelSlot, name: activeExpressionName,
        collectionId: selectedCollectionId, expressionIndex: selectedExpressionIndex,
        selections: structuredClone(composition), transforms: cloneTransforms(transforms), referenceTransforms: structuredClone(referenceTransforms),
        portableMotion: motionForPublishedPreset(transforms,referenceTransforms,composition,componentAssets,catalogItems,sameComposition?existing:null), noseOpacity, effects: cloneEffects(effects), updatedAt: new Date().toISOString()
      }
      await window.desktop.saveFaceExpressionPreset(modelSlot, saved)
      setPresetId(saved.id)
      setWorkingCopies((current) => ({ ...current, [expressionWorkingCopyKey(selectedCollectionId, selectedExpressionIndex)]: { id: saved.id, composition: saved.selections, transforms: saved.transforms, noseOpacity: saved.noseOpacity, effects: cloneEffects(saved.effects) } }))
      setPresets(await window.desktop.listFaceExpressionPresets(modelSlot))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar este preset.') }
    finally { setSaving(false) }
  }
  const selectCollection = async (collectionId: string) => {
    if (collectionId === selectedCollectionId || switchingExpression || saving) return
    setSwitchingExpression(true)
    setError(null)
    const currentKey = expressionWorkingCopyKey(selectedCollectionId, selectedExpressionIndex)
    const targetKey = expressionWorkingCopyKey(collectionId, 0)
    setWorkingCopies((current) => ({ ...current, [currentKey]: {
      id: presetId, composition: structuredClone(composition), transforms: cloneTransforms(transforms), noseOpacity, effects: cloneEffects(effects)
    } }))
    setSelectedCollectionId(collectionId)
    setSelectedExpressionIndex(0)
    setPreviewGaze('right')
    try {
      const workingCopy = workingCopies[targetKey]
      if (workingCopy) {
        setPresetId(workingCopy.id); setComposition(workingCopy.composition); setTransforms(cloneTransforms(workingCopy.transforms)); setNoseOpacity(workingCopy.noseOpacity); setEffects(cloneEffects(workingCopy.effects))
        return
      }
      const summary = presets.find((preset) => preset.collectionId === collectionId && preset.expressionIndex === 0)
      const saved = summary ? await window.desktop.loadFaceExpressionPreset(modelSlot, summary.id) : null
      if (saved) {
        setPresetId(saved.id); setComposition(saved.selections); setTransforms(saved.transforms); setNoseOpacity(saved.noseOpacity); setEffects(cloneEffects(saved.effects))
      } else {
        setPresetId(crypto.randomUUID()); setComposition(structuredClone(baseComposition)); setTransforms(cloneTransforms(baseTransforms)); setNoseOpacity(baseNoseOpacity); setEffects(defaultExpressionEffects())
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este conjunto.')
    } finally {
      setSwitchingExpression(false)
    }
  }
  const saveNewCollection = async () => {
    const name = newCollectionName.trim()
    if (!name || saving || loading) return
    const now = new Date().toISOString()
    const collection: FaceExpressionCollection = { schemaVersion: 1, id: crypto.randomUUID(), modelSlot, name, createdAt: now, updatedAt: now }
    setSaving(true); setError(null)
    try {
      await window.desktop.saveFaceExpressionCollection(modelSlot, collection)
      setCollections((current) => [...current, collection].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setWorkingCopies((current) => ({ ...current, [expressionWorkingCopyKey(selectedCollectionId, selectedExpressionIndex)]: {
        id: presetId, composition: structuredClone(composition), transforms: cloneTransforms(transforms), noseOpacity, effects: cloneEffects(effects)
      } }))
      setSelectedCollectionId(collection.id)
      setSelectedExpressionIndex(0)
      setPresetId(crypto.randomUUID())
      setComposition(structuredClone(baseComposition))
      setTransforms(cloneTransforms(baseTransforms))
      setNoseOpacity(baseNoseOpacity); setEffects(defaultExpressionEffects())
      setCollectionDialogOpen(false)
      setNewCollectionName('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o conjunto.')
    } finally {
      setSaving(false)
    }
  }

  const renderComponent = (assetId: string | null, kind: 'eye' | 'pupil' | 'eyebrow', currentSide: Side, transform: FaceTransform, eyeAsset?: FaceComponentAsset, eyeTransformOverride?: FaceTransform): ReactNode => {
    if (!head || !assetId) return null
    const asset = componentAssets[assetId]
    if (!asset || asset.kind !== kind) return null
    const right = currentSide === 'right'
    // A name such as "Olho direito" identifies the library slot; it does not
    // prove that the pixels are already positioned as a right-side asset.
    // Olhos Dev uses this metadata alone to decide whether the image needs mirroring.
    const physicallyRight = asset.rightSidePositioned === true
    if (kind !== 'pupil') {
      const mirrored = right && !physicallyRight
      const layer = layerKey(kind, currentSide)
      const pairedSide = right ? 'left' : 'right'
      const pairedLayer = layerKey(kind, pairedSide)
      const movePair = linkedLayerPairs[kind]
      const canDrag = selectedLayer === layer || movePair && selectedLayer === pairedLayer
      const pairedAssetId = kind === 'eye' ? visibleComposition.eyes[pairedSide] : visibleComposition.eyebrows[pairedSide]
      const pairedAsset = pairedAssetId ? componentAssets[pairedAssetId] : undefined
      const dragMappings: Array<Omit<PreviewLayerMapping, 'startX' | 'startY'>> = [{ layer, mirroredX: mirrored, rotation: 0 }]
      if (movePair && pairedAsset) dragMappings.push({ layer: pairedLayer, mirroredX: pairedSide === 'right' && pairedAsset.rightSidePositioned !== true, rotation: 0 })
      const x = mirrored ? head.width - transform.x : transform.x
      const rotation = mirrored ? -transform.rotation : transform.rotation
      const imageStyle: CSSProperties = {
        left: `${x / head.width * 100}%`, top: `${transform.y / head.height * 100}%`,
        width: `${asset.width * transform.scaleX / head.width * 100}%`, height: `${asset.height * transform.scaleY / head.height * 100}%`,
        zIndex: kind === 'eyebrow' ? 4 : 2,
        transform: `translate(-50%,-50%) rotate(${rotation}deg) scaleX(${Boolean(transform.flipX) !== mirrored ? -1 : 1})`,
        pointerEvents: canDrag ? 'auto' : 'none', cursor: canDrag ? 'grab' : undefined, touchAction: canDrag ? 'none' : undefined
      }
      return <img key={`${kind}-${asset.id}-${right}`} className="expression-head-piece" src={asset.dataUrl} alt={canDrag ? `Arraste para mover ${layer === 'browLeft' || layer === 'browRight' ? 'a sobrancelha' : 'o olho'}` : ''} style={imageStyle}
        onPointerDown={canDrag ? (event) => beginPreviewLayerDrag(event, dragMappings) : undefined}
        onPointerMove={canDrag ? movePreviewLayerDrag : undefined} onPointerUp={canDrag ? endPreviewLayerDrag : undefined}
        onPointerCancel={canDrag ? endPreviewLayerDrag : undefined} onLostPointerCapture={canDrag ? endPreviewLayerDrag : undefined} />
    }
    if (!eyeAsset) return null
    const eyeTransform = eyeTransformOverride ?? eyeAsset.defaultTransform
    const eyePhysicallyRight = eyeAsset.rightSidePositioned === true
    const eyeMirrored = right && !eyePhysicallyRight
    const eyeX = eyeMirrored ? head.width - eyeTransform.x : eyeTransform.x
    const eyeRotation = eyeMirrored ? -eyeTransform.rotation : eyeTransform.rotation
    const pupilTransform = transform
    const mirroredPupilX = pupilSourceMirrored(currentSide,physicallyRight)
    const pupilX = mirroredPupilX ? -pupilTransform.x : pupilTransform.x
    const eyeFlip = Boolean(eyeTransform.flipX) !== eyeMirrored
    const eyeFlipDirection = eyeFlip ? -1 : 1
    const maskStyle: CSSProperties = {
      left: `${eyeX / head.width * 100}%`, top: `${eyeTransform.y / head.height * 100}%`,
      width: `${eyeAsset.width * eyeTransform.scaleX / head.width * 100}%`, height: `${eyeAsset.height * eyeTransform.scaleY / head.height * 100}%`,
      transform: `translate(-50%,-50%) rotate(${eyeRotation}deg) scaleX(${eyeFlipDirection})`,
      // Match Olhos Dev: keep the source alpha mask until its sclera-only mask
      // finishes generating, so the pupil never flashes outside the eye.
      maskImage: `url(${eyeMasks[eyeAsset.id] ?? eyeAsset.dataUrl})`,
      WebkitMaskImage: `url(${eyeMasks[eyeAsset.id] ?? eyeAsset.dataUrl})`
    }
    const pupilStyle: CSSProperties = {
      left: `${50 + pupilX / (eyeFlipDirection * eyeTransform.scaleX * eyeAsset.width) * 100}%`,
      top: `${50 + pupilTransform.y / (eyeAsset.height * eyeTransform.scaleY) * 100}%`,
      width: `${pupilTransform.scaleX * 100}%`, height: `${pupilTransform.scaleY * 100}%`,
      transform: `translate(-50%,-50%) rotate(${pupilTransform.rotation * (right && !physicallyRight ? -1 : 1) * eyeFlipDirection}deg) scaleX(${Boolean(pupilTransform.flipX) !== eyeFlip ? -1 : 1})`
    }
    const pupilLayer = layerKey('pupil', currentSide)
    const pairedSide = right ? 'left' : 'right'
    const pairedPupilLayer = layerKey('pupil', pairedSide)
    const movePair = linkedLayerPairs.pupil
    const canDrag = previewGaze==='right' && (selectedLayer === pupilLayer || movePair && selectedLayer === pairedPupilLayer)
    const pairedPupilId = visibleComposition.pupils[pairedSide]
    const pairedEyeId = visibleComposition.eyes[pairedSide]
    const pairedPupilAsset = pairedPupilId ? componentAssets[pairedPupilId] : undefined
    const pairedEyeAsset = pairedEyeId ? componentAssets[pairedEyeId] : undefined
    const pairedEyeTransform = visibleTransforms[layerKey('eye', pairedSide)]
    const pairedEyeMirrored = pairedSide === 'right' && pairedEyeAsset?.rightSidePositioned !== true
    const pairedEyeRotation = pairedEyeMirrored ? -pairedEyeTransform.rotation : pairedEyeTransform.rotation
    const dragMappings: Array<Omit<PreviewLayerMapping, 'startX' | 'startY'>> = [{ layer: pupilLayer, mirroredX: mirroredPupilX, rotation: eyeRotation }]
    if (movePair && pairedPupilAsset && pairedEyeAsset) dragMappings.push({
      layer: layerKey('pupil', pairedSide), mirroredX: pupilSourceMirrored(pairedSide,pairedPupilAsset.rightSidePositioned===true), rotation: pairedEyeRotation
    })
    return <span key={`${kind}-${asset.id}-${right}`} className="expression-head-pupil-mask" style={{ ...maskStyle, pointerEvents: canDrag ? 'auto' : 'none', cursor: canDrag ? 'grab' : undefined, touchAction: canDrag ? 'none' : undefined }}
      onPointerDown={canDrag ? (event) => beginPreviewLayerDrag(event, dragMappings) : undefined}
      onPointerMove={canDrag ? movePreviewLayerDrag : undefined} onPointerUp={canDrag ? endPreviewLayerDrag : undefined}
      onPointerCancel={canDrag ? endPreviewLayerDrag : undefined} onLostPointerCapture={canDrag ? endPreviewLayerDrag : undefined}>
      <img src={asset.dataUrl} alt={canDrag ? `Arraste para mover a pupila ${right ? 'direita' : 'esquerda'}` : ''} style={pupilStyle} />
    </span>
  }

  const renderCatalogPiece = (choice: ExpressionComposition['nose'] | NonNullable<ExpressionComposition['mouth']>, type: 'nose' | 'mouth'): ReactNode => {
    if (!head || !choice) return null
    const item = catalogItems[choice.catalogId]
    const piece = item?.pieces.find((entry) => entry.index === choice.index)
    const transform = visibleTransforms[type]
    if (!item || !piece || !transform) return null
    const style: CSSProperties = {
      left: `${transform.x / head.width * 100}%`, top: `${transform.y / head.height * 100}%`,
      width: `${piece.width * transform.scaleX / head.width * 100}%`, height: `${piece.height * transform.scaleY / head.height * 100}%`,
      opacity: type === 'nose' ? visibleNoseOpacity : 1,
      transform: `translate(-50%,-50%) rotate(${transform.rotation}deg) scaleX(${transform.flipX ? -1 : 1})`,
      pointerEvents: selectedLayer === type ? 'auto' : 'none', cursor: selectedLayer === type ? 'grab' : undefined, touchAction: selectedLayer === type ? 'none' : undefined
    }
    const canDrag = selectedLayer === type
    return <img key={`${type}-${item.id}-${piece.id}`} className="expression-head-piece" src={piece.dataUrl} alt={canDrag ? `Arraste para mover ${type === 'nose' ? 'o nariz' : 'a boca'}` : ''} style={style}
      onPointerDown={canDrag ? (event) => beginPreviewLayerDrag(event, [{ layer: type, mirroredX: false, rotation: 0 }]) : undefined}
      onPointerMove={canDrag ? movePreviewLayerDrag : undefined} onPointerUp={canDrag ? endPreviewLayerDrag : undefined}
      onPointerCancel={canDrag ? endPreviewLayerDrag : undefined} onLostPointerCapture={canDrag ? endPreviewLayerDrag : undefined} />
  }

  return <section className="fabricator-workspace expression-preset-workspace" aria-label="Preset Expressão Dev">
    {characterComparisonOpen && <ExpressionCharacterPreview modelSlot={modelSlot} preset={comparisonPreset} gaze={previewGaze} onClose={() => setCharacterComparisonOpen(false)}/>}
    <header className="expression-preset-toolbar">
      <button className="expression-choose-set-button" onClick={beginChoosing} disabled={loading || !head} type="button"><Icon name="face" />Escolher assets</button>
      <span className="model-slot-logo"><Icon name="face" /></span>
      <strong>Preset Expressão Dev</strong>
      <span className="expression-current-title"><b>{String(selectedExpressionIndex + 1).padStart(2, '0')}</b>{activeExpressionName}</span>
      <button type="button" className="pose-button secondary" onClick={() => setCharacterComparisonOpen(true)}
        disabled={loading || saving || !head} title="Comparar base facial e expressão num personagem do Customizador">
        Testar em personagem
      </button>
      {previewGaze==='left' && <small role="status" title="PT é uma orientação de olhar, não outra expressão">PT — prévia somente leitura. Selecione a expressão normal para editar as coordenadas.</small>}
      <span className="expression-preset-toolbar-spacer" />
      {!loading && <span className={`expression-workspace-save-status${workspaceSaveStatus === 'failed' ? ' failed' : ''}`} role="status">{workspaceSaveStatus === 'saving' ? 'Salvando rascunho…' : workspaceSaveStatus === 'failed' ? 'Falha ao salvar' : 'Rascunho salvo'}</span>}
      <span className="expression-preset-model-label">Modelo {String(modelSlot).padStart(2, '0')} · {project?.name ?? 'sem modelo'}</span>
      <button className="expression-save-button" onClick={() => void saveCurrentPreset()} disabled={loading || saving || switchingExpression} type="button"><Icon name="save" />{saving ? 'Salvando…' : `Salvar ${activeExpressionName}`}</button>
    </header>
    {error && <div className="expression-preset-error" role="alert">{error}</div>}
    <div className="expression-preset-body">
    <aside className="expression-collection-panel" aria-label="Conjuntos de expressão">
      <header className="expression-collection-heading"><span><strong>Conjuntos</strong><small>{collections.length + 1} conjunto(s)</small></span><button type="button" disabled={loading || saving} onClick={() => { setNewCollectionName(''); setCollectionDialogOpen(true) }}><Icon name="plus" />Novo</button></header>
      <button className={`expression-collection-card${selectedCollectionId === EXPRESSION_COLLECTION_ID ? ' active' : ''}`} type="button" aria-pressed={selectedCollectionId === EXPRESSION_COLLECTION_ID} disabled={switchingExpression || saving} onClick={() => void selectCollection(EXPRESSION_COLLECTION_ID)}>
        <span className="expression-collection-icon"><Icon name="face" /></span>
        <span><strong>Padrão</strong><small>21 expressões</small></span>
        <b>›</b>
      </button>
      {collections.map((collection) => <button key={collection.id} className={`expression-collection-card${selectedCollectionId === collection.id ? ' active' : ''}`} type="button" aria-pressed={selectedCollectionId === collection.id} disabled={switchingExpression || saving} onClick={() => void selectCollection(collection.id)}>
        <span className="expression-collection-icon"><Icon name="face" /></span>
        <span><strong>{collection.name}</strong><small>21 expressões</small></span>
        <b>›</b>
      </button>)}
    </aside>
    <aside className="expression-sequence-panel" aria-label={`Sequência do conjunto ${selectedCollectionId === EXPRESSION_COLLECTION_ID ? 'Padrão' : collections.find((collection) => collection.id === selectedCollectionId)?.name ?? ''}`}>
      <header className="expression-sequence-actions">
        <button className="expression-sequence-new" type="button" disabled={loading || switchingExpression || saving} onClick={createExpression}><Icon name="plus" />Nova</button>
        <button className="expression-sequence-reset" type="button" title="Restaurar os valores originais da expressão atual" aria-label="Restaurar expressão atual" disabled={loading || switchingExpression || saving} onClick={resetCurrentExpression}><Icon name="reset" />Restaurar</button>
      </header>
      <nav className="expression-sequence-list" aria-label="Expressões do conjunto Padrão">
        {STANDARD_EXPRESSIONS.map((name, index) => {
          const saved = expressionPresetByIndex.has(index)
          const cached = workingCopies[expressionWorkingCopyKey(selectedCollectionId, index)]
          const isActive = selectedExpressionIndex === index
          return <div className="expression-sequence-row" key={name}>
            <button type="button" className={`expression-sequence-item${isActive ? ' active' : ''}`} aria-pressed={isActive} disabled={loading || switchingExpression || saving} onClick={() => void selectExpression(index)}>
              <b>{String(index + 1).padStart(2, '0')}</b><span>{name}</span><small>{isActive ? 'Editando' : saved ? 'Salvo' : cached ? 'Rascunho' : 'Vazio'}</small>
            </button>
            <button className="expression-sequence-look-left" type="button" aria-pressed={isActive && previewGaze === 'left'} title={`Carregar ${name} com as pupilas voltadas à esquerda`} aria-label={`Pupilas à esquerda: ${name}`} disabled={loading || switchingExpression || saving} onClick={() => void selectExpression(index, true)}>pt</button>
          </div>
        })}
        {customExpressionIndices.map((index) => {
          const saved = expressionPresetByIndex.has(index)
          const cached = workingCopies[expressionWorkingCopyKey(selectedCollectionId, index)]
          const isActive = selectedExpressionIndex === index
          const name = collectionExpressionNames[index] ?? expressionPresetByIndex.get(index)?.name ?? `Nova expressão ${index - STANDARD_EXPRESSIONS.length + 1}`
          return <div className="expression-sequence-row" key={`custom-${index}`}>
            <button type="button" className={`expression-sequence-item expression-sequence-item-custom${isActive ? ' active' : ''}`} aria-pressed={isActive} disabled={loading || switchingExpression || saving} onClick={() => void selectExpression(index)}>
              <b>+</b><span>{name}</span><small>{isActive ? 'Editando' : saved ? 'Salvo' : cached ? 'Rascunho' : 'Vazio'}</small>
            </button>
            <button className="expression-sequence-look-left" type="button" aria-pressed={isActive && previewGaze === 'left'} title={`Carregar ${name} com as pupilas voltadas à esquerda`} aria-label={`Pupilas à esquerda: ${name}`} disabled={loading || switchingExpression || saving} onClick={() => void selectExpression(index, true)}>pt</button>
          </div>
        })}
      </nav>
    </aside>
    <main className="expression-head-stage" aria-label="Prévia da cabeça">
      {loading ? <span>Carregando cabeça e biblioteca facial…</span> : head ? <div ref={previewCanvas} className="expression-head-canvas" style={{ aspectRatio: `${head.width} / ${head.height}` }}>
        <img className="expression-head-base" src={head.dataUrl} alt="Cabeça do modelo" />
        <div className="expression-head-effects" aria-label="Prévia dos efeitos da expressão" style={{ WebkitMaskImage: `url(${head.dataUrl})`, maskImage: `url(${head.dataUrl})` }}>{(['shadow', 'blush', 'mouthBlush'] as const).map((key) => {
          const effect = effects[key]
          if (!effect.enabled) return null
          const color = `color-mix(in srgb, ${effect.color} ${Math.round(effect.opacity * (key === 'blush' ? .54 : 1) * 100)}%, transparent)`
          if (key === 'shadow') return <span key={key} className="expression-preview-shadow" aria-hidden="true" style={{ top: `${effect.offsetY * 100}%`, height: `${effect.size * 100}%`, background: `linear-gradient(180deg, ${color}, transparent)` }} />
          if (key === 'blush') {
            const shape = effect.style ?? 'cheeks'
            const radial = (at: string) => `radial-gradient(ellipse at ${at}, ${color}, transparent ${Math.round((.4 + effect.softness * .6) * 100)}%)`
            const background = shape === 'cheeks' ? `${radial('27% 50%')}, ${radial('73% 50%')}` : shape === 'bands' ? `${radial('50% 25%')}, ${radial('50% 50%')}, ${radial('50% 75%')}` : radial('50% 50%')
            return <span key={key} className="expression-preview-blush expression-preview-blush-draggable" role="group" tabIndex={0} aria-label="Posição do blush nas bochechas. Arraste ou use as setas para mover; Shift move mais." onPointerDown={beginBlushDrag} onPointerMove={moveBlushDrag} onPointerUp={endBlushDrag} onPointerCancel={endBlushDrag} onLostPointerCapture={endBlushDrag} onKeyDown={nudgeBlush} style={{ left: `${50 + (effect.offsetX ?? 0) * 100}%`, top: `${50 + effect.offsetY * 100}%`, width: `${effect.size * 100}%`, height: `${effect.size * (effect.aspectRatio ?? .52) * 100}%`, background, transform: `translate(-50%,-50%) rotate(${shape === 'diagonal' ? -16 : 0}deg)` }} />
          }
          if (!visibleComposition.mouth) return null
          const mouthTransform = visibleTransforms.mouth
          return <span key={key} className="expression-preview-mouth-blush" aria-hidden="true" style={{ left: `${(mouthTransform.x + (effect.offsetX ?? 0) * head.width) / (head.width || 1) * 100}%`, top: `${(mouthTransform.y + effect.offsetY * head.height) / (head.height || 1) * 100}%`, width: `${(effect.width ?? effect.size) * 100}%`, height: `${(effect.height ?? effect.size * (effect.aspectRatio ?? .52)) * 100}%`, background: `radial-gradient(ellipse, ${color}, transparent ${Math.round((.4 + effect.softness * .58) * 100)}%)`, transform: `translate(-50%,-50%) rotate(${mouthTransform.rotation + (effect.rotation ?? 0)}deg)` }} />
        })}</div>
        {(['left', 'right'] as const).map((currentSide) => {
          const eye = componentAssets[visibleComposition.eyes[currentSide] ?? '']
          const pupil = componentAssets[visibleComposition.pupils[currentSide] ?? '']
          const brow = componentAssets[visibleComposition.eyebrows[currentSide] ?? '']
          return <span className="expression-head-side-layer" key={currentSide} data-side={currentSide}>
            {eye && renderComponent(eye.id, 'eye', currentSide, visibleTransforms[layerKey('eye', currentSide)])}
            {pupil && eye && renderComponent(pupil.id, 'pupil', currentSide, visibleTransforms[layerKey('pupil', currentSide)], eye, visibleTransforms[layerKey('eye', currentSide)])}
            {brow && renderComponent(brow.id, 'eyebrow', currentSide, visibleTransforms[layerKey('eyebrow', currentSide)])}
          </span>
        })}
        {renderCatalogPiece(visibleComposition.nose, 'nose')}
        {renderCatalogPiece(visibleComposition.mouth, 'mouth')}
      </div> : <div className="expression-head-empty"><Icon name="face" /><strong>Este slot ainda não tem uma cabeça</strong><span>Importe um modelo no slot {modelSlot} para montar a prévia da expressão.</span></div>}
      {head && <span className="expression-head-caption">Prévia da cabeça · escolha os assets para ver a composição</span>}
    </main>
    <aside className="expression-preset-inspector">
      <header><strong>Ajustes deste preset</strong><small>Salvos separados de Olhos Dev e Rosto Dev</small></header>
      <section className="expression-layer-picker" aria-label="Peça do preset">
        <strong>Peça</strong>
        <div className="expression-layer-picker-grid">
          {presetLayerPairs.map(({ kind, label, keys, labels }) => <section className="expression-layer-pair" key={kind} aria-label={label}>
            <div role="group" aria-label={`Escolher ${label.toLowerCase()} para ajustar`}>
              {keys.map((key, index) => <button key={key} type="button" aria-pressed={selectedLayer === key} className={selectedLayer === key ? 'active' : ''} onClick={() => setSelectedLayer(key)}>
                <Icon name="eye" /><span>{labels[index]}</span>
              </button>)}
            </div>
            <label><input type="checkbox" checked={linkedLayerPairs[kind]} onChange={(event) => setLinkedLayerPairs((current) => ({ ...current, [kind]: event.target.checked }))} /><span>Mover os dois lados juntos</span></label>
          </section>)}
          <div className="expression-layer-singles" role="group" aria-label="Escolher nariz ou boca para ajustar">
            {presetSingleLayers.map(({ key, label, icon }) => <button key={key} type="button" aria-pressed={selectedLayer === key} className={selectedLayer === key ? 'active' : ''} onClick={() => setSelectedLayer(key)}>
              <Icon name={icon} /><span>{label}</span>
            </button>)}
          </div>
        </div>
      </section>
      {(['x', 'y'] as const).map((field) => <label className="expression-transform-control" key={field}>{field === 'x' ? 'Posição horizontal' : 'Posição vertical'}<input type="range" min={-100} max={Math.max(100, (field === 'x' ? head?.width : head?.height) ?? 100)} step="1" value={transforms[selectedLayer][field]} onChange={(event) => updateLayerTransform(selectedLayer, { [field]: Number(event.target.value) })} /><output>{Math.round(transforms[selectedLayer][field])} px</output></label>)}
      {(['scaleX', 'scaleY'] as const).map((field) => <label className="expression-transform-control" key={field}>{field === 'scaleX' ? 'Largura' : 'Altura'}<input type="range" min="0.02" max="4" step="0.01" value={transforms[selectedLayer][field]} onChange={(event) => updateLayerTransform(selectedLayer, { [field]: Number(event.target.value) })} /><output>{Math.round(transforms[selectedLayer][field] * 100)}%</output></label>)}
      <label className="expression-transform-control">Rotação<input type="range" min="-180" max="180" step="1" value={transforms[selectedLayer].rotation} onChange={(event) => updateLayerTransform(selectedLayer, { rotation: Number(event.target.value) })} /><output>{Math.round(transforms[selectedLayer].rotation)}°</output></label>
      <button className="expression-flip-button" type="button" onClick={() => updateLayerTransform(selectedLayer, { flipX: !transforms[selectedLayer].flipX })}><Icon name="flipHorizontal" />{transforms[selectedLayer].flipX ? 'Desespelhar peça' : 'Espelhar peça'}</button>
      {selectedLayer === 'nose' && <label className="expression-transform-control">Transparência<input type="range" min="0" max="1" step="0.01" value={noseOpacity} onChange={(event) => setNoseOpacity(Number(event.target.value))} /><output>{Math.round((1 - noseOpacity) * 100)}%</output></label>}
      <button className="expression-flip-button" type="button" onClick={resetSelectedLayer}><Icon name="reset" />Restaurar valores emprestados</button>
      <small>Esses valores pertencem apenas ao preset atual. Eles não alteram os assets de origem.</small>
      <section className="expression-effects-section" aria-label="Efeitos da expressão">
        <header><strong>Efeitos da expressão</strong><small>Aplicados somente a este preset</small></header>
        {([['shadow', 'Sombra'], ['blush', 'Blush nas bochechas'], ['mouthBlush', 'Blush na boca']] as const).map(([key, label]) => {
          const effect = effects[key]
          return <details className="expression-effect-card" key={key} open={effect.enabled}>
            <summary><label><input type="checkbox" checked={effect.enabled} onChange={(event) => updateEffect(key, { enabled: event.target.checked })} />{label}</label></summary>
            <label className="expression-effect-color">Cor<input type="color" value={effect.color} onChange={(event) => updateEffect(key, { color: event.target.value })} /></label>
            {key === 'blush' && <label className="expression-effect-color">Formato<select value={effect.style ?? 'cheeks'} onChange={(event) => updateEffect(key, { style: event.target.value as NonNullable<typeof effect.style> })}><option value="oval">Oval</option><option value="cheeks">Duas bochechas</option><option value="bands">Faixas</option><option value="diagonal">Diagonal</option><option value="spot">Ponto</option></select></label>}
            {key === 'blush' && <small className="expression-effect-hint">Arraste o blush na prévia para ajustar a posição.</small>}
            {key === 'mouthBlush' ? <>
              {([['opacity', 'Intensidade', 0, 1, .01], ['softness', 'Suavidade', 0, 1, .01]] as const).map(([field, title, min, max, step]) => <label className="expression-transform-control" key={field}>{title}<input type="range" min={min} max={max} step={step} value={effect[field]} onChange={(event) => updateEffect(key, { [field]: Number(event.target.value) })} /><output>{Math.round(effect[field] * 100)}%</output></label>)}
              {([['width', 'Largura', .01, 1, .01], ['height', 'Altura', .01, 1, .01], ['offsetY', 'Posição vertical', -.5, .5, .01], ['offsetX', 'Posição horizontal', -.5, .5, .01], ['rotation', 'Rotação', -180, 180, 1]] as const).map(([field, title, min, max, step]) => {
                const value = field === 'width' ? effect.width ?? effect.size : field === 'height' ? effect.height ?? effect.size * (effect.aspectRatio ?? .52) : field === 'rotation' ? effect.rotation ?? 0 : effect[field] ?? 0
                return <label className="expression-transform-control" key={field}>{title}<input type="range" min={min} max={max} step={step} value={value} onChange={(event) => updateEffect(key, { [field]: Number(event.target.value) })} /><output>{field === 'rotation' ? `${Math.round(value)}°` : `${Math.round(value * 100)}%`}</output></label>
              })}
            </> : <>
              {([['opacity', 'Intensidade', 0, 1, .01], ['softness', 'Suavidade', 0, 1, .01], ['size', 'Tamanho', .05, 2, .01], ['offsetY', key === 'shadow' ? 'Altura da sombra' : 'Posição vertical', -.5, .5, .01]] as const).map(([field, title, min, max, step]) => <label className="expression-transform-control" key={field}>{title}<input type="range" min={min} max={max} step={step} value={effect[field]} onChange={(event) => updateEffect(key, { [field]: Number(event.target.value) })} /><output>{field === 'offsetY' ? `${Math.round(effect.offsetY * 100)}%` : `${Math.round(effect[field] * 100)}%`}</output></label>)}
              {key !== 'shadow' && <><label className="expression-transform-control">Proporção vertical<input type="range" min="0.05" max="2" step="0.01" value={effect.aspectRatio ?? .52} onChange={(event) => updateEffect(key, { aspectRatio: Number(event.target.value) })} /><output>{Math.round((effect.aspectRatio ?? .52) * 100)}%</output></label><label className="expression-transform-control">Posição horizontal<input type="range" min="-0.5" max="0.5" step="0.01" value={effect.offsetX ?? 0} onChange={(event) => updateEffect(key, { offsetX: Number(event.target.value) })} /><output>{Math.round((effect.offsetX ?? 0) * 100)}%</output></label></>}
            </>}
          </details>
        })}
      </section>
    </aside>
    </div>
    {open && <div className="expression-picker-backdrop" role="presentation" onClick={cancelChoosing}>
      <section className="expression-picker-modal" role="dialog" aria-modal="true" aria-labelledby="expression-picker-title" onClick={(event) => event.stopPropagation()}>
        <header><span><small>MODELO {String(modelSlot).padStart(2, '0')}</small><h2 id="expression-picker-title">Escolher conjunto</h2></span><button aria-label="Fechar" onClick={cancelChoosing} type="button">×</button></header>
        <nav className="expression-picker-categories" aria-label="Categorias faciais">
          {([['eyes', 'Olhos'], ['pupils', 'Pupilas'], ['eyebrows', 'Sobrancelhas'], ['nose', 'Nariz'], ['mouth', 'Boca']] as const).map(([id, label]) => <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)} type="button">{label}</button>)}
        </nav>
        <div className="expression-picker-content">
          {(category === 'eyes' || category === 'pupils' || category === 'eyebrows') && <>
            <h3>Escolha {category === 'eyes' ? 'um par de olhos' : category === 'pupils' ? 'um par de pupilas' : 'um par de sobrancelhas'}</h3>
            <div className="expression-picker-assets expression-picker-pairs">{visibleComponentOptions.map((option) => {
              const leftAsset = componentAssets[option.leftId]
              const rightAsset = componentAssets[option.rightId]
              return <button key={option.key} className={selectedOptionKey === option.key ? 'selected' : ''} onClick={() => setComponentChoice(option)} type="button">
                <span className="expression-component-option-preview"><img src={leftAsset?.dataUrl} alt="" /><img className={option.leftId === option.rightId ? 'mirrored' : ''} src={rightAsset?.dataUrl} alt="" /></span>
                <span>{option.name}</span><small>Esquerda + direita</small>
              </button>
            })}{!visibleComponentOptions.length && <p className="expression-picker-empty">Nenhuma peça salva nesta categoria.</p>}</div>
          </>}
          {(category === 'nose' || category === 'mouth') && <>
            {category === 'mouth' && <div className="expression-picker-sides"><button className={mouthKind === 'mouth-closed' ? 'active' : ''} onClick={() => setMouthKind('mouth-closed')} type="button">Fechadas</button><button className={mouthKind === 'mouth-open' ? 'active' : ''} onClick={() => setMouthKind('mouth-open')} type="button">Abertas</button></div>}
            <h3>{category === 'nose' ? 'Escolha o nariz' : 'Escolha a folha de bocas'}</h3>
            <div className="expression-picker-assets expression-picker-catalog-assets">{filteredCatalogOptions.map((option) => {
              const item = option.item
              const detail = catalogItems[item.id]
              const selectedId = category === 'nose' ? draft.nose?.catalogId : draft.mouth?.catalogId
              const selected = Boolean(selectedId && option.ids.includes(selectedId))
              const preview = detail?.pieces[0]
              return <button key={option.key} className={selected ? 'selected' : ''} onClick={() => chooseCatalog(item)} type="button"><img src={preview?.dataUrl} alt="" /><span>{item.name}</span><small>{item.pieceCount} peça(s)</small></button>
            })}{!filteredCatalogOptions.length && <p className="expression-picker-empty">Nenhum asset salvo nesta categoria.</p>}</div>
            {selectedCatalog && <><h3>{category === 'nose' ? 'Variante do nariz' : 'Expressão da boca'}{category === 'mouth' ? ' · primeira peça = canto superior esquerdo' : ''}</h3><div className="expression-picker-variants">{selectedCatalog.pieces.map((piece) => {
              const selected = category === 'nose' ? draft.nose?.index === piece.index : draft.mouth?.index === piece.index
              return <button className={selected ? 'selected' : ''} key={piece.id} onClick={() => category === 'nose' ? setDraft((current) => current.nose ? { ...current, nose: { ...current.nose, index: piece.index } } : current) : setDraft((current) => current.mouth ? { ...current, mouth: { ...current.mouth, index: piece.index } } : current)} type="button"><img src={piece.dataUrl} alt="" /><b>{String(piece.index + 1).padStart(2, '0')}</b></button>
            })}</div></>}
          </>}
        </div>
        <footer><span>{draft.eyes.left || draft.eyes.right ? 'Olhos' : 'Sem olhos'} · {draft.pupils.left || draft.pupils.right ? 'pupilas' : 'sem pupilas'} · {draft.nose ? 'nariz' : 'sem nariz'} · {draft.mouth ? 'boca' : 'sem boca'}</span><button className="expression-picker-apply" disabled={saving || switchingExpression} onClick={() => void applyComposition()} type="button"><Icon name="check" />{saving ? 'Aplicando…' : 'Usar composição'}</button></footer>
      </section>
    </div>}
    {collectionDialogOpen && <div className="expression-picker-backdrop" role="presentation" onClick={() => setCollectionDialogOpen(false)}>
      <form className="expression-collection-dialog" role="dialog" aria-modal="true" aria-labelledby="expression-collection-dialog-title" onSubmit={(event) => { event.preventDefault(); void saveNewCollection() }} onClick={(event) => event.stopPropagation()}>
        <h2 id="expression-collection-dialog-title">Novo conjunto</h2>
        <label>Nome do conjunto<input autoFocus maxLength={80} value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="Ex.: Expressões da Ayla" /></label>
        <footer><button type="button" onClick={() => setCollectionDialogOpen(false)}>Cancelar</button><button type="submit" disabled={!newCollectionName.trim() || saving}>{saving ? 'Criando…' : 'Criar conjunto'}</button></footer>
      </form>
    </div>}
  </section>
}
