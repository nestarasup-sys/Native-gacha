import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  FaceCatalogItem,
  FaceCatalogItemSummary,
  FaceComponentAsset,
  FaceComponentAssetSummary,
  FaceComponentKind,
  FaceDetailKind,
  FaceTransform,
  FabricatorDesktopApi,
  ModelPart
} from '../../../../../shared/fabricator'
import type { EyeSheetPiece } from './splitEyeSheet'
import type { AlignableFaceKind, FaceImportAnchor } from './faceImportAlignment'
import type { FacePartId } from './faceComponentImportModel'
import type { normalizeEditableImageFile } from '../normalizeImage'
import type { splitEyeSheet } from './splitEyeSheet'
import type { processFaceSheet } from './processFaceSheet'
import type {
  createEyeSheetImportPlan,
  createEyebrowImportPlan,
  createFaceDetailImportEntry
} from './faceComponentImportModel'
import type { faceCatalogImagesForImport, faceCatalogItemForSave } from './faceCatalogEdits'
import type { assertFaceComponentImportActive, saveFaceComponentAssetBatch } from './faceComponentAssetBatch'

type LibraryCategory = FaceComponentKind | FaceDetailKind | 'nose' | 'mouth'
type CatalogKind = 'nose' | 'mouth-closed' | 'mouth-open'
type FaceImportApi = Pick<FabricatorDesktopApi,
  'saveFaceComponentAsset' | 'deleteFaceComponentAsset' | 'saveFaceCatalogItem'
>
type FileInputChange = Pick<ChangeEvent<HTMLInputElement>, 'target'>
type ImportModal = 'import' | 'delete' | null
type Updater<T> = Dispatch<SetStateAction<T>>

export type FaceComponentImportCommandDependencies = {
  api: FaceImportApi
  modelSlot: number
  head: ModelPart | null
  anchors?: Partial<Record<AlignableFaceKind, FaceImportAnchor>>
  faceDetailLabel: (kind: FaceDetailKind) => string
  isContextCurrent: () => boolean
  isMounted: () => boolean
  eyeSheetImportController: MutableRefObject<AbortController | null>
  eyeSheetImportContextCancelled: MutableRefObject<boolean>
  setBusy: (busy: boolean) => void
  setError: (error: string) => void
  setNotice: (notice: string) => void
  setOpenModal: (modal: ImportModal) => void
  setDetails: Updater<Record<string, FaceComponentAsset>>
  setAssets: Updater<FaceComponentAssetSummary[]>
  setSelectedAssets: Updater<Partial<Record<FacePartId, string>>>
  setSelectedPart: (part: FacePartId) => void
  setLibraryCategory: (category: LibraryCategory) => void
  selectFaceDetail: (kind: FaceDetailKind, id: string | undefined) => void
  setNoseCatalog: Updater<FaceCatalogItemSummary[]>
  setNoseDetails: Updater<Record<string, FaceCatalogItem>>
  setSelectedNoseId: (id: string | null) => void
  setMouthCatalog: Updater<FaceCatalogItemSummary[]>
  setMouthDetails: Updater<Record<string, FaceCatalogItem>>
  setSelectedMouthId: (id: string | null) => void
  setMouthKind: (kind: 'mouth-closed' | 'mouth-open') => void
  normalizeImage: typeof normalizeEditableImageFile
  splitEyeSheet: typeof splitEyeSheet
  processFaceSheet: typeof processFaceSheet
  createEyeSheetImportPlan: typeof createEyeSheetImportPlan
  createEyebrowImportPlan: typeof createEyebrowImportPlan
  createFaceDetailImportEntry: typeof createFaceDetailImportEntry
  assertImportActive: typeof assertFaceComponentImportActive
  saveAssetBatch: typeof saveFaceComponentAssetBatch
  faceCatalogItemForSave: typeof faceCatalogItemForSave
  faceCatalogImagesForImport: typeof faceCatalogImagesForImport
  initialCatalogTransform: (head: ModelPart, item: Pick<FaceCatalogItem, 'category' | 'pieces'>) => FaceTransform
  createId: () => string
  now: () => string
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'AbortError'
}

export function createFaceComponentImportCommands(dependencies: FaceComponentImportCommandDependencies) {
  const importEyeSheet = async (event: FileInputChange) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const { head, modelSlot } = dependencies
    if (!file || !head) return

    const controller = new AbortController()
    dependencies.eyeSheetImportController.current = controller
    dependencies.setBusy(true)
    dependencies.setError('')
    try {
      const canonicalSheet = await dependencies.normalizeImage(file)
      dependencies.assertImportActive(controller.signal)
      const pieces: EyeSheetPiece[] = await dependencies.splitEyeSheet(canonicalSheet.dataUrl, controller.signal)
      dependencies.assertImportActive(controller.signal)
      if (!dependencies.isContextCurrent()) return
      const plan = dependencies.createEyeSheetImportPlan({
        pieces,
        fileName: file.name,
        modelSlot,
        head,
        anchors: dependencies.anchors,
        createId: dependencies.createId,
        now: dependencies.now
      })
      await dependencies.saveAssetBatch(dependencies.api, modelSlot, plan.entries, controller.signal)
      if (!dependencies.isContextCurrent()) return
      dependencies.setDetails((current) => ({ ...current, ...Object.fromEntries(plan.assets.map((asset) => [asset.id, asset])) }))
      dependencies.setAssets((current) => [...plan.assets, ...current])
      dependencies.setSelectedAssets((current) => ({ ...current, ...plan.assigned }))
      dependencies.setSelectedPart('eye-left')
      dependencies.setLibraryCategory('eye')
      dependencies.setOpenModal(null)
      dependencies.setNotice('Olho aberto, pupila e olho fechado importados. Ajuste cada peça na Biblioteca.')
    } catch (reason) {
      if (!controller.signal.aborted && !isAbortError(reason) && dependencies.isContextCurrent()) {
        dependencies.setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (dependencies.eyeSheetImportController.current === controller) dependencies.eyeSheetImportController.current = null
      if (!controller.signal.aborted && dependencies.isMounted()) dependencies.setBusy(false)
    }
  }

  const importEyebrow = async (event: FileInputChange) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const { head, modelSlot } = dependencies
    if (!file || !head) return

    dependencies.setBusy(true)
    dependencies.setError('')
    try {
      const image = await dependencies.normalizeImage(file)
      if (!dependencies.isContextCurrent()) return
      const plan = dependencies.createEyebrowImportPlan({
        fileName: file.name,
        modelSlot,
        head,
        ...image,
        createId: dependencies.createId,
        now: dependencies.now
      })
      await dependencies.saveAssetBatch(dependencies.api, modelSlot, plan.entries)
      if (!dependencies.isContextCurrent()) return
      const imported = plan.entries.map(({ asset, dataUrl }) => ({ ...asset, dataUrl }))
      dependencies.setDetails((current) => ({ ...current, ...Object.fromEntries(imported.map((asset) => [asset.id, asset])) }))
      dependencies.setAssets((current) => [...imported, ...current])
      dependencies.setSelectedAssets((current) => ({ ...current, 'brow-left': plan.leftId, 'brow-right': plan.rightId }))
      dependencies.setSelectedPart('brow-left')
      dependencies.setLibraryCategory('eyebrow')
      dependencies.setOpenModal(null)
      dependencies.setNotice('Sobrancelha importada. O lado direito foi criado espelhado; ajuste cada lado na Biblioteca.')
    } catch (reason) {
      if (dependencies.isContextCurrent()) dependencies.setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (dependencies.isMounted()) dependencies.setBusy(false)
    }
  }

  const importFaceDetail = async (kind: FaceDetailKind, event: FileInputChange) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const { head, modelSlot } = dependencies
    if (!file || !head) return

    dependencies.setBusy(true)
    dependencies.setError('')
    try {
      const image = await dependencies.normalizeImage(file)
      if (!dependencies.isContextCurrent()) return
      const entry = dependencies.createFaceDetailImportEntry({
        kind,
        fileName: file.name,
        fallbackName: dependencies.faceDetailLabel(kind),
        modelSlot,
        head,
        ...image,
        createId: dependencies.createId,
        now: dependencies.now
      })
      const asset = entry.asset
      await dependencies.api.saveFaceComponentAsset(modelSlot, asset, entry.dataUrl)
      if (!dependencies.isContextCurrent()) return
      const saved = { ...asset, dataUrl: entry.dataUrl }
      dependencies.setAssets((current) => [asset, ...current])
      dependencies.setDetails((current) => ({ ...current, [asset.id]: saved }))
      dependencies.selectFaceDetail(kind, asset.id)
      dependencies.setLibraryCategory(kind)
      dependencies.setNotice(`${asset.name} adicionado ao catálogo facial.`)
      dependencies.setOpenModal(null)
    } catch (reason) {
      if (dependencies.isContextCurrent()) dependencies.setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (dependencies.isMounted()) dependencies.setBusy(false)
    }
  }

  const importCatalogSheet = async (kind: CatalogKind, event: FileInputChange, noseMode: 'one' | 'six' = 'one') => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const { head, modelSlot } = dependencies
    if (!file || !head) return

    dependencies.setBusy(true)
    dependencies.setError('')
    try {
      const image = await dependencies.normalizeImage(file)
      if (!dependencies.isContextCurrent()) return
      const processed = await dependencies.processFaceSheet(kind, image.dataUrl, noseMode)
      if (!dependencies.isContextCurrent()) return
      if (!processed.pieces.length) throw new Error('Nenhuma peça foi encontrada na folha.')
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || (kind === 'nose' ? 'Nariz' : 'Boca')
      const item: FaceCatalogItem = {
        schemaVersion: 1,
        id: dependencies.createId(),
        modelSlot,
        category: kind,
        name,
        sheet: { kind, name: file.name, width: processed.width, height: processed.height, tolerance: 42, dataUrl: processed.sheetPng },
        pieces: processed.pieces,
        transforms: { [kind === 'nose' ? 'nose' : 'mouth']: dependencies.initialCatalogTransform(head, { category: kind, pieces: processed.pieces }) },
        eyeLinked: true,
        browLinked: true,
        selectedNose: 0,
        selectedExpression: 0,
        updatedAt: dependencies.now()
      }
      await dependencies.api.saveFaceCatalogItem(modelSlot, dependencies.faceCatalogItemForSave(item), dependencies.faceCatalogImagesForImport(item))
      if (!dependencies.isContextCurrent()) return
      const summary: FaceCatalogItemSummary = {
        id: item.id,
        modelSlot,
        category: kind,
        name,
        updatedAt: item.updatedAt,
        pieceCount: item.pieces.length
      }
      if (kind === 'nose') {
        dependencies.setNoseCatalog((current) => [summary, ...current])
        dependencies.setNoseDetails((current) => ({ ...current, [item.id]: item }))
        dependencies.setSelectedNoseId(item.id)
        dependencies.setLibraryCategory('nose')
      } else {
        dependencies.setMouthCatalog((current) => [summary, ...current])
        dependencies.setMouthDetails((current) => ({ ...current, [item.id]: item }))
        dependencies.setSelectedMouthId(item.id)
        dependencies.setMouthKind(kind)
        dependencies.setLibraryCategory('mouth')
      }
      dependencies.setNotice(`${item.pieces.length} ${item.pieces.length === 1 ? 'variante salva' : 'variantes salvas'} em ${name}.`)
      dependencies.setOpenModal(null)
    } catch (reason) {
      if (dependencies.isContextCurrent()) dependencies.setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (dependencies.isMounted()) dependencies.setBusy(false)
    }
  }

  function cancelEyeSheetImport() {
    const controller = dependencies.eyeSheetImportController.current
    dependencies.eyeSheetImportController.current = null
    if (!controller) return
    dependencies.eyeSheetImportContextCancelled.current = true
    controller.abort()
  }

  return { importEyeSheet, importEyebrow, importFaceDetail, importCatalogSheet, cancelEyeSheetImport }
}
