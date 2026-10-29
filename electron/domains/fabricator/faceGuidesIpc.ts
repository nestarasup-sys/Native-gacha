/** IPC para carregar e salvar as guias de desenho do Fabricador. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FaceGuideProfile } from '../../../src/shared/fabricator'
import type { FaceGuideValues } from './faceGuidePersistence'
import { createKeyedOperationQueue } from '../storage/keyedOperationQueue.ts'

type Dependencies = {
  isProfile: (value: unknown) => value is FaceGuideProfile
  read: (profile: FaceGuideProfile) => Promise<FaceGuideValues | null>
  write: (profile: FaceGuideProfile, guides: unknown) => Promise<void>
}

export function registerFaceGuideHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  deps: Dependencies
): { getPendingWrites: () => Promise<void>[] } {
  const saveQueue = createKeyedOperationQueue({ retainFailures: true })

  ipc.handle('fabricator:face-guides:load', async (event, profile: string): Promise<FaceGuideValues | null> => {
    assertTrustedSender(event)
    if (!deps.isProfile(profile)) throw new Error('Perfil de guias inválido.')
    return deps.read(profile)
  })

  ipc.handle('fabricator:face-guides:save', async (event, profile: string, guides: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isProfile(profile)) throw new Error('Perfil de guias inválido.')
    return saveQueue.run(profile, () => deps.write(profile, guides))
  })

  return { getPendingWrites: saveQueue.getPendingWrites }
}
