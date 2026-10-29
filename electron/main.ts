import { createEditorV6Paths } from './domains/editorV6/paths'
import { registerMediaProtocols } from './mediaProtocols'
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir as nativeMkdir, readFile as nativeReadFile, writeFile as nativeWriteFile, readdir as nativeReaddir, unlink as nativeUnlink, rename as nativeRename, stat as nativeStat, access as nativeAccess, rm as nativeRm, copyFile as nativeCopyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { FABRICATOR_MODEL_SLOT_COUNT, FABRICATOR_POSE_SLOT_COUNT, type FaceExpressionPreset, type FabricatorProjectSave, type ModelPart } from '../src/shared/fabricator'
import type { CustomizerCharacter } from '../src/shared/customizer'
import type { CustomizerFaceAssetReference } from '../src/shared/customizerFaceAssetReferences'
import type { FabricatorPoseReference } from '../src/shared/fabricatorPoseReferences'
import type { EditorV6Document } from '../src/shared/editorV6'
import type { StudioDocument } from '../src/shared/studio'
import { isStudioDocument } from '../src/shared/studioValidation'
import { isEditorV6Document } from '../src/shared/editorV6Schema'
import { registerEditorV6ExportHandlers } from './domains/editorV6/exportIpc'
import { createEditorV6MotionService } from './domains/editorV6/motionIpc'
import { VideoLibraryStore, configureVideoLibraryStorage } from './domains/mediaLibrary/videoLibraryStore'
import { VideoBackgroundLibraryStore, configureBackgroundLibraryStorage } from './backgroundLibrary'
import { RoteiroUiGifLibraryStore, configureRoteiroUiGifStorage } from './roteiroUiGifLibrary'
import { DataPlatform, getAppDataUsage } from './dataPlatform.cjs'
import { DomainFileSystem } from './domainFileSystem.cjs'
import { DataMigrationService } from './dataMigration.cjs'
import { DataBackupService } from './dataBackups.cjs'
import { registerDataMigrationHandlers } from './domains/storage/dataMigrationIpc'
import { registerDataBackupHandlers } from './domains/storage/dataBackupIpc'
import { registerPendingPersistenceFlushIpc } from './domains/storage/pendingPersistenceIpc'
import { createKeyedOperationQueue } from './domains/storage/keyedOperationQueue'
import { configureAssetImageStorage, readAssetImage, writeAssetImageSource } from './assetImageOverrides'
import { normalizeImageBuffer } from './imageIngestion.cjs'
import { measureIpc } from './ipcPerformance'
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
import { createMainWindowFactory } from './application/mainWindow'
import { createEditorV6VideoReferenceLookup } from './domains/editorV6/videoReferences'

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
let editorV6MotionService: ReturnType<typeof createEditorV6MotionService> | null = null

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
const withPoseReferenceSnapshot = <T>(operation: (references: readonly FabricatorPoseReference[]) => Promise<T>): Promise<T> =>
  getPoseReferenceIntegrity().withPoseReferenceSnapshot(operation)
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

const wardrobePersistence = createFabricatorWardrobePersistence({
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
  const senderUrl = event.senderFrame?.url
  if (!senderUrl) throw new Error('Origem da solicitação inválida.')
  const expectedUrl = process.env.ELECTRON_RENDERER_URL
  if (expectedUrl) {
    if (new URL(senderUrl).origin !== new URL(expectedUrl).origin) throw new Error('Origem da solicitação não autorizada.')
  } else if (resolve(fileURLToPath(senderUrl)) !== resolve(join(__dirname, '../renderer/index.html'))) {
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
  decodeImage: importedImageDataUrlBuffer,
  normalizeImage: normalizeImageBuffer
})

const { listEditorV6s, listEditorV6PoseReferenceDocuments } = createEditorV6LibraryIndex({
  files: { mkdir, readdir },
  editorV6LibraryPath,
  readEditorV6Summary,
  readEditorV6PoseReferences
})

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
    setPendingWrites: (pending) => { studioSaveQueues.studio = pending },
    measure: (label, operation) => measureIpc(label, operation)
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
    setPendingWrites: (pending) => { editorV6SaveQueue = pending },
    measure: (label, operation) => measureIpc(label, operation)
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
    files: { stat, readFile, mkdir, writeFile },
    normalizeImage: normalizeImageBuffer, dataUrlBuffer, createId: randomUUID,
    openPath: (path) => shell.openPath(path)
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
    assertNoVideoReferences,
    assertLibraryVideoReferencesAvailable,
    assertLibraryBackgroundReferencesAvailable,
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
  }))

  registerCustomizerCharacterHandlers(ipcMain, assertTrustedSender, customizerService, measureIpc)

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
    coordinatePoseReferenceChange, withPoseReferenceSnapshot,
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
  rendererPath: join(__dirname, '../renderer/index.html'),
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
  restrictNavigation: restrictRendererNavigation,
  onRendererLoaded: (window) => {
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
  },
  onClosed: () => editorV6MotionService?.releaseIdle(),
  flushRendererWrites: async (window) => {
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
  restrictRendererPermissions(session.defaultSession)
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
    readEditorV6Manifest: async (id) => JSON.parse(await nativeReadFile(join(editorV6Path(id), 'editorV6.json'), 'utf8'))
  })
  await registerFabricatorHandlers()
  editorV6MotionService = createEditorV6MotionService({ ipcMain, assertTrustedSender, html: join(__dirname, '../renderer/index.html'), preload: join(__dirname, '../preload/editorV6MotionPreload.cjs'), devUrl: process.env.ELECTRON_RENDERER_URL, cacheDirectory: join(app.getPath('userData'), 'cache', 'editor-v6-motion-v2') })
  editorV6ExportService = registerEditorV6ExportHandlers({ ipcMain, assertTrustedSender, projectPath: editorV6Path,
    toolsDirectory: app.isPackaged ? join(process.resourcesPath, 'video-tools') : resolve(__dirname, '../../resources/video-tools'),
    workerHtml: join(__dirname, '../renderer/editor-v6-export.html'), workerPreload: join(__dirname, '../preload/editorV6ExportPreload.cjs'),
    devUrl: process.env.ELECTRON_RENDERER_URL, tempRoot: app.getPath('temp'), getCharacters: () => customizerService.list(),
    resolveLibraryVideo: async (id) => { const item = await videoLibrary.resolveMedia(id); return { ...item, path: await dataFileSystem.resolvePhysicalPath(item.path) ?? item.path } },
    bakeMotion: (request, signal) => editorV6MotionService!.bakeForExport(request, signal) })
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let waitingForPersistenceWritesBeforeQuit = false
let persistenceWritesDrainedForQuit = false
app.on('before-quit', (event) => {
  if (persistenceWritesDrainedForQuit) return
  // Always prevent quit while an asynchronous drain is in flight. A second
  // before-quit must not bypass the first drain.
  event.preventDefault()
  if (waitingForPersistenceWritesBeforeQuit) return
  waitingForPersistenceWritesBeforeQuit = true
  editorV6ExportService?.cancelAll()
  editorV6MotionService?.cancelAll()
  const pendingWrites = [
    ...collectPendingPersistenceWrites(),
    ...(dataBackupIpc?.getActiveTasks() ?? []),
    ...(roteiroExportIpc ? [roteiroExportIpc.drain()] : []),
    ...(editorV6ExportService ? [editorV6ExportService.drain()] : []),
    ...(editorV6MotionService ? [editorV6MotionService.drain()] : [])
  ]
  void Promise.allSettled(pendingWrites).then((results) => {
    waitingForPersistenceWritesBeforeQuit = false
    const failed = results.some((result) => result.status === 'rejected')
    if (failed) {
      roteiroExportIpc?.resumeAfterFailedShutdown()
      editorV6ExportService?.resumeAfterFailedShutdown()
      // Do not report successful shutdown after a persistence failure.
      // Keep the application available for retry/recovery instead.
      if (!BrowserWindow.getAllWindows().some((window) => !window.isDestroyed())) createMainWindow()
      dialog.showErrorBox('Falha no salvamento', 'Uma gravação pendente falhou. O aplicativo permanecerá aberto para proteger suas alterações.')
      return
    }
    persistenceWritesDrainedForQuit = true
    dataPlatform.close()
    app.quit()
  })
})
