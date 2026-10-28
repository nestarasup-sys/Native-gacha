/** IPC para carregar e salvar as guias de desenho do Fabricador. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FaceGuideProfile } from '../../../src/shared/fabricator'
import type { FaceGuideValues } from './faceGuidePersistence'

type Dependencies = {
  isProfile: (value: unknown) => value is FaceGuideProfile
  read: (profile: FaceGuideProfile) => Promise<FaceGuideValues | null>
  write: (profile: FaceGuideProfile, guides: unknown) => Promise<void>
  queueSave: (operation: () => Promise<void>) => Promise<void>
}

export function registerFaceGuideHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  deps: Dependencies
): void {
  ipc.handle('fabricator:face-guides:load', async (event, profile: string): Promise<FaceGuideValues | null> => {
    assertTrustedSender(event)
    if (!deps.isProfile(profile)) throw new Error('Perfil de guias inválido.')
    return deps.read(profile)
  })

  ipc.handle('fabricator:face-guides:save', async (event, profile: string, guides: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (!deps.isProfile(profile)) throw new Error('Perfil de guias inválido.')
    return deps.queueSave(() => deps.write(profile, guides))
  })
}
