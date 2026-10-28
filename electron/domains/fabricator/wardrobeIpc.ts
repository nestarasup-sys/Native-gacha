import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, resolve } from 'node:path'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels'
import type { WardrobeAssetSave, WardrobeSet, WardrobeSetSave } from '../../../src/shared/fabricator'
import { assertReferencedWardrobeComponentsRemain, assertWardrobeSetHasNoCharacterReferences } from './wardrobeReferences'
import type { FabricatorWardrobePersistence } from './wardrobePersistence'

export function registerFabricatorWardrobeHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  isValidModelSlot: (slot: number) => boolean
  isValidWardrobeId: (id: string) => boolean
  wardrobeModelPath: (modelSlot: number) => string
  wardrobeSetPath: (modelSlot: number, id: string) => string
  persistence: FabricatorWardrobePersistence
  withCharactersLocked: <T>(operation: (characters: readonly CustomizerCharacter[]) => Promise<T>) => Promise<T>
}) {
  deps.ipcMain.handle(fabricatorIpcChannels.loadWardrobeSet, async (event, modelSlot: number, id: string): Promise<WardrobeSet | null> => {
    deps.assertTrustedSender(event)
    return deps.persistence.read(modelSlot, id)
  })

  deps.ipcMain.handle(fabricatorIpcChannels.saveWardrobeSet, async (event, modelSlot: number, set: WardrobeSetSave, assets: WardrobeAssetSave[]): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !set || set.modelSlot !== modelSlot || !deps.isValidWardrobeId(set.id) || !Array.isArray(set.components)) {
      throw new Error('Conjunto de roupa inválido.')
    }
    await deps.withCharactersLocked(async (characters) => {
      assertReferencedWardrobeComponentsRemain(characters, modelSlot, set.id, new Set(set.components.map((component) => component.id)))
      await deps.persistence.save(modelSlot, set, assets)
    })
  })

  deps.ipcMain.handle(fabricatorIpcChannels.deleteWardrobeSet, async (event, modelSlot: number, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !deps.isValidWardrobeId(id)) throw new Error('Conjunto de roupa inválido.')
    const base = resolve(deps.wardrobeModelPath(modelSlot))
    const target = resolve(deps.wardrobeSetPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `set-${id}`) throw new Error('Caminho de exclusão inválido.')
    await deps.withCharactersLocked(async (characters) => {
      assertWardrobeSetHasNoCharacterReferences(characters, modelSlot, id)
      await deps.persistence.remove(target)
    })
  })

  return { getPendingWrites: () => [deps.persistence.getPendingWrites()] }
}
