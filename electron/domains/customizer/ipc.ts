/** Canais públicos preservados: a autenticação do sender ocorre antes de qualquer IO. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { CustomizerCharacterService } from './service.ts'

export function registerCustomizerCharacterHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  service: CustomizerCharacterService,
  measure: <T>(channel: string, operation: () => Promise<T>) => Promise<T>
): void {
  ipc.handle('customizer:characters:list', async (event) => {
    assertTrustedSender(event)
    return measure('customizer:characters:list', () => service.list())
  })
  ipc.handle('customizer:characters:save', async (event, character: unknown) => {
    assertTrustedSender(event)
    return measure('customizer:characters:save', () => service.save(character))
  })
  ipc.handle('customizer:characters:create', async (event, name: unknown) => {
    assertTrustedSender(event)
    return service.create(name)
  })
  ipc.handle('customizer:characters:delete', async (event, id: unknown) => {
    assertTrustedSender(event)
    return service.delete(id)
  })
}
