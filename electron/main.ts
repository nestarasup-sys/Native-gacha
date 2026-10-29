import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, type IpcMainInvokeEvent } from 'electron'
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir as nativeMkdir, readFile as nativeReadFile, writeFile as nativeWriteFile, readdir as nativeReaddir, unlink as nativeUnlink, rename as nativeRename, stat as nativeStat, access as nativeAccess, rm as nativeRm, copyFile as nativeCopyFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { FABRICATOR_MODEL_SLOT_COUNT, FABRICATOR_POSE_SLOT_COUNT, type FaceAssetKind, type FaceAssetSave, type FaceCatalogItem, type FaceCatalogItemSave, type FaceCatalogItemSummary, type FaceComponentAsset, type FaceComponentAssetSave, type FaceComponentAssetSummary, type FaceElementKind, type FaceExpressionPreset, type FaceExpressionTransforms, type FaceExpressionWorkspaceDraft, type FaceSet, type FaceSetSave, type FaceSheetKind, type FaceTransform, type FabricatorPoseDraftSave, type FabricatorPoseSave, type FabricatorProjectSave, type HairStyle, type HairStyleAsset, type HairStyleSave, type HairWorkspace, type HairWorkspaceAsset, type HairWorkspaceSave, type ModelPart } from '../src/shared/fabricator'
import { hairCategories } from '../src/shared/hairCategories'
import type { CustomizerCharacter } from '../src/shared/customizer'
import type { CustomizerFaceAssetReference } from '../src/shared/customizerFaceAssetReferences'
import type { FabricatorPoseReference } from '../src/shared/fabricatorPoseReferences'
import { addedFabricatorPoseReferences, collectCustomizerPoseReferences, collectEditorV6PoseReferences, collectStudioPoseReferences } from '../src/shared/fabricatorPoseReferences'
import type { EditorV6Document } from '../src/shared/editorV6'
import type { StudioAsset, StudioDocument } from '../src/shared/studio'
import { isStudioExpressionEffects, isStudioFaceTransforms } from '../src/shared/studio'
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
import { createKeyedOperationQueue } from './domains/storage/keyedOperationQueue'
import { configureAssetImageStorage, readAssetImage, writeAssetImageSource } from './assetImageOverrides'
import { migrateElectronProfile } from './electronProfileMigration.cjs'
import { normalizeImageBuffer } from './imageIngestion.cjs'
import { measureIpc } from './ipcPerformance'
import { BaseVideoService } from './domains/baseVideos/service'
import { registerBaseVideoHandlers } from './domains/baseVideos/ipc'
import { isValidCustomizerFaceAppearance } from './domains/customizer/validation'
import { CustomizerCharacterRepository } from './domains/customizer/repository'
import { CustomizerCharacterService } from './domains/customizer/service'
import { registerCustomizerCharacterHandlers } from './domains/customizer/ipc'
import { starterCharacters } from './domains/customizer/starterCharacters'
import { FabricatorModelCatalog } from './domains/fabricator/modelCatalog'
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
import { createPoseReferenceChangeCoordinator } from './domains/fabricator/poseReferences'
import { createAnimatorPersistence } from './domains/fabricator/animatorPersistence'
import { registerFabricatorPoseHandlers } from './domains/fabricator/poseIpc'
import { registerFabricatorAnimatorHandlers } from './domains/fabricator/animatorIpc'
import { FabricatorCatalogAssetService } from './domains/fabricator/catalogAssetService'
import { createFabricatorCatalogPersistence } from './domains/fabricator/catalogPersistence'
import { createFabricatorExpressionStorage } from './domains/fabricator/expressionStorage'
import { createExpressionBatchTransaction } from './domains/fabricator/expressionBatchTransaction'
import { createFabricatorDesignSettingsService } from './domains/fabricator/designSettingsService'
import { registerFabricatorDesignSettingsHandlers } from './domains/fabricator/designSettingsIpc'
import { isPortableExpressionMotion, isPtPupilOverrides, isPtPupilMotion } from '../src/shared/portableExpression'
import { registerExpressionPresetHandlers } from './domains/fabricator/expressionIpc'
import { registerStudioPrimaryHandlers } from './domains/studio/primaryIpc'
import { registerStudioFileHandlers } from './domains/studio/fileIpc'
import { createStudioLibraryIndex } from './domains/studio/libraryIndex'
import { createStudioDocumentPersistence } from './domains/studio/documentPersistence'
import { studioIpcChannels } from '../src/shared/studioIpcChannels'
import type { AssetNamespace } from './domains/fabricator/versionedAssetResolver'
import { inspectFabricatorStorage } from '../src/shared/fabricatorStorageCompatibility'
import { captureFabricatorRealScreens, captureCustomizerStudioRealScreens, captureCustomizerStudioReopened } from './domains/fabricator/visualUiCapture'
import { registerModelSourceDownloadHandlers } from './domains/fabricator/modelSourceExportIpc'
import { registerEditorV6PrimaryHandlers } from './domains/editorV6/primaryIpc'
import { registerEditorV6FileHandlers } from './domains/editorV6/fileIpc'
import { createEditorV6LibraryIndex } from './domains/editorV6/libraryIndex'
import { createEditorV6DocumentPersistence } from './domains/editorV6/documentPersistence'
import { createVideoReferenceChangeCoordinator, createVideoReferenceGuard } from './domains/mediaLibrary/videoReferences'
import { createRoteirosVideoReferenceLookup } from './domains/roteiros/videoReferences'
import { createRoteirosDocumentService } from './domains/roteiros/service'
import { registerRoteirosDocumentHandlers } from './domains/roteiros/documentIpc'
import { createRoteiroExportLogsService } from './domains/roteiros/exportLogsService'
import { registerRoteiroExportLogsHandlers } from './domains/roteiros/exportLogsIpc'
import { createRoteiroExportService } from './domains/roteiros/exportService'
import { registerRoteiroExportHandlers } from './domains/roteiros/exportIpc'
import { createRoteiroBackgroundReferenceGuard, createRoteiroUiGifReferenceGuard } from './domains/roteiros/assetReferences'
import { createRoteiroUiGifsService } from './domains/roteiros/uiGifsService'
import { registerRoteiroUiGifsHandlers } from './domains/roteiros/uiGifsIpc'
import { createBackgroundLibraryService } from './domains/mediaLibrary/backgroundLibraryService'
import { registerBackgroundLibraryHandlers } from './domains/mediaLibrary/backgroundLibraryIpc'
import { createVideoLibraryService } from './domains/mediaLibrary/videoLibraryService'
import { registerVideoLibraryHandlers } from './domains/mediaLibrary/videoLibraryIpc'
import { createEditorV6VideoReferenceLookup } from './domains/editorV6/videoReferences'

let configuredAppDataRoot: string | null = null
let roteirosSaveQueue: Promise<void> = Promise.resolve()

function waitForRoteirosWrites(): Promise<void> {
  return roteirosSaveQueue.catch(() => undefined)
}

function enqueueRoteirosWrite<T>(operation: () => Promise<T> | T): Promise<T> {
  const next = roteirosSaveQueue.catch(() => undefined).then(operation)
  roteirosSaveQueue = next.then(() => undefined)
  return next
}

function configureDevAiDataRoot(): void {
  const privateCopyTest = process.env.GACHA_DEV_AI_PRIVATE_TEST === '1'
  if (privateCopyTest && process.env.GACHA_DEV_AI_TEST !== '1') {
    throw new Error('O modo privado DEV AI exige o runner local isolado.')
  }
  if (process.env.GACHA_DEV_AI_TEST !== '1') return
  if (app.isPackaged || app.isReady()) throw new Error('DEV AI IPC só pode configurar o root antes do boot em build de desenvolvimento.')
  const requestedSandbox = process.env.GACHA_DEV_AI_SANDBOX
  if (!requestedSandbox || !resolve(requestedSandbox)) throw new Error('Root sintético DEV AI ausente.')

  if (privateCopyTest) {
    const privateRoot = resolve(process.env.GACHA_DEV_AI_PRIVATE_ROOT ?? '')
    const allowedRoot = resolve(process.env.GACHA_DEV_AI_PRIVATE_ALLOWED_ROOT ?? '')
    const sandbox = resolve(requestedSandbox)
    const userData = join(privateRoot, 'userData')
    const markerPath = join(privateRoot, 'private-copy-marker.json')
    const relativePrivate = relative(allowedRoot, privateRoot)
    const relativeSandbox = relative(privateRoot, sandbox)
    const isWithin = (root: string, path: string): boolean => {
      const pathRelative = relative(root, path)
      return !!pathRelative && pathRelative !== '..' && !pathRelative.startsWith(`..${sep}`)
    }
    const sameCanonicalPath = (left: string, right: string): boolean => process.platform === 'win32'
      ? left.toLowerCase() === right.toLowerCase()
      : left === right
    if (!relativePrivate || !isWithin(allowedRoot, privateRoot) || relativeSandbox !== 'userData'
      || !sameCanonicalPath(sandbox, userData)) {
      throw new Error('Cópia privada DEV AI fora da raiz local autorizada.')
    }
    const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf8')) as {
      schemaVersion?: number; privateDataCopy?: boolean; verifiedSha256?: boolean; sourceBackup?: string; copyMode?: string
    } : null
    const sourceBackup = marker?.sourceBackup ? resolve(marker.sourceBackup) : ''
    const backupManifest = sourceBackup ? join(sourceBackup, 'backup-manifest.json') : ''
    if (marker?.schemaVersion !== 1 || marker.privateDataCopy !== true || marker.verifiedSha256 !== true
      || !['baseline', 'wardrobe-reset'].includes(marker.copyMode ?? '')
      || !isWithin(allowedRoot, sourceBackup) || sourceBackup.toLowerCase() === privateRoot.toLowerCase()
      || !existsSync(backupManifest) || !existsSync(sandbox)) {
      throw new Error('Cópia privada DEV AI sem backup local validado.')
    }
    for (const path of [allowedRoot, privateRoot, markerPath, sourceBackup, backupManifest, sandbox]) {
      if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !sameCanonicalPath(realpathSync(path), path)) {
        throw new Error('Path não canônico ou symlink recusado no teste privado.')
      }
    }
    const sessionData = join(privateRoot, 'session-data')
    mkdirSync(sessionData, { recursive: true })
    if (lstatSync(sessionData).isSymbolicLink() || !sameCanonicalPath(realpathSync(sessionData), sessionData)) {
      throw new Error('Diretório de sessão privado inválido.')
    }
    // appData deve conter userData: requisito da migração segura e dos backups.
    app.setPath('appData', privateRoot)
    app.setPath('userData', userData)
    app.setPath('sessionData', sessionData)
    return
  }

  const repoRoot = resolve(__dirname, '../..')
  const runsRoot = resolve(repoRoot, 'out', 'dev-ai', 'runs')
  const sandbox = resolve(requestedSandbox)
  const runRoot = dirname(sandbox)
  const relativeRun = relative(runsRoot, runRoot)
  if (!relativeRun || relativeRun === '..' || relativeRun.startsWith(`..${sep}`) || relativeRun.includes(sep)
    || basename(sandbox) !== 'sandbox' || !existsSync(sandbox)) {
    throw new Error('Root sintético DEV AI fora do diretório autorizado.')
  }

  const sameCanonicalPath = (left: string, right: string): boolean => process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
  for (const path of [resolve(repoRoot, 'out'), resolve(repoRoot, 'out', 'dev-ai'), runsRoot, runRoot, sandbox]) {
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !sameCanonicalPath(realpathSync(path), path)) {
      throw new Error('Root sintético DEV AI ausente, não canônico ou ligado por symlink.')
    }
  }
  const markerPath = join(runRoot, '.dev-ai-sandbox.json')
  if (!existsSync(markerPath) || lstatSync(markerPath).isSymbolicLink() || !sameCanonicalPath(realpathSync(markerPath), markerPath)) {
    throw new Error('Marcador do sandbox DEV AI ausente ou inválido.')
  }
  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { schemaVersion?: number; runId?: string; syntheticOnly?: boolean }
  if (marker.schemaVersion !== 1 || marker.runId !== basename(runRoot) || marker.syntheticOnly !== true) {
    throw new Error('Marcador do sandbox DEV AI não identifica uma execução sintética válida.')
  }

  const userData = join(sandbox, 'electron-user-data')
  const sessionData = join(sandbox, 'electron-session-data')
  mkdirSync(userData, { recursive: true })
  mkdirSync(sessionData, { recursive: true })
  // O appData nativo aponta ao perfil Windows real; neste teste deve ser o
  // sandbox previamente autenticado pelo marcador. Mantém a regra within().
  app.setPath('appData', sandbox)
  app.setPath('userData', userData)
  app.setPath('sessionData', sessionData)
}

configureDevAiDataRoot()

function configureLocalAppDataRoot(): string | null {
  if (process.env.GACHA_DEV_AI_TEST === '1') return null

  const stressRoot = process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
    ? process.env.GACHA_EDITOR_V6_STRESS_DATA_ROOT
    : undefined
  if (process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1' && (!stressRoot || !isAbsolute(stressRoot))) {
    throw new Error('O teste offscreen precisa de um perfil temporário absoluto; o perfil normal foi protegido.')
  }
  const defaultRoot = stressRoot ?? (app.isPackaged
    ? join(dirname(process.execPath), 'app-data')
    : join(app.getAppPath(), 'app-data'))
  const dataRoot = resolve(defaultRoot)
  const legacyUserData = join(dataRoot, 'user-data')
  const profileRoot = join(dataRoot, 'runtime', 'profile')
  const sessionDataRoot = join(dataRoot, 'cache', 'electron-session')
  const paths = [dataRoot, join(dataRoot, 'runtime'), profileRoot, join(dataRoot, 'cache'), sessionDataRoot,
    join(dataRoot, 'logs'), join(dataRoot, 'crash-dumps'), join(dataRoot, 'temp')]
  for (const path of paths) {
    mkdirSync(path, { recursive: true })
    if (lstatSync(path).isSymbolicLink() || resolve(path) !== realpathSync(path)) {
      throw new Error(`Diretório local de dados não canônico: ${path}`)
    }
  }

  // Keep Chromium's persistent profile and session storage inside the portable
  // app-data root, separate from the app's domain data and from each other.
  migrateElectronProfile({ dataRoot, legacyRoot: legacyUserData, profileRoot, sessionRoot: sessionDataRoot })
  app.setPath('appData', dataRoot)
  app.setPath('userData', profileRoot)
  app.setPath('sessionData', sessionDataRoot)
  app.setPath('logs', join(dataRoot, 'logs'))
  app.setPath('crashDumps', join(dataRoot, 'crash-dumps'))
  app.setPath('temp', join(dataRoot, 'temp'))
  process.env.TEMP = join(dataRoot, 'temp')
  process.env.TMP = join(dataRoot, 'temp')
  process.env.TMPDIR = join(dataRoot, 'temp')
  return dataRoot
}

configuredAppDataRoot = configureLocalAppDataRoot()

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
let dataMigrationIpc: ReturnType<typeof registerDataMigrationHandlers> | null = null
let fabricatorHairIpc: ReturnType<typeof registerFabricatorHairHandlers> | null = null
let fabricatorProjectIpc: ReturnType<typeof registerFabricatorProjectHandlers> | null = null
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
const libraryPath = () => join(app.getPath('userData'), 'fabricator', 'models')
const slotPath = (slot: number) => join(libraryPath(), `slot-${slot}`)
const fabricatorModelCatalog = new FabricatorModelCatalog(slotCount, slotPath, { readFile, readAssetImage })
const poseLibraryPath = () => join(app.getPath('userData'), 'fabricator', 'poses')
const poseModelPath = (modelSlot: number) => join(poseLibraryPath(), `model-${modelSlot}`)
const poseSlotPath = (modelSlot: number, slot: number) => join(poseModelPath(modelSlot), `slot-${slot}`)
const poseDraftPath = (modelSlot: number) => join(poseModelPath(modelSlot), 'draft')
const animatorLibraryPath = () => join(app.getPath('userData'), 'fabricator', 'animations')
const animatorModelPath = (modelSlot: number) => join(animatorLibraryPath(), `model-${modelSlot}`)
const animatorSlotPath = (modelSlot: number, slot: number) => join(animatorModelPath(modelSlot), `slot-${slot}`)
const animatorDraftPath = (modelSlot: number) => join(animatorModelPath(modelSlot), 'draft')
const wardrobeLibraryPath = () => join(app.getPath('userData'), 'fabricator', 'wardrobe')
const wardrobeModelPath = (modelSlot: number) => join(wardrobeLibraryPath(), `model-${modelSlot}`)
const wardrobeSetPath = (modelSlot: number, id: string) => join(wardrobeModelPath(modelSlot), `set-${id}`)
const faceModelPath = (modelSlot: number) => join(app.getPath('userData'), 'fabricator', 'faces', `model-${modelSlot}`)
const faceSetPath = (modelSlot: number, id: string) => join(faceModelPath(modelSlot), `set-${id}`)
const faceCatalogPath = (modelSlot: number) => join(faceModelPath(modelSlot), 'catalog')
const faceCatalogItemPath = (modelSlot: number, id: string) => join(faceCatalogPath(modelSlot), `item-${id}`)
const faceExpressionPresetPath = (modelSlot: number, id: string) => join(app.getPath('userData'), 'fabricator', 'expression-presets', `model-${modelSlot}`, `preset-${id}.json`)
const faceExpressionCollectionsPath = (modelSlot: number) => join(app.getPath('userData'), 'fabricator', 'expression-presets', `model-${modelSlot}`, 'collections.json')
const faceExpressionWorkspaceDraftPath = (modelSlot: number) => join(app.getPath('userData'), 'fabricator', 'expression-presets', `model-${modelSlot}`, 'workspace-draft.json')
const faceComponentPath = (modelSlot: number) => join(app.getPath('userData'), 'fabricator', 'face-components', `model-${modelSlot}`)
const faceComponentItemPath = (modelSlot: number, id: string) => join(faceComponentPath(modelSlot), `item-${id}`)
const hairModelPath = (modelSlot: number) => join(app.getPath('userData'), 'fabricator', 'hair', `model-${modelSlot}`)
const hairStylePath = (modelSlot: number, id: string) => join(hairModelPath(modelSlot), 'styles', `style-${id}`)
const characterLibraryPath = () => join(app.getPath('userData'), 'customizer', 'characters')
const studioLibraryPath = (workspace: 'studio' | 'video' = 'studio') => join(app.getPath('userData'), 'studios', workspace === 'video' ? 'Editor Gacha' : 'Studio Principal')
const studioPath = (id: string) => join(studioLibraryPath('studio'), `studio-${id}`)
const editorV6LibraryPath = () => join(app.getPath('userData'), 'studios', 'Editor V6')
const editorV6Path = (id: string) => join(editorV6LibraryPath(), `editorV6-${id}`)
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
let editorV6SaveQueue: Promise<void> = Promise.resolve()
const characterManifestPath = () => join(characterLibraryPath(), 'characters.json')
let poseSaveQueue: Promise<void> = Promise.resolve()
const poseSaveWrites = new Set<Promise<void>>()
let poseMigration: Promise<void> | null = null
let faceGuideIpc: ReturnType<typeof registerFaceGuideHandlers> | null = null
let fabricatorFaceCatalogIpc: ReturnType<typeof registerFabricatorFaceCatalogHandlers> | null = null
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

const isValidWardrobeId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)
const isValidFaceCatalogId = (id: string) => /^[a-zA-Z0-9_-]{1,120}$/.test(id)
const faceSheetKinds: FaceSheetKind[] = ['eyes', 'eyebrows', 'nose', 'mouth-closed', 'mouth-open']
const faceElementKinds: FaceElementKind[] = ['eye-left', 'eye-right', 'brow-left', 'brow-right', 'nose', 'mouth']

function validFaceSet(modelSlot: number, set: FaceSetSave): boolean {
  if (!isValidModelSlot(modelSlot) || set?.schemaVersion !== 1 || set.modelSlot !== modelSlot || !isValidWardrobeId(set.id)
    || typeof set.name !== 'string' || !set.name.trim() || set.name.length > 80
    || !Array.isArray(set.pieces) || set.pieces.length > 60 || !set.sheets || typeof set.sheets !== 'object'
    || !set.transforms || typeof set.transforms !== 'object') return false
  const ids = new Set<string>()
  for (const piece of set.pieces) {
    if (!isValidWardrobeId(piece.id) || ids.has(piece.id) || !faceSheetKinds.includes(piece.sheet)
      || !Number.isInteger(piece.index) || piece.index < 0 || piece.index > 20
      || (piece.side !== undefined && piece.side !== 'left' && piece.side !== 'right')
      || !piece.crop || ![piece.crop.x, piece.crop.y, piece.crop.width, piece.crop.height, piece.width, piece.height].every(Number.isFinite)
      || piece.crop.width <= 0 || piece.crop.height <= 0 || piece.width <= 0 || piece.height <= 0) return false
    ids.add(piece.id)
  }
  for (const [kind, sheet] of Object.entries(set.sheets)) {
    if (!faceSheetKinds.includes(kind as FaceSheetKind) || !sheet || !Number.isFinite(sheet.width)
      || !Number.isFinite(sheet.height) || sheet.width <= 0 || sheet.height <= 0 || sheet.width * sheet.height > 32_000_000
      || !Number.isFinite(sheet.tolerance) || sheet.tolerance < 0 || sheet.tolerance > 280) return false
  }
  for (const kind of faceElementKinds) {
    const transform = set.transforms[kind]
    if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      || transform.scaleX <= 0 || transform.scaleY <= 0) return false
  }
  return Number.isInteger(set.selectedNose) && set.selectedNose >= 0 && set.selectedNose <= 5
    && Number.isInteger(set.selectedExpression) && set.selectedExpression >= 0 && set.selectedExpression <= 20
    && typeof set.eyeLinked === 'boolean' && typeof set.browLinked === 'boolean'
}

function validFaceExpressionPreset(modelSlot: number, preset: FaceExpressionPreset): boolean {
  const validTransform = (transform: unknown) => {
    if (!transform || typeof transform !== 'object') return false
    const candidate = transform as FaceTransform
    return [candidate.x, candidate.y, candidate.scaleX, candidate.scaleY, candidate.rotation].every(Number.isFinite)
      && candidate.scaleX > 0 && candidate.scaleX <= 20 && candidate.scaleY > 0 && candidate.scaleY <= 20
      && (candidate.flipX === undefined || typeof candidate.flipX === 'boolean')
  }
  const selections = preset?.selections
  const validSideSelections = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const candidate = value as Record<string, unknown>
    return ['left', 'right'].every((side) => candidate[side] === null || typeof candidate[side] === 'string' && isValidWardrobeId(candidate[side] as string))
  }
  const validCatalogSelection = (value: unknown, kinds: string[]) => {
    if (value === null) return true
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const candidate = value as Record<string, unknown>
    return typeof candidate.catalogId === 'string' && isValidFaceCatalogId(candidate.catalogId)
      && Number.isInteger(candidate.index) && (candidate.index as number) >= 0 && (candidate.index as number) <= 20
      && (candidate.kind === undefined || kinds.includes(String(candidate.kind)))
  }
  return isValidModelSlot(modelSlot) && !!preset && preset.schemaVersion === 1 && preset.modelSlot === modelSlot
    && isValidWardrobeId(preset.id) && typeof preset.name === 'string' && Boolean(preset.name.trim()) && preset.name.length <= 80
    && ((preset.collectionId === undefined && preset.expressionIndex === undefined)
      || (typeof preset.collectionId === 'string' && isValidWardrobeId(preset.collectionId)
        && Number.isInteger(preset.expressionIndex) && (preset.expressionIndex as number) >= 0 && (preset.expressionIndex as number) <= 999))
    && typeof preset.updatedAt === 'string' && Number.isFinite(Date.parse(preset.updatedAt))
    && !!selections && validSideSelections(selections.eyes) && validSideSelections(selections.pupils)
    && (selections.eyebrows === undefined || validSideSelections(selections.eyebrows))
    && validCatalogSelection(selections.nose, ['nose'])
    && validCatalogSelection(selections.mouth, ['mouth-closed', 'mouth-open'])
    && !!preset.transforms && (['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'nose', 'mouth'] as Array<keyof FaceExpressionTransforms>).every((key) => validTransform(preset.transforms[key]))
    && (preset.transforms.browLeft === undefined || validTransform(preset.transforms.browLeft))
    && (preset.transforms.browRight === undefined || validTransform(preset.transforms.browRight))
    && (preset.referenceTransforms === undefined || Object.values(preset.referenceTransforms).every(validTransform))
    && (preset.portableMotion === undefined || isPortableExpressionMotion(preset.portableMotion))
    && (preset.ptPupils === undefined || isPtPupilOverrides(preset.ptPupils))
    && (preset.ptPupilMotion === undefined || isPtPupilMotion(preset.ptPupilMotion))
    && Number.isFinite(preset.noseOpacity) && preset.noseOpacity >= 0 && preset.noseOpacity <= 1
    && (preset.effects === undefined || isStudioExpressionEffects(preset.effects))
}

function validFaceExpressionWorkspaceDraft(modelSlot: number, draft: FaceExpressionWorkspaceDraft): boolean {
  if (!isValidModelSlot(modelSlot) || !draft || draft.schemaVersion !== 1 || draft.modelSlot !== modelSlot
    || !(draft.selectedCollectionId === 'standard' || isValidWardrobeId(draft.selectedCollectionId))
    || !Number.isInteger(draft.selectedExpressionIndex) || draft.selectedExpressionIndex < 0 || draft.selectedExpressionIndex > 999
    || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt))) return false
  const validEntry = (entry: FaceExpressionWorkspaceDraft['current'], collectionId: string, expressionIndex: number): boolean => {
    if (!entry || typeof entry !== 'object') return false
    return validFaceExpressionPreset(modelSlot, {
      schemaVersion: 1, id: entry.id, modelSlot, name: 'Rascunho', collectionId,
      expressionIndex, selections: entry.selections, transforms: entry.transforms, ptPupils: entry.ptPupils,
      noseOpacity: entry.noseOpacity, effects: entry.effects, updatedAt: draft.updatedAt
    })
  }
  if (!validEntry(draft.current, draft.selectedCollectionId, draft.selectedExpressionIndex) || !draft.workingCopies || typeof draft.workingCopies !== 'object' || Array.isArray(draft.workingCopies)
    || Object.keys(draft.workingCopies).length > 1000 || !draft.customExpressionNames || typeof draft.customExpressionNames !== 'object'
    || Array.isArray(draft.customExpressionNames) || Object.keys(draft.customExpressionNames).length > 1000) return false
  for (const [key, entry] of Object.entries(draft.workingCopies)) {
    const separator = key.lastIndexOf(':')
    const collectionId = key.slice(0, separator)
    const index = Number(key.slice(separator + 1))
    if (separator < 1 || !(collectionId === 'standard' || isValidWardrobeId(collectionId)) || !Number.isInteger(index) || index < 0 || index > 999) return false
    if (!validEntry(entry, collectionId, index)) return false
  }
  for (const [key, name] of Object.entries(draft.customExpressionNames)) {
    if (!/^.{1,80}:\d{1,3}$/.test(key) || typeof name !== 'string' || !name.trim() || name.length > 80) return false
  }
  return true
}

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

async function writeFaceSet(modelSlot: number, set: FaceSetSave, assets: FaceAssetSave[]): Promise<void> {
  invalidateCatalogPng('face', `${modelSlot}:set:${set.id}`)
  if (!validFaceSet(modelSlot, set)) throw new Error('Rosto inválido.')
  const expected = new Set([...set.pieces.map(piece => piece.id), ...Object.keys(set.sheets).map(kind => `sheet-${kind}`)])
  if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens do rosto inválidas.')
  const folder = faceSetPath(modelSlot, set.id)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: join(folder, 'images'), manifestName: 'face.json', manifest: set,
    images: assets.map(asset => ({ id: asset.id, bytes: dataUrlBuffer(asset.dataUrl) })),
    expected, prune: 'all'
  })
}

async function readFaceSet(modelSlot: number, id: string): Promise<FaceSet | null> {
  if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Rosto inválido.')
  try {
    const folder = faceSetPath(modelSlot, id)
    await catalogPersistence.recoverCatalogManifest(folder, join(folder, 'images'))
    const set = JSON.parse(await readFile(join(folder, 'face.json'), 'utf8')) as FaceSetSave
    if (!inspectFabricatorStorage('face', set).compatible) return null
    if (!validFaceSet(modelSlot, set) || set.id !== id) return null
    const version = set.updatedAt
    const identity = `${modelSlot}:set:${id}`
    const sheets = { ...set.sheets } as FaceSet['sheets']
    for (const kind of faceSheetKinds) if (sheets[kind]) sheets[kind] = { ...sheets[kind], dataUrl: `data:image/png;base64,${(await readCatalogPng('face', identity, version, join(folder, 'images', `sheet-${kind}.png`))).toString('base64')}` }
    const pieces = await Promise.all(set.pieces.map(async (piece) => ({ ...piece, dataUrl: `data:image/png;base64,${(await readCatalogPng('face', identity, version, join(folder, 'images', `${piece.id}.png`))).toString('base64')}` })))
    return { ...set, sheets, pieces }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

function validFaceCatalogItem(modelSlot: number, item: FaceCatalogItemSave): boolean {
  const requiredElements: Record<FaceSheetKind, FaceElementKind[]> = {
    eyes: ['eye-left', 'eye-right'], eyebrows: ['brow-left', 'brow-right'], nose: ['nose'],
    'mouth-closed': ['mouth'], 'mouth-open': ['mouth']
  }
  if (!isValidModelSlot(modelSlot) || item?.schemaVersion !== 1 || item.modelSlot !== modelSlot || !isValidFaceCatalogId(item.id)
    || !faceSheetKinds.includes(item.category) || item.sheet?.kind !== item.category
    || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120
    || !Array.isArray(item.pieces) || item.pieces.length > 60 || !item.transforms || typeof item.transforms !== 'object'
    || !Number.isFinite(item.sheet.width) || !Number.isFinite(item.sheet.height) || item.sheet.width <= 0 || item.sheet.height <= 0
    || item.sheet.width * item.sheet.height > 32_000_000 || !Number.isFinite(item.sheet.tolerance) || item.sheet.tolerance < 0 || item.sheet.tolerance > 280) return false
  const ids = new Set<string>()
  for (const piece of item.pieces) {
    if (!isValidWardrobeId(piece.id) || ids.has(piece.id) || piece.sheet !== item.category
      || !Number.isInteger(piece.index) || piece.index < 0 || piece.index > 20
      || (piece.side !== undefined && piece.side !== 'left' && piece.side !== 'right')
      || !piece.crop || ![piece.crop.x, piece.crop.y, piece.crop.width, piece.crop.height, piece.width, piece.height].every(Number.isFinite)
      || piece.crop.width <= 0 || piece.crop.height <= 0 || piece.width <= 0 || piece.height <= 0) return false
    ids.add(piece.id)
  }
  for (const element of requiredElements[item.category]) {
    const transform = item.transforms[element]
    if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      || transform.scaleX <= 0 || transform.scaleY <= 0) return false
  }
  return typeof item.eyeLinked === 'boolean' && typeof item.browLinked === 'boolean'
    && (item.opacity === undefined || item.category === 'nose' && Number.isFinite(item.opacity) && item.opacity >= 0 && item.opacity <= 1)
    && Number.isInteger(item.selectedNose) && item.selectedNose >= 0 && item.selectedNose <= 5
    && Number.isInteger(item.selectedExpression) && item.selectedExpression >= 0 && item.selectedExpression <= 20
    && typeof item.updatedAt === 'string'
}

async function writeFaceCatalogItem(modelSlot: number, item: FaceCatalogItemSave, assets: FaceAssetSave[]): Promise<void> {
  invalidateCatalogPng('face', `${modelSlot}:catalog:${item.id}`)
  if (!validFaceCatalogItem(modelSlot, item)) throw new Error('Peça facial inválida.')
  const expected = new Set([`sheet-${item.category}`, ...item.pieces.map(piece => piece.id)])
  if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens da peça facial inválidas.')
  const folder = faceCatalogItemPath(modelSlot, item.id)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: join(folder, 'images'), manifestName: 'item.json', manifest: item,
    images: assets.map(asset => ({ id: asset.id, bytes: dataUrlBuffer(asset.dataUrl) })),
    expected, prune: 'all'
  })
}

function legacyFaceCatalogId(id: string): { setId: string; category: FaceSheetKind } | null {
  if (!id.startsWith('legacy_')) return null
  for (const category of faceSheetKinds) {
    const suffix = `_${category}`
    if (id.endsWith(suffix)) {
      const setId = id.slice('legacy_'.length, -suffix.length)
      if (isValidWardrobeId(setId)) return { setId, category }
    }
  }
  return null
}

async function readFaceCatalogItem(modelSlot: number, id: string): Promise<FaceCatalogItem | null> {
  if (!isValidModelSlot(modelSlot) || !isValidFaceCatalogId(id)) throw new Error('Peça facial inválida.')
  try {
    const folder = faceCatalogItemPath(modelSlot, id)
    await catalogPersistence.recoverCatalogManifest(folder, join(folder, 'images'))
    const item = JSON.parse(await readFile(join(folder, 'item.json'), 'utf8')) as FaceCatalogItemSave
    if (!inspectFabricatorStorage('face-catalog', item).compatible) return null
    if (!validFaceCatalogItem(modelSlot, item) || item.id !== id) return null
    const identity = `${modelSlot}:catalog:${id}`
    const version = item.updatedAt
    const sheet = { ...item.sheet, dataUrl: `data:image/png;base64,${(await readCatalogPng('face', identity, version, join(folder, 'images', `sheet-${item.category}.png`))).toString('base64')}` }
    const pieces = await Promise.all(item.pieces.map(async (piece) => ({ ...piece, dataUrl: `data:image/png;base64,${(await readCatalogPng('face', identity, version, join(folder, 'images', `${piece.id}.png`))).toString('base64')}` })))
    return { ...item, sheet, pieces }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    const legacy = legacyFaceCatalogId(id)
    if (!legacy) return null
    const set = await readFaceSet(modelSlot, legacy.setId)
    const sheet = set?.sheets[legacy.category]
    if (!set || !sheet) return null
    const elements: FaceElementKind[] = legacy.category === 'eyes' ? ['eye-left', 'eye-right'] : legacy.category === 'eyebrows' ? ['brow-left', 'brow-right'] : legacy.category === 'nose' ? ['nose'] : ['mouth']
    return {
      schemaVersion: 1, id, modelSlot, category: legacy.category, name: sheet.name.replace(/\.[^.]+$/, ''), sheet,
      pieces: set.pieces.filter((piece) => piece.sheet === legacy.category),
      transforms: Object.fromEntries(elements.map((element) => [element, set.transforms[element]])),
      eyeLinked: set.eyeLinked, browLinked: set.browLinked, selectedNose: set.selectedNose,
      selectedExpression: set.selectedExpression, updatedAt: set.updatedAt
    }
  }
}

async function listFaceCatalogItems(modelSlot: number): Promise<FaceCatalogItemSummary[]> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  const items = new Map<string, FaceCatalogItemSummary>()
  try {
    for (const entry of await readdir(faceCatalogPath(modelSlot), { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^item-[a-zA-Z0-9_-]{1,120}$/.test(entry.name)) continue
      const folder = join(faceCatalogPath(modelSlot), entry.name)
      await catalogPersistence.recoverCatalogManifest(folder, join(folder, 'images'))
      try {
        const item = JSON.parse(await readFile(join(folder, 'item.json'), 'utf8')) as FaceCatalogItemSave
        if (validFaceCatalogItem(modelSlot, item) && item.id === entry.name.slice(5)) items.set(item.id, { id: item.id, modelSlot, category: item.category, name: item.name, updatedAt: item.updatedAt, pieceCount: item.pieces.length })
      } catch { /* Incomplete catalog items are hidden. */ }
    }
  } catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
  // Surface old complete face saves as category items until the user edits or saves them individually.
  try {
    for (const entry of await readdir(faceModelPath(modelSlot), { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^set-[a-zA-Z0-9_-]{1,80}$/.test(entry.name)) continue
      const setId = entry.name.slice(4)
      const folder = join(faceModelPath(modelSlot), entry.name)
      await catalogPersistence.recoverCatalogManifest(folder, join(folder, 'images'))
      try {
        const set = JSON.parse(await readFile(join(folder, 'face.json'), 'utf8')) as FaceSetSave
        if (!validFaceSet(modelSlot, set) || set.id !== setId) continue
        for (const category of faceSheetKinds) {
          const sheet = set.sheets[category]
          if (!sheet) continue
          const id = `legacy_${setId}_${category}`
          if (items.has(id)) continue
          items.set(id, { id, modelSlot, category, name: sheet.name.replace(/\.[^.]+$/, ''), updatedAt: set.updatedAt, pieceCount: set.pieces.filter((piece) => piece.sheet === category).length })
        }
      } catch { /* Invalid legacy sets do not enter the new catalog. */ }
    }
  } catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
  return [...items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function validFaceComponentAsset(modelSlot: number, asset: FaceComponentAssetSave): boolean {
  const transform = asset?.defaultTransform
  return isValidModelSlot(modelSlot) && asset?.schemaVersion === 1 && asset.modelSlot === modelSlot
    && isValidWardrobeId(asset.id) && ['eye', 'pupil', 'eye-closed', 'eyebrow', 'eye-highlight-left', 'eye-highlight-right', 'blush', 'facial-shadow', 'head-extra'].includes(asset.kind)
    && typeof asset.name === 'string' && asset.name.trim().length > 0 && asset.name.length <= 120
    && Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0 && asset.width * asset.height <= 32_000_000
    && (asset.rightSidePositioned === undefined || typeof asset.rightSidePositioned === 'boolean')
    && (asset.pairId === undefined || isValidWardrobeId(asset.pairId))
    && Boolean(transform) && [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
    && (transform.flipX === undefined || typeof transform.flipX === 'boolean')
    && transform.scaleX > 0 && transform.scaleY > 0 && transform.scaleX <= 20 && transform.scaleY <= 20
    && typeof asset.updatedAt === 'string'
}

async function listFaceComponentAssets(modelSlot: number, kind?: FaceAssetKind): Promise<FaceComponentAssetSummary[]> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  const directory = faceComponentPath(modelSlot)
  const output: FaceComponentAssetSummary[] = []
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^item-[a-zA-Z0-9_-]{1,120}$/.test(entry.name)) continue
      const folder = join(directory, entry.name)
      await catalogPersistence.recoverCatalogManifest(folder, folder)
      try {
        const asset = JSON.parse(await readFile(join(folder, 'asset.json'), 'utf8')) as FaceComponentAssetSave
        if (!validFaceComponentAsset(modelSlot, asset) || asset.id !== entry.name.slice(5) || kind && asset.kind !== kind) continue
        const { defaultTransform: _transform, ...summary } = asset
        output.push(summary)
      } catch { /* Hide incomplete component assets. */ }
    }
  } catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
  return output.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function readFaceComponentAsset(modelSlot: number, id: string): Promise<FaceComponentAsset | null> {
  if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Asset facial inválido.')
  try {
    const folder = faceComponentItemPath(modelSlot, id)
    await catalogPersistence.recoverCatalogManifest(folder, folder)
    const asset = JSON.parse(await readFile(join(folder, 'asset.json'), 'utf8')) as FaceComponentAssetSave
    if (!inspectFabricatorStorage('face-component', asset).compatible) return null
    if (!validFaceComponentAsset(modelSlot, asset) || asset.id !== id) return null
    const dataUrl = `data:image/png;base64,${(await readCatalogPng('face', `${modelSlot}:component:${id}`, asset.updatedAt, join(folder, 'asset.png'))).toString('base64')}`
    return { ...asset, dataUrl }
  } catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null; throw reason }
}

async function writeFaceComponentAsset(modelSlot: number, asset: FaceComponentAssetSave, dataUrl: string): Promise<void> {
  invalidateCatalogPng('face', `${modelSlot}:component:${asset.id}`)
  if (!validFaceComponentAsset(modelSlot, asset) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Asset facial inválido; use uma imagem PNG.')
  const folder = faceComponentItemPath(modelSlot, asset.id)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: folder, manifestName: 'asset.json', manifest: asset,
    images: [{ id: 'asset', bytes: dataUrlBuffer(dataUrl) }], expected: new Set(['asset'])
  })
}

function validHairWorkspace(modelSlot: number, workspace: HairWorkspaceSave): boolean {
  if (!isValidModelSlot(modelSlot) || workspace?.schemaVersion !== 1 || workspace.modelSlot !== modelSlot || !workspace.transforms) return false
  for (const side of ['front', 'back', 'fringe'] as const) {
    const category = workspace.categoryBySide?.[side]
    if (category !== undefined && !hairCategories.some((item) => item.id === category && item.side === side)) return false
  }
  for (const side of ['front', 'back', 'fringe'] as const) {
    const asset = workspace[side]
    const transform = workspace.transforms[side]
    if (side === 'fringe' && !asset && !transform) continue
    if (asset && (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 32_000_000)) return false
    if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      || Math.abs(transform.x) > 100_000 || Math.abs(transform.y) > 100_000 || transform.scaleX <= 0 || transform.scaleY <= 0 || transform.scaleX > 20 || transform.scaleY > 20
      || (transform.flipX !== undefined && typeof transform.flipX !== 'boolean')) return false
  }
  if (workspace.chromaTolerance !== undefined && (!Number.isFinite(workspace.chromaTolerance) || workspace.chromaTolerance < 0 || workspace.chromaTolerance > 100)) return false
  if (workspace.chromaMode !== undefined && !['auto', 'green', 'checker'].includes(workspace.chromaMode)) return false
  if (workspace.sourceImageSaved !== undefined && typeof workspace.sourceImageSaved !== 'boolean') return false
  if (workspace.sourceAppliesToDraft !== undefined && typeof workspace.sourceAppliesToDraft !== 'boolean') return false
  return typeof workspace.updatedAt === 'string'
}

async function writeHairWorkspace(modelSlot: number, workspace: HairWorkspaceSave, assets: HairWorkspaceAsset[]): Promise<void> {
  invalidateCatalogPng('hair', `${modelSlot}:workspace`)
  if (!validHairWorkspace(modelSlot, workspace)) throw new Error('Configuração de cabelo inválida.')
  const expected = new Set<string>((['front', 'back', 'fringe'] as const).filter(side => workspace[side] != null))
  if (workspace.sourceImageSaved) expected.add('source')
  if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens de cabelo inválidas.')
  const folder = hairModelPath(modelSlot)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: join(folder, 'images'), manifestName: 'hair.json', manifest: workspace,
    images: assets.map(asset => ({ id: asset.id, bytes: dataUrlBuffer(asset.dataUrl) })),
    expected, prune: ['front', 'back', 'fringe', 'source'],
    missingMessage: id => `Imagem de cabelo ausente: ${id}.`
  })
}

async function readHairWorkspace(modelSlot: number): Promise<HairWorkspace | null> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  try {
    const folder = hairModelPath(modelSlot)
    await catalogPersistence.recoverCatalogManifest(folder, join(folder, 'images'))
    const saved = JSON.parse(await readFile(join(folder, 'hair.json'), 'utf8')) as HairWorkspaceSave
    if (!inspectFabricatorStorage('hair', saved).compatible) return null
    if (!validHairWorkspace(modelSlot, saved)) return null
    const identity = `${modelSlot}:workspace`
    const version = saved.updatedAt
    const loadPart = async (side: 'front' | 'back' | 'fringe') => saved[side]
      ? { ...saved[side]!, dataUrl: `data:image/png;base64,${(await readCatalogPng('hair', identity, version, join(folder, 'images', `${side}.png`))).toString('base64')}` }
      : null
    let sourceImageDataUrl: string | undefined
    if (saved.sourceImageSaved) {
      try { sourceImageDataUrl = `data:image/png;base64,${(await readCatalogPng('hair', identity, version, join(folder, 'images', 'source.png'))).toString('base64')}` }
      catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
    }
    return { ...saved, front: await loadPart('front'), back: await loadPart('back'), fringe: await loadPart('fringe'), ...(sourceImageDataUrl ? { sourceImageDataUrl } : {}) }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

async function clearHairWorkspace(modelSlot: number): Promise<void> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  const folder = hairModelPath(modelSlot)
  const images = join(folder, 'images')
  // Recover or reject a pending write before removing its journal and duplicate assets.
  await catalogPersistence.recoverCatalogManifest(folder, images)
  await rm(join(folder, 'hair.json'), { force: true })
  await rm(join(folder, 'hair.json.tmp'), { force: true })
  await rm(join(folder, 'hair.json.backup'), { force: true })
  await rm(images, { recursive: true, force: true })
}

type LegacyHairCatalogState = 'active' | 'dismissed' | null
const legacyHairCatalogStatePath = (modelSlot: number) => join(hairModelPath(modelSlot), 'hair-legacy-catalog-state-v1')

async function readLegacyHairCatalogState(modelSlot: number): Promise<LegacyHairCatalogState> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  try {
    const state = (await readFile(legacyHairCatalogStatePath(modelSlot), 'utf8')).trim()
    if (state === 'active' || state === 'dismissed') return state
    throw new Error('Estado de catálogo legado de cabelo inválido.')
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

async function writeLegacyHairCatalogState(modelSlot: number, state: Exclude<LegacyHairCatalogState, null>): Promise<void> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  const folder = hairModelPath(modelSlot)
  await mkdir(folder, { recursive: true })
  const previous = await readLegacyHairCatalogState(modelSlot)
  const next = state === 'active' && previous === 'dismissed' ? 'dismissed' : state
  await writeFile(legacyHairCatalogStatePath(modelSlot), next, 'utf8')
}

function validHairStyle(modelSlot: number, style: HairStyleSave): boolean {
  if (!isValidModelSlot(modelSlot) || style?.schemaVersion !== 1 || style.modelSlot !== modelSlot || !isValidWardrobeId(style.id)
    || typeof style.name !== 'string' || !style.name.trim() || style.name.length > 80 || !style.transforms) return false
  if (!style.front && !style.back && !style.fringe) return false
  if (style.category !== undefined) {
    const category = hairCategories.find((item) => item.id === style.category)
    if (!category || !style[category.side]) return false
  }
  if (style.categoryBySide !== undefined && (!style.categoryBySide || Array.isArray(style.categoryBySide) || typeof style.categoryBySide !== 'object')) return false
  if (style.categoryBySide !== undefined) {
    for (const side of ['front', 'back', 'fringe'] as const) {
      const categoryId = style.categoryBySide[side]
      if (categoryId !== undefined && !hairCategories.some((item) => item.id === categoryId && item.side === side)) return false
      if (categoryId !== undefined && !style[side]) return false
    }
  }
  if (style.sourceImageSaved !== undefined && typeof style.sourceImageSaved !== 'boolean') return false
  if (style.sourceAppliesToDraft !== undefined && typeof style.sourceAppliesToDraft !== 'boolean') return false
  if (style.sourceAppliesToDraft === true && style.sourceImageSaved !== true) return false
  if (style.chromaTolerance !== undefined && (!Number.isFinite(style.chromaTolerance) || style.chromaTolerance < 0 || style.chromaTolerance > 100)) return false
  if (style.chromaMode !== undefined && !['auto', 'green', 'checker'].includes(style.chromaMode)) return false
  for (const side of ['front', 'back', 'fringe'] as const) {
    const asset = style[side]
    const transform = style.transforms[side]
    if (side === 'fringe' && !asset && !transform) continue
    if (asset && (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 32_000_000)) return false
    if (!transform || ![transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      || Math.abs(transform.x) > 100_000 || Math.abs(transform.y) > 100_000 || transform.scaleX <= 0 || transform.scaleY <= 0 || transform.scaleX > 20 || transform.scaleY > 20
      || (transform.flipX !== undefined && typeof transform.flipX !== 'boolean')) return false
  }
  return typeof style.createdAt === 'string' && typeof style.updatedAt === 'string'
}

async function writeHairStyle(modelSlot: number, style: HairStyleSave, assets: HairStyleAsset[]): Promise<void> {
  invalidateCatalogPng('hair', `${modelSlot}:style:${style.id}`)
  if (!validHairStyle(modelSlot, style)) throw new Error('Estilo de cabelo inválido.')
  const expected = new Set<string>((['front', 'back', 'fringe'] as const).filter(side => style[side] != null))
  if (style.sourceImageSaved) expected.add('source')
  if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens do cabelo inválidas.')
  const folder = hairStylePath(modelSlot, style.id)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: join(folder, 'images'), manifestName: 'hair-style.json', manifest: style,
    images: assets.map(asset => ({ id: asset.id, bytes: dataUrlBuffer(asset.dataUrl) })),
    expected, prune: ['front', 'back', 'fringe', 'source'],
    missingMessage: id => `Imagem de cabelo ausente: ${id}.`
  })
}

async function readHairStyle(modelSlot: number, id: string, includeSource = false): Promise<HairStyle | null> {
  if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Estilo de cabelo inválido.')
  try {
    const folder = hairStylePath(modelSlot, id)
    await catalogPersistence.recoverCatalogManifest(folder, join(folder, 'images'))
    const saved = JSON.parse(await readFile(join(folder, 'hair-style.json'), 'utf8')) as HairStyleSave
    if (!inspectFabricatorStorage('hair-style', saved).compatible) return null
    if (!validHairStyle(modelSlot, saved) || saved.id !== id) return null
    const identity = `${modelSlot}:style:${id}`
    const version = saved.updatedAt
    const loadPart = async (side: 'front' | 'back' | 'fringe') => saved[side]
      ? { ...saved[side]!, dataUrl: `data:image/png;base64,${(await readCatalogPng('hair', identity, version, join(folder, 'images', `${side}.png`))).toString('base64')}` }
      : null
    const sourceImageDataUrl = includeSource && saved.sourceImageSaved
      ? `data:image/png;base64,${(await readCatalogPng('hair', identity, version, join(folder, 'images', 'source.png'))).toString('base64')}`
      : undefined
    return { ...saved, front: await loadPart('front'), back: await loadPart('back'), fringe: await loadPart('fringe'), ...(sourceImageDataUrl ? { sourceImageDataUrl } : {}) }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') {
      if (id === 'legacy-workspace') {
        if (await readLegacyHairCatalogState(modelSlot) === 'dismissed') return null
        try { await access(join(hairModelPath(modelSlot), 'hair-style-migration-v1')); return null }
        catch(markerError) { if ((markerError as NodeJS.ErrnoException).code !== 'ENOENT') throw markerError }
        return legacyHairStyle(modelSlot,await readHairWorkspace(modelSlot))
      }
      return null
    }
    throw reason
  }
}

// Assets versionados são usados apenas nas bibliotecas oficiais; rascunhos não entram em cache.
const catalogAssets = new FabricatorCatalogAssetService(readAssetImage)
function readCatalogPng(namespace: AssetNamespace, identity: string, version: string, imagePath: string): Promise<Buffer> {
  return catalogAssets.read(namespace, identity, version, imagePath)
}
function invalidateCatalogPng(namespace: AssetNamespace, identity: string): void {
  catalogAssets.invalidate(namespace, identity)
}

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

function ensureLegacyPoseMigration(): Promise<void> {
  if (poseMigration) return poseMigration
  poseMigration = (async () => {
    const root = poseLibraryPath()
    for (let slot = 1; slot <= poseSlotCount; slot += 1) {
      const legacyFolder = join(root, `slot-${slot}`)
      try {
        const project = JSON.parse(await readFile(join(legacyFolder, 'pose.json'), 'utf8')) as FabricatorPoseSave
        if (!isValidModelSlot(project.sourceModelSlot)) continue
        const destination = poseSlotPath(project.sourceModelSlot, slot)
        try { await access(join(destination, 'pose.json')) } catch {
          await mkdir(dirname(destination), { recursive: true })
          await rename(legacyFolder, destination)
        }
      } catch (reason) {
        if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      }
    }
    const legacyDraft = join(root, 'draft')
    try {
      const draft = JSON.parse(await readFile(join(legacyDraft, 'draft.json'), 'utf8')) as FabricatorPoseDraftSave
      const modelSlot = draft.project.sourceModelSlot
      if (!isValidModelSlot(modelSlot)) return
      const destination = poseDraftPath(modelSlot)
      try { await access(join(destination, 'draft.json')) } catch {
        await mkdir(dirname(destination), { recursive: true })
        await rename(legacyDraft, destination)
      }
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    }
  })()
  return poseMigration
}

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

function isStudioDocument(value: unknown): value is StudioDocument {
  if (!value || typeof value !== 'object') return false
  const studio = value as Partial<StudioDocument>
  const assets = studio.assets
  const elements = studio.elements
  return studio.schemaVersion === 1
    && typeof studio.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studio.id)
    && typeof studio.title === 'string' && studio.title.trim().length > 0 && studio.title.length <= 100
    && typeof studio.color === 'string' && /^(#[0-9a-f]{6}|hsl\([\d.]+\s+[\d.]+%\s+[\d.]+%\))$/i.test(studio.color)
    && typeof studio.createdAt === 'string' && Number.isFinite(Date.parse(studio.createdAt))
    && typeof studio.updatedAt === 'string' && Number.isFinite(Date.parse(studio.updatedAt))
    && typeof studio.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(studio.backgroundColor)
    && (studio.backgroundAssetId === null || typeof studio.backgroundAssetId === 'string')
    && (studio.thumbnailDataUrl === undefined || typeof studio.thumbnailDataUrl === 'string' && /^data:image\/(jpeg|png);base64,/.test(studio.thumbnailDataUrl) && studio.thumbnailDataUrl.length <= 1_500_000)
    && [studio.backgroundX, studio.backgroundY, studio.backgroundWidth, studio.backgroundHeight, studio.backgroundRotation].every(Number.isFinite)
    && Array.isArray(assets) && assets.length <= 500
    && assets.every((asset) => isStudioAsset(asset))
    && Array.isArray(elements) && elements.length <= 1000
    && (studio.backgroundAssetId === null || assets.some((asset) => asset.id === studio.backgroundAssetId && asset.category === 'background'))
    && elements.every((element) => Boolean(element && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(element.id) && typeof element.text === 'string'
      && ['image', 'character', 'narrator', 'speech', 'thought'].includes(element.kind)
      && isStudioFaceTransforms(element.faceTransforms)
      && (element.expressionBase === undefined || Boolean(element.expressionBase && element.expressionBase.appearance && isValidCustomizerFaceAppearance(element.expressionBase.appearance)
        && element.expressionBase.transforms && isStudioFaceTransforms(element.expressionBase.transforms)))
      && (element.activeExpressionPresetId === undefined || element.activeExpressionPresetId === null || typeof element.activeExpressionPresetId === 'string' && isValidWardrobeId(element.activeExpressionPresetId))
      && isStudioExpressionEffects(element.activeExpressionEffects)
      && (element.activeExpressionCollectionId === undefined || typeof element.activeExpressionCollectionId === 'string' && isValidWardrobeId(element.activeExpressionCollectionId))
      && (element.characterSourceUpdatedAt === undefined || (typeof element.characterSourceUpdatedAt === 'string' && Number.isFinite(Date.parse(element.characterSourceUpdatedAt))))
      && (element.kind !== 'image' || assets.some((asset) => asset.id === element.assetId && asset.category === 'object'))
      && (element.kind !== 'character' || (typeof element.characterId === 'string' && assets.some((asset) => asset.id === element.assetId && asset.category === 'character')))
      && [element.x, element.y, element.width, element.height, element.rotation, element.zIndex].every(Number.isFinite)))
}

function isStudioAsset(value: unknown): value is StudioAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<StudioAsset>
  return typeof asset.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.id)
    && (asset.category === 'background' || asset.category === 'object' || asset.category === 'character')
    && typeof asset.name === 'string' && asset.name.length <= 255
    && (asset.mimeType === 'image/png' || asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/webp')
    && typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`) && asset.dataUrl.length <= 70_000_000
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

async function assertFabricatorPoseReferencesAvailable(references: readonly FabricatorPoseReference[]): Promise<void> {
  for (const reference of references) {
    if (reference.modelSlot === null || !isValidModelSlot(reference.modelSlot) || !isValidPoseSlot(reference.poseSlot)) {
      throw new Error(`Não foi possível identificar o modelo e a pose usados por ${reference.owner}. Reabra e selecione uma pose salva.`)
    }
    if (!await readPoseProject(reference.modelSlot, reference.poseSlot)) {
      throw new Error(`A pose ${reference.modelSlot}:${reference.poseSlot} usada por ${reference.owner} não está mais disponível no Fabricador Dev.`)
    }
  }
}

async function assertDependentCharacterPoseReferencesAvailable(previous: CustomizerCharacter, next: CustomizerCharacter): Promise<void> {
  if (previous.id !== next.id) throw new Error('Não foi possível confirmar a identidade do personagem ao alterar o modelo.')
  if (previous.customization.modelSlot === next.customization.modelSlot) return
  const [studios, editorDocuments] = await Promise.all([
    listStudioPoseReferenceDocuments(), listEditorV6PoseReferenceDocuments()
  ])
  const previousReferences = [
    ...collectStudioPoseReferences(studios, [previous]),
    ...collectEditorV6PoseReferences(editorDocuments, [previous])
  ]
  const nextReferences = [
    ...collectStudioPoseReferences(studios, [next]),
    ...collectEditorV6PoseReferences(editorDocuments, [next])
  ]
  await assertFabricatorPoseReferencesAvailable(addedFabricatorPoseReferences(nextReferences, previousReferences))
}

function withPoseReferenceSnapshot<T>(operation: (references: readonly FabricatorPoseReference[]) => Promise<T>): Promise<T> {
  return customizerService.withCharactersLocked(async (characters) => {
    const [studios, editorDocuments] = await Promise.all([
      listStudioPoseReferenceDocuments(), listEditorV6PoseReferenceDocuments()
    ])
    const references = [
      ...collectCustomizerPoseReferences(characters),
      ...collectStudioPoseReferences(studios, characters),
      ...collectEditorV6PoseReferences(editorDocuments, characters)
    ]
    return operation(references)
  })
}

async function assertStudioPoseReferencesAvailable(document: StudioDocument): Promise<void> {
  const [previous, characters] = await Promise.all([
    readStudioPoseReferences(document.id), customizerService.list()
  ])
  const nextReferences = collectStudioPoseReferences([document], characters)
  const previousReferences = previous ? collectStudioPoseReferences([previous], characters) : []
  await assertFabricatorPoseReferencesAvailable(addedFabricatorPoseReferences(nextReferences, previousReferences))
}

async function assertEditorV6PoseReferencesAvailable(document: EditorV6Document): Promise<void> {
  const [previous, characters] = await Promise.all([
    readEditorV6PoseReferences(document.id), customizerService.list()
  ])
  const nextReferences = collectEditorV6PoseReferences([document], characters)
  const previousReferences = previous ? collectEditorV6PoseReferences([previous], characters) : []
  await assertFabricatorPoseReferencesAvailable(addedFabricatorPoseReferences(nextReferences, previousReferences))
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
  poseSlotPath, poseDraftPath, modelHeadParts, isValidModelSlot, isValidPoseSlot,
  dataUrlBuffer, writeAssetImageSource, readAssetImage,
  files: { mkdir, access, copyFile, readdir, unlink, readFile, writeFile, rename }
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

const { isValidAnimatorSlot, writeAnimatorAnimation, readAnimatorAnimation, writeAnimatorDraft, readAnimatorDraft } = createAnimatorPersistence({
  animatorSlotPath, animatorDraftPath, isValidModelSlot, isValidPoseSlot,
  dataUrlBuffer, writeAssetImageSource, readAssetImage,
  files: { mkdir, access, readdir, unlink, readFile, writeFile, rename }
})

function collectPendingPersistenceWrites(): Promise<unknown>[] {
  return [
    ...(fabricatorProjectIpc?.getPendingWrites() ?? []), ...poseSaveWrites, ...(fabricatorHairIpc?.getPendingWrites() ?? []),
    ...(fabricatorAnimatorIpc?.getPendingWrites() ?? []), ...(fabricatorWardrobeIpc?.getPendingWrites() ?? []),
    ...(fabricatorFaceCatalogIpc?.getPendingWrites() ?? []),
    ...expressionPresetOperations.getPendingWrites(),
    ...(faceGuideIpc?.getPendingWrites() ?? []), customizerService.pendingWrites,
    studioSaveQueues.studio, editorV6SaveQueue, roteirosSaveQueue,
    ...(poseMigration ? [poseMigration] : [])
  ]
}

async function flushPendingPersistenceWrites(): Promise<void> {
  const results = await Promise.allSettled(collectPendingPersistenceWrites())
  const failedWrite = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failedWrite) throw failedWrite.reason
}

async function registerFabricatorHandlers(): Promise<void> {
  ipcMain.handle(studioIpcChannels.flushPendingWrites, async (event): Promise<void> => {
    assertTrustedSender(event)
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner && !owner.isDestroyed() && !owner.webContents.isLoading()) {
      await owner.webContents.executeJavaScript('window.__flushPendingRendererWrites()')
    }
    await flushPendingPersistenceWrites()
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

  registerStudioFileHandlers({
    ipcMain, assertTrustedSender,
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
  registerEditorV6FileHandlers({
    ipcMain, assertTrustedSender,
    libraryPath: editorV6LibraryPath, projectPath: editorV6Path,
    files: { stat, readFile, mkdir, writeFile },
    normalizeImage: normalizeImageBuffer, dataUrlBuffer, createId: randomUUID,
    openPath: (path) => shell.openPath(path)
  })

  const videoLibraryService = createVideoLibraryService({
    library: videoLibrary,
    openImportDialog: async () => {
      const result = await dialog.showOpenDialog({ title: 'Biblioteca de vídeos: importar', properties: ['openFile'], filters: [{ name: 'Vídeos', extensions: ['mp4', 'webm', 'mov', 'm4v'] }] })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    enqueueWrite: enqueueRoteirosWrite,
    coordinateReferenceChange: coordinateVideoReferenceChange,
    assertNoReferences: assertNoVideoReferences
  })
  registerVideoLibraryHandlers({ ipcMain, assertTrustedSender, service: videoLibraryService })
  const backgroundLibraryService = createBackgroundLibraryService({
    openImportDialog: async () => {
      const result = await dialog.showOpenDialog({ title: 'Biblioteca de fundos: importar', properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    library: videoBackgroundLibrary,
    assertRoteiroUnreferenced: createRoteiroBackgroundReferenceGuard(() => dataPlatform.database),
    enqueueWrite: enqueueRoteirosWrite
  })
  registerBackgroundLibraryHandlers({ ipcMain, assertTrustedSender, service: backgroundLibraryService })
  const roteiroUiGifsService = createRoteiroUiGifsService({
    getDefaultGifPath: getRoteiroUiGifDefaultPath,
    openImportDialog: async () => {
      const result = await dialog.showOpenDialog({ title: 'Biblioteca de GIFs: adicionar', properties: ['openFile'], filters: [{ name: 'GIF animado', extensions: ['gif'] }] })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    library: roteiroUiGifLibrary,
    assertUnreferenced: createRoteiroUiGifReferenceGuard(() => dataPlatform.database),
    enqueueWrite: enqueueRoteirosWrite
  })
  registerRoteiroUiGifsHandlers({ ipcMain, assertTrustedSender, service: roteiroUiGifsService })
  const roteiroExportService = createRoteiroExportService({
    getAppDataRoot: () => configuredAppDataRoot ?? join(app.getPath('userData'), 'app-data'),
    resolveBackground: async (id) => {
      const resolved = await videoBackgroundLibrary.resolve(id)
      return await dataFileSystem.resolvePhysicalPath(resolved.path) ?? resolved.path
    },
    resolveGif: async (id) => {
      const resolved = await roteiroUiGifLibrary.resolve(id)
      return await dataFileSystem.resolvePhysicalPath(resolved) ?? resolved
    },
    resolveVideo: async (video) => {
      const resolved = await videoLibrary.resolveMedia(video.id)
      if (resolved.extension !== video.extension || resolved.durationFrames !== null && resolved.durationFrames !== video.durationFrames) throw new Error(`O vídeo “${video.name}” não corresponde ao arquivo da biblioteca.`)
      return await dataFileSystem.resolvePhysicalPath(resolved.path) ?? resolved.path
    }
  })
  registerRoteiroExportHandlers({ ipcMain, assertTrustedSender, openPath: (path) => shell.openPath(path), service: roteiroExportService })

  const roteiroDocumentService = createRoteirosDocumentService({
    getDatabase: () => dataPlatform.database,
    waitForPendingWrites: waitForRoteirosWrites,
    enqueueWrite: enqueueRoteirosWrite,
    coordinateVideoReferenceChange,
    assertLibraryVideoReferencesAvailable,
    assertLibraryBackgroundReferencesAvailable,
    assertLibraryUiGifReferencesAvailable
  })
  registerRoteirosDocumentHandlers({ ipcMain, assertTrustedSender, service: roteiroDocumentService })
  const roteiroExportLogsService = createRoteiroExportLogsService({
    getDatabase: () => dataPlatform.database,
    waitForPendingWrites: waitForRoteirosWrites,
    enqueueWrite: enqueueRoteirosWrite
  })
  registerRoteiroExportLogsHandlers({ ipcMain, assertTrustedSender, service: roteiroExportLogsService })
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

  registerModelSourceDownloadHandlers(ipcMain, assertTrustedSender, () => app.getPath('downloads'))
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
    readAnimatorAnimation, writeAnimatorAnimation, readAnimatorDraft, writeAnimatorDraft,
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

  registerFabricatorFaceAnimationExportHandler({
    ipcMain, assertTrustedSender, isValidModelSlot, writeFile
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

function createMainWindow(): void {
  Menu.setApplicationMenu(null)
  const videoStressOffscreen = process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
  const window = new BrowserWindow({
    show: !videoStressOffscreen && process.env.GACHA_DEV_AI_TEST !== '1',
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f7f8fa',
    title: 'Gacha Nymi',
    icon: join(__dirname, '../renderer/gacha-nymi.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Normal windows retain Chromium's background throttling. Stress sessions
      // keep their preview clock active while the window stays off-display.
      backgroundThrottling: videoStressOffscreen || process.env.GACHA_DEV_AI_TEST === '1' ? false : true
    }
  })
  if (videoStressOffscreen) {
    window.setSkipTaskbar(true)
    window.once('ready-to-show', () => {
      // A never-shown BrowserWindow is throttled by some Windows compositor
      // paths despite backgroundThrottling=false. An off-display native window
      // keeps real Electron rendering active without appearing on any monitor.
      window.setPosition(-32000, -32000)
      window.showInactive()
    })
  }
  window.removeMenu()
  window.webContents.once('did-finish-load', () => {
    if (dataBackupService) {
      void dataBackupService.finalizePendingRestore().catch((reason: unknown) => {
        console.error('A restauração foi aplicada, mas a limpeza do staging falhou; a cópia anterior foi preservada.', reason)
      })
    }
    if (!dataMigration) return
    void dataMigration.finalizeAfterHealthyLoad().catch((reason: unknown) => {
      console.error('A validação final do armazenamento local falhou; as cópias de segurança temporárias foram preservadas.', reason)
    })
  })

  // Smoke isolado, somente perfil DEV AI validado por configureDevAiDataRoot().
  // Não captura screenshots nem usa perfis reais em execução normal.
  if (process.env.GACHA_DEV_AI_TEST === '1' && process.env.GACHA_FABRICATOR_REAL_UI_CAPTURE === '1') {
    window.webContents.once('did-finish-load', () => {
      const sandbox = resolve(process.env.GACHA_DEV_AI_SANDBOX ?? '')
      const captures = join(sandbox, 'fabricator-real-ui-captures')
      const reopen = process.env.GACHA_DEV_AI_REOPEN === '1'
      const capture = reopen
        ? captureCustomizerStudioReopened(window, captures)
        : captureFabricatorRealScreens(window, captures, process.env.GACHA_FABRICATOR_VISUAL_BASELINE)
          .then(() => captureCustomizerStudioRealScreens(window, captures))
      void capture.then(() => { console.log('Capturas reais concluídas', captures, reopen ? '(reabertura)' : '(primeiro processo)'); app.quit() })
        .catch(error => { console.error('Falha no teste visual real do Fabricador:', error); app.exit(1) })
    })
  }

  let closeAfterFlush = false
  let flushingBeforeClose = false
  window.on('closed', () => editorV6MotionService?.releaseIdle())
  window.on('close', (event) => {
    if (closeAfterFlush) return
    event.preventDefault()
    if (flushingBeforeClose) return
    flushingBeforeClose = true
    const flushRendererWrites = window.webContents.isLoading()
      ? Promise.resolve()
      : window.webContents.executeJavaScript("window.desktop?.flushPendingWrites ? window.desktop.flushPendingWrites() : undefined")
    void flushRendererWrites.then(() => {
      closeAfterFlush = true
      flushingBeforeClose = false
      if (!window.isDestroyed()) window.close()
    }).catch(async (reason: unknown) => {
      flushingBeforeClose = false
      console.error('Não foi possível concluir os salvamentos antes de fechar o editor:', reason)
      if (!window.isDestroyed()) await dialog.showMessageBox(window, {
        type: 'error',
        title: 'Salvamento pendente',
        message: 'Não foi possível concluir os salvamentos. O editor continuará aberto para proteger suas alterações.',
        buttons: ['Voltar ao editor']
      })
    })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerVideoAssetProtocol(): void {
  protocol.handle('gacha-video', async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (url.hostname !== 'library' || parts.length !== 1 || !uuid.test(parts[0])) return new Response('Not found', { status: 404 })
      const media = await videoLibrary.resolveMedia(parts[0])
      const path = await dataFileSystem.resolvePhysicalPath(media.path) ?? media.path
      const file = await stat(path)
      const mimeType = ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' } as const)[media.extension]
      const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': mimeType, 'cache-control': 'no-store' })
      const range = request.headers.get('range')
      if (request.method === 'HEAD') { headers.set('content-length', String(file.size)); return new Response(null, { status: 200, headers }) }
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
        const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]))
        const end = match[2] && match[1] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= file.size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
        headers.set('content-range', `bytes ${start}-${end}/${file.size}`); headers.set('content-length', String(end-start+1))
        return new Response(Readable.toWeb(createReadStream(path,{start,end})) as unknown as BodyInit,{status:206,headers})
      }
      headers.set('content-length', String(file.size))
      return new Response(Readable.toWeb(createReadStream(path)) as unknown as BodyInit, { status: 200, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
}

function registerEditorV6MediaProtocol(): void {
  protocol.handle('gacha-editor-media', async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (parts.length !== 2 || !uuid.test(parts[0])) return new Response('Not found', { status: 404 })
      let path: string, mimeType: string
      if (url.hostname === 'project') {
        const file = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i.exec(parts[1])
        if (!file) return new Response('Not found', { status: 404 })
        const folder = editorV6Path(parts[0])
        const manifest = JSON.parse(await nativeReadFile(join(folder, 'editorV6.json'), 'utf8')) as { id?: unknown; media?: Array<{ id?: unknown; fileName?: unknown; mimeType?: unknown }> }
        const media = manifest.id === parts[0] ? manifest.media?.find((item) => item.id === file[1] && item.fileName === parts[1]) : undefined
        if (!media || typeof media.mimeType !== 'string') return new Response('Not found', { status: 404 })
        path = join(folder, 'media', parts[1]); mimeType = media.mimeType
      } else if (url.hostname === 'library' && uuid.test(parts[1])) {
        const projectFolder = editorV6Path(parts[0])
        const manifest = JSON.parse(await nativeReadFile(join(projectFolder, 'editorV6.json'), 'utf8')) as { id?: unknown; media?: Array<{ libraryVideoId?: unknown }> }
        if (manifest.id !== parts[0] || !manifest.media?.some((item) => item.libraryVideoId === parts[1])) return new Response('Not found', { status: 404 })
        const media = await videoLibrary.resolveMedia(parts[1])
        path = await dataFileSystem.resolvePhysicalPath(media.path) ?? media.path
        mimeType = media.mimeType
      } else return new Response('Not found', { status: 404 })
      const supportedTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/opus', 'audio/webm'])
      if (!supportedTypes.has(mimeType)) return new Response('Not found', { status: 404 })
      const metadata = await nativeStat(path)
      const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': mimeType, 'cache-control': 'no-store' })
      const range = request.headers.get('range')
      if (request.method === 'HEAD') { headers.set('content-length', String(metadata.size)); return new Response(null, { status: 200, headers }) }
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${metadata.size}` } })
        const start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]))
        const end = match[2] && match[1] ? Math.min(metadata.size - 1, Number(match[2])) : metadata.size - 1
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= metadata.size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${metadata.size}` } })
        headers.set('content-range', `bytes ${start}-${end}/${metadata.size}`); headers.set('content-length', String(end - start + 1))
        return new Response(Readable.toWeb(createReadStream(path, { start, end })) as unknown as BodyInit, { status: 206, headers })
      }
      headers.set('content-length', String(metadata.size))
      return new Response(Readable.toWeb(createReadStream(path)) as unknown as BodyInit, { status: 200, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
}

function registerVideoBackgroundProtocol(): void {
  protocol.handle('gacha-background', async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (url.hostname !== 'library' || parts.length !== 1 || !uuid.test(parts[0])) return new Response('Not found', { status: 404 })
      const image = await videoBackgroundLibrary.resolve(parts[0])
      const bytes = await readFile(image.path)
      return new Response(bytes, { headers: { 'content-type': image.mimeType, 'cache-control': 'no-store' } })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  protocol.handle('gacha-gif', async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (url.hostname !== 'library' || parts.length !== 1 || !uuid.test(parts[0])) return new Response('Not found', { status: 404 })
      const path = await roteiroUiGifLibrary.resolve(parts[0])
      const gif = await readFile(path)
      return new Response(gif, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' } })
    } catch { return new Response('Not found', { status: 404 }) }
  })
}

app.whenReady().then(async () => {
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
  registerFabricatorDesignSettingsHandlers({ ipcMain, assertTrustedSender, service: designSettingsService })
  dataMigration = new DataMigrationService({
    dataRoot: app.getPath('appData'),
    userDataRoot: app.getPath('userData'),
    catalog: dataPlatform,
    onProgress: (progress) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('app:data-migration:progress', progress)
    }
  })
  registerDataBackupHandlers({
    ipcMain, assertTrustedSender,
    getStorageSummary: async () => ({ disk: await getAppDataUsage(app.getPath('appData')), catalog: dataPlatform.storageSummary() }),
    getService: () => dataBackupService,
    flushPendingWrites: async (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window && !window.webContents.isLoading()) await window.webContents.executeJavaScript('window.desktop?.flushPendingWrites?.()')
      await flushPendingPersistenceWrites()
    },
    relaunch: () => app.relaunch(),
    quit: () => app.quit()
  })
  dataMigrationIpc = registerDataMigrationHandlers({
    ipcMain, assertTrustedSender,
    getService: () => dataMigration,
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
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  }
  registerVideoAssetProtocol()
  registerEditorV6MediaProtocol()
  registerVideoBackgroundProtocol()
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
  const dataMigrationTask = dataMigrationIpc?.getActiveTask()
  const pendingWrites = [
    ...collectPendingPersistenceWrites(),
    ...(dataMigrationTask ? [dataMigrationTask] : []),
    ...(editorV6ExportService ? [editorV6ExportService.drain()] : []),
    ...(editorV6MotionService ? [editorV6MotionService.drain()] : [])
  ]
  void Promise.allSettled(pendingWrites).then((results) => {
    waitingForPersistenceWritesBeforeQuit = false
    const failed = results.some((result) => result.status === 'rejected')
    if (failed) {
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
