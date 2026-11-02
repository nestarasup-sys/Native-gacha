/** Canais públicos preservados: a autenticação do sender ocorre antes de qualquer IO. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { CustomizerCharacterService } from './service.ts'

export function registerCustomizerCharacterHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  service: CustomizerCharacterService
): void {
  ipc.handle('customizer:characters:list', async (event) => {
    assertTrustedSender(event)
    return service.list()
  })
  ipc.handle('customizer:characters:save', async (event, character: unknown) => {
    assertTrustedSender(event)
    return service.save(character)
  })
  ipc.handle('customizer:characters:create', async (event, name: unknown, initialHeadSize: unknown, gender: unknown) => {
    assertTrustedSender(event)
    return service.create(name, initialHeadSize, gender)
  })
  ipc.handle('customizer:characters:delete', async (event, id: unknown) => {
    assertTrustedSender(event)
    return service.delete(id)
  })
}
