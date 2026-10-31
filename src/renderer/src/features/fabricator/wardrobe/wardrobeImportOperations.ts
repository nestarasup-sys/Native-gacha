import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { FabricatorProject, WardrobeSet } from '../../../../../shared/fabricator'
import { normalizeEditableImageFile } from '../normalizeImage'
import { createWardrobeTorsoGridComponents } from './wardrobeGridImport'
import { createWardrobeComponentsFromProcessedSheet } from './wardrobeSheetImport'
import { createWardrobeSleeveSheetComponents } from './wardrobeSleeveSheetImport'
import type { WardrobeProcessorResponse } from './wardrobeProcessorProtocol'

type Setter<T> = Dispatch<SetStateAction<T>>
type ImportContext = {
  model: FabricatorProject | null
  referenceModel: FabricatorProject | null
  sourceParts: Record<string, unknown> | null
  modelSlot: number
  processing: boolean
  saving: boolean
  openingSet: boolean
  workerRef: MutableRefObject<Worker | null>
  requestRef: MutableRefObject<number>
  gridSizeRef: MutableRefObject<3 | 4>
  pairedImportKindRef: MutableRefObject<'sleeves' | 'pants'>
  sleeveUndoRef: MutableRefObject<WardrobeSet[]>
  sleeveRedoRef: MutableRefObject<WardrobeSet[]>
  setDeformMode: Setter<boolean>
  setProcessing: Setter<boolean>
  setError: Setter<string>
  setImportPickerOpen: Setter<boolean>
  setDraft: Setter<WardrobeSet | null>
  setActiveSetId: Setter<string | null>
  setSelectedId: Setter<string | null>
  setDirty: Setter<boolean>
  setBodyOffsets: Setter<Record<string, { x: number; y: number }>>
  clearWardrobeWarpState: () => void
}

function readFile(file: File): Promise<string> {
  return normalizeEditableImageFile(file).then(image => image.dataUrl)
}

/** File imports and worker lifecycle remain isolated from component rendering. */
export function createWardrobeImportOperations({
  model, referenceModel, sourceParts, modelSlot, processing, saving, openingSet,
  workerRef, requestRef, gridSizeRef, pairedImportKindRef, sleeveUndoRef, sleeveRedoRef,
  setDeformMode, setProcessing, setError, setImportPickerOpen, setDraft,
  setActiveSetId, setSelectedId, setDirty, setBodyOffsets, clearWardrobeWarpState
}: ImportContext) {
  const importSheet = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    if (!sourceParts) { setError('Aguarde a referência corporal carregar antes de importar a folha.'); return }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { setError('Use uma imagem PNG, JPG ou WebP.'); return }
    setDeformMode(false)
    setProcessing(true); setError('')
    try {
      const source = await readFile(file)
      workerRef.current?.terminate()
      const worker = new Worker(new URL('./wardrobeProcessor.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const id = ++requestRef.current
      worker.onmessage = (event: MessageEvent<WardrobeProcessorResponse>) => {
        const message = event.data
        if (message.id !== id) return
        setProcessing(false); worker.terminate(); workerRef.current = null
        if (message.type === 'error') { setError(message.message); return }
        if (!message.pieces.length) { setError('Não encontrei peças visíveis. Confira se a folha tem transparência entre as peças.'); return }
        const components = createWardrobeComponentsFromProcessedSheet(message.pieces, message.width, message.height, referenceModel ?? model)
        const unbound = components.filter((component) => !component.attachedPartId)
        if (unbound.length) {
          setError(`${unbound.length} peça(s) sem osso correspondente na referência original. Selecione o osso de cada peça antes de salvar; não faremos um encaixe arbitrário.`)
        }
        clearWardrobeWarpState()
        setDraft({ schemaVersion: 1, edition: 1, id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
        setActiveSetId(null); setSelectedId(components[0]?.id ?? null); setDirty(true); setBodyOffsets({})
      }
      worker.onerror = () => { setProcessing(false); setError('Falha ao processar a imagem localmente.'); worker.terminate(); workerRef.current = null }
      worker.postMessage({ id, dataUrl: source })
    } catch (reason) { setProcessing(false); setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }
  const importTorsoGrid = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    if (!sourceParts) { setError('Aguarde a referência corporal carregar antes de importar a folha.'); return }
    const gridSize = gridSizeRef.current
    setDeformMode(false)
    setProcessing(true); setError(''); setImportPickerOpen(false)
    try {
      const image = await createImageBitmap(file)
      const components = createWardrobeTorsoGridComponents(image, referenceModel ?? model, gridSize, () => crypto.randomUUID())
      if (!components.length) throw new Error('A grade ' + gridSize + '×3 não contém peças visíveis. Confira as células da imagem.')
      clearWardrobeWarpState()
      setDraft({ schemaVersion: 1, edition: 1, importKind: gridSize === 4 ? 'torso-grid-4x3' : 'torso-grid-3x3', id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
      setActiveSetId(null); setSelectedId(components[0].id); setDirty(true); setBodyOffsets({})
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a grade de roupas.') }
    finally { setProcessing(false) }
  }
  const importSleeveGrid = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    setDeformMode(false); setProcessing(true); setError(''); setImportPickerOpen(false)
    try {
      const components = createWardrobeSleeveSheetComponents(await createImageBitmap(file), referenceModel ?? model, () => crypto.randomUUID(), pairedImportKindRef.current)
      clearWardrobeWarpState()
      setDraft({ schemaVersion: 1, edition: 1, importKind: pairedImportKindRef.current === 'pants' ? 'pants-grid-3x4' : 'sleeve-grid-3x4', id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
      setActiveSetId(null); setSelectedId(components[0]?.id ?? null); setDirty(true); setBodyOffsets({})
      sleeveUndoRef.current = []; sleeveRedoRef.current = []
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a grade de mangas.') }
    finally { setProcessing(false) }
  }

  return { importSheet, importTorsoGrid, importSleeveGrid }
}
