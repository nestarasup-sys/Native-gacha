/** Camada de transporte IPC do catálogo de roupas: autorização antes do domínio. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FabricatorWardrobeCatalog } from './wardrobeCatalog'

export function registerFabricatorWardrobeCatalogHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  catalog: Pick<FabricatorWardrobeCatalog, 'list'>
): void {
  ipc.handle('fabricator:wardrobe:list', async (event, modelSlot: number) => {
    assertTrustedSender(event)
    return catalog.list(modelSlot)
  })
}
