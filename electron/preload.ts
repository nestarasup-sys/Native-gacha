import { createFabricatorInvoker, fabricatorIpcChannels } from '../src/shared/fabricatorIpcChannels'
import { createStudioInvoker } from '../src/shared/studioIpcChannels'
import { createEditorV6Invoker } from '../src/shared/editorV6IpcChannels'
import { contextBridge, ipcRenderer } from 'electron'
import type { FabricatorDesktopApi, FabricatorModelSourcePublishRequest } from '../src/shared/fabricator'
import type { CustomizerDesktopApi } from '../src/shared/customizer'
import type { StudioDesktopApi, VideoLibraryDesktopApi } from '../src/shared/studio'
import type { EditorV6DesktopApi } from '../src/shared/editorV6'
import type { RoteirosDesktopApi } from '../src/shared/roteiros'

const invokeFabricator = createFabricatorInvoker(ipcRenderer)
const fabricatorApi: FabricatorDesktopApi = {
  listFabricatorSlots: () => invokeFabricator('listFabricatorSlots'),
  importFabricatorModel: (slot) => ipcRenderer.invoke('fabricator:import-model', slot),
  loadFabricatorSlot: (slot) => invokeFabricator('loadFabricatorSlot', slot),
  saveFabricatorProject: (project, changedAssets) => ipcRenderer.invoke('fabricator:save-project', project, changedAssets),
  publishFabricatorModelSource: (project, sourceDataUrl, changedAssets) => ipcRenderer.invoke(fabricatorIpcChannels.publishFabricatorModelSource, { project, sourceDataUrl, changedAssets } satisfies FabricatorModelSourcePublishRequest),
  downloadFabricatorModelSource: (slot, pngDataUrl) => invokeFabricator('downloadFabricatorModelSource', slot, pngDataUrl),
  loadFabricatorHistory: (slot) => ipcRenderer.invoke('fabricator:load-history', slot),
  saveFabricatorHistory: (slot, history, current, changedAssets) => ipcRenderer.invoke('fabricator:save-history', slot, history, current, changedAssets),
  deleteFabricatorSlot: (slot) => ipcRenderer.invoke('fabricator:delete-slot', slot),
  listFabricatorPoseSlots: (modelSlot) => invokeFabricator('listFabricatorPoseSlots', modelSlot),
  getFabricatorExportPoseSlots: (modelSlot) => invokeFabricator('getFabricatorExportPoseSlots', modelSlot),
  saveFabricatorExportPoseSlots: (modelSlot, slots) => invokeFabricator('saveFabricatorExportPoseSlots', modelSlot, slots),
  loadFabricatorPose: (modelSlot, slot) => invokeFabricator('loadFabricatorPose', modelSlot, slot),
  saveFabricatorPose: (modelSlot, slot, project, assets) => invokeFabricator('saveFabricatorPose', modelSlot, slot, project, assets),
  deleteFabricatorPose: (modelSlot, slot) => invokeFabricator('deleteFabricatorPose', modelSlot, slot),
  loadFabricatorPoseDraft: (modelSlot) => invokeFabricator('loadFabricatorPoseDraft', modelSlot),
  saveFabricatorPoseDraft: (modelSlot, draft, assets) => invokeFabricator('saveFabricatorPoseDraft', modelSlot, draft, assets),
  deleteFabricatorPoseDraft: (modelSlot) => invokeFabricator('deleteFabricatorPoseDraft', modelSlot),
  listAnimatorModelSlots: () => invokeFabricator('listAnimatorModelSlots'),
  listAnimatorAnimations: (modelSlot) => invokeFabricator('listAnimatorAnimations', modelSlot),
  loadAnimatorAnimation: (modelSlot, slot) => invokeFabricator('loadAnimatorAnimation', modelSlot, slot),
  saveAnimatorAnimation: (modelSlot, slot, animation, assets) => invokeFabricator('saveAnimatorAnimation', modelSlot, slot, animation, assets),
  deleteAnimatorAnimation: (modelSlot, slot) => invokeFabricator('deleteAnimatorAnimation', modelSlot, slot),
  loadAnimatorDraft: (modelSlot) => invokeFabricator('loadAnimatorDraft', modelSlot),
  saveAnimatorDraft: (modelSlot, draft, assets) => invokeFabricator('saveAnimatorDraft', modelSlot, draft, assets),
  deleteAnimatorDraft: (modelSlot) => invokeFabricator('deleteAnimatorDraft', modelSlot),
  listWardrobeSets: (modelSlot) => invokeFabricator('listWardrobeSets', modelSlot),
  listWardrobeSetsDetailed: (modelSlot) => invokeFabricator('listWardrobeSetsDetailed', modelSlot),
  loadWardrobeSet: (modelSlot, id) => invokeFabricator('loadWardrobeSet', modelSlot, id),
  saveWardrobeSet: (modelSlot, set, assets) => invokeFabricator('saveWardrobeSet', modelSlot, set, assets),
  deleteWardrobeSet: (modelSlot, id) => invokeFabricator('deleteWardrobeSet', modelSlot, id),
  listFaceSets: (modelSlot) => ipcRenderer.invoke('fabricator:face:list', modelSlot),
  loadFaceSet: (modelSlot, id) => ipcRenderer.invoke('fabricator:face:load', modelSlot, id),
  saveFaceSet: (modelSlot, set, assets) => ipcRenderer.invoke('fabricator:face:save', modelSlot, set, assets),
  deleteFaceSet: (modelSlot, id) => ipcRenderer.invoke('fabricator:face:delete', modelSlot, id),
  listFaceCatalog: (modelSlot) => ipcRenderer.invoke('fabricator:face-catalog:list', modelSlot),
  loadFaceCatalogItem: (modelSlot, id) => ipcRenderer.invoke('fabricator:face-catalog:load', modelSlot, id),
  saveFaceCatalogItem: (modelSlot, item, assets) => ipcRenderer.invoke('fabricator:face-catalog:save', modelSlot, item, assets),
  deleteFaceCatalogItem: (modelSlot, id) => ipcRenderer.invoke('fabricator:face-catalog:delete', modelSlot, id),
  listFaceExpressionPresets: (modelSlot) => ipcRenderer.invoke('fabricator:expression-presets:list', modelSlot),
  listFaceExpressionCollections: (modelSlot) => ipcRenderer.invoke('fabricator:expression-collections:list', modelSlot),
  saveFaceExpressionCollection: (modelSlot, collection) => ipcRenderer.invoke('fabricator:expression-collections:save', modelSlot, collection),
  loadFaceExpressionPreset: (modelSlot, id) => ipcRenderer.invoke('fabricator:expression-presets:load', modelSlot, id),
  saveFaceExpressionPreset: (modelSlot, preset) => ipcRenderer.invoke('fabricator:expression-presets:save', modelSlot, preset),
  saveFaceExpressionPresetBatch: (modelSlot, presets) => ipcRenderer.invoke('fabricator:expression-presets:save-batch', modelSlot, presets),
  deleteFaceExpressionPreset: (modelSlot, id) => ipcRenderer.invoke('fabricator:expression-presets:delete', modelSlot, id),
  saveFaceAnimationExport: (modelSlot, data) => ipcRenderer.invoke('fabricator:face-animation:export', modelSlot, data),
  loadFaceExpressionWorkspaceDraft: (modelSlot) => ipcRenderer.invoke('fabricator:expression-workspace:load', modelSlot),
  saveFaceExpressionWorkspaceDraft: (modelSlot, draft) => ipcRenderer.invoke('fabricator:expression-workspace:save', modelSlot, draft),
  listFaceComponentAssets: (modelSlot, kind) => invokeFabricator('listFaceComponentAssets', modelSlot, kind),
  loadFaceComponentAsset: (modelSlot, id) => invokeFabricator('loadFaceComponentAsset', modelSlot, id),
  saveFaceComponentAsset: (modelSlot, asset, dataUrl) => invokeFabricator('saveFaceComponentAsset', modelSlot, asset, dataUrl),
  deleteFaceComponentAsset: (modelSlot, id) => invokeFabricator('deleteFaceComponentAsset', modelSlot, id),
  loadFaceGuides: (profile) => ipcRenderer.invoke('fabricator:face-guides:load', profile),
  saveFaceGuides: (profile, guides) => ipcRenderer.invoke('fabricator:face-guides:save', profile, guides),
  loadHairWorkspace: (modelSlot) => invokeFabricator('loadHairWorkspace', modelSlot),
  saveHairWorkspace: (modelSlot, workspace, assets) => invokeFabricator('saveHairWorkspace', modelSlot, workspace, assets),
  listHairStyles: (modelSlot) => invokeFabricator('listHairStyles', modelSlot),
  loadHairStyle: (modelSlot, id) => invokeFabricator('loadHairStyle', modelSlot, id),
  saveHairStyle: (modelSlot, style, assets) => invokeFabricator('saveHairStyle', modelSlot, style, assets),
  deleteHairStyle: (modelSlot, id) => invokeFabricator('deleteHairStyle', modelSlot, id)
}

const customizerApi: CustomizerDesktopApi = {
  listCustomizerCharacters: () => ipcRenderer.invoke('customizer:characters:list'),
  saveCustomizerCharacter: (character) => ipcRenderer.invoke('customizer:characters:save', character),
  createCustomizerCharacter: (name) => ipcRenderer.invoke('customizer:characters:create', name),
  deleteCustomizerCharacter: (id) => ipcRenderer.invoke('customizer:characters:delete', id)
}

const invokeStudio = createStudioInvoker(ipcRenderer)
const studioApi: StudioDesktopApi = {
  flushPendingWrites: () => invokeStudio('flushPendingWrites'),
  listStudios: () => invokeStudio('listStudios'),
  saveStudio: (studio) => invokeStudio('saveStudio', studio),
  deleteStudio: (id) => invokeStudio('deleteStudio', id),
  getStudioFolder: () => invokeStudio('getStudioFolder'),
  importStudioImage: (category) => invokeStudio('importStudioImage', category),
  saveStudioPrint: (studioId, dataUrl) => invokeStudio('saveStudioPrint', studioId, dataUrl),
  openStudioPrints: (studioId) => invokeStudio('openStudioPrints', studioId)
}

const invokeEditorV6 = createEditorV6Invoker(ipcRenderer)
const editorV6Api: EditorV6DesktopApi = {
  listEditorV6Projects: () => invokeEditorV6('listEditorV6Projects'),
  saveEditorV6Project: (document) => invokeEditorV6('saveEditorV6Project', document),
  deleteEditorV6Project: (id) => invokeEditorV6('deleteEditorV6Project', id),
  getEditorV6Folder: () => invokeEditorV6('getEditorV6Folder'),
  importEditorV6Image: (category) => invokeEditorV6('importEditorV6Image', category),
  saveEditorV6Print: (id, dataUrl) => invokeEditorV6('saveEditorV6Print', id, dataUrl),
  openEditorV6Prints: (id) => invokeEditorV6('openEditorV6Prints', id),
  startEditorV6Export: (project, options) => invokeEditorV6('startEditorV6Export', project, options),
  getEditorV6ExportStatus: (id) => invokeEditorV6('getEditorV6ExportStatus', id),
  cancelEditorV6Export: (id) => invokeEditorV6('cancelEditorV6Export', id),
  revealEditorV6Export: (id, report) => invokeEditorV6('revealEditorV6Export', id, report),
  importEditorV6ExportAudio: (id) => invokeEditorV6('importEditorV6ExportAudio', id),
  cloneEditorV6ExportAudio: (source, target, clips) => invokeEditorV6('cloneEditorV6ExportAudio', source, target, clips)
}

const videoLibraryApi: VideoLibraryDesktopApi = {
  listVideoLibrary: () => ipcRenderer.invoke('video-library:list'),
  importVideoLibrary: () => ipcRenderer.invoke('video-library:import'),
  finishVideoLibraryImport: (id, durationFrames) => ipcRenderer.invoke('video-library:finish', id, durationFrames),
  deleteVideoLibraryItem: (id) => ipcRenderer.invoke('video-library:delete', id),
  renameVideoLibraryItem: (id, name) => ipcRenderer.invoke('video-library:rename', id, name),
  listVideoBackgroundLibrary: () => ipcRenderer.invoke('background-library:list'),
  importVideoBackground: () => ipcRenderer.invoke('background-library:import'),
  deleteVideoBackground: (id) => ipcRenderer.invoke('background-library:delete', id)
}

const roteirosApi: RoteirosDesktopApi = {
  listRoteiros: () => ipcRenderer.invoke('roteiros:list'),
  saveRoteiros: (roteiros) => ipcRenderer.invoke('roteiros:save', roteiros),
  listBaseVideoDetails: () => ipcRenderer.invoke('base-videos:list-details'),
  saveBaseVideoDetails: (details) => ipcRenderer.invoke('base-videos:save-details', details),
  listBaseVideoCategories: () => ipcRenderer.invoke('base-videos:categories:list'),
  createBaseVideoCategory: (name) => ipcRenderer.invoke('base-videos:categories:create', name),
  renameBaseVideoCategory: (id, name) => ipcRenderer.invoke('base-videos:categories:rename', id, name),
  deleteBaseVideoCategory: (id) => ipcRenderer.invoke('base-videos:categories:delete', id),
  listRoteiroExportLogs: (roteiroId) => ipcRenderer.invoke('roteiros:export-logs:list', roteiroId),
  appendRoteiroExportLog: (roteiroId, entry) => ipcRenderer.invoke('roteiros:export-logs:append', roteiroId, entry),
  clearRoteiroExportLogs: (roteiroId) => ipcRenderer.invoke('roteiros:export-logs:clear', roteiroId),
  deleteBaseVideoDetails: (videoId) => ipcRenderer.invoke('base-videos:delete-details', videoId),
  deleteBaseVideo: (videoId) => ipcRenderer.invoke('base-videos:delete', videoId),
  publishBaseVideo: (videoId) => ipcRenderer.invoke('base-videos:publish', videoId),
  startRoteiroCharacterExport: (request) => ipcRenderer.invoke('roteiros:characters-export:start', request),
  writeRoteiroCharacterExportAsset: (jobId, asset) => ipcRenderer.invoke('roteiros:characters-export:asset', jobId, asset),
  finishRoteiroCharacterExport: (jobId) => ipcRenderer.invoke('roteiros:characters-export:finish', jobId),
  cancelRoteiroCharacterExport: (jobId) => ipcRenderer.invoke('roteiros:characters-export:cancel', jobId),
  exportRoteiroAssets: (request) => ipcRenderer.invoke('roteiros:assets-export', request),
  openRoteiroExportFolder: (request) => ipcRenderer.invoke('roteiros:export-folder:open', request),
  listRoteiroUiGifs: () => ipcRenderer.invoke('roteiros:ui-gifs:list'),
  importRoteiroUiGif: () => ipcRenderer.invoke('roteiros:ui-gifs:import'),
  deleteRoteiroUiGif: (id) => ipcRenderer.invoke('roteiros:ui-gifs:delete', id)
}

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  appName: 'Gacha Nymi',
  normalizeImageForImport: (bytes: Uint8Array) => ipcRenderer.invoke('app:image:normalize', bytes),
  loadFabricatorDesignSettings: () => ipcRenderer.invoke('fabricator:design-settings:load'),
  saveFabricatorDesignSettings: (settings: unknown) => ipcRenderer.invoke('fabricator:design-settings:save', settings),
  getAppDataStorageSummary: () => ipcRenderer.invoke('app:data-storage-summary'),
  getDataMigrationSummary: () => ipcRenderer.invoke('app:data-migration:prepare'),
  runDataMigration: () => ipcRenderer.invoke('app:data-migration:run-all'),
  pauseDataMigration: () => ipcRenderer.invoke('app:data-migration:pause'),
  restartAfterDataMigration: () => ipcRenderer.invoke('app:data-migration:restart'),
  onDataMigrationProgress: (callback: (progress: { domainId: string; completedFiles: number; totalFiles: number; completedBytes: number; totalBytes: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { domainId: string; completedFiles: number; totalFiles: number; completedBytes: number; totalBytes: number }) => callback(progress)
    ipcRenderer.on('app:data-migration:progress', listener)
    return () => ipcRenderer.removeListener('app:data-migration:progress', listener)
  },
  listDataBackups: () => ipcRenderer.invoke('app:data-backups:list'),
  createDataBackup: () => ipcRenderer.invoke('app:data-backups:create'),
  verifyDataBackup: (id: string) => ipcRenderer.invoke('app:data-backups:verify', id),
  restoreDataBackup: (id: string) => ipcRenderer.invoke('app:data-backups:restore', id),
  deleteDataBackup: (id: string) => ipcRenderer.invoke('app:data-backups:delete', id),
  ...fabricatorApi,
  ...customizerApi,
  ...studioApi,
  ...editorV6Api,
  ...videoLibraryApi,
  ...roteirosApi
})
