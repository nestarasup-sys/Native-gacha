/** Contrato único dos canais Fabricador compartilhado entre main, preload e renderer.
 * Novos canais devem atualizar este mapa sem renomear os contratos legados.
 */
import type { FabricatorDesktopApi } from './fabricator'

export const fabricatorIpcChannels = {
  listFabricatorSlots: 'fabricator:list-slots',
  loadFabricatorSlot: 'fabricator:load-slot',
  duplicateFabricatorSlot: 'fabricator:duplicate-slot',
  publishFabricatorModelSource: 'fabricator:model-source:publish',
  downloadFabricatorModelSource: 'fabricator:model-source:download',
  listFabricatorPoseSlots: 'fabricator:poses:list',
  getFabricatorExportPoseSlots: 'fabricator:poses:export-slots:get',
  saveFabricatorExportPoseSlots: 'fabricator:poses:export-slots:save',
  loadFabricatorPose: 'fabricator:poses:load',
  saveFabricatorPose: 'fabricator:poses:save',
  deleteFabricatorPose: 'fabricator:poses:delete',
  loadFabricatorPoseDraft: 'fabricator:poses:draft:load',
  saveFabricatorPoseDraft: 'fabricator:poses:draft:save',
  deleteFabricatorPoseDraft: 'fabricator:poses:draft:delete',
  listAnimatorModelSlots: 'fabricator:animator:model-slots',
  listAnimatorAnimations: 'fabricator:animator:list',
  loadAnimatorAnimation: 'fabricator:animator:load',
  saveAnimatorAnimation: 'fabricator:animator:save',
  deleteAnimatorAnimation: 'fabricator:animator:delete',
  loadAnimatorDraft: 'fabricator:animator:draft:load',
  saveAnimatorDraft: 'fabricator:animator:draft:save',
  deleteAnimatorDraft: 'fabricator:animator:draft:delete',
  listWardrobeSets: 'fabricator:wardrobe:list',
  listWardrobeSetsDetailed: 'fabricator:wardrobe:list-detailed',
  loadWardrobeSet: 'fabricator:wardrobe:load',
  saveWardrobeSet: 'fabricator:wardrobe:save',
  deleteWardrobeSet: 'fabricator:wardrobe:delete',
  listFaceComponentAssets: 'fabricator:face-components:list',
  loadFaceComponentAsset: 'fabricator:face-components:load',
  saveFaceComponentAsset: 'fabricator:face-components:save',
  deleteFaceComponentAsset: 'fabricator:face-components:delete',
  loadHairWorkspace: 'fabricator:hair:load',
  saveHairWorkspace: 'fabricator:hair:save',
  listHairStyles: 'fabricator:hair:styles:list',
  loadHairStyle: 'fabricator:hair:styles:load',
  saveHairStyle: 'fabricator:hair:styles:save',
  deleteHairStyle: 'fabricator:hair:styles:delete',
} as const satisfies Partial<Record<keyof FabricatorDesktopApi, string>>

export type FabricatorIpcMethod = keyof typeof fabricatorIpcChannels
export type FabricatorIpcArguments<K extends FabricatorIpcMethod> = Parameters<FabricatorDesktopApi[K]>
export type FabricatorIpcResult<K extends FabricatorIpcMethod> = Awaited<ReturnType<FabricatorDesktopApi[K]>>

export type FabricatorInvokeTransport = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** A única conversão de tipos está no limite de transporte do Electron. */
export function createFabricatorInvoker(transport: FabricatorInvokeTransport) {
  return function invoke<K extends FabricatorIpcMethod>(
    method: K, ...args: FabricatorIpcArguments<K>
  ): Promise<FabricatorIpcResult<K>> {
    return transport.invoke(fabricatorIpcChannels[method], ...args) as Promise<FabricatorIpcResult<K>>
  }
}
