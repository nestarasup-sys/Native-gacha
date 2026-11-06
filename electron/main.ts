import { createEditorV6Paths } from './domains/editorV6/paths'
import { registerMediaProtocols } from './mediaProtocols'
import { app, BrowserWindow, dialog, ipcMain as rawIpcMain, Menu, protocol, session, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir as nativeMkdir, readFile as nativeReadFile, writeFile as nativeWriteFile, readdir as nativeReaddir, unlink as nativeUnlink, rename as nativeRename, stat as nativeStat, access as nativeAccess, rm as nativeRm, copyFile as nativeCopyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FABRICATOR_MODEL_SLOT_COUNT, FABRICATOR_POSE_SLOT_COUNT, type FaceExpressionPreset, type FabricatorProjectSave, type ModelPart } from '../src/shared/fabricator'
import type { CustomizerCharacter } from '../src/shared/customizer'
import type { CustomizerFaceAssetReference } from '../src/shared/customizerFaceAssetReferences'
import type { FabricatorPoseReference } from '../src/shared/fabricatorPoseReferences'
import type { EditorV6Document } from '../src/shared/editorV6'
import { editorV6BenchmarkAudioMatchesExport, type EditorV6ExportOptions } from '../src/shared/editorV6Export'
import { isEditorV6ExportTestMode } from '../src/shared/editorV6ExportTestModes'
import type { EditorV6MotionCacheStats } from './domains/editorV6/motionCache'
import type { StudioDocument } from '../src/shared/studio'
import { isStudioDocument } from '../src/shared/studioValidation'
import { isEditorV6Document } from '../src/shared/editorV6Schema'
import { registerEditorV6ExportHandlers } from './domains/editorV6/exportIpc'
import { registerEditorV7ExportHandlers } from './domains/editorV7/exportIpc'
import { createEditorV6MotionService } from './domains/editorV6/motionIpc'
import { VideoLibraryStore, configureVideoLibraryStorage } from './domains/mediaLibrary/videoLibraryStore'
import { VideoBackgroundLibraryStore, configureBackgroundLibraryStorage } from './backgroundLibrary'
import { EditorV6MediaLibraryStore, configureEditorV6MediaLibraryStorage } from './domains/editorV6/mediaLibrary'
import { registerEditorV6MediaLibraryHandlers } from './domains/editorV6/mediaLibraryIpc'
import { createEditorV6MediaReferenceIndex } from './domains/editorV6/mediaReferences'
import { RoteiroUiGifLibraryStore, configureRoteiroUiGifStorage } from './roteiroUiGifLibrary'
import { DataPlatform, getAppDataUsage } from './dataPlatform.cjs'
import { DomainFileSystem } from './domainFileSystem.cjs'
import { DataMigrationService } from './dataMigration.cjs'
import { DataBackupService } from './dataBackups.cjs'
import { registerDataMigrationHandlers } from './domains/storage/dataMigrationIpc'
import { registerDataBackupHandlers } from './domains/storage/dataBackupIpc'
import { createDiagnosticsLog } from './domains/storage/diagnosticsLog'
import { registerDiagnosticsHandlers } from './domains/storage/diagnosticsIpc'
import { registerPendingPersistenceFlushIpc } from './domains/storage/pendingPersistenceIpc'
import { createKeyedOperationQueue } from './domains/storage/keyedOperationQueue'
import { configureAssetImageStorage, readAssetImage, writeAssetImageSource } from './assetImageOverrides'
import { normalizeImageBuffer } from './imageIngestion.cjs'
import { getIpcPerformanceSnapshot, measureIpc, setIpcPerformanceCollectionEnabled } from './ipcPerformance'
import { createMeasuredIpcMain } from './application/measuredIpcMain'
import { restrictRendererNavigation } from './windowNavigation'
import { restrictRendererPermissions } from './windowPermissions'
import { BaseVideoService } from './domains/baseVideos/service'
import { registerBaseVideoHandlers } from './domains/baseVideos/ipc'
import { CustomizerCharacterRepository } from './domains/customizer/repository'
import { createCustomizerPaths } from './domains/customizer/paths'
import { CustomizerCharacterService } from './domains/customizer/service'
import { registerCustomizerCharacterHandlers } from './domains/customizer/ipc'
import { starterCharacters } from './domains/customizer/starterCharacters'
import { FabricatorModelCatalog } from './domains/fabricator/modelCatalog'
import { createFabricatorPaths } from './domains/fabricator/paths'
import { registerFabricatorModelCatalogHandlers } from './domains/fabricator/modelIpc'
import { FabricatorWardrobeCatalog } from './domains/fabricator/wardrobeCatalog'
import { createFabricatorCatalogListings, legacyHairStyle } from './domains/fabricator/catalogListings'
import { registerFabricatorWardrobeCatalogHandlers } from './domains/fabricator/wardrobeCatalogIpc'
import { createFabricatorWardrobePersistence } from './domains/fabricator/wardrobePersistence'
import { createSplitAwareWardrobeReader } from './domains/fabricator/wardrobeSplitRecovery'
import { registerFabricatorWardrobeHandlers } from './domains/fabricator/wardrobeIpc'
import { createFaceGuidePersistence, isFaceGuideProfile } from './domains/fabricator/faceGuidePersistence'
import { registerFabricatorFaceCatalogHandlers } from './domains/fabricator/faceCatalogIpc'
import { registerFabricatorHairHandlers } from './domains/fabricator/hairIpc'
import { registerFaceGuideHandlers } from './domains/fabricator/faceGuidesIpc'
import { registerFabricatorFaceAnimationExportHandler } from './domains/fabricator/faceAnimationExportIpc'
import { registerImageNormalizationHandler } from './domains/images/imageNormalizationIpc'
import { listModelSourceSlots, recoverModelSourceSlot } from './domains/fabricator/modelSourceRecovery'
import { createFabricatorModelWriter } from './domains/fabricator/modelWriter'
import { createFabricatorHistoryPersistence } from './domains/fabricator/historyPersistence'
import { registerFabricatorProjectHandlers } from './domains/fabricator/projectIpc'
import { createPosePersistence } from './domains/fabricator/posePersistence'
import { createLegacyPoseMigration } from './domains/fabricator/legacyPoseMigration'
import { createPoseReferenceChangeCoordinator } from './domains/fabricator/poseReferences'
import { createFabricatorPoseReferenceIntegrity } from './domains/fabricator/poseReferenceIntegrity'
import { createAnimatorPersistence } from './domains/fabricator/animatorPersistence'
import { registerFabricatorPoseHandlers } from './domains/fabricator/poseIpc'
import { registerFabricatorAnimatorHandlers } from './domains/fabricator/animatorIpc'
import { FabricatorCatalogAssetService } from './domains/fabricator/catalogAssetService'
import { createFabricatorCatalogPersistence } from './domains/fabricator/catalogPersistence'
import { createFabricatorFaceStorage } from './domains/fabricator/faceStorage'
import { createFabricatorHairStorage } from './domains/fabricator/hairStorage'
import { createFabricatorExpressionStorage } from './domains/fabricator/expressionStorage'
import { createFabricatorExpressionValidators } from './domains/fabricator/expressionValidation'
import { createExpressionBatchTransaction } from './domains/fabricator/expressionBatchTransaction'
import { createFabricatorDesignSettingsService } from './domains/fabricator/designSettingsService'
import { registerFabricatorDesignSettingsHandlers } from './domains/fabricator/designSettingsIpc'
import { registerExpressionPresetHandlers } from './domains/fabricator/expressionIpc'
import { registerStudioPrimaryHandlers } from './domains/studio/primaryIpc'
import { createStudioPaths } from './domains/studio/paths'
import { registerStudioFileHandlers } from './domains/studio/fileIpc'
import { createStudioLibraryIndex } from './domains/studio/libraryIndex'
import { createStudioDocumentPersistence } from './domains/studio/documentPersistence'
import type { AssetNamespace } from './domains/fabricator/versionedAssetResolver'
import { inspectFabricatorStorage } from '../src/shared/fabricatorStorageCompatibility'
import { registerModelSourceDownloadHandlers } from './domains/fabricator/modelSourceExportIpc'
import { registerEditorV6PrimaryHandlers } from './domains/editorV6/primaryIpc'
import { registerEditorV6FileHandlers } from './domains/editorV6/fileIpc'
import { createEditorV6LibraryIndex } from './domains/editorV6/libraryIndex'
import { createEditorV6DocumentPersistence } from './domains/editorV6/documentPersistence'
import { createVideoReferenceChangeCoordinator, createVideoReferenceGuard } from './domains/mediaLibrary/videoReferences'
import { createRoteirosVideoReferenceLookup } from './domains/roteiros/videoReferences'
import { createRoteirosWriteQueue } from './domains/roteiros/writeQueue'
import { registerRoteirosIpc, type RoteirosIpcLifecycle } from './application/registerRoteirosIpc'
import { configureDevAiDataRoot, configureLocalAppDataRoot } from './application/appDataBootstrap'
import { selectRendererMemorySnapshot } from './application/rendererMemorySnapshot'
import { readElectronAppMetrics } from './application/electronAppMetrics'
import { mapRuntimeProcessMetrics } from './application/runtimeProcessMetrics'
import { createPersistenceShutdownHandler } from './application/persistenceShutdown'
import { createMainWindowFactory } from './application/mainWindow'
import { createEditorV6VideoReferenceLookup } from './domains/editorV6/videoReferences'
import { canVisibleRendererRequestFullscreen, createRendererTrustPolicy, isTrustedRendererFrame } from './application/rendererTrust'

const ipcMain = createMeasuredIpcMain(rawIpcMain, measureIpc, (channel) => !channel.startsWith('app:diagnostics:'))
const rendererHtmlPath = join(__dirname, '../renderer/index.html')
const devRendererUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
const rendererTrustPolicy = createRendererTrustPolicy(devRendererUrl, rendererHtmlPath)
let configuredAppDataRoot: string | null = null
const roteirosWriteQueue = createRoteirosWriteQueue()
const dataMaintenanceQueue = createKeyedOperationQueue()

function runDataMaintenance<T>(operation: () => Promise<T>): Promise<T> {
  return dataMaintenanceQueue.run('app-data-maintenance', operation)
}

const waitForRoteirosWrites = roteirosWriteQueue.waitForPendingWrites
const enqueueRoteirosWrite = roteirosWriteQueue.enqueue

configureDevAiDataRoot({ app, repositoryRoot: resolve(__dirname, '../..') })
configuredAppDataRoot = configureLocalAppDataRoot({ app })
const diagnosticsLog = createDiagnosticsLog(app.getPath('appData'))
process.on('uncaughtExceptionMonitor', (error, origin) => {
  diagnosticsLog.recordFatalMain({ severity: 'error', code: 'main.uncaught-exception', message: `${origin}: ${error.message}` })
})
process.on('warning', (warning) => {
  void diagnosticsLog.recordMain({ severity: 'warning', code: 'main.process-warning', message: `${warning.name}: ${warning.message}` }).catch(() => undefined)
})

// Local, opt-in harness for Windows media stress runs. It keeps the
// normal app-data profile and app IPC, but lets an external local runner drive
// the hidden renderer through CDP without showing a desktop window.
if (process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1') {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  // Keep Chromium's animation/compositor clock running in the isolated Windows
  // harness even though its native window is positioned outside every display.
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  const debuggingPort = process.env.GACHA_VIDEO_STRESS_DEBUG_PORT
  if (debuggingPort && /^\d{1,5}$/.test(debuggingPort) && Number(debuggingPort) > 0 && Number(debuggingPort) <= 65535) {
    app.commandLine.appendSwitch('remote-debugging-port', debuggingPort)
  }
}

// The catalog starts empty and does not scan or rewrite legacy libraries.
// Existing JSON/file stores remain authoritative until each domain is migrated.
const dataPlatform = new DataPlatform(configuredAppDataRoot ?? dirname(app.getPath('userData')))
const dataFileSystem = new DomainFileSystem(dataPlatform, app.getPath('userData'))
configureVideoLibraryStorage(dataFileSystem)
configureBackgroundLibraryStorage(dataFileSystem)
configureEditorV6MediaLibraryStorage(dataFileSystem)
configureRoteiroUiGifStorage(dataFileSystem)
configureAssetImageStorage(dataFileSystem)
const mkdir = dataFileSystem.mkdir.bind(dataFileSystem) as typeof nativeMkdir
const readFile = dataFileSystem.readFile.bind(dataFileSystem) as typeof nativeReadFile
const writeFile = dataFileSystem.writeFile.bind(dataFileSystem) as typeof nativeWriteFile
const readdir = dataFileSystem.readdir.bind(dataFileSystem) as typeof nativeReaddir
const unlink = dataFileSystem.unlink.bind(dataFileSystem) as typeof nativeUnlink
const rename = dataFileSystem.rename.bind(dataFileSystem) as typeof nativeRename
const stat = dataFileSystem.stat.bind(dataFileSystem) as typeof nativeStat
const access = dataFileSystem.access.bind(dataFileSystem) as typeof nativeAccess
const rm = dataFileSystem.rm.bind(dataFileSystem) as typeof nativeRm
const copyFile = dataFileSystem.copyFile.bind(dataFileSystem) as typeof nativeCopyFile
const faceGuidePersistence = createFaceGuidePersistence({ mkdir, readFile, writeFile, rename }, () => app.getPath('userData'))
let dataMigration: InstanceType<typeof DataMigrationService> | null = null
let dataBackupService: InstanceType<typeof DataBackupService> | null = null
let dataBackupIpc: ReturnType<typeof registerDataBackupHandlers> | null = null
let dataMigrationIpc: ReturnType<typeof registerDataMigrationHandlers> | null = null
let roteiroExportIpc: RoteirosIpcLifecycle | null = null
let fabricatorHairIpc: ReturnType<typeof registerFabricatorHairHandlers> | null = null
let fabricatorProjectIpc: ReturnType<typeof registerFabricatorProjectHandlers> | null = null
let fabricatorModelSourceDownloadIpc: ReturnType<typeof registerModelSourceDownloadHandlers> | null = null
let fabricatorFaceAnimationExportIpc: ReturnType<typeof registerFabricatorFaceAnimationExportHandler> | null = null
let fabricatorDesignSettingsIpc: ReturnType<typeof registerFabricatorDesignSettingsHandlers> | null = null
let fabricatorWardrobeIpc: ReturnType<typeof registerFabricatorWardrobeHandlers> | null = null
let fabricatorAnimatorIpc: ReturnType<typeof registerFabricatorAnimatorHandlers> | null = null
let editorV6ExportService: ReturnType<typeof registerEditorV6ExportHandlers> | null = null
let editorV7ExportService: ReturnType<typeof registerEditorV7ExportHandlers> | null = null
let editorV6MotionService: ReturnType<typeof createEditorV6MotionService> | null = null
let rendererWritesFlushedForShutdown = false

protocol.registerSchemesAsPrivileged([
  { scheme: 'gacha-video', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'gacha-background', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'gacha-gif', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

const slotCount = FABRICATOR_MODEL_SLOT_COUNT
const poseSlotCount = FABRICATOR_POSE_SLOT_COUNT
const userDataPath = () => app.getPath('userData')
const {
  libraryPath, slotPath, poseLibraryPath, poseModelPath, poseSlotPath, poseDraftPath,
  animatorLibraryPath, animatorModelPath, animatorSlotPath, animatorDraftPath,
  wardrobeModelPath, wardrobeSetPath,
  faceModelPath, faceSetPath, faceCatalogPath, faceCatalogItemPath,
  faceExpressionPresetPath, faceExpressionCollectionsPath, faceExpressionWorkspaceDraftPath,
  faceComponentPath, faceComponentItemPath, hairModelPath, hairStylePath
} = createFabricatorPaths(userDataPath)
const { characterManifestPath } = createCustomizerPaths(userDataPath)
const { studioLibraryPath, studioPath } = createStudioPaths(userDataPath)
const { editorV6LibraryPath, editorV6Path } = createEditorV6Paths(userDataPath)
const fabricatorModelCatalog = new FabricatorModelCatalog(slotCount, slotPath, { readFile, readAssetImage })
const videoLibrary = new VideoLibraryStore(() => studioLibraryPath('video'))
const coordinateVideoReferenceChange = createVideoReferenceChangeCoordinator()
const coordinatePoseReferenceChange = createPoseReferenceChangeCoordinator()
const assertLibraryVideoReferencesAvailable = async (videoIds: readonly string[]): Promise<void> => {
  if (videoIds.length === 0) return
  const availableVideos = new Map((await videoLibrary.list()).map((item) => [item.id, item]))
  const unavailable = videoIds.find((id) => !availableVideos.get(id)?.available)
  if (unavailable) {
    const item = availableVideos.get(unavailable)
    throw new Error(`O vídeo${item ? ` “${item.name}”` : ''} não está disponível na biblioteca. Reimporte-o ou remova o vínculo antes de salvar.`)
  }
}
const videoBackgroundLibrary = new VideoBackgroundLibraryStore(() => studioLibraryPath('video'))
const coordinateBackgroundReferenceChange = coordinateVideoReferenceChange
let editorV6MediaLibrary!: EditorV6MediaLibraryStore
const roteiroUiGifLibrary = new RoteiroUiGifLibraryStore(() => studioLibraryPath('video'))
const getRoteiroUiGifDefaultPath = () => {
  const roots = [join(app.getAppPath(), 'src', 'renderer', 'public', 'assets', 'ui', 'loading.gif'), join(app.getAppPath(), 'out', 'renderer', 'assets', 'ui', 'loading.gif')]
  return roots.find((path) => existsSync(path))
}
const assertLibraryBackgroundReferencesAvailable = async (assetIds: readonly string[]): Promise<void> => {
  if (assetIds.length === 0) return
  const availableAssets = new Map((await videoBackgroundLibrary.list()).map((item) => [item.id, item]))
  const unavailable = assetIds.find((id) => !availableAssets.get(id)?.available)
  if (unavailable) {
    const item = availableAssets.get(unavailable)
    throw new Error(`O fundo${item ? ` “${item.name}”` : ''} não está disponível na biblioteca. Reimporte-o ou remova o vínculo antes de salvar.`)
  }
}
const assertLibraryUiGifReferencesAvailable = async (assetIds: readonly string[]): Promise<void> => {
  if (assetIds.length === 0) return
  const defaultGifPath = getRoteiroUiGifDefaultPath()
  if (!defaultGifPath) throw new Error('O GIF padrão do Gacha V5 não foi encontrado na instalação.')
  const availableAssets = new Map((await roteiroUiGifLibrary.list(defaultGifPath)).map((item) => [item.id, item]))
  const unavailable = assetIds.find((id) => !availableAssets.get(id)?.available)
  if (unavailable) {
    const item = availableAssets.get(unavailable)
    throw new Error(`O GIF${item ? ` “${item.name}”` : ''} não está disponível na biblioteca. Reimporte-o ou remova o vínculo antes de salvar.`)
  }
}
const studioSaveQueues = { studio: Promise.resolve() as Promise<void> }
let studioFileIpc: ReturnType<typeof registerStudioFileHandlers> | null = null
let editorV6FileIpc: ReturnType<typeof registerEditorV6FileHandlers> | null = null
let editorV6SaveQueue: Promise<void> = Promise.resolve()
let poseSaveQueue: Promise<void> = Promise.resolve()
const poseSaveWrites = new Set<Promise<void>>()
let faceGuideIpc: ReturnType<typeof registerFaceGuideHandlers> | null = null
let fabricatorFaceCatalogIpc: ReturnType<typeof registerFabricatorFaceCatalogHandlers> | null = null
// O Customizador recebe estes guards antes de o armazenamento de poses ser montado;
// os callbacks só rodam depois da inicialização completa do composition root.
let poseReferenceIntegrity: ReturnType<typeof createFabricatorPoseReferenceIntegrity> | null = null
function getPoseReferenceIntegrity() {
  if (!poseReferenceIntegrity) throw new Error('A validação de vínculos de pose ainda não foi inicializada.')
  return poseReferenceIntegrity
}
const assertFabricatorPoseReferencesAvailable = (references: readonly FabricatorPoseReference[]): Promise<void> =>
  getPoseReferenceIntegrity().assertPoseReferencesAvailable(references)
const assertDependentCharacterPoseReferencesAvailable = (previous: CustomizerCharacter, next: CustomizerCharacter): Promise<void> =>
  getPoseReferenceIntegrity().assertDependentCharacterPoseReferencesAvailable(previous, next)
const assertStudioPoseReferencesAvailable = (document: StudioDocument): Promise<void> =>
  getPoseReferenceIntegrity().assertStudioPoseReferencesAvailable(document)
const assertEditorV6PoseReferencesAvailable = (document: EditorV6Document): Promise<void> =>
  getPoseReferenceIntegrity().assertEditorV6PoseReferencesAvailable(document)
// O acesso do Customizador passa pelo mesmo DomainFileSystem legado, sem migrar dados.
const customizerRepository = new CustomizerCharacterRepository(
  characterManifestPath,
  { access, readFile, writeFile, rename, unlink, mkdir },
  starterCharacters,
  randomUUID,
  () => new Date().toISOString()
)
const customizerService = new CustomizerCharacterService(
  customizerRepository,
  randomUUID,
  () => new Date().toISOString(),
  {
    assertWardrobeGroupsAvailable: async (groups) => {
      const requested = new Map<string, typeof groups[number]>()
      for (const group of groups) requested.set(`${group.modelSlot}:${group.setId}`, group)
      const resolved = await Promise.all(Array.from(requested, async ([key, group]) => [key, group, await readWardrobeSet(group.modelSlot, group.setId)] as const))
      for (const [key, group, set] of resolved) {
        if (!set) throw new Error(`A roupa ${key} não está mais disponível no Fabricador Dev. Atualize a biblioteca e selecione um conjunto salvo.`)
        if (group.componentId && !set.components.some((component) => component.id === group.componentId)) {
          throw new Error(`A peça ${group.componentId} não existe mais no conjunto ${key}. Atualize a biblioteca antes de equipá-la.`)
        }
      }
    },
    assertHairStylesAvailable: async (references) => {
      for (const { modelSlot, id } of references) {
        if (!await readHairStyle(modelSlot, id)) {
          throw new Error(`O cabelo ${modelSlot}:${id} não está mais disponível no Fabricador Dev. Atualize a biblioteca e escolha um cabelo salvo.`)
        }
      }
    },
    assertFaceAssetsAvailable: assertFaceAssetReferencesAvailable,
    assertFabricatorPosesAvailable: assertFabricatorPoseReferencesAvailable,
    assertDependentFabricatorPosesAvailable: assertDependentCharacterPoseReferencesAvailable,
    coordinatePoseReferenceChange
  }
)

const { isValidWardrobeId, isValidFaceCatalogId, validFaceExpressionPreset, validFaceExpressionWorkspaceDraft } = createFabricatorExpressionValidators(isValidModelSlot)

const expressionStorage = createFabricatorExpressionStorage({
  files: { readFile, writeFile, mkdir, rename, readdir }, userDataRoot: app.getPath('userData'),
  isValidModelSlot, isValidWardrobeId, validFaceExpressionPreset, validFaceExpressionWorkspaceDraft,
  faceExpressionWorkspaceDraftPath, faceExpressionCollectionsPath, faceExpressionPresetPath
})
const { readFaceExpressionWorkspaceDraft, writeFaceExpressionWorkspaceDraft,
  listFaceExpressionPresets, listFaceExpressionCollections, writeFaceExpressionCollection,
  readFaceExpressionPreset, writeFaceExpressionPreset } = expressionStorage

const expressionBatch = createExpressionBatchTransaction({
  files: { mkdir, readFile, writeFile, rename, rm, unlink },
  modelFolder: slot => join(app.getPath('userData'), 'fabricator', 'expression-presets', `model-${slot}`),
  presetPath: faceExpressionPresetPath,
  validModelSlot: isValidModelSlot,
  validPreset: validFaceExpressionPreset
})

// Presets, drafts and their referenced assets are isolated by model slot.
// Keep reads and writes ordered within a slot while allowing unrelated slots to progress.
const expressionPresetOperations = createKeyedOperationQueue()
function queueExpressionWork<T>(modelSlot: number, operation: () => Promise<T>): Promise<T> {
  return expressionPresetOperations.run(String(modelSlot), operation)
}

const catalogPersistence = createFabricatorCatalogPersistence({ mkdir, access, readFile, writeFile, rename, unlink, rm, readdir }, writeAssetImageSource)

const faceStorage = createFabricatorFaceStorage({
  isValidModelSlot, isValidWardrobeId, isValidFaceCatalogId,
  paths: {
    faceModel: faceModelPath, faceSet: faceSetPath, faceCatalog: faceCatalogPath,
    faceCatalogItem: faceCatalogItemPath, faceComponent: faceComponentPath, faceComponentItem: faceComponentItemPath
  },
  dataUrlBuffer,
  saveCatalog: (options) => catalogPersistence.saveCatalog(options),
  recoverCatalogManifest: (folder, imageFolder) => catalogPersistence.recoverCatalogManifest(folder, imageFolder),
  isCompatible: (kind, value) => inspectFabricatorStorage(kind, value).compatible,
  readCatalogPng: (identity, version, path) => readCatalogPng('face', identity, version, path),
  invalidateCatalogPng: (identity) => invalidateCatalogPng('face', identity),
  files: { readFile, readdir }
})
const {
  validFaceSet, writeFaceSet, readFaceSet,
  writeFaceCatalogItem, readFaceCatalogItem, listFaceCatalogItems,
  listFaceComponentAssets, readFaceComponentAsset, writeFaceComponentAsset
} = faceStorage

// Assets versionados são usados apenas nas bibliotecas oficiais; rascunhos não entram em cache.
const catalogAssets = new FabricatorCatalogAssetService(readAssetImage)
function readCatalogPng(namespace: AssetNamespace, identity: string, version: string, imagePath: string): Promise<Buffer> {
  return catalogAssets.read(namespace, identity, version, imagePath)
}
function invalidateCatalogPng(namespace: AssetNamespace, identity: string): void {
  catalogAssets.invalidate(namespace, identity)
}

const hairStorage = createFabricatorHairStorage({
  isValidModelSlot, isValidWardrobeId,
  paths: { hairModel: hairModelPath, hairStyle: hairStylePath },
  dataUrlBuffer,
  saveCatalog: (options) => catalogPersistence.saveCatalog(options),
  recoverCatalogManifest: (folder, imageFolder) => catalogPersistence.recoverCatalogManifest(folder, imageFolder),
  isCompatible: (kind, value) => inspectFabricatorStorage(kind, value).compatible,
  readCatalogPng: (identity, version, path) => readCatalogPng('hair', identity, version, path),
  invalidateCatalogPng: (identity) => invalidateCatalogPng('hair', identity),
  legacyHairStyle,
  files: { access, mkdir, readFile, rm, writeFile }
})
const {
  validHairStyle, writeHairWorkspace, readHairWorkspace, clearHairWorkspace,
  readLegacyHairCatalogState, writeLegacyHairCatalogState, writeHairStyle, readHairStyle
} = hairStorage

const wardrobeStorage = createFabricatorWardrobePersistence({
  isValidModelSlot,
  isValidWardrobeId,
  wardrobeSetPath,
  deformationOriginalId: (componentId) => `${componentId}_deform_original`,
  dataUrlBuffer,
  saveCatalog: (options) => catalogPersistence.saveCatalog(options),
  recoverWardrobeManifest: (folder) => catalogPersistence.recoverWardrobeManifest(folder),
  isCompatible: (value) => inspectFabricatorStorage('wardrobe', value).compatible,
  readCatalogPng: (identity, version, path) => readCatalogPng('wardrobe', identity, version, path),
  invalidateCatalogPng: (identity) => invalidateCatalogPng('wardrobe', identity),
  files: { readFile, rm }
})

const wardrobePersistence = { ...wardrobeStorage,
  read: createSplitAwareWardrobeReader({ read: wardrobeStorage.read, slotPath, readFile, readdir }) }

async function readWardrobeSet(modelSlot: number, id: string) {
  return wardrobePersistence.read(modelSlot, id)
}

function queuePoseWrite(operation: () => Promise<void>): Promise<void> {
  const next = poseSaveQueue.catch(() => undefined).then(operation)
  poseSaveQueue = next
  poseSaveWrites.add(next)
  void next.then(() => poseSaveWrites.delete(next), () => poseSaveWrites.delete(next))
  return next
}

function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= slotCount
}

function isValidPoseSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= poseSlotCount
}

function isValidModelSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= slotCount
}

const legacyPoseMigration = createLegacyPoseMigration({
  getLegacyRoot: poseLibraryPath,
  poseSlotCount,
  poseSlotPath,
  poseDraftPath,
  isValidModelSlot,
  files: { readFile, access, mkdir, rename }
})
const ensureLegacyPoseMigration = legacyPoseMigration.ensure

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  if (!frame) throw new Error('Origem da solicitação inválida.')
  if (!isTrustedRendererFrame(frame.url, frame === event.sender.mainFrame, rendererTrustPolicy)) {
    throw new Error('Origem da solicitação não autorizada.')
  }
}

const { readStudio, readStudioPoseReferences, writeStudio, removeStudio } = createStudioDocumentPersistence({
  files: { readFile, writeFile, mkdir, access, rename, unlink, rm },
  studioPath,
  studioLibraryPath,
  validate: isStudioDocument,
  decodeImage: importedImageDataUrlBuffer,
  normalizeImage: normalizeImageBuffer
})

const { listStudios, listStudioPoseReferenceDocuments } = createStudioLibraryIndex({
  files: { mkdir, readdir },
  studioLibraryPath,
  readStudio,
  readStudioPoseReferences
})

const { readEditorV6, readEditorV6Summary, readEditorV6PoseReferences, writeEditorV6, removeEditorV6 } = createEditorV6DocumentPersistence({
  files: { readFile, writeFile, mkdir, access, rename, unlink, rm },
  editorV6Path,
  editorV6LibraryPath,
  validate: isEditorV6Document,
  assertLibraryVideoReferencesAvailable,
  assertLibraryBackgroundReferencesAvailable,
  assertLibraryMediaReferencesAvailable: async (category, ids) => {
    if (ids.length) await Promise.all(ids.map((id) => editorV6MediaLibrary.resolve(category, id)))
  },
  coordinateLibraryReferenceChange: (operation) => coordinateBackgroundReferenceChange(operation),
  decodeImage: importedImageDataUrlBuffer,
  normalizeImage: normalizeImageBuffer
})

const { listEditorV6s, listEditorV6PoseReferenceDocuments } = createEditorV6LibraryIndex({
  files: { mkdir, readdir },
  editorV6LibraryPath,
  readEditorV6Summary,
  readEditorV6PoseReferences
})

const editorV6MediaReferences = createEditorV6MediaReferenceIndex({
  listProjects: listEditorV6s,
  readManifest: async (projectId) => JSON.parse(await readFile(join(editorV6Path(projectId), 'editorV6.json'), 'utf8'))
})
editorV6MediaLibrary = new EditorV6MediaLibraryStore(
  () => editorV6LibraryPath(),
  (category, id) => editorV6MediaReferences.references(category, id),
  (category, ids) => editorV6MediaReferences.referencesForIds(category, ids)
)

const assertNoVideoReferences = createVideoReferenceGuard([
  createRoteirosVideoReferenceLookup(() => dataPlatform.database),
  createEditorV6VideoReferenceLookup({
    listProjects: listEditorV6s,
    readManifest: (projectId) => readFile(join(editorV6Path(projectId), 'editorV6.json'), 'utf8')
  })
])

async function assertFaceAssetReferencesAvailable(references: readonly CustomizerFaceAssetReference[]): Promise<void> {
  for (const reference of references) {
    if (reference.assetType === 'face-set') {
      if (!await readFaceSet(reference.modelSlot, reference.id)) {
        throw new Error(`O conjunto facial ${reference.modelSlot}:${reference.id} não está mais disponível no Fabricador Dev.`)
      }
    } else if (reference.assetType === 'face-catalog') {
      const item = await readFaceCatalogItem(reference.modelSlot, reference.id)
      if (!item || item.category !== reference.category) {
        throw new Error(`A peça facial ${reference.modelSlot}:${reference.id} não está mais disponível para ${reference.category} no Fabricador Dev.`)
      }
    } else {
      const asset = await readFaceComponentAsset(reference.modelSlot, reference.id)
      if (!asset || asset.kind !== reference.kind) {
        throw new Error(`O asset facial ${reference.modelSlot}:${reference.id} não está mais disponível para ${reference.kind} no Fabricador Dev.`)
      }
    }
  }
}

function dataUrlBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error('Arquivo de peça inválido.')
  return Buffer.from(match[1], 'base64')
}

function importedImageDataUrlBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl)
  if (!match) throw new Error('Imagem inválida. Selecione PNG, JPG ou WebP estático.')
  return Buffer.from(match[2], 'base64')
}

const writeFabricatorProject = createFabricatorModelWriter({
  slotPath,
  isValidSlot,
  dataUrlBuffer,
  writeAssetImageSource,
  files: { mkdir, readFile, writeFile, rename, readdir, access, unlink }
})

const fabricatorHistoryPersistence = createFabricatorHistoryPersistence({
  slotPath,
  isValidSlot,
  dataUrlBuffer,
  files: { access, mkdir, readFile, readdir, rename, unlink, writeFile }
})

const { writePoseProject, readPoseProject, writePoseDraft, readPoseDraft } = createPosePersistence({
  poseSlotPath, poseDraftPath, modelSlotPath: slotPath, modelHeadParts, isValidModelSlot, isValidPoseSlot,
  dataUrlBuffer, writeAssetImageSource, readAssetImage,
  files: { mkdir, access, copyFile, readdir, unlink, readFile, writeFile, rename }
})
poseReferenceIntegrity = createFabricatorPoseReferenceIntegrity({
  isValidModelSlot,
  isValidPoseSlot,
  readPose: (modelSlot, poseSlot) => readPoseProject(modelSlot, poseSlot),
  listCharacters: () => customizerService.list(),
  withCharactersLocked: (operation) => customizerService.withCharactersLocked(operation),
  listStudioDocuments: listStudioPoseReferenceDocuments,
  readStudioDocument: readStudioPoseReferences,
  listEditorV6Documents: listEditorV6PoseReferenceDocuments,
  readEditorV6Document: readEditorV6PoseReferences
})

async function modelHeadParts(modelSlot: number): Promise<Array<Pick<ModelPart, 'id' | 'name' | 'width' | 'height' | 'resizeBase'>>> {
  try {
    const model = JSON.parse(await readFile(join(slotPath(modelSlot), 'project.json'), 'utf8')) as FabricatorProjectSave
    return model.parts.filter((part) => part.resizeBase).map(({ id, name, width, height, resizeBase }) => ({ id, name, width, height, resizeBase }))
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw reason
  }
}

const { isValidAnimatorSlot, writeAnimatorAnimation, readAnimatorAnimation, recoverAnimatorAnimation, writeAnimatorDraft, readAnimatorDraft, recoverAnimatorDraft } = createAnimatorPersistence({
  animatorSlotPath, animatorDraftPath, isValidModelSlot, isValidPoseSlot,
  dataUrlBuffer, writeAssetImageSource, readAssetImage,
  files: { mkdir, access, readdir, unlink, readFile, writeFile, rename, rm }
})

function collectPendingPersistenceWrites(): Promise<unknown>[] {
  const migrationTask = dataMigrationIpc?.getActiveTask()
  const legacyPoseMigrationTask = legacyPoseMigration.getTrackedTask()
  return [
    ...(fabricatorProjectIpc?.getPendingWrites() ?? []), ...poseSaveWrites, ...(fabricatorHairIpc?.getPendingWrites() ?? []),
    ...(fabricatorModelSourceDownloadIpc?.getPendingWrites() ?? []),
    ...(fabricatorFaceAnimationExportIpc?.getPendingWrites() ?? []),
    ...(fabricatorDesignSettingsIpc?.getPendingWrites() ?? []),
    ...(fabricatorAnimatorIpc?.getPendingWrites() ?? []), ...(fabricatorWardrobeIpc?.getPendingWrites() ?? []),
    ...(fabricatorFaceCatalogIpc?.getPendingWrites() ?? []),
    ...expressionPresetOperations.getPendingWrites(),
    ...(faceGuideIpc?.getPendingWrites() ?? []), customizerService.pendingWrites,
    ...(studioFileIpc?.getPendingWrites() ?? []),
    ...(editorV6FileIpc?.getPendingWrites() ?? []),
    ...(editorV6ExportService?.getPendingWrites() ?? []),
    ...videoLibrary.getPendingWrites(), ...videoBackgroundLibrary.getPendingWrites(),
    ...roteiroUiGifLibrary.getPendingWrites(),
    ...(migrationTask ? [migrationTask] : []),
    studioSaveQueues.studio, editorV6SaveQueue, ...roteirosWriteQueue.getPendingWrites(),
    ...(legacyPoseMigrationTask ? [legacyPoseMigrationTask] : [])
  ]
}

async function flushPendingPersistenceWrites(): Promise<void> {
  const results = await Promise.allSettled(collectPendingPersistenceWrites())
  const failedWrite = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failedWrite) throw failedWrite.reason
}

async function registerFabricatorHandlers(): Promise<void> {
  registerPendingPersistenceFlushIpc({
    ipcMain,
    assertTrustedSender,
    flushRendererWrites: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender)
      if (owner && !owner.isDestroyed() && !owner.webContents.isLoading()) {
        await owner.webContents.executeJavaScript('window.__flushPendingRendererWrites()')
      }
    },
    flushMainWrites: flushPendingPersistenceWrites
  })

  registerStudioPrimaryHandlers({
    ipcMain, assertTrustedSender,
    list: () => listStudios(),
    write: (document) => writeStudio(document),
    remove: (id) => removeStudio(id),
    assertPoseReferencesAvailable: assertStudioPoseReferencesAvailable,
    coordinatePoseReferenceChange,
    getPendingWrites: () => studioSaveQueues.studio,
    setPendingWrites: (pending) => { studioSaveQueues.studio = pending }
  })

  registerEditorV6PrimaryHandlers({
    ipcMain, assertTrustedSender,
    list: () => listEditorV6s(),
    read: (id) => readEditorV6(id),
    write: (document) => coordinateVideoReferenceChange(() => writeEditorV6(document)),
    remove: (id) => removeEditorV6(id),
    assertPoseReferencesAvailable: assertEditorV6PoseReferencesAvailable,
    coordinatePoseReferenceChange,
    getPendingWrites: () => editorV6SaveQueue,
    setPendingWrites: (pending) => { editorV6SaveQueue = pending }
  })

  studioFileIpc = registerStudioFileHandlers({
    ipcMain, assertTrustedSender,
    showOpenDialog: (options) => dialog.showOpenDialog(options),
    appDataPath: () => app.getPath('appData'), tempPath: () => app.getPath('temp'), studioPath,
    dataFileSystem: {
      locate: (path) => dataFileSystem.locate(path),
      isLegacyDomain: (domainId) => dataPlatform.getDomainState(domainId).state === 'legacy',
      materializeDirectory: (sourcePath, destinationPath) => dataFileSystem.materializeDirectory(sourcePath, destinationPath)
    },
    files: { stat, readFile, mkdir, writeFile, rm },
    normalizeImage: normalizeImageBuffer, dataUrlBuffer, createId: randomUUID,
    openPath: (path) => shell.openPath(path)
  })
  editorV6FileIpc = registerEditorV6FileHandlers({
    ipcMain, assertTrustedSender,
    showOpenDialog: (options) => dialog.showOpenDialog(options),
    libraryPath: editorV6LibraryPath, projectPath: editorV6Path,
    resolveBackground: async (id) => {
      const asset = await videoBackgroundLibrary.resolve(id)
      const listed = (await videoBackgroundLibrary.list()).find((item) => item.id === id && item.available)
      if (!listed) throw new Error('Fundo não encontrado na biblioteca.')
      return { ...asset, name: listed.name }
    },
    resolveObject: async (id) => editorV6MediaLibrary.resolve('object', id),
    files: { stat, readFile, mkdir, writeFile },
    normalizeImage: normalizeImageBuffer, dataUrlBuffer, createId: randomUUID,
    openPath: (path) => shell.openPath(path)
  })
  registerEditorV6MediaLibraryHandlers({
    ipcMain, assertTrustedSender,
    showOpenDialog: (options) => dialog.showOpenDialog(options),
    library: editorV6MediaLibrary,
    assertUnreferenced: (category, id) => editorV6MediaReferences.assertUnreferenced(category, id),
    coordinateReferenceChange: (operation) => coordinateBackgroundReferenceChange(operation)
  })

  roteiroExportIpc = registerRoteirosIpc({
    ipcMain,
    assertTrustedSender,
    getDatabase: () => dataPlatform.database,
    videoLibrary,
    videoBackgroundLibrary,
    roteiroUiGifLibrary,
    getDefaultGifPath: getRoteiroUiGifDefaultPath,
    getAppDataRoot: () => configuredAppDataRoot ?? join(app.getPath('userData'), 'app-data'),
    resolvePhysicalPath: (path) => dataFileSystem.resolvePhysicalPath(path),
    openPath: (path) => shell.openPath(path),
    revealV6Text: (path) => shell.showItemInFolder(path),
    saveV6Text: async (event, content) => {
      const owner = BrowserWindow.fromWebContents(event.sender)
      const options = { title: 'Exportar roteiro para Editor V6', defaultPath: 'roteiro-editor-v6.txt', filters: [{ name: 'Arquivo de texto', extensions: ['txt'] }] }
      const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      const destination = result.filePath.toLowerCase().endsWith('.txt') ? result.filePath : `${result.filePath}.txt`
      await nativeWriteFile(destination, content, 'utf8')
      return destination
    },
    openImportFile: async (kind) => {
      const selection = kind === 'video'
        ? { title: 'Biblioteca de vídeos: importar', filters: [{ name: 'Vídeos', extensions: ['mp4', 'webm', 'mov', 'm4v'] }] }
        : kind === 'background'
          ? { title: 'Biblioteca de fundos: importar', filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }
          : { title: 'Biblioteca de GIFs: adicionar', filters: [{ name: 'GIF animado', extensions: ['gif'] }] }
      const result = await dialog.showOpenDialog({ ...selection, properties: ['openFile'] })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    enqueueWrite: enqueueRoteirosWrite,
    waitForPendingWrites: waitForRoteirosWrites,
    coordinateVideoReferenceChange,
    coordinateBackgroundReferenceChange,
    assertNoVideoReferences,
    assertLibraryVideoReferencesAvailable,
    assertLibraryBackgroundReferencesAvailable,
    assertEditorV6BackgroundUnreferenced: (id) => editorV6MediaReferences.assertUnreferenced('background', id),
    listEditorV6BackgroundReferences: async (id) => (await editorV6MediaReferences.references('background', id)).map((item) => ({ id: item.projectId, title: item.title })),
    assertLibraryUiGifReferencesAvailable
  })
  // Módulo Base de Vídeos: IPC → casos de uso → repositório SQLite.
  // Compartilha a fila existente de Roteiros para conservar a ordem das gravações.
  registerBaseVideoHandlers(ipcMain, assertTrustedSender, new BaseVideoService({
    getDatabase: () => dataPlatform.database,
    enqueueWrite: enqueueRoteirosWrite,
    coordinateVideoReferenceChange,
    resolveMedia: (id) => videoLibrary.resolveMedia(id),
    assertMediaAccessible: async (path) => {
      const physical = await dataFileSystem.resolvePhysicalPath(path)
      if (physical) await nativeAccess(physical)
      else await dataFileSystem.access(path)
    },
    assertNoVideoReferences,
    deleteLibraryVideo: async (id) => { await videoLibrary.delete(id) }
  }), {
    showSaveDialog: (sender, options) => {
      const owner = BrowserWindow.fromWebContents(sender)
      return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
    },
    writeFile: nativeWriteFile
  })

  registerCustomizerCharacterHandlers(ipcMain, assertTrustedSender, customizerService)

  // Uma recuperação ambígua não pode esconder os demais modelos nem escolher um backup sozinha.
  // O catálogo expõe o slot pendente para decisão explícita na interface.
  const recoverSlot = (slot: number) =>
    recoverModelSourceSlot(slot, slotPath, { readdir, readFile, rename, rm })
  registerFabricatorModelCatalogHandlers(ipcMain, assertTrustedSender, {
    listSlots: () => listModelSourceSlots(slotCount, recoverSlot, () => fabricatorModelCatalog.listSlots()),
    loadSlot: async (slot) => {
      if (isValidSlot(slot)) await recoverSlot(slot)
      return fabricatorModelCatalog.loadSlot(slot)
    }
  })

  fabricatorProjectIpc = registerFabricatorProjectHandlers({
    ipcMain,
    assertTrustedSender,
    isValidSlot,
    libraryPath,
    slotPath,
    writeProject: writeFabricatorProject,
    history: fabricatorHistoryPersistence,
    openImportDialog: async (mode) => {
      const result = await dialog.showOpenDialog({
        title: mode === 'reimport' ? 'Reimportar imagem original do modelo' : 'Importar folha de modelo',
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    normalizeImage: normalizeImageBuffer,
    createId: randomUUID,
    files: { stat, readFile, mkdir, writeFile, readdir, rename, rm, access, unlink }
  })

  fabricatorModelSourceDownloadIpc = registerModelSourceDownloadHandlers(ipcMain, assertTrustedSender, () => app.getPath('downloads'))
  registerFabricatorPoseHandlers({
    ipcMain, assertTrustedSender, ensureLegacyPoseMigration, isValidModelSlot, isValidPoseSlot,
    slotCount, poseSlotCount, poseSlotPath, poseModelPath, poseDraftPath,
    queuePoseWrite, readPoseProject, writePoseProject, readPoseDraft, writePoseDraft,
    coordinatePoseReferenceChange,
    files: { readFile, writeFile, mkdir, rename, rm }
  })

  fabricatorAnimatorIpc = registerFabricatorAnimatorHandlers({
    ipcMain, assertTrustedSender, isValidModelSlot, isValidAnimatorSlot, poseSlotCount,
    animatorLibraryPath, animatorModelPath, animatorSlotPath, animatorDraftPath,
    readAnimatorAnimation, recoverAnimatorAnimation, writeAnimatorAnimation, readAnimatorDraft, recoverAnimatorDraft, writeAnimatorDraft,
    files: { readFile, readdir, rm }
  })

    registerFabricatorWardrobeCatalogHandlers(ipcMain, assertTrustedSender,
      new FabricatorWardrobeCatalog(wardrobeModelPath, { readdir, readFile }, slotCount,
        (folder) => catalogPersistence.recoverWardrobeManifest(folder)))

  fabricatorWardrobeIpc = registerFabricatorWardrobeHandlers({
    ipcMain,
    assertTrustedSender,
    isValidModelSlot,
    isValidWardrobeId,
    wardrobeModelPath,
    wardrobeSetPath,
    persistence: wardrobePersistence,
    withCharactersLocked: (operation) => customizerService.withCharactersLocked(operation)
  })

  const catalogListings = createFabricatorCatalogListings({
    files:{readdir,readFile},
    validSlot:isValidModelSlot,
    faceModelPath,hairModelPath,
    validFace:validFaceSet,validHair:validHairStyle,
    recover:(folder,images)=>catalogPersistence.recoverCatalogManifest(folder,images),
    readLegacyHair:readHairWorkspace,
    readLegacyHairCatalogState
  })
  fabricatorFaceCatalogIpc = registerFabricatorFaceCatalogHandlers(ipcMain, assertTrustedSender, {
    isValidModelSlot, isValidWardrobeId, isValidFaceCatalogId,
    listFaceSets: (modelSlot) => catalogListings.listFaces(modelSlot),
    readFaceSet, writeFaceSet, faceModelPath, faceSetPath,
    listFaceCatalogItems, readFaceCatalogItem, writeFaceCatalogItem, faceCatalogPath, faceCatalogItemPath,
    listFaceComponentAssets, readFaceComponentAsset, writeFaceComponentAsset, faceComponentPath, faceComponentItemPath,
    hasStoredFaceCatalogItem: async (modelSlot, id) => {
      try { await access(join(faceCatalogItemPath(modelSlot, id), 'item.json')); return true }
      catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return false; throw reason }
    },
    withReferenceSnapshot: (modelSlot, operation) => customizerService.withCharactersLocked((characters) => queueExpressionWork(modelSlot, async () => {
      await expressionBatch.recover(modelSlot)
      const summaries = await listFaceExpressionPresets(modelSlot)
      const loadedPresets = await Promise.all(summaries.map(({ id }) => readFaceExpressionPreset(modelSlot, id)))
      const expressionPresets = loadedPresets.filter((preset): preset is FaceExpressionPreset => Boolean(preset))
      return operation({
        characters,
        expressionPresets,
        expressionDraft: await readFaceExpressionWorkspaceDraft(modelSlot),
        faceComponents: await listFaceComponentAssets(modelSlot)
      })
    })),
    removeDirectory: (path) => rm(path, { recursive: true, force: true })
  })

  registerExpressionPresetHandlers(ipcMain, assertTrustedSender, {
    queue: queueExpressionWork,
    recover: expressionBatch.recover,
    listPresets: listFaceExpressionPresets,
    listCollections: listFaceExpressionCollections,
    saveCollection: writeFaceExpressionCollection,
    loadPreset: readFaceExpressionPreset,
    savePreset: writeFaceExpressionPreset,
    saveBatch: expressionBatch.save,
    removePreset: path => rm(path, { force: true }),
    presetPath: faceExpressionPresetPath,
    validSlot: isValidModelSlot,
    validId: isValidWardrobeId,
    loadDraft: readFaceExpressionWorkspaceDraft,
    saveDraft: writeFaceExpressionWorkspaceDraft,
    assertFaceAssetsAvailable: async (modelSlot, references) => {
      if (references.some((reference) => reference.modelSlot !== modelSlot)) throw new Error('Referência facial fora do modelo atual.')
      await assertFaceAssetReferencesAvailable(references)
    }
  })

  fabricatorFaceAnimationExportIpc = registerFabricatorFaceAnimationExportHandler({
    ipcMain, assertTrustedSender, isValidModelSlot, writeFile,
    showSaveDialog: (sender, options) => {
      const owner = BrowserWindow.fromWebContents(sender)
      return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
    }
  })
  faceGuideIpc = registerFaceGuideHandlers(ipcMain, assertTrustedSender, {
    isProfile: isFaceGuideProfile,
    read: (profile) => faceGuidePersistence.read(profile),
    write: (profile, guides) => faceGuidePersistence.write(profile, guides)
  })

  fabricatorHairIpc = registerFabricatorHairHandlers({
    ipcMain, assertTrustedSender,
    isValidModelSlot,
    isValidHairStyleId: isValidWardrobeId,
    hairModelPath, hairStylePath,
    readWorkspace: readHairWorkspace,
    writeWorkspace: writeHairWorkspace,
    clearWorkspace: clearHairWorkspace,
    listStyles: (modelSlot) => catalogListings.listHair(modelSlot),
    readStyle: readHairStyle,
    writeStyle: writeHairStyle,
    setLegacyHairCatalogState: writeLegacyHairCatalogState,
    removeDirectory: (path) => rm(path, { recursive: true, force: true }),
    withCharactersLocked: (operation) => customizerService.withCharactersLocked(operation)
  })
}

const createMainWindow = createMainWindowFactory({
  env: process.env,
  createWindow: (options) => new BrowserWindow(options),
  clearApplicationMenu: () => Menu.setApplicationMenu(null),
  iconPath: join(__dirname, '../renderer/gacha-nymi.ico'),
  preloadPath: join(__dirname, '../preload/preload.cjs'),
  rendererPath: rendererHtmlPath,
  rendererUrl: devRendererUrl,
  restrictNavigation: restrictRendererNavigation,
  onRendererLoaded: (window) => {
    window.webContents.on('render-process-gone', (_event, details) => {
      void diagnosticsLog.recordMain({
        severity: 'error',
        code: 'renderer.process-gone',
        message: `O processo visual foi encerrado (${details.reason}; código ${details.exitCode}).`
      }).catch(() => undefined)
    })
    if (dataBackupService) {
      void dataBackupService.finalizePendingRestore().catch((reason: unknown) => {
        console.error('A restauração foi aplicada, mas a limpeza do staging falhou; a cópia anterior foi preservada.', reason)
      })
    }
    if (dataMigration) {
      void dataMigration.finalizeAfterHealthyLoad().catch((reason: unknown) => {
        console.error('A validação final do armazenamento local falhou; as cópias de segurança temporárias foram preservadas.', reason)
      })
    }

    // Smoke isolado, somente perfil DEV AI validado por configureDevAiDataRoot().
    // Não captura screenshots nem usa perfis reais em execução normal.
    if (process.env.GACHA_DEV_AI_TEST === '1' && process.env.GACHA_FABRICATOR_REAL_UI_CAPTURE === '1') {
      const sandbox = resolve(process.env.GACHA_DEV_AI_SANDBOX ?? '')
      const captures = join(sandbox, 'fabricator-real-ui-captures')
      const reopen = process.env.GACHA_DEV_AI_REOPEN === '1'
      const capture = import('./domains/fabricator/visualUiCapture').then((visualCapture) => reopen
        ? visualCapture.captureCustomizerStudioReopened(window, captures)
        : visualCapture.captureFabricatorRealScreens(window, captures, process.env.GACHA_FABRICATOR_VISUAL_BASELINE)
          .then(() => visualCapture.captureCustomizerStudioRealScreens(window, captures)))
      void capture.then(() => { console.log('Capturas reais concluídas', captures, reopen ? '(reabertura)' : '(primeiro processo)'); app.quit() })
        .catch(error => { console.error('Falha no teste visual real do Fabricador:', error); app.exit(1) })
    }
    if (process.env.GACHA_DEV_AI_TEST === '1' && process.env.GACHA_LOGS_DEV_REAL_UI_CAPTURE === '1') {
      const capture = import('./domains/storage/logsDevVisualCapture').then((visualCapture) =>
        visualCapture.captureLogsDevRealScreens(window, join(app.getPath('appData'), 'logs-dev-captures')))
      void capture.then(() => { console.log('Capturas reais da Logs Dev concluídas'); app.quit() })
        .catch(error => { console.error('Falha na revisão visual sintética da Logs Dev:', error); app.exit(1) })
    }
  },
  onClosed: () => editorV6MotionService?.releaseIdle(),
  flushRendererWrites: async (window) => {
    if (rendererWritesFlushedForShutdown) return
    if (!window.webContents.isLoading()) {
      await window.webContents.executeJavaScript('window.desktop?.flushPendingWrites ? window.desktop.flushPendingWrites() : undefined')
    }
  },
  onFlushFailure: (window, reason) => {
    console.error('Não foi possível concluir os salvamentos antes de fechar o editor:', reason)
    if (window.isDestroyed()) return
    void dialog.showMessageBox(window, {
      type: 'error',
      title: 'Salvamento pendente',
      message: 'Não foi possível concluir os salvamentos. O editor continuará aberto para proteger suas alterações.',
      buttons: ['Voltar ao editor']
    }).catch((dialogError: unknown) => console.error('Não foi possível exibir o aviso de salvamento pendente:', dialogError))
  }
})

app.whenReady().then(async () => {
  restrictRendererPermissions(session.defaultSession, {
    canRequestFullscreen: ({ webContents, requestingUrl, isMainFrame }) => {
      if (!webContents || !isMainFrame || webContents.isDestroyed()) return false
      const window = BrowserWindow.fromWebContents(webContents)
      return Boolean(window && !window.isDestroyed() && window.webContents === webContents
        && canVisibleRendererRequestFullscreen(isMainFrame, window.isVisible(), requestingUrl, webContents.getURL(), rendererTrustPolicy))
    }
  })
  dataBackupService = new DataBackupService({ dataRoot: app.getPath('appData'), catalog: dataPlatform })
  await dataBackupService.applyPendingRestore()
  dataPlatform.initialize()
  registerImageNormalizationHandler({
    ipcMain, assertTrustedSender, normalizeImage: normalizeImageBuffer
  })
  const designSettingsService = createFabricatorDesignSettingsService({
    userDataRoot: app.getPath('userData'),
    catalog: dataPlatform,
    files: {
      readLegacy: (path) => nativeReadFile(path),
      writeLegacyCopy: (path, bytes) => writeFile(path, bytes),
      readText: (path) => readFile(path, 'utf8'),
      mkdir: (path, options) => mkdir(path, options),
      writeText: (path, text) => writeFile(path, text, 'utf8')
    }
  })
  fabricatorDesignSettingsIpc = registerFabricatorDesignSettingsHandlers({ ipcMain, assertTrustedSender, service: designSettingsService })
  dataMigration = new DataMigrationService({
    dataRoot: app.getPath('appData'),
    userDataRoot: app.getPath('userData'),
    catalog: dataPlatform,
    onProgress: (progress) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('app:data-migration:progress', progress)
    }
  })
  dataBackupIpc = registerDataBackupHandlers({
    ipcMain, assertTrustedSender,
    runMaintenance: runDataMaintenance,
    getStorageSummary: async () => ({ disk: await getAppDataUsage(app.getPath('appData')), catalog: dataPlatform.storageSummary() }),
    getService: () => dataBackupService,
    flushPendingWrites: async (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window && !window.webContents.isLoading()) await window.webContents.executeJavaScript('window.desktop?.flushPendingWrites?.()')
      await flushPendingPersistenceWrites()
    },
    showConfirmation: (event, options) => {
      const owner = BrowserWindow.fromWebContents(event.sender)
      return owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options)
    },
    relaunch: () => app.relaunch(),
    quit: () => app.quit()
  })
  dataMigrationIpc = registerDataMigrationHandlers({
    ipcMain, assertTrustedSender,
    getService: () => dataMigration,
    runMaintenance: runDataMaintenance,
    relaunch: () => app.relaunch(),
    quit: () => app.quit()
  })
  registerDiagnosticsHandlers({
    ipcMain, assertTrustedSender,
    log: diagnosticsLog,
    getRuntimeDiagnostics: async (event) => {
      const mainMemory = process.memoryUsage()
      const measuredProcesses = readElectronAppMetrics()
      const rendererPid = event.sender.getOSProcessId()
      const rendererMemory = selectRendererMemorySnapshot(measuredProcesses.metrics, { getOSProcessId: () => rendererPid })
      return {
        measuredAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron ?? 'desconhecida',
        chromiumVersion: process.versions.chrome ?? 'desconhecida',
        nodeVersion: process.versions.node ?? 'desconhecida',
        platform: process.platform,
        architecture: process.arch,
        uptimeSeconds: Math.round(process.uptime()),
        processMetrics: {
          sampleIntervalMs: measuredProcesses.sampleIntervalMs,
          processes: mapRuntimeProcessMetrics(measuredProcesses.metrics, {
            mainPid: process.pid,
            rendererPid,
            sampleIntervalMs: measuredProcesses.sampleIntervalMs
          })
        },
        memory: {
          mainRssBytes: mainMemory.rss,
          mainHeapUsedBytes: mainMemory.heapUsed,
          mainExternalBytes: mainMemory.external,
          ...rendererMemory
        }
      }
    },
    getIpcPerformanceSnapshot,
    setIpcPerformanceCollection: setIpcPerformanceCollectionEnabled,
    getStorageSummary: async () => ({ disk: await getAppDataUsage(app.getPath('appData')), catalog: dataPlatform.storageSummary() }),
    listBackups: () => dataBackupService?.listBackups() ?? Promise.resolve([]),
    getAppVersion: () => app.getVersion(),
    showSaveDialog: (event, options) => {
      const owner = BrowserWindow.fromWebContents(event.sender)
      return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
    },
    writeFile: (path, text) => nativeWriteFile(path, text, 'utf8')
  })
  if (process.env.GACHA_DEV_AI_TEST === '1') {
    // Defense in depth for fixture-only Electron tests: no renderer-originated
    // HTTP(S), WebSocket or FTP traffic, including images or fetch calls.
    // This is NOT an OS firewall and does not confine Node subprocesses.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const blocked = /^(?:https?|wss?|ftp):/i.test(details.url)
      callback({ cancel: blocked })
    })
  }
  registerMediaProtocols({
    protocol, videoLibrary, backgroundLibrary: videoBackgroundLibrary, gifLibrary: roteiroUiGifLibrary,
    fileSystem: dataFileSystem, readFile, editorV6Path,
    readEditorV6Manifest: async (id) => JSON.parse(await nativeReadFile(join(editorV6Path(id), 'editorV6.json'), 'utf8')),
    resolveEditorV6LibraryAsset: async (id) => {
      try {
        const background = await videoBackgroundLibrary.resolve(id)
        return { path: await dataFileSystem.resolvePhysicalPath(background.path) ?? background.path, mimeType: background.mimeType }
      } catch {
        const object = await editorV6MediaLibrary.resolve('object', id)
        return { path: await dataFileSystem.resolvePhysicalPath(object.path) ?? object.path, mimeType: object.mimeType }
      }
    },
    resolveEditorV6LibraryAudio: async (id) => {
      const item = await editorV6MediaLibrary.resolve('audio', id)
      return { path: await dataFileSystem.resolvePhysicalPath(item.path) ?? item.path, mimeType: item.mimeType }
    }
  })
  await registerFabricatorHandlers()
  editorV6MotionService = createEditorV6MotionService({ ipcMain, assertTrustedSender, html: rendererHtmlPath, preload: join(__dirname, '../preload/editorV6MotionPreload.cjs'), devUrl: devRendererUrl, cacheDirectory: join(app.getPath('userData'), 'cache', 'editor-v6-motion-v2'), concurrency: 2 })
  editorV6ExportService = registerEditorV6ExportHandlers({ ipcMain, assertTrustedSender, projectPath: editorV6Path,
    recordDiagnostic: diagnosticsLog.recordMain,
    toolsDirectory: app.isPackaged ? join(process.resourcesPath, 'video-tools') : resolve(__dirname, '../../resources/video-tools'),
    workerHtml: join(__dirname, '../renderer/editor-v6-export.html'), workerPreload: join(__dirname, '../preload/editorV6ExportPreload.cjs'),
    devUrl: devRendererUrl, tempRoot: app.getPath('temp'), getCharacters: () => customizerService.list(),
    resolveLibraryVideo: async (id) => { const item = await videoLibrary.resolveMedia(id); return { ...item, path: await dataFileSystem.resolvePhysicalPath(item.path) ?? item.path } },
    resolveLibraryAudio: async (id) => { const item = await editorV6MediaLibrary.resolve('audio', id); return { ...item, path: await dataFileSystem.resolvePhysicalPath(item.path) ?? item.path } },
    resolveLibraryAsset: async (id) => {
      try { const item = await videoBackgroundLibrary.resolve(id); return { ...item, path: await dataFileSystem.resolvePhysicalPath(item.path) ?? item.path } }
      catch { const item = await editorV6MediaLibrary.resolve('object', id); return { ...item, path: await dataFileSystem.resolvePhysicalPath(item.path) ?? item.path } }
    },
    bakeMotion: (request, signal) => editorV6MotionService!.bakeForExport(request, signal),
    getMotionCacheStats: () => editorV6MotionService!.getCacheStats() })
  editorV7ExportService = registerEditorV7ExportHandlers({ ipcMain, assertTrustedSender, toolsDirectory: app.isPackaged ? join(process.resourcesPath, 'video-tools') : resolve(__dirname, '../../resources/video-tools') })
  if (process.env.GACHA_EDITOR_V6_STRESS_AUTORUN === '1') {
    void (async () => {
      const projectId = process.env.GACHA_EDITOR_V6_STRESS_PROJECT_ID ?? ''
      const outputRoot = resolve(process.env.GACHA_EDITOR_V6_STRESS_OUTPUT_ROOT ?? '')
      const allowedOutputRoot = resolve(__dirname, '../../out/editor-v6-stress/runs')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
        || (outputRoot !== allowedOutputRoot && !outputRoot.startsWith(allowedOutputRoot + '\\'))) throw Error('Parâmetros do benchmark isolado inválidos.')
      await nativeMkdir(outputRoot, { recursive: true })
      const project = await readEditorV6(projectId)
      if (!project) throw Error(`Projeto de benchmark ${projectId} não encontrado no perfil temporário.`)
      const hairPresetSlotValue = process.env.GACHA_EDITOR_V6_STRESS_HAIR_PRESET_SLOT
      const hairPresetSlot = hairPresetSlotValue === undefined ? null : Number(hairPresetSlotValue)
      if (hairPresetSlot !== null && (!Number.isInteger(hairPresetSlot) || hairPresetSlot < 1 || hairPresetSlot > 5)) throw Error('O slot de preset de cabelo precisa estar entre 1 e 5.')
      if (hairPresetSlot !== null && !process.env.GACHA_VIDEO_STRESS_OFFSCREEN) throw Error('O preparo real de cabelo requer um perfil Electron isolado.')
      const cacheProbe = process.env.GACHA_EDITOR_V6_STRESS_CACHE_PROBE === '1'
      const singleMotionRun = process.env.GACHA_EDITOR_V6_STRESS_SINGLE_MOTION_RUN === '1'
      const hairPreparationOnly = process.env.GACHA_EDITOR_V6_STRESS_HAIR_PREPARATION_ONLY === '1'
      const noHairControl = process.env.GACHA_EDITOR_V6_STRESS_NO_HAIR_CONTROL === '1'
      const segmentStartFrame = Number(process.env.GACHA_EDITOR_V6_STRESS_START_FRAME ?? '0')
      const segmentFrameCount = Number(process.env.GACHA_EDITOR_V6_STRESS_FRAME_COUNT ?? project?.timeline.durationFrames ?? 0)
      const stressRepeatCount = Number(process.env.GACHA_EDITOR_V6_STRESS_REPEAT ?? '1')
      if (hairPreparationOnly && hairPresetSlot === null) throw Error('O perfil de preparação de cabelo exige um preset válido.')
      if (noHairControl && (hairPresetSlot !== null || !process.env.GACHA_VIDEO_STRESS_OFFSCREEN)) throw Error('O controle sem cabelo exige um perfil offscreen isolado e não aceita preset de cabelo.')
      if ((hairPresetSlot !== null || noHairControl) && (!Number.isSafeInteger(segmentStartFrame) || segmentStartFrame < 0
        || !Number.isSafeInteger(segmentFrameCount) || segmentFrameCount < 1 || segmentStartFrame + segmentFrameCount > project.timeline.durationFrames
        || !Number.isInteger(stressRepeatCount) || stressRepeatCount < 1 || stressRepeatCount > 3)) throw Error('Janela ou repetição do benchmark parcial inválida.')
      const motionConcurrencyValue = process.env.GACHA_EDITOR_V6_STRESS_MOTION_CONCURRENCY
      const motionConcurrency = motionConcurrencyValue === '1' ? 1 : motionConcurrencyValue === '2' || motionConcurrencyValue === undefined ? 2 : null
      if (motionConcurrency === null) throw Error('A concorrência de bakes do benchmark precisa ser 1 ou 2.')
      const exportTestModeValue = process.env.GACHA_EDITOR_V6_STRESS_EXPORT_TEST_MODE
      const exportTestMode = exportTestModeValue === undefined ? undefined : isEditorV6ExportTestMode(exportTestModeValue) ? exportTestModeValue : null
      if (exportTestMode === null || exportTestMode !== undefined && !process.env.GACHA_VIDEO_STRESS_OFFSCREEN) throw Error('O modo de teste de exportação só aceita um modo conhecido no benchmark offscreen isolado.')
      // Keep worker variants grouped so one configuration cannot evict the other's cache mid-measurement.
      const modes = hairPreparationOnly ? [true] : hairPresetSlot !== null || noHairControl ? Array.from({ length: stressRepeatCount }, () => true) : singleMotionRun ? [false] : cacheProbe ? [false, false, false] : [false, false, false, true, true, true]
      let hairHarnessWindow: BrowserWindow | null = null
      const processPeakByRunRole = new Map<string, { run: number; role: string; samples: number; peakWorkingSetBytes: number; peakPrivateBytes: number; peakCpuPercent: number | null }>()
      const processSampleCountByRun = new Map<number, number>()
      let processSampler: { sample: (processes: Array<{ pid: number; role: string }>, frame: number) => Promise<{ sampledAt: string; frame: number; processes: unknown[] }>; close: () => Promise<void> } | null = null
      let sampleTimer: ReturnType<typeof setInterval> | null = null
      let hairStressCompleted = false
      const ffmpegPids = new Set<number>()
      const hairRuns: Array<{
        run: number; cacheState: string; workers: number; totalFrames: number; width: number; height: number; fps: string
        requestedEncoder: string; selectedEncoder: string; hairPresetSlot: number; hairPresetFingerprint: string
        hairPreparationRendererMs: number; hairPreparationWallMs: number; hairPreparationStages: unknown; hairBundleSerializationMs: number; hairBundleBytes: number
        mainExportWallMs: number; clickToValidatedWallMs: number; exportMilliseconds: number
        phaseMilliseconds: unknown; audioClips: number; audioOutput: boolean; videoInputs: number
        mouthAnimation: { characters: number; stateAtlases: number; skippedStates: number; staleStates: number; preparationMilliseconds: number } | null
        motionTransitionsPrepared: number; motionCache: unknown; motionCacheDelta: EditorV6MotionCacheStats
        mainProcessMemory: unknown; partTiming: unknown[]; processSampleCount: number; processPeaks: unknown[]
      }> = []
      let hairPreparationProfile: Record<string, unknown> | null = null
      const runs: Array<{ run: number; totalFrames: number; width: number; height: number; fps: string; workers: number; motionConcurrency: number; motionConcurrentPeak: number; milliseconds: number; exportWallMs: number; clickToValidatedWallMs: number; renderingMilliseconds: number; finalizationMilliseconds: number; rssPeakBytes: number; motionTransitions: number; motionCache?: EditorV6MotionCacheStats & { inputSamples: Array<{ cacheKey: string; planKeyHash: string; characterId: string; characterFingerprint: string }> }; motionCacheTotal?: EditorV6MotionCacheStats; mouthStates: number; audioClips: number; videoInputs: number; audioOutput: boolean }> = []
      try {
        if (hairPresetSlot !== null) {
          const { createWindowsProcessSampler } = require(resolve(__dirname, '../../scripts/editor-v6/windowsProcessSampler.cjs')) as { createWindowsProcessSampler: (scriptPath: string) => NonNullable<typeof processSampler> }
          processSampler = createWindowsProcessSampler(resolve(__dirname, '../../scripts/editor-v6/windows-process-sampler.ps1'))
          hairHarnessWindow = createMainWindow()
          const harnessWindow = hairHarnessWindow
          await new Promise<void>((resolveLoad, rejectLoad) => {
            harnessWindow.webContents.once('did-finish-load', () => resolveLoad())
            harnessWindow.webContents.once('did-fail-load', (_event, code, description) => rejectLoad(Error(`O renderer do benchmark não carregou (${code}: ${description}).`)))
          })
          const harnessDeadline = Date.now() + 60000
          while (Date.now() < harnessDeadline) {
            const ready = await harnessWindow.webContents.executeJavaScript('typeof window.__editorV6PrepareRealProjectHairForStress === "function"')
            if (ready) break
            await new Promise(resolveWait => setTimeout(resolveWait, 100))
          }
          if (!await harnessWindow.webContents.executeJavaScript('typeof window.__editorV6PrepareRealProjectHairForStress === "function"')) throw Error('O renderer não instalou o preparo de cabelo do benchmark.')
        }

        for (const [index, turbo] of modes.entries()) {
          const stressWorkerOverride = process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1' ? process.env.GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS : undefined
          const expectedExportWorkers = stressWorkerOverride ? Number(stressWorkerOverride) : turbo ? 2 : 1
          const id = randomUUID()
          const startFrame = hairPresetSlot !== null || noHairControl ? segmentStartFrame : 0
          const frameCount = hairPresetSlot !== null || noHairControl ? segmentFrameCount : project.timeline.durationFrames
          let reportProgressFrame = 0
          let sampleInFlight: Promise<void> | null = null
          const sampleProcesses = () => {
            if (!processSampler) return Promise.resolve()
            if (sampleInFlight) return sampleInFlight
            const pending = (async () => {
              const metrics = app.getAppMetrics()
              const processRoles = new Map<number, string>([[process.pid, 'main']])
              for (const metric of metrics) if (metric.pid !== process.pid) processRoles.set(metric.pid, /gpu/i.test(metric.type) ? 'gpu' : `electron-${metric.type}`)
              for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue
                const pid = window.webContents.getOSProcessId()
                if (pid > 0) processRoles.set(pid, window.webContents.getURL().includes('editor-v6-export.html') ? 'export-renderer' : 'benchmark-renderer')
              }
              for (const pid of ffmpegPids) processRoles.set(pid, 'ffmpeg')
              const sample = await processSampler!.sample([...processRoles].map(([pid, role]) => ({ pid, role })), reportProgressFrame)
              const run = index + 1
              processSampleCountByRun.set(run, (processSampleCountByRun.get(run) ?? 0) + 1)
              for (const process of sample.processes as Array<{ role: string; workingSetBytes: number; privateBytes: number; cpuPercentSincePreviousSample: number | null }>) {
                const key = `${run}:${process.role}`
                const previous = processPeakByRunRole.get(key)
                processPeakByRunRole.set(key, {
                  run, role: process.role, samples: (previous?.samples ?? 0) + 1,
                  peakWorkingSetBytes: Math.max(previous?.peakWorkingSetBytes ?? 0, process.workingSetBytes),
                  peakPrivateBytes: Math.max(previous?.peakPrivateBytes ?? 0, process.privateBytes),
                  peakCpuPercent: process.cpuPercentSincePreviousSample === null
                    ? previous?.peakCpuPercent ?? null
                    : Math.max(previous?.peakCpuPercent ?? 0, process.cpuPercentSincePreviousSample)
                })
              }
            })()
            sampleInFlight = pending
            void pending.then(() => { if (sampleInFlight === pending) sampleInFlight = null }, () => { if (sampleInFlight === pending) sampleInFlight = null })
            return pending
          }
          if (hairPresetSlot !== null) {
            await sampleProcesses()
            sampleTimer = setInterval(() => { void sampleProcesses().catch(error => console.error('[V6 benchmark process sample]', error)) }, 1000)
          }
          const suffix = hairPresetSlot !== null ? `hair-preset-${hairPresetSlot}-run-${index + 1}-workers-${expectedExportWorkers}`
            : noHairControl ? `no-hair-control-run-${index + 1}-workers-${expectedExportWorkers}`
            : `run-${index + 1}-workers-${expectedExportWorkers}-motion-bakes-${motionConcurrency}`
          const outputPath = join(outputRoot, `actual-project-${suffix}.mp4`)
          const reportPath = join(outputRoot, `actual-project-${suffix}.report.json`)
          const options: EditorV6ExportOptions = { startFrame, endFrame: startFrame + frameCount, width: 1920, height: 1080, turbo, encoder: 'auto', mouthLoop: true, mouthLoopCycleFrames: 30, ...(exportTestMode ? { testMode: exportTestMode } : {}), ...(hairPresetSlot !== null ? { hairAnimationPresetSlot: hairPresetSlot } : {}) }
          let hairAnimation: import('../src/shared/editorV6HairMotion').EditorV6HairMotionBundle | undefined
          let hairPreparationWallMs = 0
          let hairPreparationRendererMs = 0
          let hairPreparationStages: unknown = {}
          let hairBundleSerializationMs = 0
          let hairBundleBytes = 0
          let hairPresetFingerprint = ''
          if (hairPresetSlot !== null) {
            const prepareStarted = performance.now()
            const prepared = await hairHarnessWindow!.webContents.executeJavaScript(`window.__editorV6PrepareRealProjectHairForStress(${JSON.stringify(projectId)}, ${hairPresetSlot}, ${JSON.stringify(options)})`) as { bundle: import('../src/shared/editorV6HairMotion').EditorV6HairMotionBundle; preparationMs: number; preparationStages: unknown; bundleBytes: number; bundleSerializationMs: number; presetFingerprint: string; presetSlot: number }
            hairPreparationWallMs = performance.now() - prepareStarted
            hairPreparationRendererMs = prepared.preparationMs
            hairPreparationStages = prepared.preparationStages
            hairBundleSerializationMs = prepared.bundleSerializationMs
            hairAnimation = prepared.bundle
            hairBundleBytes = prepared.bundleBytes
            hairPresetFingerprint = prepared.presetFingerprint
            if (prepared.presetSlot !== hairPresetSlot || !hairAnimation.rigs.length) throw Error('O preparo não carregou o preset esperado ou não produziu rigs de cabelo.')
            if (hairPreparationOnly) {
              if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null }
              if (sampleInFlight) await sampleInFlight
              await sampleProcesses()
              const stages = prepared.preparationStages as Record<string, { samples: number; totalMs: number; maxMs: number }>
              const preparedTransitions = hairAnimation.motionTransitions?.length ?? 0
              hairPreparationProfile = {
                passed: preparedTransitions > 0 && Object.values(stages).every(stage => Number.isFinite(stage.totalMs)),
                benchmarkKind: 'real-project-hair-preparation', projectId, projectUpdatedAt: project.updatedAt,
                projectTitle: project.title, durationFrames: frameCount, timelineDurationFrames: project.timeline.durationFrames, startFrame, endFrame: startFrame + frameCount, durationSeconds: frameCount / 30,
                width: 1920, height: 1080, fps: '30/1', hairPresetSlot,
                hairPresetFingerprint, preparationWallMs: hairPreparationWallMs,
                preparationRendererMs: hairPreparationRendererMs, preparationStages: stages,
                bundleSerializationMs: hairBundleSerializationMs, bundleBytes: hairBundleBytes,
                rigCount: hairAnimation.rigs.length, preparedTransitions,
                bakeSamples: stages.bakeHairlessMotionTransition?.samples ?? 0,
                processSampleCount: processSampleCountByRun.get(index + 1) ?? 0,
                processPeaks: [...processPeakByRunRole.values()].filter(sample => sample.run === index + 1)
              }
              break
            }
          }
          const workerLabel = expectedExportWorkers === 1 ? 'um' : expectedExportWorkers === 2 ? 'dois' : String(expectedExportWorkers)
          console.log(`[V6 isolated export] Rodada ${index + 1}/${modes.length}: ${workerLabel} workers, ${frameCount} quadros 1920×1080${hairPresetSlot !== null ? `, cabelo Preset ${hairPresetSlot} ativo` : noHairControl ? ', cabelo desativado (controle)' : ', sem cabelo experimental'}.`)
          const cacheBeforeExport = editorV6MotionService!.getCacheStats()
          const exportStarted = performance.now()
          const report = await editorV6ExportService!.runIsolatedExport(project, options, outputPath, reportPath, id, undefined, (patch) => {
            if (typeof patch.frames === 'number') reportProgressFrame = patch.frames
            if (patch.message) console.log(`[V6 isolated export] ${patch.message}`)
          }, motionConcurrency, hairAnimation, pid => ffmpegPids.add(pid))
          const exportWallMs = performance.now() - exportStarted
          if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null }
          if (sampleInFlight) await sampleInFlight
          if (processSampler) await sampleProcesses()
          const cacheAfterExport = editorV6MotionService!.getCacheStats()
          const motionCacheTotal = Object.fromEntries(Object.keys(cacheAfterExport).map((key) => [key, cacheAfterExport[key as keyof EditorV6MotionCacheStats] - cacheBeforeExport[key as keyof EditorV6MotionCacheStats]])) as EditorV6MotionCacheStats
          const streams = (report.validation as { streams?: Array<{ codec_type?: string; nb_read_frames?: string | number; nb_read_packets?: string | number; has_b_frames?: number; r_frame_rate?: string; width?: number; height?: number }> } | undefined)?.streams ?? []
          const video = streams.find((stream) => stream.codec_type === 'video')
          const validatedVideoFrames = video?.nb_read_frames ?? (Number(video?.has_b_frames ?? 0) === 0 ? video?.nb_read_packets : undefined)
          const audio = streams.some((stream) => stream.codec_type === 'audio')
          // Real projects may have music/video sound even with animated hair.
          // Validate the actual mixed output; do not assume a silent fixture.
          const audioValid = hairPresetSlot !== null
            ? editorV6BenchmarkAudioMatchesExport(report.audioClips, audio)
            : report.audioClips >= 1 && audio
          if (report.state !== 'completed' || report.totalFrames !== frameCount || Number(validatedVideoFrames) !== frameCount
            || video?.r_frame_rate !== '30/1' || video.width !== options.width || video.height !== options.height
            || report.motionTransitionsPrepared !== report.motionTransitionsRequired
            || hairPresetSlot === null && (!report.motionTransitionsRequired || !report.mouthAnimation || report.mouthAnimation.skippedStates || report.mouthAnimation.staleStates || report.videoInputs < 1)
            || hairPresetSlot !== null && (report.options.hairAnimationPresetSlot !== hairPresetSlot || !hairAnimation?.rigs.length || !report.attempts.some(attempt => attempt.parts.some(part => (part.frameTiming?.hairCompositionMs?.samples ?? 0) > 0)))
            || !audioValid
            || singleMotionRun && (!report.motionPreparation || report.motionPreparation.maxConcurrentBakes !== Math.min(motionConcurrency, report.motionPreparation.unique)
              || !report.motionCache || report.motionCache.rasterized !== report.motionTransitionsRequired || report.motionCache.diskHits !== 0)) {
            throw Error(`A rodada ${index + 1} não preservou os estados esperados: ${JSON.stringify({ state: report.state, frames: report.totalFrames, videoFrames: validatedVideoFrames, fps: video?.r_frame_rate, width: video?.width, height: video?.height, motionRequired: report.motionTransitionsRequired, motionPrepared: report.motionTransitionsPrepared, hairRigs: hairAnimation?.rigs.length, hairCompositionSamples: report.attempts.flatMap(attempt => attempt.parts).map(part => part.frameTiming?.hairCompositionMs?.samples ?? 0), mouth: report.mouthAnimation, audioClips: report.audioClips, audio })}`)
          }
          if (hairPresetSlot !== null) {
            const timing = report.attempts.flatMap(attempt => attempt.parts).map(part => part.frameTiming)
            const runNumber = index + 1
            hairRuns.push({ run: runNumber, cacheState: index === 0 ? 'cold-motion-cache' : 'warm-motion-cache', workers: report.attempts[0]?.parallelism ?? expectedExportWorkers, totalFrames: report.totalFrames, width: options.width, height: options.height, fps: '30/1', requestedEncoder: options.encoder, selectedEncoder: report.attempts[0]?.encoder ?? 'unknown', hairPresetSlot, hairPresetFingerprint, hairPreparationRendererMs, hairPreparationWallMs, hairPreparationStages, hairBundleSerializationMs, hairBundleBytes, mainExportWallMs: exportWallMs, clickToValidatedWallMs: hairPreparationWallMs + exportWallMs, exportMilliseconds: report.milliseconds ?? exportWallMs, phaseMilliseconds: report.phaseMilliseconds, audioClips: report.audioClips, audioOutput: audio, videoInputs: report.videoInputs, mouthAnimation: report.mouthAnimation ? { characters: report.mouthAnimation.characters, stateAtlases: report.mouthAnimation.stateAtlases, skippedStates: report.mouthAnimation.skippedStates, staleStates: report.mouthAnimation.staleStates, preparationMilliseconds: report.mouthAnimation.preparationMilliseconds } : null, motionTransitionsPrepared: report.motionTransitionsPrepared, motionCache: report.motionCache ?? null, motionCacheDelta: motionCacheTotal, mainProcessMemory: report.mainProcessMemory ?? null, partTiming: timing, processSampleCount: processSampleCountByRun.get(runNumber) ?? 0, processPeaks: [...processPeakByRunRole.values()].filter(sample => sample.run === runNumber) })
          } else {
            runs.push({ run: index + 1, totalFrames: report.totalFrames, width: options.width, height: options.height, fps: '30/1', workers: report.attempts[0]?.parallelism ?? expectedExportWorkers, motionConcurrency, motionConcurrentPeak: report.motionPreparation?.maxConcurrentBakes ?? 0, milliseconds: report.milliseconds!, exportWallMs, clickToValidatedWallMs: hairPreparationWallMs + exportWallMs, renderingMilliseconds: report.phaseMilliseconds.rendering, finalizationMilliseconds: report.phaseMilliseconds.finalization, rssPeakBytes: report.mainProcessMemory!.peakRssBytes, motionTransitions: report.motionTransitionsPrepared, motionCache: report.motionCache, motionCacheTotal, mouthStates: report.mouthAnimation?.stateAtlases ?? 0, audioClips: report.audioClips, videoInputs: report.videoInputs, audioOutput: audio })
          }
        }
        const median = (values: number[]) => { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.floor(sorted.length / 2)] }
        if (hairPreparationOnly) {
          if (!hairPreparationProfile) throw Error('O perfil rápido não produziu uma medição de preparação.')
          await nativeWriteFile(join(outputRoot, 'stress-export-validation.json'), JSON.stringify(hairPreparationProfile, null, 2), 'utf8')
          hairStressCompleted = hairPreparationProfile.passed === true
          console.log(JSON.stringify(hairPreparationProfile, null, 2))
        } else if (hairPresetSlot !== null) {
          const targetSeconds = segmentFrameCount === 600 ? 10 : segmentFrameCount === 1200 ? 15 : null
          const summary = { passed: hairRuns.length === modes.length, benchmarkKind: 'real-project-hair-export', projectTitle: project.title, startFrame: segmentStartFrame, endFrame: segmentStartFrame + segmentFrameCount, timelineDurationFrames: project.timeline.durationFrames, durationFrames: hairRuns[0]?.totalFrames, durationSeconds: (hairRuns[0]?.totalFrames ?? 0) / 30, targetSeconds, width: 1920, height: 1080, fps: '30/1', turbo: true, requestedEncoder: 'auto', hairPresetSlot, hairPresetFingerprint: hairRuns[0]?.hairPresetFingerprint, dialogSelectionMs: 0, dialogNote: 'Destino predefinido dentro da pasta isolada; o tempo humano de seleção no diálogo não foi medido.', audioClips: hairRuns[0]?.audioClips, audioOutput: hairRuns[0]?.audioOutput, medianClickToValidatedWallMs: median(hairRuns.map(run => run.clickToValidatedWallMs)), runs: hairRuns }
          await nativeWriteFile(join(outputRoot, 'stress-export-validation.json'), JSON.stringify(summary, null, 2), 'utf8')
          hairStressCompleted = summary.passed
          console.log(JSON.stringify(summary, null, 2))
        } else if (noHairControl) {
          const summary = { passed: runs.length === modes.length, benchmarkKind: 'real-project-no-hair-control', projectTitle: project.title, startFrame: segmentStartFrame, endFrame: segmentStartFrame + segmentFrameCount, timelineDurationFrames: project.timeline.durationFrames, durationFrames: segmentFrameCount, durationSeconds: segmentFrameCount / 30, width: 1920, height: 1080, fps: '30/1', turbo: true, requestedEncoder: 'auto', audioClips: runs[0]?.audioClips, audioOutput: runs[0]?.audioOutput, medianClickToValidatedWallMs: median(runs.map(run => run.clickToValidatedWallMs)), runs }
          await nativeWriteFile(join(outputRoot, 'stress-export-validation.json'), JSON.stringify(summary, null, 2), 'utf8')
          console.log(JSON.stringify(summary, null, 2))
        } else {
          const variants = (cacheProbe || singleMotionRun ? [1] : [1, 2]).map((workers) => {
            const selected = runs.filter((run) => run.workers === workers)
            return { workers, runs: selected.length, medianMilliseconds: median(selected.map((run) => run.milliseconds)), medianRenderingMilliseconds: median(selected.map((run) => run.renderingMilliseconds)), maxMainProcessRssBytes: Math.max(...selected.map((run) => run.rssPeakBytes)) }
          })
          const summary = { passed: true, benchmarkKind: singleMotionRun ? 'motion-concurrency-single' : cacheProbe ? 'motion-cache-repeat' : 'worker-comparison', projectId, projectUpdatedAt: project.updatedAt, durationFrames: project.timeline.durationFrames, durationSeconds: project.timeline.durationFrames / 30, width: 1920, height: 1080, fps: '30/1', encoder: 'auto', mouthLoop: true, audioClips: runs[0].audioClips, videoInputs: runs[0].videoInputs, audioOutput: true, motionTransitionsPreparedPerRun: runs[0].motionTransitions, mouthStatesPerRun: runs[0].mouthStates, motionBakeConcurrency: motionConcurrency, runOrder: runs.map((run) => run.workers), runs, variants }
          await nativeWriteFile(join(outputRoot, 'stress-export-validation.json'), JSON.stringify(summary, null, 2), 'utf8')
          console.log(JSON.stringify(summary, null, 2))
        }
        app.quit()
      } finally {
        if (sampleTimer) clearInterval(sampleTimer)
        await processSampler?.close()
        if (hairHarnessWindow && !hairHarnessWindow.isDestroyed()) hairHarnessWindow.destroy()
        if (hairPresetSlot !== null) app.exit(hairStressCompleted ? 0 : 1)
      }
    })().catch((error) => { console.error('[V6 isolated export] Falha:', error); app.exit(1) })
  } else createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.env.GACHA_EDITOR_V6_STRESS_AUTORUN === '1') return
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', createPersistenceShutdownHandler({
  flushRendererWrites: async () => {
    rendererWritesFlushedForShutdown = false
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isLoading()) continue
      await window.webContents.executeJavaScript('window.desktop?.flushPendingWrites ? window.desktop.flushPendingWrites() : undefined')
    }
    rendererWritesFlushedForShutdown = true
  },
  getPendingOperations: () => [
    ...collectPendingPersistenceWrites(),
    ...(dataBackupIpc?.getActiveTasks() ?? []),
    ...(roteiroExportIpc ? [roteiroExportIpc.drain()] : []),
    ...(editorV6ExportService ? [editorV6ExportService.drain()] : []),
    ...(editorV7ExportService ? [editorV7ExportService.drain()] : []),
    ...(editorV6MotionService ? [editorV6MotionService.drain()] : [])
  ],
  drainIpc: () => ipcMain.drain(),
  cancelExports: () => {
    editorV6ExportService?.cancelAll()
    editorV7ExportService?.cancelAll()
    editorV6MotionService?.cancelAll()
  },
  resumeAfterFailedShutdown: () => {
    rendererWritesFlushedForShutdown = false
    roteiroExportIpc?.resumeAfterFailedShutdown()
    editorV6ExportService?.resumeAfterFailedShutdown()
  },
  hasUsableWindow: () => BrowserWindow.getAllWindows().some((window) => !window.isDestroyed()),
  createWindow: createMainWindow,
  showPersistenceFailure: () => dialog.showErrorBox(
    'Falha no salvamento',
    'Uma gravação pendente falhou. O aplicativo permanecerá aberto para proteger suas alterações.'
  ),
  closeDataPlatform: () => dataPlatform.close(),
  quit: () => app.quit()
}))
