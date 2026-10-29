/** IPC do Studio Principal, isolado do Video Studio e do boot Electron.
 * Recebe os casos de uso e a fila existentes: nenhum canal/formato é alterado.
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { StudioDocument } from '../../../src/shared/studio.ts'
import { studioIpcChannels } from '../../../src/shared/studioIpcChannels.ts'

const STUDIO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type StudioPrimaryIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  list: () => Promise<StudioDocument[]>
  write: (document: StudioDocument) => Promise<void>
  remove: (id: string) => Promise<void>
  assertPoseReferencesAvailable?: (document: StudioDocument) => Promise<void>
  coordinatePoseReferenceChange?: <T>(operation: () => Promise<T>) => Promise<T>
  getPendingWrites: () => Promise<void>
  setPendingWrites: (pending: Promise<void>) => void
  measure: <T>(label: string, work: () => Promise<T>) => Promise<T>
}

export function registerStudioPrimaryHandlers(deps: StudioPrimaryIpcDependencies): void {
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = deps.getPendingWrites().catch(() => undefined).then(operation)
    deps.setPendingWrites(next)
    return next
  }
  const enqueueReferenceChange = (operation: () => Promise<void>): Promise<void> =>
    (deps.coordinatePoseReferenceChange ?? ((task) => task()))(() => enqueue(operation))

  deps.ipcMain.handle(studioIpcChannels.listStudios, async (event): Promise<StudioDocument[]> => {
    deps.assertTrustedSender(event)
    return deps.measure(studioIpcChannels.listStudios, deps.list)
  })
  deps.ipcMain.handle(studioIpcChannels.saveStudio, async (event, document: StudioDocument): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.measure(studioIpcChannels.saveStudio, () => enqueueReferenceChange(async () => {
      await deps.assertPoseReferencesAvailable?.(document)
      await deps.write(document)
    }))
  })
  deps.ipcMain.handle(studioIpcChannels.deleteStudio, async (event, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !STUDIO_ID.test(id)) throw new Error('Identificador de Studio inválido.')
    await enqueueReferenceChange(() => deps.remove(id))
  })
}
