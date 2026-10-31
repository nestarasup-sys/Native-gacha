import { projectForOriginalPreview } from '../../../../shared/fabricatorModelViews'
import { useModelSourceRefresh } from './models/useModelSourceRefresh'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import type { FabricatorProject, FabricatorSlotSummary, HairStyle, HairStyleSave, HairStyleSummary, HairTransform, HairWorkspace as HairWorkspaceData, ModelPart } from '../../../../shared/fabricator'
import type { HairPartId } from '../../../../shared/customizer'
import { hairCategories, type HairAssetSide } from '../../../../shared/hairCategories'
import { emptyHairTransform, normalizeHairTransforms } from '../../../../shared/hairPersistence'
import { HairPiecePreview as HairPiece } from './HairPiecePreview'
import { HairImportModal } from './HairImportModal'
import { HairGridReviewModal } from './HairGridReviewModal'
import { defaultHairGridSplits, type HairGridSplits } from './hairGridLayout'
import { Icon } from '../../ui/components/Icon'
import { usePreviewBackground } from '../../ui/hooks/usePreviewBackground'
import { usePaletteImport } from './usePaletteImport'
import { useModelAppearanceTarget, useModelPartAppearancePreview } from './ModelAppearanceContext'
import { getHairWorkspaceCatalogPage, hairStyleDetailMatchesSummary, hairStyleSummary, loadHairWorkspaceCatalogPage, retainHairWorkspaceStyleDetails } from './hairWorkspaceCatalog'

type HairSide = HairAssetSide
type HairAsset = NonNullable<HairWorkspaceData['front']>
type HairDrag = { pointerId: number; side: HairSide; clientX: number; clientY: number; x: number; y: number }
type HairProcessorCut = { png: ArrayBuffer; width: number; height: number }
type HairProcessorResult =
  | { type: 'complete'; layout: 'pair'; front: HairProcessorCut; back: HairProcessorCut }
  | { type: 'complete'; layout: 'three-style-grid'; styles: Array<{ front: HairProcessorCut; back: HairProcessorCut; source: HairProcessorCut }>; splits: HairGridSplits }
  | { type: 'error'; message: string }
type HairGridStyle = { front: HairAsset; back: HairAsset; sourceImageDataUrl: string }
type HairGridReview = { sourceImageDataUrl: string; fileName: string; tolerance: number; mode: 'auto' | 'green' | 'checker' }
const defaultCategories: Record<HairSide, HairPartId> = { front: 'rearHair', back: 'backHair', fringe: 'frontHair' }

function headPart(project: FabricatorProject | null): ModelPart | null {
  return project?.parts.find((part) => /cabe[çc]a|head/i.test(part.name)) ?? null
}

function initialTransform(side: HairSide, head: ModelPart, asset: Pick<HairAsset, 'width' | 'height'>): HairTransform {
  const isFringe = side === 'fringe'
  const width = head.width * (isFringe ? 1.05 : 1.12)
  const height = head.height * (isFringe ? .55 : .92)
  return { x: head.width / 2, y: head.height * (isFringe ? .29 : .49), scaleX: width / asset.width, scaleY: height / asset.height, rotation: 0 }
}

function emptyHairWorkspace(modelSlot: number): HairWorkspaceData {
  return { schemaVersion: 1, modelSlot, front: null, back: null, fringe: null, transforms: { front: emptyHairTransform(), back: emptyHairTransform(), fringe: emptyHairTransform() }, categoryBySide: defaultCategories, chromaTolerance: 70, chromaMode: 'auto', updatedAt: new Date().toISOString() }
}

function hairStyleSides(style: Pick<HairStyleSummary, 'front' | 'back' | 'fringe'>): HairSide[] {
  return (['front', 'back', 'fringe'] as const).filter((side) => style[side] !== null && style[side] !== undefined)
}

function removeHairSide(workspace: HairWorkspaceData, side: HairSide): HairWorkspaceData {
  const { sourceImageDataUrl: _sourceImageDataUrl, ...withoutSource } = workspace
  return {
    ...withoutSource,
    [side]: null,
    transforms: { ...workspace.transforms, [side]: emptyHairTransform() },
    categoryBySide: { ...workspace.categoryBySide, [side]: defaultCategories[side] },
    sourceImageSaved: false,
    sourceAppliesToDraft: false,
    updatedAt: new Date().toISOString()
  }
}

function categoriesForStyle(style: Pick<HairStyle, 'category' | 'categoryBySide'>): Partial<Record<HairSide, HairPartId>> {
  const categories: Partial<Record<HairSide, HairPartId>> = { ...defaultCategories }
  if (style.category) {
    const side = hairCategories.find((item) => item.id === style.category)?.side
    if (side) categories[side] = style.category
  }
  return { ...categories, ...style.categoryBySide }
}

function nameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').trim().slice(0, 80) || 'Novo conjunto de cabelo'
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível abrir a folha de cabelo.'))
    image.src = dataUrl
  })
}

function imageAsPng(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a folha original para o chroma key.')
  context.drawImage(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function preserveHairFit(previous: HairTransform, oldAsset: HairAsset | null, nextAsset: HairAsset): HairTransform {
  if (!oldAsset) return previous
  return { ...previous, scaleX: previous.scaleX * oldAsset.width / nextAsset.width, scaleY: previous.scaleY * oldAsset.height / nextAsset.height }
}

function hairCutDataUrl(cut: HairProcessorCut): string {
  const bytes = new Uint8Array(cut.png); let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  return `data:image/png;base64,${btoa(binary)}`
}

function runHairProcessor(dataUrl: string, tolerance: number, mode: 'auto' | 'green' | 'checker', layout: 'pair' | 'three-style-grid', paddingPercent = 0, gridSplits?: HairGridSplits): Promise<HairProcessorResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hairProcessor.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<HairProcessorResult>) => {
      worker.terminate()
      if (data.type === 'error') { reject(new Error(data.message)); return }
      if (data.layout !== layout) { reject(new Error('O processador retornou um formato de cabelo inesperado.')); return }
      resolve(data)
    }
    worker.onerror = () => { worker.terminate(); reject(new Error('Não foi possível processar o chroma da folha de cabelo.')) }
    worker.postMessage({ dataUrl, tolerance, mode, layout, paddingPercent, gridSplits })
  })
}

function hairAssetFromCut(cut: HairProcessorCut): HairAsset {
  return { dataUrl: hairCutDataUrl(cut), width: cut.width, height: cut.height }
}

function processHairSheet(dataUrl: string, tolerance: number, mode: 'auto' | 'green' | 'checker'): Promise<{ front: HairAsset; back: HairAsset }> {
  return runHairProcessor(dataUrl, tolerance, mode, 'pair').then((result) => {
    if (result.type !== 'complete' || result.layout !== 'pair') throw new Error('Não foi possível separar a folha Posterior/Traseiro.')
    return { front: hairAssetFromCut(result.front), back: hairAssetFromCut(result.back) }
  })
}

function processThreeStyleHairGrid(dataUrl: string, tolerance: number, mode: 'auto' | 'green' | 'checker', paddingPercent = 4, gridSplits?: HairGridSplits): Promise<{ styles: HairGridStyle[]; splits: HairGridSplits }> {
  return runHairProcessor(dataUrl, tolerance, mode, 'three-style-grid', paddingPercent, gridSplits).then((result) => {
    if (result.type !== 'complete' || result.layout !== 'three-style-grid' || result.styles.length !== 3) {
      throw new Error('A grade precisa conter exatamente três cabelos completos.')
    }
    return {
      styles: result.styles.map(({ front, back, source }) => ({
        front: hairAssetFromCut(front), back: hairAssetFromCut(back), sourceImageDataUrl: hairCutDataUrl(source)
      })),
      splits: result.splits
    }
  })
}

function workspaceFromHairGridStyle(
  modelSlot: number, head: ModelPart,
  style: HairGridStyle,
  tolerance: number, mode: 'auto' | 'green' | 'checker'
): HairWorkspaceData {
  return {
    ...emptyHairWorkspace(modelSlot),
    front: style.front,
    back: style.back,
    transforms: {
      front: initialTransform('front', head, style.front),
      back: initialTransform('back', head, style.back),
      fringe: emptyHairTransform()
    },
    sourceImageDataUrl: style.sourceImageDataUrl,
    sourceImageSaved: true,
    sourceAppliesToDraft: true,
    chromaTolerance: tolerance,
    chromaMode: mode,
    updatedAt: new Date().toISOString()
  }
}

export function HairWorkspace({ baseModelSlot }: { baseModelSlot: number }) {
  const { requestPaletteImport } = usePaletteImport()
  const [background] = usePreviewBackground()
  const [models, setModels] = useState<FabricatorSlotSummary[]>([])
  const [modelSlot, setModelSlot] = useState(baseModelSlot)
  useModelAppearanceTarget(modelSlot)
  const appearancePreviewForPart = useModelPartAppearancePreview(modelSlot)
  const [project, setProject] = useState<FabricatorProject | null>(null)
  useModelSourceRefresh(modelSlot, fresh => setProject(projectForOriginalPreview(fresh)))
  const [hairWorkspace, setHairWorkspace] = useState<HairWorkspaceData | null>(null)
  const [hairStyles, setHairStyles] = useState<HairStyleSummary[]>([])
  const [hairStylesModelSlot, setHairStylesModelSlot] = useState<number | null>(null)
  const [hairDetails, setHairDetails] = useState<Record<string, HairStyle>>({})
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null)
  const [hairCatalogPage, setHairCatalogPage] = useState(0)
  const [styleName, setStyleName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<HairPartId>('rearHair')
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingProject, setLoadingProject] = useState(false)
  const [loadingHair, setLoadingHair] = useState(false)
  const [loadingHairCatalogPage, setLoadingHairCatalogPage] = useState(false)
  const [loadingStyle, setLoadingStyle] = useState(false)
  const [saving, setSaving] = useState(false)
  const [processingChroma, setProcessingChroma] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [hairGridReview, setHairGridReview] = useState<HairGridReview | null>(null)
  const [hairGridPreviewStyles, setHairGridPreviewStyles] = useState<HairGridStyle[] | null>(null)
  const [hairGridPaddingPercent, setHairGridPaddingPercent] = useState(4)
  const [hairGridSplits, setHairGridSplits] = useState<HairGridSplits>(defaultHairGridSplits)
  const [hairGridPreviewBusy, setHairGridPreviewBusy] = useState(false)
  const [hairGridPreviewError, setHairGridPreviewError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const singleFileInputRef = useRef<HTMLInputElement | null>(null)
  const threeStyleFileInputRef = useRef<HTMLInputElement | null>(null)
  const hairGridPreviewRequestRef = useRef(0)
  const hairGridPreviewTimerRef = useRef<number | null>(null)
  const dragRef = useRef<HairDrag | null>(null)
  const legacyWorkspaceRef = useRef<HairWorkspaceData | null>(null)
  const hairStyleRequestRef = useRef(0)
  const modelSlotRef = useRef(modelSlot)
  modelSlotRef.current = modelSlot
  const hairDetailsRef = useRef(hairDetails)
  hairDetailsRef.current = hairDetails
  useEffect(() => () => { hairStyleRequestRef.current += 1 }, [])
  useEffect(() => () => {
    hairGridPreviewRequestRef.current += 1
    if (hairGridPreviewTimerRef.current !== null) window.clearTimeout(hairGridPreviewTimerRef.current)
  }, [])
  const head = useMemo(() => project?.slot === modelSlot ? headPart(project) : null, [project, modelSlot])
  const category = hairCategories.find((item) => item.id === selectedCategory)!
  const selectedSide = category.side
  const selectedAsset = (hairWorkspace?.categoryBySide?.[selectedSide] ?? defaultCategories[selectedSide]) === selectedCategory ? hairWorkspace?.[selectedSide] ?? null : null
  const selectedTransform = selectedAsset ? hairWorkspace?.transforms[selectedSide] ?? null : null
  const visibleDraft = (side: HairSide) => selectedSide !== side || selectedAsset !== null
  const currentHairStyles = hairStylesModelSlot === modelSlot ? hairStyles : []
  const activeStyleSummary = currentHairStyles.find((style) => style.id === activeStyleId)
  const hairCatalogPageView = useMemo(() => getHairWorkspaceCatalogPage(currentHairStyles, hairCatalogPage), [currentHairStyles, hairCatalogPage])
  const retainedHairStyleIds = useMemo(() => new Set([
    ...hairCatalogPageView.visibleStyles.map((style) => style.id),
    ...(activeStyleId ? [activeStyleId] : [])
  ]), [hairCatalogPageView.visibleStyles, activeStyleId])
  const retainedHairStyleIdsRef = useRef<ReadonlySet<string>>(retainedHairStyleIds)
  retainedHairStyleIdsRef.current = retainedHairStyleIds
  const setActiveHairDetails = useCallback<Dispatch<SetStateAction<Record<string, HairStyle>>>>((update) => {
    const slot = modelSlotRef.current
    setHairDetails((current) => {
      const next = typeof update === 'function' ? update(current) : update
      return retainHairWorkspaceStyleDetails(next, slot, retainedHairStyleIdsRef.current)
    })
  }, [])
  const chromaReady = Boolean(hairWorkspace?.sourceImageDataUrl && hairWorkspace.sourceAppliesToDraft !== false)
  const draftPieces = (['front', 'back', 'fringe'] as const).flatMap((side) => {
    const asset = hairWorkspace?.[side]
    if (!asset) return []
    const pieceCategory = hairWorkspace?.categoryBySide?.[side] ?? defaultCategories[side]
    return [{ side, asset, pieceCategory, pieceName: hairCategories.find((item) => item.id === pieceCategory)?.label ?? side }]
  })

  useEffect(() => {
    let cancelled = false
    void window.desktop.fabricator.listFabricatorSlots().then((slots) => {
      if (cancelled) return
      setModels(slots)
      const firstAvailable = slots.find((slot): slot is NonNullable<typeof slot> => slot !== null)
      if (!slots[modelSlot - 1] && firstAvailable) setModelSlot(firstAvailable.slot)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os modelos.')
    }).finally(() => { if (!cancelled) setLoadingModels(false) })
    return () => { cancelled = true }
  }, [baseModelSlot])

  useEffect(() => {
    let cancelled = false
    setActiveStyleId(null)
    setHairStyles([])
    setHairStylesModelSlot(null)
    setHairDetails({})
    setHairCatalogPage(0)
    setLoadingHairCatalogPage(false)
    setLoadingStyle(false)
    hairStyleRequestRef.current += 1
    setStyleName('')
    legacyWorkspaceRef.current = null
    setProject(null)
    setHairWorkspace(null)
    setDirty(false)
    setError('')
    setLoadingProject(true)
    void window.desktop.fabricator.loadFabricatorSlot(modelSlot).then((loaded) => {
      if (cancelled) return
      setProject(projectForOriginalPreview(loaded))
      if (!loaded) setError('Este slot ainda não tem um modelo salvo.')
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o modelo selecionado.')
    }).finally(() => { if (!cancelled) setLoadingProject(false) })
    return () => { cancelled = true }
  }, [modelSlot])

  useEffect(() => {
    if (!head) return
    let cancelled = false
    setLoadingHair(true)
    void Promise.all([window.desktop.fabricator.loadHairWorkspace(modelSlot), window.desktop.fabricator.listHairStyles(modelSlot)]).then(([saved, summaries]) => {
      if (cancelled) return
      setHairStyles(summaries)
      setHairStylesModelSlot(modelSlot)
      const legacy = summaries.find((style) => style.id === 'legacy-workspace')
      const legacyWorkspace = saved ? {
        chromaTolerance: 70, chromaMode: 'auto' as const, ...saved, fringe: saved.fringe ?? null,
        transforms: { ...saved.transforms, fringe: saved.transforms.fringe ?? (saved.fringe ? initialTransform('fringe', head, saved.fringe) : emptyHairTransform()) }
      } : null
      if (legacy && legacyWorkspace) {
        legacyWorkspaceRef.current = legacyWorkspace
        setHairWorkspace(legacyWorkspace)
        setActiveStyleId(legacy.id)
        setStyleName(legacy.name)
        const firstSide = hairStyleSides(legacy)[0]
        const firstCategory = firstSide ? categoriesForStyle(legacy)[firstSide] : undefined
        if (firstCategory) setSelectedCategory(firstCategory)
      } else {
        legacyWorkspaceRef.current = null
        setHairWorkspace(emptyHairWorkspace(modelSlot))
        setActiveStyleId(null)
        setStyleName('')
      }
      setDirty(false)
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setHairWorkspace(emptyHairWorkspace(modelSlot))
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os cabelos deste modelo.')
      }
    }).finally(() => { if (!cancelled) setLoadingHair(false) })
    return () => { cancelled = true }
  }, [modelSlot, head])

  useEffect(() => {
    if (loadingHair || !head || hairCatalogPageView.visibleStyles.length === 0) {
      setLoadingHairCatalogPage(false)
      return
    }
    let cancelled = false
    setLoadingHairCatalogPage(true)
    void loadHairWorkspaceCatalogPage(
      hairCatalogPageView.visibleStyles,
      () => cancelled,
      (summary) => {
        const loaded = hairDetailsRef.current[`${modelSlot}:${summary.id}`]
        return hairStyleDetailMatchesSummary(summary, loaded)
      },
      (id) => window.desktop.fabricator.loadHairStyle(modelSlot, id)
    ).then((styles) => {
      if (cancelled || styles.length === 0) return
      setActiveHairDetails((current) => {
        const next = { ...current }
        for (const style of styles) next[`${modelSlot}:${style.id}`] = style
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as prévias do catálogo de cabelos.')
    }).finally(() => { if (!cancelled) setLoadingHairCatalogPage(false) })
    return () => { cancelled = true }
  }, [modelSlot, loadingHair, head, hairCatalogPageView.visibleStyles, setActiveHairDetails])

  useEffect(() => {
    setActiveHairDetails((current) => retainHairWorkspaceStyleDetails(
      current,
      modelSlotRef.current,
      retainedHairStyleIdsRef.current
    ))
  }, [modelSlot, retainedHairStyleIds, setActiveHairDetails])

  function updateWorkspace(updater: (current: HairWorkspaceData) => HairWorkspaceData) {
    setHairWorkspace((current) => current ? { ...updater(current), updatedAt: new Date().toISOString() } : current)
    setDirty(true)
    setNotice('')
  }

  async function importSheet(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !head || !hairWorkspace) return
    if (dirty && (hairWorkspace.front || hairWorkspace.back) && !window.confirm('Substituir a folha atual e descartar os ajustes não salvos?')) return
    setError(''); setNotice('Normalizando a paleta e preparando a folha…')
    try {
      const uploadDataUrl = await requestPaletteImport(file, 'hair')
      if (!uploadDataUrl) { setNotice(''); return }
      const image = await loadImage(uploadDataUrl)
      if (image.naturalHeight < 2) throw new Error('A folha precisa ter o cabelo posterior em cima e o traseiro em baixo.')
      const sourceImageDataUrl = imageAsPng(image)
      const tolerance = hairWorkspace.chromaTolerance ?? 70
      const mode = hairWorkspace.chromaMode ?? 'auto'
      const { front, back } = await processHairSheet(sourceImageDataUrl, tolerance, mode)
      updateWorkspace((current) => ({ ...current, front, back, categoryBySide: { ...current.categoryBySide, front: 'rearHair', back: 'backHair' }, sourceImageDataUrl, sourceImageSaved: true, sourceAppliesToDraft: true, chromaTolerance: tolerance, chromaMode: mode, transforms: { ...current.transforms, front: initialTransform('front', head, front), back: initialTransform('back', head, back) } }))
      if (!activeStyleId && !styleName.trim()) setStyleName(nameFromFile(file))
      setSelectedCategory(selectedCategory === 'backHair' ? 'backHair' : 'rearHair')
      setNotice('Folha separada dentro do conjunto: posterior, traseiro e franja ficam juntos ao salvar.')
    } catch (reason) { setNotice(''); setError(reason instanceof Error ? reason.message : 'Não foi possível separar a folha de cabelo.') }
  }

  async function importThreeStyleGrid(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !head || !hairWorkspace) return
    if (dirty && (hairWorkspace.front || hairWorkspace.back || hairWorkspace.fringe)
      && !window.confirm('Há alterações não salvas. Importar a grade vai substituir o rascunho atual. Continuar?')) return

    setError('')
    setNotice('Normalizando as cores e analisando as seis áreas da imagem…')
    setSaving(true)
    setHairGridPreviewBusy(true)
    try {
      const uploadDataUrl = await requestPaletteImport(file, 'hair')
      if (!uploadDataUrl) return
      const sourceImageDataUrl = imageAsPng(await loadImage(uploadDataUrl))
      const tolerance = hairWorkspace.chromaTolerance ?? 70
      const mode = hairWorkspace.chromaMode ?? 'auto'
      const paddingPercent = 4
      const result = await processThreeStyleHairGrid(sourceImageDataUrl, tolerance, mode, paddingPercent)
      setHairGridReview({ sourceImageDataUrl, fileName: nameFromFile(file), tolerance, mode })
      setHairGridPreviewStyles(result.styles)
      setHairGridPaddingPercent(paddingPercent)
      setHairGridSplits(result.splits)
      setHairGridPreviewError('')
      setNotice('Detectei os espaços entre as silhuetas. Confira as seis peças e ajuste as guias ou a margem antes de salvar.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível analisar a grade de três cabelos.')
    } finally { setSaving(false); setHairGridPreviewBusy(false) }
  }

  function queueHairGridPreviewReprocessing(paddingPercent: number, splits: HairGridSplits) {
    paddingPercent = Math.max(0, Math.min(12, Math.round(paddingPercent)))
    setHairGridPaddingPercent(paddingPercent)
    setHairGridSplits(splits)
    if (!hairGridReview) return
    setHairGridPreviewBusy(true)
    setHairGridPreviewError('')
    const requestId = ++hairGridPreviewRequestRef.current
    if (hairGridPreviewTimerRef.current !== null) window.clearTimeout(hairGridPreviewTimerRef.current)
    hairGridPreviewTimerRef.current = window.setTimeout(() => {
      hairGridPreviewTimerRef.current = null
      void processThreeStyleHairGrid(hairGridReview.sourceImageDataUrl, hairGridReview.tolerance, hairGridReview.mode, paddingPercent, splits)
        .then((result) => {
          if (hairGridPreviewRequestRef.current === requestId) {
            setHairGridPreviewStyles(result.styles)
            setHairGridSplits(result.splits)
          }
        })
        .catch((reason: unknown) => {
          if (hairGridPreviewRequestRef.current === requestId) setHairGridPreviewError(reason instanceof Error ? reason.message : 'Não foi possível recalcular os recortes.')
        })
        .finally(() => {
          if (hairGridPreviewRequestRef.current === requestId) setHairGridPreviewBusy(false)
        })
    }, 180)
  }

  function cancelHairGridReview() {
    hairGridPreviewRequestRef.current += 1
    if (hairGridPreviewTimerRef.current !== null) window.clearTimeout(hairGridPreviewTimerRef.current)
    hairGridPreviewTimerRef.current = null
    setHairGridReview(null)
    setHairGridPreviewStyles(null)
    setHairGridSplits(defaultHairGridSplits)
    setHairGridPreviewError('')
    setHairGridPreviewBusy(false)
  }

  async function saveHairGridReview() {
    if (!hairGridReview || !hairGridPreviewStyles || hairGridPreviewStyles.length !== 3 || hairGridPreviewBusy || saving || !head) return
    const review = hairGridReview
    const styles = hairGridPreviewStyles
    const imported: Array<{ detail: HairStyle; workspace: HairWorkspaceData }> = []
    cancelHairGridReview()
    setSaving(true)
    setError('')
    setNotice('Salvando os três conjuntos…')
    try {
      for (let index = 0; index < styles.length; index += 1) {
        const workspace = workspaceFromHairGridStyle(modelSlot, head, styles[index], review.tolerance, review.mode)
        const name = `${review.fileName} ${index + 1}`.slice(0, 80)
        const detail = await saveStyle(workspace, name, null)
        imported.push({ detail, workspace })
      }

      adoptImportedHairStyles(imported)
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setNotice('3 conjuntos foram importados e salvos. O primeiro está aberto para ajuste.')
    } catch (reason) {
      if (imported.length) {
        adoptImportedHairStyles(imported)
        window.dispatchEvent(new Event('fabricator:assets-updated'))
        setError(`${imported.length} de 3 conjuntos foram salvos. A importação parou: ${reason instanceof Error ? reason.message : 'falha ao salvar o próximo conjunto.'}`)
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a grade de cabelos.')
      }
    } finally { setSaving(false) }
  }

  function adoptImportedHairStyles(imported: Array<{ detail: HairStyle; workspace: HairWorkspaceData }>) {
    if (!imported.length) return
    const first = imported[0]
    const importedIds = new Set(imported.map(({ detail }) => detail.id))
    setHairStyles((current) => [
      ...imported.map(({ detail }) => hairStyleSummary(detail)),
      ...current.filter((style) => !importedIds.has(style.id) && style.id !== 'legacy-workspace')
    ])
    setHairStylesModelSlot(modelSlot)
    setHairDetails((current) => ({
      ...current,
      ...Object.fromEntries(imported.map(({ detail }) => [`${modelSlot}:${detail.id}`, detail]))
    }))
    setHairWorkspace(first.workspace)
    setHairCatalogPage(0)
    setActiveStyleId(first.detail.id)
    setStyleName(first.detail.name)
    setSelectedCategory('rearHair')
    legacyWorkspaceRef.current = null
    setDirty(false)
  }

  async function importSinglePiece(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !head || !hairWorkspace) return
    if (dirty && hairWorkspace[selectedSide] && !window.confirm(`Substituir a peça atual de ${category.label} e descartar os ajustes não salvos?`)) return
    setError(''); setNotice('Normalizando a paleta da peça…')
    try {
      const uploadDataUrl = await requestPaletteImport(file, 'hair')
      if (!uploadDataUrl) { setNotice(''); return }
      const image = await loadImage(uploadDataUrl)
      const asset = { dataUrl: imageAsPng(image), width: image.naturalWidth, height: image.naturalHeight }
      const side = selectedSide
      updateWorkspace((current) => ({ ...current, [side]: asset, categoryBySide: { ...current.categoryBySide, [side]: selectedCategory }, sourceAppliesToDraft: false, transforms: { ...current.transforms, [side]: initialTransform(side, head, asset) } }))
      if (!activeStyleId && !styleName.trim()) setStyleName(nameFromFile(file))
      setNotice(`${category.label} importado para o conjunto. Ajuste a peça e salve o conjunto inteiro.`)
    } catch (reason) { setNotice(''); setError(reason instanceof Error ? reason.message : 'Não foi possível importar a peça de cabelo.') }
  }

  async function applyChroma(tolerance = hairWorkspace?.chromaTolerance ?? 70, mode = hairWorkspace?.chromaMode ?? 'auto') {
    if (!chromaReady || !hairWorkspace?.sourceImageDataUrl || !head || processingChroma) return
    setProcessingChroma(true); setError(''); setNotice('')
    try {
      const { front, back } = await processHairSheet(hairWorkspace.sourceImageDataUrl, tolerance, mode)
      updateWorkspace((current) => ({
        ...current,
        front, back, chromaTolerance: tolerance, chromaMode: mode,
        categoryBySide: { ...current.categoryBySide, front: 'rearHair', back: 'backHair' },
        transforms: {
          ...current.transforms,
          front: preserveHairFit(current.transforms.front, current.front, front),
          back: preserveHairFit(current.transforms.back, current.back, back)
        }
      }))
      setNotice(tolerance === 0 ? 'Chroma zerado. A folha original foi restaurada na prévia.' : 'Chroma aplicado novamente a partir da folha original.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar o chroma key.') }
    finally { setProcessingChroma(false) }
  }

  function startDrag(event: PointerEvent<HTMLImageElement>, side: HairSide) {
    if (!head || !hairWorkspace || side !== selectedSide) return
    event.preventDefault(); event.stopPropagation()
    const stage = event.currentTarget.parentElement
    if (!stage) return
    stage.setPointerCapture(event.pointerId)
    const transform = hairWorkspace.transforms[side]
    if (!transform) return
    dragRef.current = { pointerId: event.pointerId, side, clientX: event.clientX, clientY: event.clientY, x: transform.x, y: transform.y }
  }

  function moveHair(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !head) return
    const rect = event.currentTarget.getBoundingClientRect()
    const width = rect.width / zoom, height = rect.height / zoom
    if (!width || !height) return
    const dx = (event.clientX - drag.clientX) / width * head.width
    const dy = (event.clientY - drag.clientY) / height * head.height
    updateWorkspace((current) => ({ ...current, transforms: { ...current.transforms, [drag.side]: { ...current.transforms[drag.side], x: drag.x + dx, y: drag.y + dy } } }))
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  function updateHairPixels(side: HairSide, dataUrl: string) {
    updateWorkspace((current) => current[side] ? { ...current, [side]: { ...current[side]!, dataUrl } } : current)
  }

  function changeTransform(patch: Partial<HairTransform>) {
    if (!head || !selectedAsset) return
    updateWorkspace((current) => ({ ...current, transforms: { ...current.transforms, [selectedSide]: { ...(current.transforms[selectedSide] ?? initialTransform(selectedSide, head, selectedAsset)), ...patch } } }))
  }

  async function saveHair() {
    if (!hairWorkspace || saving || (!hairWorkspace.front && !hairWorkspace.back && !hairWorkspace.fringe)) return
    if (!styleName.trim()) { setError('Dê um nome para o conjunto antes de salvar.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const detail = await saveStyle(hairWorkspace)
      setHairStyles((current) => [hairStyleSummary(detail), ...current.filter((style) => style.id !== detail.id && style.id !== 'legacy-workspace')])
      setHairStylesModelSlot(modelSlot)
      setHairDetails((current) => ({ ...current, [`${modelSlot}:${detail.id}`]: detail }))
      setHairCatalogPage(0)
      setActiveStyleId(detail.id)
      setStyleName(detail.name)
      legacyWorkspaceRef.current = null
      setDirty(false)
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setNotice(`Conjunto “${detail.name}” salvo com ${hairStyleSides(detail).length} peça(s).`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível salvar os cabelos.'
      setError(message)
    }
    finally { setSaving(false) }
  }

  async function saveStyle(workspace: HairWorkspaceData, styleNameOverride = styleName, existingOverride: HairStyleSummary | null | undefined = activeStyleId && activeStyleId !== 'legacy-workspace' ? activeStyleSummary : undefined): Promise<HairStyle> {
    const existing = existingOverride ?? undefined
    const id = existing?.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const front = workspace.front
    const back = workspace.back
    const fringe = workspace.fringe ?? null
    const sourceImageDataUrl = workspace.sourceImageDataUrl
    const saved: HairStyleSave = {
      schemaVersion: 1, id, modelSlot, name: styleNameOverride.trim().slice(0, 80),
      categoryBySide: Object.fromEntries((['front', 'back', 'fringe'] as const).filter((side) => Boolean(workspace[side])).map((side) => [side, workspace.categoryBySide?.[side] ?? defaultCategories[side]])) as Partial<Record<HairSide, HairPartId>>,
      front: front ? { width: front.width, height: front.height } : null,
      back: back ? { width: back.width, height: back.height } : null,
      fringe: fringe ? { width: fringe.width, height: fringe.height } : null,
      transforms: workspace.transforms,
      sourceImageSaved: Boolean(sourceImageDataUrl),
      sourceAppliesToDraft: Boolean(sourceImageDataUrl) && workspace.sourceAppliesToDraft !== false,
      chromaTolerance: workspace.chromaTolerance ?? 70,
      chromaMode: workspace.chromaMode ?? 'auto',
      createdAt: existing?.createdAt ?? now, updatedAt: now
    }
    saved.transforms = normalizeHairTransforms(saved)
    const assets = [
      front ? { id: 'front' as const, dataUrl: front.dataUrl } : null,
      back ? { id: 'back' as const, dataUrl: back.dataUrl } : null,
      fringe ? { id: 'fringe' as const, dataUrl: fringe.dataUrl } : null,
      sourceImageDataUrl ? { id: 'source' as const, dataUrl: sourceImageDataUrl } : null
    ].filter((asset): asset is NonNullable<typeof asset> => asset !== null)
    await window.desktop.fabricator.saveHairStyle(modelSlot, saved, assets)
    return {
      ...saved,
      front: saved.front && front ? { ...front } : null,
      back: saved.back && back ? { ...back } : null,
      fringe: saved.fringe && fringe ? { ...fringe } : null,
      ...(sourceImageDataUrl ? { sourceImageDataUrl } : {})
    }
  }

  async function openStyle(summary: HairStyleSummary) {
    if (dirty && !window.confirm('Há alterações não salvas. Abrir este conjunto e descartá-las?')) return
    if (!head || loadingStyle) return
    const requestId = ++hairStyleRequestRef.current
    const requestedModelSlot = modelSlot
    setLoadingStyle(true)
    setError('')
    try {
      const cached = hairDetailsRef.current[`${requestedModelSlot}:${summary.id}`]
      const cachedIsCurrent = hairStyleDetailMatchesSummary(summary, cached)
      const legacySourceAvailable = summary.id === 'legacy-workspace' && Boolean(legacyWorkspaceRef.current?.sourceImageDataUrl)
      const includeSource = Boolean(summary.sourceImageSaved) && !legacySourceAvailable
      const needsSource = includeSource && !cached?.sourceImageDataUrl
      const style = cachedIsCurrent && !needsSource
        ? cached
        : await window.desktop.fabricator.loadHairStyle(requestedModelSlot, summary.id, includeSource)
      if (!style) throw new Error(`Não foi possível carregar o conjunto “${summary.name}”.`)
      if (hairStyleRequestRef.current !== requestId || modelSlotRef.current !== requestedModelSlot) return
      setActiveHairDetails((current) => ({ ...current, [`${requestedModelSlot}:${style.id}`]: style }))
      const sourceImageDataUrl = style.sourceImageDataUrl ?? (style.id === 'legacy-workspace' ? legacyWorkspaceRef.current?.sourceImageDataUrl : undefined)
      const categories = categoriesForStyle(style)
      const workspace: HairWorkspaceData = {
        ...emptyHairWorkspace(requestedModelSlot),
        front: style.front ? { ...style.front } : null,
        back: style.back ? { ...style.back } : null,
        fringe: style.fringe ? { ...style.fringe } : null,
        transforms: { ...structuredClone(style.transforms), fringe: style.transforms.fringe ?? (style.fringe ? initialTransform('fringe', head, style.fringe) : emptyHairTransform()) },
        categoryBySide: categories,
        ...(sourceImageDataUrl ? { sourceImageDataUrl } : {}),
        sourceImageSaved: Boolean(sourceImageDataUrl),
        sourceAppliesToDraft: style.sourceAppliesToDraft ?? legacyWorkspaceRef.current?.sourceAppliesToDraft ?? Boolean(sourceImageDataUrl),
        chromaTolerance: style.chromaTolerance ?? legacyWorkspaceRef.current?.chromaTolerance ?? 70,
        chromaMode: style.chromaMode ?? legacyWorkspaceRef.current?.chromaMode ?? 'auto',
        updatedAt: new Date().toISOString()
      }
      setHairWorkspace(workspace)
      setActiveStyleId(style.id)
      setStyleName(style.name)
      setDirty(false)
      const firstSide = hairStyleSides(style)[0]
      const firstCategory = firstSide ? categories[firstSide] : undefined
      if (firstCategory) setSelectedCategory(firstCategory)
      setNotice(`Conjunto “${style.name}” aberto com ${hairStyleSides(style).length} peça(s).`)
    } catch (reason) {
      if (hairStyleRequestRef.current === requestId && modelSlotRef.current === requestedModelSlot) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este conjunto de cabelo.')
    } finally {
      if (hairStyleRequestRef.current === requestId && modelSlotRef.current === requestedModelSlot) setLoadingStyle(false)
    }
  }

  async function deleteSelectedSet() {
    if (!activeStyleId || saving || !activeStyleSummary) return
    const dirtyMessage = dirty ? ' As alterações ainda não salvas também serão descartadas.' : ''
    if (!window.confirm(`Excluir permanentemente o conjunto “${styleName || activeStyleSummary.name}”? Todas as peças, a folha original, os backups de gravação e a cópia de rascunho deste conjunto serão removidos. Personagens que usam este conjunto perderão essa referência.${dirtyMessage}`)) return
    setSaving(true); setError(''); setNotice('')
    try {
      await window.desktop.fabricator.deleteHairStyle(modelSlot, activeStyleId)
      setHairWorkspace(emptyHairWorkspace(modelSlot))
      setDirty(false)
      setHairStyles((current) => current.filter((item) => item.id !== activeStyleId))
      setHairDetails((current) => { const next = { ...current }; delete next[`${modelSlot}:${activeStyleId}`]; return next })
      setActiveStyleId(null)
      setStyleName('')
      legacyWorkspaceRef.current = null
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setNotice(`Conjunto “${activeStyleSummary.name}” e seus arquivos foram excluídos.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o conjunto.') }
    finally { setSaving(false) }
  }

  async function deleteSelectedPiece() {
    if (!hairWorkspace || !selectedAsset || saving) return
    const side = selectedSide
    const nextWorkspace = removeHairSide(hairWorkspace, side)
    const remainingPieces = (['front', 'back', 'fringe'] as const).filter((pieceSide) => Boolean(nextWorkspace[pieceSide])).length
    const savedSet = activeStyleId ? activeStyleSummary : undefined
    const saveRestMessage = dirty && remainingPieces ? ' As alterações pendentes nas outras peças também serão salvas.' : ''
    if (savedSet && !window.confirm(`Excluir permanentemente “${category.label}” do conjunto “${savedSet.name}”? O PNG desta peça, o original da folha e os backups temporários serão removidos. Personagens que usam esta peça deixarão de encontrá-la.${remainingPieces ? ' As outras peças do conjunto serão mantidas.' : ' Como é a última peça, o conjunto inteiro também será removido.'}${saveRestMessage}`)) return

    setError(''); setNotice('')
    if (!savedSet) {
      setHairWorkspace(nextWorkspace)
      setDirty(true)
      setNotice(`${category.label} foi removido do rascunho. A folha original também foi descartada.`)
      return
    }

    setSaving(true)
    try {
      if (remainingPieces) {
        const detail = await saveStyle(nextWorkspace)
        setHairStyles((current) => [hairStyleSummary(detail), ...current.filter((style) => style.id !== detail.id && style.id !== 'legacy-workspace')])
        setHairStylesModelSlot(modelSlot)
        setHairDetails((current) => ({ ...current, [`${modelSlot}:${detail.id}`]: detail }))
        setHairCatalogPage(0)
        setHairWorkspace(nextWorkspace)
        setActiveStyleId(detail.id)
        setStyleName(detail.name)
        setDirty(false)
        legacyWorkspaceRef.current = null
        window.dispatchEvent(new Event('fabricator:assets-updated'))
        setNotice(`${category.label}, seu PNG e a folha original foram removidos. As outras peças do conjunto foram mantidas.`)
      } else {
        await window.desktop.fabricator.deleteHairStyle(modelSlot, savedSet.id)
        setHairStyles((current) => current.filter((style) => style.id !== savedSet.id))
        setHairDetails((current) => { const next = { ...current }; delete next[`${modelSlot}:${savedSet.id}`]; return next })
        setHairWorkspace(emptyHairWorkspace(modelSlot))
        setActiveStyleId(null)
        setStyleName('')
        setDirty(false)
        legacyWorkspaceRef.current = null
        window.dispatchEvent(new Event('fabricator:assets-updated'))
        setNotice(`A última peça, a folha original e o conjunto “${savedSet.name}” foram excluídos.`)
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a peça.') }
    finally { setSaving(false) }
  }

  function startNewSet() {
    if (activeStyleId === 'legacy-workspace') {
      setError('Salve este cabelo antigo primeiro para convertê-lo em conjunto antes de criar outro.')
      return
    }
    if (dirty && !window.confirm('Descartar as alterações não salvas e começar outro conjunto?')) return
    setHairWorkspace(emptyHairWorkspace(modelSlot))
    setActiveStyleId(null)
    setStyleName('')
    setDirty(false)
    setError('')
    setNotice('Novo conjunto iniciado. Importe as peças e salve quando estiver pronto.')
  }

  function flipSelectedHair() {
    changeTransform({ flipX: !selectedTransform?.flipX })
  }

  function resetSelectedTransform() {
    if (!head || !selectedAsset) return
    changeTransform(initialTransform(selectedSide, head, selectedAsset))
  }

  return <section className="fabricator-workspace hair-dev-workspace" aria-label="Cabelos Dev">
    <header className="hair-dev-toolbar">
      <span className="model-slot-logo"><Icon name="bow" /></span>
      <span><strong>Cabelos Dev</strong><small>Monte os cabelos para cada modelo</small></span>
      <label>Modelo de referência<select value={modelSlot} onChange={(event) => { if (dirty && !window.confirm('Há alterações não salvas. Descartar e trocar de modelo?')) return; cancelHairGridReview(); setImportModalOpen(false); setModelSlot(Number(event.target.value)) }} disabled={loadingModels || saving || loadingStyle || Boolean(hairGridReview)}>{models.map((model, index) => model && <option key={model.slot} value={model.slot}>Modelo {String(index + 1).padStart(2, '0')} · {model.name}</option>)}</select></label>
      <button className="hair-dev-save" onClick={() => void saveHair()} disabled={!hairWorkspace || (!hairWorkspace.front && !hairWorkspace.back && !hairWorkspace.fringe) || saving || loadingHair || loadingStyle} title={activeStyleId && activeStyleId !== 'legacy-workspace' ? 'Salvar alterações neste conjunto' : 'Salvar todas as peças como um conjunto'} type="button"><Icon name="check" />{saving ? 'Salvando…' : activeStyleId && activeStyleId !== 'legacy-workspace' ? 'Salvar alterações' : 'Salvar conjunto'}</button>
    </header>
    <div className="hair-dev-body">
      <aside className="hair-dev-library" aria-label="Biblioteca de cabelos">
        <header><strong>Conjuntos de cabelo</strong><small>{currentHairStyles.length} salvos</small></header>
        <div className="hair-dev-library-actions">
          <button type="button" onClick={startNewSet} disabled={loadingHair || loadingStyle || saving}><Icon name="plus" /> Novo conjunto</button>
          <button type="button" onClick={() => setImportModalOpen(true)} disabled={!head || loadingHair || loadingStyle || saving}><Icon name="plus" /> Importar</button>
          <button type="button" onClick={() => void deleteSelectedSet()} disabled={!activeStyleId || saving || loadingHair || loadingStyle}><Icon name="trash" /> Excluir conjunto</button>
        </div>
        <input ref={singleFileInputRef} className="hair-dev-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importSinglePiece(event)} />
        <input ref={fileInputRef} className="hair-dev-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importSheet(event)} />
        <input ref={threeStyleFileInputRef} className="hair-dev-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importThreeStyleGrid(event)} />
        <label className="hair-dev-set-name">Nome do conjunto<input maxLength={80} value={styleName} placeholder="Ex.: Cabelo longo" disabled={loadingStyle || saving} onChange={(event) => { setStyleName(event.target.value); setDirty(true) }} /></label>
        <small className="hair-dev-library-hint">Importe peças para o mesmo conjunto. O botão Salvar grava todas juntas.</small>
        <nav className="hair-dev-library-tabs" aria-label="Categorias da biblioteca" role="tablist">
          {hairCategories.map((item) => <button key={item.id} type="button" role="tab" aria-selected={selectedCategory === item.id} className={selectedCategory === item.id ? 'active' : ''} onClick={() => { setSelectedCategory(item.id); if (hairWorkspace?.[item.side] && hairWorkspace.categoryBySide?.[item.side] !== item.id) updateWorkspace((current) => ({ ...current, categoryBySide: { ...current.categoryBySide, [item.side]: item.id } })) }}>{item.label}</button>)}
        </nav>
        <section className="hair-dev-library-category" role="tabpanel" aria-label="Peças deste conjunto">
          <h3>Peças deste conjunto <small>{hairWorkspace ? (['front', 'back', 'fringe'] as const).filter((side) => Boolean(hairWorkspace[side])).length : 0}</small></h3>
          <div className="hair-dev-set-pieces">
            {draftPieces.map(({ side, asset, pieceCategory, pieceName }) => <button className={selectedSide === side && selectedAsset ? 'active' : ''} key={side} type="button" onClick={() => setSelectedCategory(pieceCategory)}><img src={asset.dataUrl} alt="" /><span>{pieceName}</span></button>)}
            {!draftPieces.length && <small>Importe peças para montar o conjunto.</small>}
          </div>
        </section>
        <section className="hair-dev-library-category hair-dev-set-catalog" aria-label="Catálogo de conjuntos">
          <h3>Catálogo <small>{currentHairStyles.length}</small></h3>
          <div className="hair-dev-set-list" aria-busy={loadingHair || loadingHairCatalogPage || loadingStyle}>
            {hairCatalogPageView.visibleStyles.map((style) => {
              const details = hairDetails[`${modelSlot}:${style.id}`]
              return <button className={style.id === activeStyleId ? 'active' : ''} key={style.id} disabled={loadingHair || loadingHairCatalogPage || loadingStyle || loadingProject || saving} type="button" onClick={() => void openStyle(style)}>
                <span className="hair-dev-set-thumbnails">{hairStyleSides(style).map((side) => {
                  const asset = details?.[side]
                  return asset?.dataUrl
                    ? <img key={side} src={asset.dataUrl} alt="" />
                    : <span className="hair-dev-set-thumbnail-empty" key={side} aria-hidden="true"><Icon name="bow" /></span>
                })}</span>
                <span className="hair-dev-set-caption"><b>{style.name}</b><small>{hairStyleSides(style).length} peça(s)</small></span>
              </button>
            })}
            {loadingHairCatalogPage && <small>Carregando prévias…</small>}
            {!loadingHair && !currentHairStyles.length && <small>Nenhum conjunto salvo para este modelo.</small>}
          </div>
          {currentHairStyles.length > 0 && <nav className="hair-dev-set-pagination" aria-label="Páginas do catálogo de cabelos">
            <button type="button" aria-label="Página anterior" disabled={hairCatalogPageView.page === 0 || loadingHairCatalogPage} onClick={() => setHairCatalogPage((page) => Math.max(0, page - 1))}>‹</button>
            <small>Página {hairCatalogPageView.page + 1}/{hairCatalogPageView.pageCount}</small>
            <button type="button" aria-label="Próxima página" disabled={hairCatalogPageView.page >= hairCatalogPageView.pageCount - 1 || loadingHairCatalogPage} onClick={() => setHairCatalogPage((page) => Math.min(hairCatalogPageView.pageCount - 1, page + 1))}>›</button>
          </nav>}
        </section>
      </aside>
      <section className="hair-dev-preview" aria-label="Prévia da cabeça">
        <div className="hair-dev-preview-heading"><strong>PRÉVIA DA CABEÇA</strong><span>{head ? Math.round(head.width) + ' × ' + Math.round(head.height) : ''}</span></div>
        <div className="hair-dev-preview-stage" style={{ backgroundColor: background }} onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(.5, Math.min(3, value * (event.deltaY < 0 ? 1.1 : .9)))) }}>
          {head && <div className="hair-dev-head-stage" style={{ aspectRatio: head.width + ' / ' + head.height, transform: 'scale(' + zoom + ')' }} onPointerMove={moveHair} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
            {hairWorkspace?.back && visibleDraft('back') && <HairPiece side="back" asset={hairWorkspace.back} transform={hairWorkspace.transforms.back} head={head} selected={selectedSide === 'back'} onPointerDown={startDrag} disabled={saving || loadingHair || loadingStyle || processingChroma} onErase={(dataUrl) => updateHairPixels('back', dataUrl)} />}
            <img className="hair-dev-head-base" src={appearancePreviewForPart(head)} alt="Cabeça do modelo de referência" draggable={false} />
            {hairWorkspace?.front && visibleDraft('front') && <HairPiece side="front" asset={hairWorkspace.front} transform={hairWorkspace.transforms.front} head={head} selected={selectedSide === 'front'} onPointerDown={startDrag} disabled={saving || loadingHair || loadingStyle || processingChroma} onErase={(dataUrl) => updateHairPixels('front', dataUrl)} />}
            {hairWorkspace?.fringe && hairWorkspace.transforms.fringe && visibleDraft('fringe') && <HairPiece side="fringe" asset={hairWorkspace.fringe} transform={hairWorkspace.transforms.fringe} head={head} selected={selectedSide === 'fringe'} onPointerDown={startDrag} disabled={saving || loadingHair || loadingStyle || processingChroma} onErase={(dataUrl) => updateHairPixels('fringe', dataUrl)} />}
          </div>}
          {(loadingModels || loadingProject || loadingHair || loadingStyle) && <span className="hair-dev-message">Carregando modelo e cabelos…</span>}
          {!loadingModels && !loadingProject && !head && <span className="hair-dev-message">{error || 'O modelo não tem uma peça chamada Cabeça.'}</span>}
          {head && !hairWorkspace?.front && !hairWorkspace?.back && !hairWorkspace?.fringe && !loadingHair && <span className="hair-dev-message">Selecione um conjunto ou importe a primeira peça.</span>}
          <div className="hair-dev-zoom-tools"><button onClick={() => setZoom((value) => Math.min(3, value * 1.15))} aria-label="Aproximar" type="button">+</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.max(.5, value / 1.15))} aria-label="Afastar" type="button">−</button></div>
        </div>
        {(error || notice) && <div className={'hair-dev-status' + (error ? ' error' : '')} role={error ? 'alert' : 'status'}>{error || notice}</div>}
      </section>
      <section className="hair-dev-controls" aria-label="Controles de cabelo">
        <header><strong>Ajuste da peça</strong><small>{category.label} · arraste a peça na prévia para mover</small></header>
        <section className="hair-dev-chroma" aria-label="Controles do chroma key">
          <header><span><strong>Chroma key</strong><small>Remoção do fundo da folha</small></span><output>{hairWorkspace?.chromaTolerance ?? 70}%</output></header>
          <label className="hair-dev-chroma-mode">Tipo de fundo<select aria-label="Tipo de fundo para chroma key" value={hairWorkspace?.chromaMode ?? 'auto'} disabled={!chromaReady || processingChroma} onChange={(event) => updateWorkspace((current) => ({ ...current, chromaMode: event.target.value as 'auto' | 'green' | 'checker' }))}><option value="auto">Detectar automaticamente</option><option value="green">Verde / chroma verde</option><option value="checker">Quadriculado cinza e preto</option></select></label>
          <label className="hair-dev-chroma-range"><span><small>Menos</small><small>Mais</small></span><input aria-label="Intensidade do chroma key" type="range" min="0" max="100" step="1" value={hairWorkspace?.chromaTolerance ?? 70} disabled={!chromaReady || processingChroma} onChange={(event) => updateWorkspace((current) => ({ ...current, chromaTolerance: Number(event.target.value) }))} /></label>
          <div className="hair-dev-chroma-actions"><button className="hair-dev-catalog-save" onClick={() => void applyChroma()} disabled={!chromaReady || processingChroma} type="button"><Icon name={processingChroma ? 'reset' : 'check'} />{processingChroma ? 'Aplicando…' : 'Aplicar chroma'}</button><button className="hair-dev-reset" onClick={() => { updateWorkspace((current) => ({ ...current, chromaTolerance: 0 })); void applyChroma(0) }} disabled={!chromaReady || processingChroma} type="button">Voltar ao original</button></div>
          <small className="hair-dev-chroma-hint">O ajuste sempre parte da folha original e mantém o encaixe das peças.</small>
        </section>
        {selectedAsset && selectedTransform ? <>
          <div className="hair-dev-control-title"><b>{category.label}</b><small>Arraste a parte selecionada na prévia.</small></div>
          <div className="hair-dev-position-grid">
            {([['x', 'Posição X'], ['y', 'Posição Y']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" step="1" value={Math.round(selectedTransform[field])} onChange={(event) => changeTransform({ [field]: Number(event.target.value) })} /></label>)}
          </div>
          {([['scaleX', 'Largura · espremer/esticar'], ['scaleY', 'Altura · espremer/esticar']] as const).map(([field, label]) => <label className="hair-dev-range" key={field}><span><b>{label}</b><output>{Math.round(selectedTransform[field] * 100)}%</output></span><input type="range" min="10" max="500" step="1" value={Math.max(10, Math.min(500, Math.round(selectedTransform[field] * 100)))} onChange={(event) => changeTransform({ [field]: Number(event.target.value) / 100 })} /><input className="hair-dev-range-number" type="number" min="10" max="1000" step="1" aria-label={label + ' em porcentagem'} value={Math.round(selectedTransform[field] * 100)} onChange={(event) => changeTransform({ [field]: Math.max(.1, Math.min(10, Number(event.target.value) / 100)) })} /></label>)}
          <label className="hair-dev-range"><span><b>Rotação</b><output>{Math.round(selectedTransform.rotation)}°</output></span><input type="range" min="-180" max="180" step="1" value={Math.max(-180, Math.min(180, Math.round(selectedTransform.rotation)))} onChange={(event) => changeTransform({ rotation: Number(event.target.value) })} /></label>
          <div className="hair-dev-piece-actions"><button className="hair-dev-reset" onClick={flipSelectedHair} type="button"><Icon name="flipHorizontal" /> Inverter na horizontal</button><button className="hair-dev-reset" onClick={resetSelectedTransform} type="button">Restaurar encaixe inicial</button></div>
          <button className="hair-dev-delete-piece" onClick={() => void deleteSelectedPiece()} disabled={saving || loadingHair || loadingStyle} type="button"><Icon name="trash" /> Excluir esta peça</button>
          <div data-hair-eraser-controls />
        </> : <p className="hair-dev-empty">Importe uma peça em {category.label} para ajustar seu encaixe.</p>}
      </section>
    </div>
    {importModalOpen && <HairImportModal
      disabled={!head || loadingHair || loadingStyle || saving}
      onClose={() => setImportModalOpen(false)}
      onImportSingle={() => { setImportModalOpen(false); singleFileInputRef.current?.click() }}
      onImportPairSheet={() => { setImportModalOpen(false); fileInputRef.current?.click() }}
      onImportThreeStyleGrid={() => { setImportModalOpen(false); threeStyleFileInputRef.current?.click() }}
    />}
    {hairGridReview && hairGridPreviewStyles && <HairGridReviewModal
      sourceImageDataUrl={hairGridReview.sourceImageDataUrl}
      styles={hairGridPreviewStyles}
      paddingPercent={hairGridPaddingPercent}
      splits={hairGridSplits}
      busy={hairGridPreviewBusy}
      saving={saving}
      error={hairGridPreviewError}
      onPaddingChange={(value) => queueHairGridPreviewReprocessing(value, hairGridSplits)}
      onSplitsChange={(splits) => queueHairGridPreviewReprocessing(hairGridPaddingPercent, splits)}
      onCancel={cancelHairGridReview}
      onSave={() => void saveHairGridReview()}
    />}
  </section>
}
