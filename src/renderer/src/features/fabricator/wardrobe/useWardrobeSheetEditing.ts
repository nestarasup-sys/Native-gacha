import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { FabricatorProject, WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'
import { usePaletteImport } from '../usePaletteImport'
import { createWardrobeTorsoGridComponents } from './wardrobeGridImport'
import { createWardrobeComponentsFromProcessedSheet } from './wardrobeSheetImport'
import { createWardrobePairedSheetComponents } from './wardrobePairedSheetImport'
import { createWardrobeGridHistory } from './wardrobeGridHistory'
import { isWardrobePairedGridImportKind, wardrobePairedGridImportKind, type WardrobePairedSheetKind } from './wardrobePairedSheetPolicy'
import { splitWardrobeGarmentPairAtJoint } from './splitWardrobeGarmentPair'
import type { WardrobeProcessorResponse } from './wardrobeProcessorProtocol'
import type { WardrobeJointCutSettings } from './wardrobeJointCutSettings'
import { isLongJointSplitCandidate } from './wardrobeWorkspaceModel'

type Point = { x: number; y: number }
type Setter<T> = Dispatch<SetStateAction<T>>

type UseWardrobeSheetEditingOptions = {
  model: FabricatorProject | null
  referenceModel: FabricatorProject | null
  modelSlot: number
  sourceReady: boolean
  draft: WardrobeSet | null
  draftRef: MutableRefObject<WardrobeSet | null>
  selected: WardrobeComponent | null
  bodyOffsets: Record<string, Point>
  processing: boolean
  saving: boolean
  openingSet: boolean
  joinJointsMode: boolean
  jointCutSettingsRef: MutableRefObject<WardrobeJointCutSettings>
  gridSizeRef: MutableRefObject<3 | 4>
  pairedSheetKindRef: MutableRefObject<WardrobePairedSheetKind>
  pairedGridHistoryRef: MutableRefObject<ReturnType<typeof createWardrobeGridHistory>>
  workerRef: MutableRefObject<Worker | null>
  requestRef: MutableRefObject<number>
  setDraft: Setter<WardrobeSet | null>
  setActiveSetId: Setter<string | null>
  setSelectedId: Setter<string | null>
  setDirty: Setter<boolean>
  setProcessing: Setter<boolean>
  setError: Setter<string>
  setDeformMode: Setter<boolean>
  setImportPickerOpen: Setter<boolean>
  setJoinJointsMode: Setter<boolean>
  clearDeformationSession: () => void
}

/** Owns image import, paired-sheet editing history and joint-split authoring for Roupas DEV. */
export function useWardrobeSheetEditing(options: UseWardrobeSheetEditingOptions) {
  const { requestPaletteImport } = usePaletteImport()
  const {
    model, referenceModel, modelSlot, sourceReady, draft, draftRef, selected, bodyOffsets,
    processing, saving, openingSet, joinJointsMode, jointCutSettingsRef, gridSizeRef,
    pairedSheetKindRef, pairedGridHistoryRef, workerRef, requestRef, setDraft,
    setActiveSetId, setSelectedId, setDirty, setProcessing, setError, setDeformMode,
    setImportPickerOpen, setJoinJointsMode, clearDeformationSession
  } = options

  const importSheet = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    if (!sourceReady) { setError('Aguarde a referência corporal carregar antes de importar a folha.'); return }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { setError('Use uma imagem PNG, JPG ou WebP.'); return }
    setDeformMode(false)
    setError('')
    setProcessing(true)
    try {
      const source = await requestPaletteImport(file, 'wardrobe')
      if (!source) { setProcessing(false); return }
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
        clearDeformationSession()
        setDraft({ schemaVersion: 1, edition: 1, id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
        setActiveSetId(null); setSelectedId(components[0]?.id ?? null); setDirty(true); setJoinJointsMode(false)
      }
      worker.onerror = () => { setProcessing(false); setError('Falha ao processar a imagem localmente.'); worker.terminate(); workerRef.current = null }
      worker.postMessage({ id, dataUrl: source })
    } catch (reason) { setProcessing(false); setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }

  const importTorsoGrid = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    if (!sourceReady) { setError('Aguarde a referência corporal carregar antes de importar a folha.'); return }
    const gridSize = gridSizeRef.current
    setDeformMode(false)
    setError(''); setImportPickerOpen(false)
    setProcessing(true)
    try {
      const source = await requestPaletteImport(file, 'wardrobe')
      if (!source) return
      const image = await createImageBitmap(await (await fetch(source)).blob())
      const components = createWardrobeTorsoGridComponents(image, referenceModel ?? model, gridSize, () => crypto.randomUUID())
      if (!components.length) throw new Error('A grade ' + gridSize + '×3 não contém peças visíveis. Confira as células da imagem.')
      clearDeformationSession()
      setDraft({ schemaVersion: 1, edition: 1, importKind: gridSize === 4 ? 'torso-grid-4x3' : 'torso-grid-3x3', id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
      setActiveSetId(null); setSelectedId(components[0].id); setDirty(true); setJoinJointsMode(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a grade de roupas.') }
    finally { setProcessing(false) }
  }

  const importPairedSheet = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    setDeformMode(false); setError(''); setImportPickerOpen(false)
    setProcessing(true)
    try {
      const source = await requestPaletteImport(file, 'wardrobe')
      if (!source) return
      const components = createWardrobePairedSheetComponents(await createImageBitmap(await (await fetch(source)).blob()), referenceModel ?? model, () => crypto.randomUUID(), pairedSheetKindRef.current)
      clearDeformationSession()
      setDraft({ schemaVersion: 1, edition: 1, importKind: wardrobePairedGridImportKind(pairedSheetKindRef.current), id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
      setActiveSetId(null); setSelectedId(components[0]?.id ?? null); setDirty(true); setJoinJointsMode(false)
      pairedGridHistoryRef.current.clear()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a grade pareada.') }
    finally { setProcessing(false) }
  }

  const splitSelectedGarmentAtJoint = async () => {
    if (!draft || !referenceModel || !selected || !joinJointsMode || processing || saving || openingSet || !isLongJointSplitCandidate(selected)) return
    setProcessing(true); setError('')
    try {
      const replacements = await splitWardrobeGarmentPairAtJoint(
        draft,
        selected,
        referenceModel,
        bodyOffsets,
        jointCutSettingsRef.current,
        {
          decodePixels: async (dataUrl) => {
            const image = new Image(); image.src = dataUrl; await image.decode()
            const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) throw new Error('Não foi possível ler a imagem da roupa; nada foi alterado.')
            context.drawImage(image, 0, 0)
            return context.getImageData(0, 0, canvas.width, canvas.height)
          },
          encodeSegment: (segment) => {
            const canvas = document.createElement('canvas'); canvas.width = segment.width; canvas.height = segment.height
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Não foi possível preparar os recortes; nada foi alterado.')
            const output = context.createImageData(segment.width, segment.height)
            output.data.set(segment.pixels)
            context.putImageData(output, 0, 0)
            return canvas.toDataURL('image/png')
          },
          createId: () => crypto.randomUUID()
        }
      )
      if (draftRef.current !== draft) throw new Error('O conjunto mudou durante o cálculo. Revise a peça e tente dividir novamente; nada foi alterado.')
      pairedGridHistoryRef.current.record(draft)
      setDraft({ ...draft, components: [...draft.components.filter((component) => component.sleevePairId !== selected.sleevePairId), ...replacements], updatedAt: new Date().toISOString() })
      setSelectedId(replacements.find((component) => component.sleeveSide === selected.sleeveSide && component.sleeveSegment === 'upper')?.id ?? replacements[0]?.id ?? null)
      setDirty(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível dividir a roupa na junta do modelo.') }
    finally { setProcessing(false) }
  }

  const undoPairedGridEdit = () => {
    const previous = pairedGridHistoryRef.current.undo(draft)
    if (!previous) return
    setDraft(previous); setSelectedId(previous.components[0]?.id ?? null); setDirty(true)
  }
  const redoPairedGridEdit = () => {
    const next = pairedGridHistoryRef.current.redo(draft)
    if (!next) return
    setDraft(next); setSelectedId(next.components[0]?.id ?? null); setDirty(true)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isWardrobePairedGridImportKind(draft?.importKind) || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoPairedGridEdit() : undoPairedGridEdit() }
      else if (event.key.toLowerCase() === 'y') { event.preventDefault(); redoPairedGridEdit() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft?.importKind, draft])

  return { importSheet, importTorsoGrid, importPairedSheet, splitSelectedGarmentAtJoint, undoPairedGridEdit, redoPairedGridEdit }
}
