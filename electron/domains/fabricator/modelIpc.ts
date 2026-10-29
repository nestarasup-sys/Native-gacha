/** Canais IPC estáveis para o catálogo de modelos do Fabricador. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FabricatorModelCatalog } from './modelCatalog.ts'
import { AmbiguousModelSourceRecoveryError } from './modelSourceRecovery.ts'
import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels.ts'

export function registerFabricatorModelCatalogHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  catalog: Pick<FabricatorModelCatalog, 'listSlots' | 'loadSlot'>
): void {
  ipc.handle(fabricatorIpcChannels.listFabricatorSlots, async (event) => {
    assertTrustedSender(event)
    return catalog.listSlots()
  })
  ipc.handle(fabricatorIpcChannels.loadFabricatorSlot, async (event, slot: number) => {
    assertTrustedSender(event)
    try {
      return await catalog.loadSlot(slot)
    } catch (reason) {
      // IPC consumers treat null as an unavailable model; listing still marks
      // the slot as recoveryRequired so the user can resolve it in Modelos DEV.
      if (reason instanceof AmbiguousModelSourceRecoveryError) return null
      throw reason
    }
  })
}
