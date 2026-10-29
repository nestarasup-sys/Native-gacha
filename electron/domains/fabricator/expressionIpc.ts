/** IPC for expression presets and drafts, isolated from main Electron startup.
 * Each model slot shares one queue and crash-recovery gate across reads and mutations.
 */
import { basename, dirname, resolve } from 'node:path'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FaceExpressionCollection, FaceExpressionPreset, FaceExpressionPresetSummary,
  FaceExpressionWorkspaceDraft } from '../../../src/shared/fabricator'
import {
  addedFaceExpressionDraftReferences, addedFaceExpressionPresetReferences
} from './faceReferences.ts'
import type { FaceExpressionAssetReference } from './faceReferences.ts'

type Dependencies = {
  queue: <T>(modelSlot: number, task: () => Promise<T>) => Promise<T>
  recover: (modelSlot: number) => Promise<void>
  listPresets: (modelSlot: number) => Promise<FaceExpressionPresetSummary[]>
  listCollections: (modelSlot: number) => Promise<FaceExpressionCollection[]>
  saveCollection: (modelSlot: number, collection: FaceExpressionCollection) => Promise<void>
  loadPreset: (modelSlot: number, id: string) => Promise<FaceExpressionPreset | null>
  savePreset: (modelSlot: number, preset: FaceExpressionPreset) => Promise<void>
  saveBatch: (modelSlot: number, presets: FaceExpressionPreset[]) => Promise<void>
  removePreset: (path: string) => Promise<void>
  presetPath: (modelSlot: number, id: string) => string
  validSlot: (slot: number) => boolean
  validId: (id: string) => boolean
  loadDraft: (modelSlot: number) => Promise<FaceExpressionWorkspaceDraft | null>
  saveDraft: (modelSlot: number, draft: FaceExpressionWorkspaceDraft) => Promise<void>
  assertFaceAssetsAvailable: (modelSlot: number, references: readonly FaceExpressionAssetReference[]) => Promise<void>
}

export function registerExpressionPresetHandlers(
  ipc: Pick<IpcMain,'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  deps: Dependencies
): void {
  const run = <T>(slot: number, action: () => Promise<T>) =>
    deps.queue(slot, async () => { await deps.recover(slot); return action() })
  const savePreset = async (slot: number, preset: FaceExpressionPreset): Promise<void> => {
    if (!preset || typeof preset !== 'object' || !deps.validId(preset.id)) return deps.savePreset(slot, preset)
    const existing = await deps.loadPreset(slot, preset.id)
    await deps.assertFaceAssetsAvailable(slot, addedFaceExpressionPresetReferences([preset], [existing]))
    return deps.savePreset(slot, preset)
  }
  const saveBatch = async (slot: number, presets: FaceExpressionPreset[]): Promise<void> => {
    if (!Array.isArray(presets)) return deps.saveBatch(slot, presets)
    const existing = await Promise.all(presets.map((preset) => preset && typeof preset === 'object' && deps.validId(preset.id)
      ? deps.loadPreset(slot, preset.id)
      : Promise.resolve(null)))
    const references = addedFaceExpressionPresetReferences(presets, existing)
    await deps.assertFaceAssetsAvailable(slot, references)
    return deps.saveBatch(slot, presets)
  }
  const saveDraft = async (slot: number, draft: FaceExpressionWorkspaceDraft): Promise<void> => {
    if (!draft || typeof draft !== 'object' || !draft.current || !draft.workingCopies || typeof draft.workingCopies !== 'object') {
      return deps.saveDraft(slot, draft)
    }
    const existing = await deps.loadDraft(slot)
    await deps.assertFaceAssetsAvailable(slot, addedFaceExpressionDraftReferences(draft, existing))
    return deps.saveDraft(slot, draft)
  }
  ipc.handle('fabricator:expression-presets:list', (event, slot: number) => {
    assertTrustedSender(event)
    return run(slot, () => deps.listPresets(slot))
  })
  ipc.handle('fabricator:expression-collections:list', (event, slot: number) => {
    assertTrustedSender(event)
    return run(slot, () => deps.listCollections(slot))
  })
  ipc.handle('fabricator:expression-collections:save', (event, slot: number, collection: FaceExpressionCollection) => {
    assertTrustedSender(event)
    return run(slot, () => deps.saveCollection(slot,collection))
  })
  ipc.handle('fabricator:expression-presets:load', (event, slot: number, id: string) => {
    assertTrustedSender(event)
    return run(slot, () => deps.loadPreset(slot,id))
  })
  ipc.handle('fabricator:expression-presets:save', (event, slot: number, preset: FaceExpressionPreset) => {
    assertTrustedSender(event)
    return run(slot, () => savePreset(slot,preset))
  })
  ipc.handle('fabricator:expression-presets:save-batch', (event, slot: number, presets: FaceExpressionPreset[]) => {
    assertTrustedSender(event)
    return run(slot, () => saveBatch(slot,presets))
  })
  ipc.handle('fabricator:expression-presets:delete', (event, slot: number, id: string) => {
    assertTrustedSender(event)
    if (!deps.validSlot(slot) || !deps.validId(id)) throw Error('Preset de expressão inválido.')
    const target=resolve(deps.presetPath(slot,id))
    const base=dirname(target)
    if (basename(target)!==`preset-${id}.json` || basename(base)!==`model-${slot}`)
      throw Error('Caminho de exclusão inválido.')
    return run(slot, () => deps.removePreset(target))
  })
  ipc.handle('fabricator:expression-workspace:load', (event, slot: number) => {
    assertTrustedSender(event)
    return run(slot, () => deps.loadDraft(slot))
  })
  ipc.handle('fabricator:expression-workspace:save', (event, slot: number, draft: FaceExpressionWorkspaceDraft) => {
    assertTrustedSender(event)
    return run(slot, () => saveDraft(slot,draft))
  })
}
