/** Coordena a exportação de assets e personagens dos documentos de Roteiros. */
import { dirname, join } from 'node:path'
import type { RoteiroExportCharacterInfo, RoteiroVideoReference } from '../../../src/shared/roteiros'
import { RoteiroCharacterExportStore } from './characterExportStore.ts'
import { RoteiroProjectExportStore } from './projectExportStore.ts'
import { isRoteiroDocument, isRoteiroId } from './validation.ts'

type RoteiroAssetExportKind = 'background' | 'videos' | 'script' | 'gif'
type RoteiroExportFolderKind = 'characters' | 'background' | 'videos' | 'script' | 'ui'

export type RoteiroExportServiceDependencies = {
  getAppDataRoot: () => string
  resolveBackground: (id: string) => Promise<string>
  resolveGif: (id: string) => Promise<string>
  resolveVideo: (video: RoteiroVideoReference) => Promise<string>
}

function isCharacterInfo(value: unknown, characterIds: readonly string[]): value is RoteiroExportCharacterInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const character = value as Partial<RoteiroExportCharacterInfo>
  return isRoteiroId(character.id) && characterIds.includes(character.id)
    && typeof character.name === 'string' && character.name.trim().length > 0 && character.name.length <= 100
    && Number.isInteger(character.modelSlot) && character.modelSlot! >= 1 && character.modelSlot! <= 100
    && typeof character.hair === 'string' && character.hair.length <= 255
    && typeof character.outfit === 'string' && character.outfit.length <= 255
    && typeof character.skin === 'string' && character.skin.length <= 255
    && typeof character.hasFaceAppearance === 'boolean'
    && Array.isArray(character.poseSlots) && character.poseSlots.length <= 100
    && character.poseSlots.every((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 100)
    && Array.isArray(character.expressions) && character.expressions.length <= 500
    && character.expressions.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 100)
}

export function createRoteiroExportService(deps: RoteiroExportServiceDependencies) {
  let characterStore: RoteiroCharacterExportStore | null = null
  let projectStore: RoteiroProjectExportStore | null = null

  const getCharacterStore = () => {
    if (!characterStore) characterStore = new RoteiroCharacterExportStore(join(deps.getAppDataRoot(), 'temp', 'roteiro-character-export'))
    return characterStore
  }

  const getProjectStore = () => {
    if (!projectStore) projectStore = new RoteiroProjectExportStore(deps.resolveBackground, deps.resolveGif, deps.resolveVideo)
    return projectStore
  }

  return {
    exportAssets(request: unknown): Promise<{ path: string; files: number }> {
      if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Solicitação de exportação inválida.')
      const value = request as { roteiro?: unknown; kind?: unknown; characters?: unknown }
      const roteiro = value.roteiro
      if (!isRoteiroDocument(roteiro) || !['background', 'videos', 'script', 'gif'].includes(String(value.kind))) throw new Error('Roteiro ou tipo de exportação inválido.')

      let characters: RoteiroExportCharacterInfo[] = []
      if (value.characters !== undefined) {
        if (!Array.isArray(value.characters) || value.characters.length > 500 || !value.characters.every((item) => isCharacterInfo(item, roteiro.characterIds))
          || new Set(value.characters.map((item: RoteiroExportCharacterInfo) => item.id)).size !== value.characters.length) {
          throw new Error('Dados de personagens inválidos para o TXT.')
        }
        characters = value.characters as RoteiroExportCharacterInfo[]
      }

      return getProjectStore().export(roteiro, value.kind as RoteiroAssetExportKind, characters)
    },

    async ensureExportFolder(request: unknown): Promise<string> {
      if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Solicitação para abrir pasta inválida.')
      const value = request as { roteiro?: unknown; kind?: unknown }
      const roteiro = value.roteiro
      if (!isRoteiroDocument(roteiro) || !['characters', 'background', 'videos', 'script', 'ui'].includes(String(value.kind))) throw new Error('Roteiro ou pasta de exportação inválida.')
      const folder = await getProjectStore().ensureExportFolder(roteiro, value.kind as RoteiroExportFolderKind)
      if (value.kind === 'characters') await getCharacterStore().recoverProject(dirname(dirname(folder)))
      return folder
    },

    startCharacterExport(request: unknown) {
      return getCharacterStore().start(request)
    },

    writeCharacterExportAsset(jobId: string, asset: unknown): Promise<void> {
      return getCharacterStore().writeAsset(jobId, asset)
    },

    finishCharacterExport(jobId: string) {
      return getCharacterStore().finish(jobId)
    },

    cancelCharacterExport(jobId: string): Promise<void> {
      return getCharacterStore().cancel(jobId)
    }
  }
}
