import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, type IpcMainInvokeEvent, type MessageBoxOptions } from 'electron'
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir as nativeMkdir, readFile as nativeReadFile, writeFile as nativeWriteFile, readdir as nativeReaddir, unlink as nativeUnlink, rename as nativeRename, stat as nativeStat, access as nativeAccess, rm as nativeRm, copyFile as nativeCopyFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { totalmem, freemem } from 'node:os'
import { videoStudioMemoryReport, type VideoStudioProcessFailure } from '../src/shared/videoStudioNext/diagnostics'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { FaceAssetKind, FaceAssetSave, FaceCatalogItem, FaceCatalogItemSave, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSave, FaceComponentAssetSummary, FaceElementKind, FaceExpressionPreset, FaceExpressionTransforms, FaceExpressionWorkspaceDraft, FaceGuideProfile, FaceSet, FaceSetSave, FaceSetSummary, FaceSheetKind, FaceTransform, FabricatorAssetSave, FabricatorHistoryEntry, FabricatorHistorySaveEntry, FabricatorHistorySaveState, FabricatorHistoryState, FabricatorPoseDraftSave, FabricatorPoseSave, FabricatorProject, FabricatorProjectSave, HairStyle, HairStyleAsset, HairStyleSave, HairStyleSummary, HairWorkspace, HairWorkspaceAsset, HairWorkspaceSave, ModelPart, WardrobeAssetSave, WardrobeCategory, WardrobeSet, WardrobeSetSave } from '../src/shared/fabricator'
import { hairCategories } from '../src/shared/hairCategories'
import type { StudioAsset, StudioDocument, VideoStudioAsset, VideoStudioCardSummary, VideoTimelineDocument } from '../src/shared/studio'
import { isStudioExpressionEffects, isStudioFaceTransforms } from '../src/shared/studio'
import { isValidVideoMediaClip } from '../src/shared/videoMedia'
import { isValidVideoAudioSettings } from '../src/shared/videoAudio'
// In-memory, privacy-minimal crash ring (no project paths or media bytes).
const videoStudioRecentProcessFailures: VideoStudioProcessFailure[] = []
function recordVideoStudioProcessFailure(kind: VideoStudioProcessFailure['kind'], reason: string, exitCode: number): void {
  videoStudioRecentProcessFailures.push({
    occurredAt: new Date().toISOString(), kind, reason, exitCode,
  })
  if (videoStudioRecentProcessFailures.length > 24) videoStudioRecentProcessFailures.shift()
}
app.on('render-process-gone', (_event, _contents, details) => {
  recordVideoStudioProcessFailure('renderer', details.reason, details.exitCode)
})
app.on('child-process-gone', (_event, details) => {
  recordVideoStudioProcessFailure('child', details.reason, details.exitCode)
})

import { VideoLibraryStore, configureVideoLibraryStorage } from './videoLibrary'
import { VideoBackgroundLibraryStore, configureBackgroundLibraryStorage } from './backgroundLibrary'
import { RoteiroUiGifLibraryStore, configureRoteiroUiGifStorage } from './roteiroUiGifLibrary'
import { VideoExportLibrary } from './videoExports'
import { VideoExportJobStore } from './videoExportJobs'
import { VideoExportSurfaceHost } from './videoExportSurfaceHost'
import { VideoExportCoordinator } from './videoExportCoordinator'
import { VideoPreviewProxyStore } from './videoPreviewProxyStore'
import { resolveVideoStudioTools } from './videoToolsResolver'
import { probeVideoStudioFfmpeg, type VideoStudioFfmpegCapabilities } from './videoFfmpegCapabilities'
import type { VideoExportProgress, VideoExportStartRequest } from '../src/shared/videoExportRuntime'
import type { RoteiroDocument, RoteiroExportCharacterInfo, RoteiroExportLog, RoteiroReactionBlock, RoteiroSectionContent, RoteiroVideoReference } from '../src/shared/roteiros'
import { RoteiroCharacterExportStore } from './roteiroCharacterExport'
import { RoteiroProjectExportStore } from './roteiroProjectExport'
import { serializeVideoCharacterRenderAssetSnapshot } from '../src/shared/videoCharacterRenderAssets'
import { DataPlatform, getAppDataUsage } from './dataPlatform.cjs'
import { DomainFileSystem } from './domainFileSystem.cjs'
import { DataMigrationService } from './dataMigration.cjs'
import { DataBackupService } from './dataBackups.cjs'
import { configureAssetImageStorage, readAssetImage, writeAssetImageSource } from './assetImageOverrides'
import { migrateElectronProfile } from './electronProfileMigration.cjs'
import { normalizeImageBuffer } from './imageIngestion.cjs'
import { measureIpc } from './ipcPerformance'
import { BaseVideoService } from './domains/baseVideos/service'
import { registerBaseVideoHandlers } from './domains/baseVideos/ipc'
import { isRoteiroDocument } from './domains/roteiros/validation'
import { isCustomizerCharacter, isValidCustomizerFaceAppearance } from './domains/customizer/validation'
import { CustomizerCharacterRepository } from './domains/customizer/repository'
import { CustomizerCharacterService } from './domains/customizer/service'
import { registerCustomizerCharacterHandlers } from './domains/customizer/ipc'
import { starterCharacters } from './domains/customizer/starterCharacters'
import { FabricatorModelCatalog } from './domains/fabricator/modelCatalog'
import { registerFabricatorModelCatalogHandlers } from './domains/fabricator/modelIpc'
import { FabricatorWardrobeCatalog } from './domains/fabricator/wardrobeCatalog'
import { createFabricatorCatalogListings, legacyHairStyle } from './domains/fabricator/catalogListings'
import { registerFabricatorWardrobeCatalogHandlers } from './domains/fabricator/wardrobeCatalogIpc'
import { createFaceGuidePersistence, isFaceGuideProfile } from './domains/fabricator/faceGuidePersistence'
import { publishModelSource, type ModelSourcePublishRequest } from './domains/fabricator/modelSource'
import { recoverModelSourceSlot } from './domains/fabricator/modelSourceRecovery'
import { createFabricatorModelWriter } from './domains/fabricator/modelWriter'
import { createPosePersistence } from './domains/fabricator/posePersistence'
import { createAnimatorPersistence } from './domains/fabricator/animatorPersistence'
import { registerFabricatorPoseHandlers } from './domains/fabricator/poseIpc'
import { registerFabricatorAnimatorHandlers } from './domains/fabricator/animatorIpc'
import { FabricatorCatalogAssetService } from './domains/fabricator/catalogAssetService'
import { createFabricatorCatalogPersistence } from './domains/fabricator/catalogPersistence'
import { createFabricatorExpressionStorage } from './domains/fabricator/expressionStorage'
import { createExpressionBatchTransaction } from './domains/fabricator/expressionBatchTransaction'
import { isPortableExpressionMotion, isPtPupilOverrides, isPtPupilMotion } from '../src/shared/portableExpression'
import { registerExpressionPresetHandlers } from './domains/fabricator/expressionIpc'
import { registerStudioPrimaryHandlers } from './domains/studio/primaryIpc'
import { createStudioLibraryIndex } from './domains/studio/libraryIndex'
import { createStudioDocumentPersistence } from './domains/studio/documentPersistence'
import { studioIpcChannels } from '../src/shared/studioIpcChannels'
import type { AssetNamespace } from './domains/fabricator/versionedAssetResolver'
import { inspectFabricatorStorage } from '../src/shared/fabricatorStorageCompatibility'
import { fabricatorIpcChannels } from '../src/shared/fabricatorIpcChannels'
import { captureFabricatorRealScreens, captureCustomizerStudioRealScreens, captureCustomizerStudioReopened } from './domains/fabricator/visualUiCapture'
import { registerModelSourceDownloadHandlers } from './domains/fabricator/modelSourceExportIpc'

let configuredAppDataRoot: string | null = null
let videoExportLibrary: VideoExportLibrary | null = null
let videoExportJobStore: VideoExportJobStore | null = null
let videoExportSurfaceHost: VideoExportSurfaceHost | null = null
let videoExportCoordinator: VideoExportCoordinator | null = null
let videoPreviewProxyStore: VideoPreviewProxyStore | null = null
let videoPreviewToolsPromise: Promise<{ ffmpeg: VideoStudioFfmpegCapabilities }> | null = null
const videoExportJobOwners = new Map<string, number>()
const videoExportTerminalCleanupTimers = new Map<string, NodeJS.Timeout>()
let roteirosSaveQueue: Promise<void> = Promise.resolve()
let roteiroCharacterExportStore: RoteiroCharacterExportStore | null = null
let roteiroProjectExportStore: RoteiroProjectExportStore | null = null
const roteiroCharacterExportJobOwners = new Map<string, number>()


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

  const defaultRoot = app.isPackaged
    ? join(dirname(process.execPath), 'app-data')
    : join(app.getAppPath(), 'app-data')
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

// Local, opt-in harness for Windows Video Studio stress runs. It keeps the
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
let dataMigrationRunning = false
let dataMigrationPauseRequested = false
let dataMigrationTask: Promise<unknown> | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'gacha-video', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'gacha-background', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'gacha-gif', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

const slotCount = 10
const poseSlotCount = 12
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
type StudioWorkspaceStorage = 'studio' | 'video'
const studioLibraryPath = (workspace: StudioWorkspaceStorage = 'studio') => join(app.getPath('userData'), 'studios', workspace === 'video' ? 'Video Studio' : 'Studio Principal')
const studioPath = (id: string, workspace: StudioWorkspaceStorage = 'studio') => join(studioLibraryPath(workspace), `studio-${id}`)
const videoLibrary = new VideoLibraryStore(() => studioLibraryPath('video'))
const videoBackgroundLibrary = new VideoBackgroundLibraryStore(() => studioLibraryPath('video'))
const roteiroUiGifLibrary = new RoteiroUiGifLibraryStore(() => studioLibraryPath('video'))
const studioSaveQueues: Record<StudioWorkspaceStorage, Promise<void>> = { studio: Promise.resolve(), video: Promise.resolve() }
const characterManifestPath = () => join(characterLibraryPath(), 'characters.json')
const fabricatorSaveQueues = new Map<number, Promise<void>>()
let poseSaveQueue: Promise<void> = Promise.resolve()
const poseSaveWrites = new Set<Promise<void>>()
let poseMigration: Promise<void> | null = null
let animatorSaveQueue: Promise<void> = Promise.resolve()
let wardrobeSaveQueue: Promise<void> = Promise.resolve()
let faceSaveQueue: Promise<void> = Promise.resolve()
let expressionPresetSaveQueue: Promise<void> = Promise.resolve()
let faceGuideSaveQueue: Promise<void> = Promise.resolve()
const hairSaveQueues = new Map<number, Promise<void>>()
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
  () => new Date().toISOString()
)

const wardrobeCategories: WardrobeCategory[] = ['camisa', 'jaqueta', 'manga-superior', 'manga-inferior', 'luvas', 'capa', 'cinto', 'oculos', 'acessorio-cabeca', 'saia', 'calca-coxa', 'calca-canela', 'shorts', 'meia', 'sapato']
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

// Reads are queued too: no list/load may observe a half-written batch.
function queueExpressionWork<T>(operation: () => Promise<T>): Promise<T> {
  const work = expressionPresetSaveQueue.catch(() => undefined).then(operation)
  expressionPresetSaveQueue = work.then(() => undefined, () => undefined)
  return work
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

async function readFaceGuides(profile: FaceGuideProfile) { return faceGuidePersistence.read(profile) }
async function writeFaceGuides(profile: FaceGuideProfile, guides: unknown): Promise<void> { return faceGuidePersistence.write(profile, guides) }

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

function validHairStyle(modelSlot: number, style: HairStyleSave): boolean {
  if (!isValidModelSlot(modelSlot) || style?.schemaVersion !== 1 || style.modelSlot !== modelSlot || !isValidWardrobeId(style.id)
    || typeof style.name !== 'string' || !style.name.trim() || style.name.length > 80 || !style.transforms) return false
  if (!style.front && !style.back && !style.fringe) return false
  if (style.category !== undefined) {
    const category = hairCategories.find((item) => item.id === style.category)
    if (!category || !style[category.side]) return false
  }
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
  if (assets.some(asset => !expected.has(asset.id)) || new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Imagens do cabelo inválidas.')
  const folder = hairStylePath(modelSlot, style.id)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: join(folder, 'images'), manifestName: 'hair-style.json', manifest: style,
    images: assets.map(asset => ({ id: asset.id, bytes: dataUrlBuffer(asset.dataUrl) })),
    expected, prune: ['front', 'back', 'fringe'],
    missingMessage: id => `Imagem de cabelo ausente: ${id}.`
  })
}

async function readHairStyle(modelSlot: number, id: string): Promise<HairStyle | null> {
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
    return { ...saved, front: await loadPart('front'), back: await loadPart('back'), fringe: await loadPart('fringe') }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') {
      if (id === 'legacy-workspace') {
        // Respect a migration/deletion previously recorded by older builds.
        // The virtual legacy entry must not return after the migrated entry
        // was deliberately removed by the user.
        try { await access(join(hairModelPath(modelSlot),'hair-style-migration-v1')); return null }
        catch(markerError) { if ((markerError as NodeJS.ErrnoException).code !== 'ENOENT') throw markerError }
        return legacyHairStyle(modelSlot,await readHairWorkspace(modelSlot))
      }
      return null
    }
    throw reason
  }
}

async function recoverWardrobeManifest(folder: string): Promise<void> {
  await catalogPersistence.recoverWardrobeManifest(folder)
}

async function writeWardrobeSet(modelSlot: number, set: WardrobeSetSave, assets: WardrobeAssetSave[]): Promise<void> {
  invalidateCatalogPng('wardrobe', `${modelSlot}:${set.id}`)
  if (!isValidModelSlot(modelSlot) || set.schemaVersion !== 1 || (set.edition !== undefined && set.edition !== 1 && set.edition !== 2) || set.modelSlot !== modelSlot || !isValidWardrobeId(set.id) || !Array.isArray(set.components) || set.components.length < 1 || set.components.length > 100) throw new Error('Conjunto de roupa inválido.')
  const ids = new Set(set.components.map(component => component.id))
  if (ids.size !== set.components.length || set.components.some(component => !isValidWardrobeId(component.id) || !wardrobeCategories.includes(component.category) || !isValidWardrobeId(component.attachedPartId))) throw new Error('Peças do conjunto inválidas.')
  const folder = wardrobeSetPath(modelSlot, set.id)
  await catalogPersistence.saveCatalog({
    folder, imageFolder: join(folder, 'parts'), manifestName: 'wardrobe.json', manifest: set,
    // O contrato legado ignora assets extras não presentes no conjunto.
    images: assets.filter(asset => ids.has(asset.id)).map(asset => ({ id: asset.id, bytes: dataUrlBuffer(asset.dataUrl) })),
    expected: ids, prune: 'all',
    missingMessage: id => {
      const component = set.components.find(part => part.id === id)
      return `Imagem ausente no conjunto: ${component?.name ?? id} (${id}).`
    }
  })
}

// Assets versionados são usados apenas nas bibliotecas oficiais; rascunhos não entram em cache.
const catalogAssets = new FabricatorCatalogAssetService(readAssetImage)
function readCatalogPng(namespace: AssetNamespace, identity: string, version: string, imagePath: string): Promise<Buffer> {
  return catalogAssets.read(namespace, identity, version, imagePath)
}
function invalidateCatalogPng(namespace: AssetNamespace, identity: string): void {
  catalogAssets.invalidate(namespace, identity)
}

async function readWardrobeSet(modelSlot: number, id: string): Promise<WardrobeSet | null> {
  if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Conjunto de roupa inválido.')
  try {
    await wardrobeSaveQueue.catch(() => undefined)
    const folder = wardrobeSetPath(modelSlot, id)
    await recoverWardrobeManifest(folder)
    const set = JSON.parse(await readFile(join(folder, 'wardrobe.json'), 'utf8')) as WardrobeSetSave
    if (!inspectFabricatorStorage('wardrobe', set).compatible) return null
    if (set.schemaVersion !== 1 || (set.edition !== undefined && set.edition !== 1 && set.edition !== 2) || set.modelSlot !== modelSlot || set.id !== id || !Array.isArray(set.components) || set.components.length > 100) return null
    const version = `${set.updatedAt}:${set.edition ?? 1}`
    const identity = `${modelSlot}:${id}`
    const components = await Promise.all(set.components.map(async (component) => ({
      ...component,
      category: (component.category as string) === 'cinto-saia-1' ? 'cinto' as const : (component.category as string) === 'cinto-saia-2' ? 'saia' as const : component.category,
      renderAboveHair: (component.category === 'oculos' || component.category === 'acessorio-cabeca') && component.renderAboveHair === true,
      dataUrl: `data:image/png;base64,${(await readCatalogPng('wardrobe', identity, version, join(folder, 'parts', `${component.id}.png`))).toString('base64')}`
    })))
    return { ...set, components }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
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
    && (studio.videoTimeline === undefined || isVideoTimelineDocument(studio.videoTimeline, elements))
    && (studio.backgroundAssetId === null || assets.some((asset) => asset.id === studio.backgroundAssetId && asset.category === 'background'))
    && elements.every((element) => Boolean(element && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(element.id) && typeof element.text === 'string'
      && ['image', 'character', 'narrator', 'speech', 'thought'].includes(element.kind)
      && (element.timelineColor === undefined || typeof element.timelineColor === 'string' && /^#[0-9a-f]{6}$/i.test(element.timelineColor))
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

function isVideoTimelineDocument(value: unknown, elements: StudioDocument['elements']): value is VideoTimelineDocument {
  if (!value || typeof value !== 'object') return false
  const timeline = value as Partial<VideoTimelineDocument>
  const characterIds = new Set(elements.filter((element) => element?.kind === 'character').map((element) => element.id))
  const textIds = new Set(elements.filter((element) => element?.kind === 'speech' || element?.kind === 'thought').map((element) => element.id))
  const validState = (state: VideoTimelineDocument['characterKeys'][number]['state'], id: string) => Boolean(state
    && state.element?.kind === 'character' && state.element.id === id
    && typeof state.element.characterId === 'string' && typeof state.element.assetId === 'string'
    && [state.element.x, state.element.y, state.element.width, state.element.height, state.element.rotation, state.element.zIndex].every(Number.isFinite)
    && isStudioFaceTransforms(state.element.faceTransforms) && isStudioExpressionEffects(state.element.activeExpressionEffects)
    && typeof state.imageDataUrl === 'string' && state.imageDataUrl.startsWith('data:image/png;base64,') && state.imageDataUrl.length <= 70_000_000)
  return timeline.schemaVersion === 1 && timeline.frameRate === 60
    && typeof timeline.playing === 'boolean'
    && (timeline.coverDataUrl === undefined || typeof timeline.coverDataUrl === 'string' && /^data:image\/(jpeg|png);base64,/.test(timeline.coverDataUrl) && timeline.coverDataUrl.length <= 1_500_000)
    && isValidVideoAudioSettings(timeline.videoAudio)
    && (timeline.trackSettings === undefined || Object.keys(timeline.trackSettings).length <= 1002 && Object.entries(timeline.trackSettings).every(([id, settings]) => (characterIds.has(id) || id === 'speech' || id === 'thought' || id === 'video') && settings && (settings.visible === undefined || typeof settings.visible === 'boolean') && (settings.locked === undefined || typeof settings.locked === 'boolean') && (settings.collapsed === undefined || typeof settings.collapsed === 'boolean') && (settings.order === undefined || Number.isInteger(settings.order) && settings.order >= 0 && settings.order <= 1002) && (settings.label === undefined || typeof settings.label === 'string' && settings.label.length <= 80)))
    && Number.isInteger(timeline.durationFrames) && timeline.durationFrames! >= 60 && timeline.durationFrames! <= 60 * 60 * 60 * 24
    && Number.isInteger(timeline.playheadFrame) && timeline.playheadFrame! >= 0 && timeline.playheadFrame! <= timeline.durationFrames!
    && Array.isArray(timeline.characterKeys) && timeline.characterKeys.length <= 100_000
    && (timeline.characterBases === undefined || Object.entries(timeline.characterBases).every(([id, state]) => characterIds.has(id) && validState(state, id)))
    && (timeline.characterPositions === undefined || Object.entries(timeline.characterPositions).every(([id, position]) => characterIds.has(id) && position && Number.isFinite(position.x) && Number.isFinite(position.y)))
    && (timeline.characterTransforms === undefined || Object.entries(timeline.characterTransforms).every(([id, transform]) => characterIds.has(id) && transform && [transform.x, transform.y, transform.rotation, transform.zIndex].every(Number.isFinite) && (transform.flipX === undefined || typeof transform.flipX === 'boolean') && [transform.characterScale, transform.characterWidthScale, transform.characterHeightScale].every((value) => value === undefined || Number.isFinite(value))))
    && timeline.characterKeys.every((key) => Boolean(key && typeof key.id === 'string' && characterIds.has(key.elementId) && Number.isInteger(key.frame) && key.frame >= 0 && key.frame <= timeline.durationFrames! && (key.poseSlot === null || Number.isInteger(key.poseSlot)) && (key.expressionCollectionId === null || typeof key.expressionCollectionId === 'string') && (key.expressionPresetId === null || typeof key.expressionPresetId === 'string') && ['idle', 'blink', 'talk'].includes(key.faceMode) && (key.state === undefined || validState(key.state, key.elementId))))
    && Array.isArray(timeline.textClips) && timeline.textClips.length <= 100_000
    && timeline.textClips.every((clip) => Boolean(clip && typeof clip.id === 'string' && textIds.has(clip.elementId) && (clip.kind === 'speech' || clip.kind === 'thought') && Number.isInteger(clip.startFrame) && Number.isInteger(clip.endFrame) && clip.startFrame >= 0 && clip.endFrame > clip.startFrame && clip.endFrame <= timeline.durationFrames! && (clip.state === undefined || clip.state.id === clip.elementId && clip.state.kind === clip.kind && typeof clip.state.text === 'string' && [clip.state.x, clip.state.y, clip.state.width, clip.state.height, clip.state.rotation, clip.state.zIndex].every(Number.isFinite))))
    && (timeline.videoAssets === undefined || Array.isArray(timeline.videoAssets) && timeline.videoAssets.length <= 1000 && timeline.videoAssets.every((asset) => Boolean(asset && typeof asset.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.id) && typeof asset.name === 'string' && asset.name.length <= 255 && (asset.extension === 'mp4' && asset.mimeType === 'video/mp4' || asset.extension === 'webm' && asset.mimeType === 'video/webm' || asset.extension === 'mov' && asset.mimeType === 'video/quicktime' || asset.extension === 'm4v' && asset.mimeType === 'video/x-m4v') && Number.isInteger(asset.size) && asset.size > 0 && asset.size <= 5 * 1024 * 1024 * 1024 && Number.isInteger(asset.durationFrames) && asset.durationFrames > 0 && asset.durationFrames <= 60 * 60 * 60 * 24)))
    && (timeline.videoClips === undefined || Array.isArray(timeline.videoClips) && timeline.videoClips.length <= 100_000 && timeline.videoClips.every((clip) => {
      const asset = timeline.videoAssets?.find((item) => item.id === clip?.assetId)
      return Boolean(asset && isValidVideoMediaClip(clip, asset.durationFrames, timeline.durationFrames!))
    }))
    && Array.isArray(timeline.saveMarkers) && timeline.saveMarkers.length <= 100_000
    && timeline.saveMarkers.every((marker) => Boolean(marker && typeof marker.id === 'string' && Number.isInteger(marker.frame) && marker.frame >= 0 && marker.frame <= timeline.durationFrames! && Array.isArray(marker.affectedTrackIds) && marker.affectedTrackIds.every((id) => typeof id === 'string')))
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

const { readStudio, writeStudio, removeStudio } = createStudioDocumentPersistence({
  files: { readFile, writeFile, mkdir, access, rename, unlink, rm },
  studioPath,
  studioLibraryPath,
  prepareVideoDelete: () => videoLibrary.list(),
  validate: isStudioDocument,
  decodeImage: importedImageDataUrlBuffer,
  normalizeImage: normalizeImageBuffer,
  ensureVideoAssets: (id, assets) => videoLibrary.ensureProjectAssets(id, assets),
  videoStudioCardSummary: (value, id) => videoStudioCardSummary(value, id)
})

const { listStudios, listVideoStudioCards, videoStudioCardSummary } = createStudioLibraryIndex({
  files: { mkdir, readdir, readFile, writeFile },
  studioLibraryPath,
  readStudio: (id, workspace) => readStudio(id, workspace)
})

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

type StoredHistoryEntry = {
  action: FabricatorHistoryEntry['action']
  project: Omit<FabricatorProject, 'sourceDataUrl' | 'parts'>
  parts: Array<{ part: Omit<ModelPart, 'dataUrl' | 'chromaBaseDataUrl'>; hash: string; chromaBaseHash?: string }>
}

async function writeFabricatorHistory(slot: number, history: FabricatorHistorySaveState): Promise<void> {
  if (!isValidSlot(slot) || !Array.isArray(history.undo) || !Array.isArray(history.redo) || history.undo.length > 50 || history.redo.length > 50) throw new Error('Histórico inválido.')
  const folder = join(slotPath(slot), 'history')
  const assetsFolder = join(folder, 'assets')
  await mkdir(assetsFolder, { recursive: true })
  const referencedAssets = new Set<string>()
  const storeAsset = async (bytes: Buffer, extension: string): Promise<string> => {
    const hash = createHash('sha256').update(bytes).digest('hex')
    const filename = `${hash}.${extension}`
    referencedAssets.add(filename)
    try { await access(join(assetsFolder, filename)) } catch { await writeFile(join(assetsFolder, filename), bytes) }
    return hash
  }
  const serializeEntry = async (entry: FabricatorHistorySaveEntry): Promise<StoredHistoryEntry> => {
    const snapshot = entry.project
    if (snapshot.slot !== slot || snapshot.schemaVersion !== 1 || snapshot.parts.length > 500) throw new Error('Snapshot de histórico inválido.')
    if (!/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(snapshot.sourceAssetName)) throw new Error('Imagem original no histórico inválida.')
    await access(join(slotPath(slot), snapshot.sourceAssetName))
    const parts = await Promise.all(snapshot.parts.map(async (part) => {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(part.id)) throw new Error('Peça de histórico inválida.')
      return {
        part: (({ dataUrl: _dataUrl, chromaBaseDataUrl: _baseDataUrl, ...metadata }) => metadata)(part),
        hash: await storeAsset(dataUrlBuffer(part.dataUrl), 'png'),
        ...(part.chromaBaseDataUrl ? { chromaBaseHash: await storeAsset(dataUrlBuffer(part.chromaBaseDataUrl), 'png') } : {})
      }
    }))
    const { parts: _parts, ...metadata } = snapshot
    return { action: entry.action, project: metadata, parts }
  }
  const stored = {
    version: 1,
    undo: await Promise.all(history.undo.map(serializeEntry)),
    redo: await Promise.all(history.redo.map(serializeEntry))
  }
  const temporaryManifest = join(folder, 'history.json.tmp')
  await writeFile(temporaryManifest, JSON.stringify(stored), 'utf8')
  await rename(temporaryManifest, join(folder, 'history.json'))
  for (const filename of await readdir(assetsFolder)) if (!referencedAssets.has(filename)) await unlink(join(assetsFolder, filename))
  const keptSources = new Set([
    ...stored.undo.map((entry) => entry.project.sourceAssetName),
    ...stored.redo.map((entry) => entry.project.sourceAssetName)
  ])
  try {
    const current = JSON.parse(await readFile(join(slotPath(slot), 'project.json'), 'utf8')) as { sourceFile?: string }
    if (current.sourceFile) keptSources.add(current.sourceFile)
  } catch { /* The current project may not yet have a manifest. */ }
  for (const filename of await readdir(slotPath(slot))) {
    if (/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(filename) && !keptSources.has(filename)) await unlink(join(slotPath(slot), filename))
  }
}

async function readFabricatorHistory(slot: number): Promise<FabricatorHistoryState> {
  const folder = join(slotPath(slot), 'history')
  const assetsFolder = join(folder, 'assets')
  const stored = JSON.parse(await readFile(join(folder, 'history.json'), 'utf8')) as {
    version: number
    undo: StoredHistoryEntry[]
    redo: StoredHistoryEntry[]
  }
  if (stored.version !== 1 || !Array.isArray(stored.undo) || !Array.isArray(stored.redo) || stored.undo.length > 50 || stored.redo.length > 50) throw new Error('Arquivo de histórico inválido.')
  const cache = new Map<string, Buffer>()
  const readAsset = async (hash: string, extension: string) => {
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Referência de histórico inválida.')
    const key = `${hash}.${extension}`
    let bytes = cache.get(key)
    if (!bytes) { bytes = await readFile(join(assetsFolder, key)); cache.set(key, bytes) }
    return bytes
  }
  const restoreEntry = async (entry: StoredHistoryEntry): Promise<FabricatorHistoryEntry> => {
    if (!['edit', 'mixer', 'reset'].includes(entry.action) || entry.project.slot !== slot) throw new Error('Snapshot de histórico inválido.')
    if (!/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(entry.project.sourceAssetName)) throw new Error('Imagem original do histórico inválida.')
    const source = await readFile(join(slotPath(slot), entry.project.sourceAssetName))
    const extension = extname(entry.project.sourceAssetName).toLowerCase()
    const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
    const parts = await Promise.all(entry.parts.map(async ({ part, hash, chromaBaseHash }) => ({
      ...part,
      dataUrl: `data:image/png;base64,${(await readAsset(hash, 'png')).toString('base64')}`,
      ...(chromaBaseHash ? { chromaBaseDataUrl: `data:image/png;base64,${(await readAsset(chromaBaseHash, 'png')).toString('base64')}` } : {})
    })))
    return {
      action: entry.action,
      project: { ...entry.project, sourceDataUrl: `data:${mime};base64,${source.toString('base64')}`, parts }
    }
  }
  return { undo: await Promise.all(stored.undo.map(restoreEntry)), redo: await Promise.all(stored.redo.map(restoreEntry)) }
}

const writeFabricatorProject = createFabricatorModelWriter({
  slotPath,
  isValidSlot,
  dataUrlBuffer,
  writeAssetImageSource,
  files: { mkdir, readFile, writeFile, rename, readdir, access, unlink }
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

async function registerFabricatorHandlers(): Promise<void> {
  ipcMain.handle(studioIpcChannels.flushPendingWrites, async (event): Promise<void> => {
    assertTrustedSender(event)
    const pendingWrites = [
      ...fabricatorSaveQueues.values(), ...poseSaveWrites, ...hairSaveQueues.values(),
      animatorSaveQueue, wardrobeSaveQueue, faceSaveQueue, expressionPresetSaveQueue,
      faceGuideSaveQueue, customizerService.pendingWrites,
      studioSaveQueues.studio, studioSaveQueues.video, roteirosSaveQueue
    ]
    const results = await Promise.allSettled(pendingWrites)
    const failedWrite = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failedWrite) throw failedWrite.reason
  })

  const registerStudioWorkspace = (workspace: StudioWorkspaceStorage, channel: 'studio' | 'video-studio') => {
    if (workspace === 'studio') registerStudioPrimaryHandlers({
      ipcMain, assertTrustedSender,
      list: () => listStudios('studio'),
      write: (document) => writeStudio(document, 'studio'),
      remove: (id) => removeStudio(id, 'studio'),
      getPendingWrites: () => studioSaveQueues.studio,
      setPendingWrites: (pending) => { studioSaveQueues.studio = pending },
      measure: (label, operation) => measureIpc(label, operation)
    })
    if (workspace === 'video') ipcMain.handle(`${channel}:list`, async (event): Promise<StudioDocument[] | VideoStudioCardSummary[]> => {
      assertTrustedSender(event)
      return measureIpc<StudioDocument[] | VideoStudioCardSummary[]>(`${channel}:list`, () => workspace === 'video' ? listVideoStudioCards() : listStudios(workspace))
    })

    if (workspace === 'video') ipcMain.handle('video-studio:get', async (event, id: string): Promise<StudioDocument | null> => {
      assertTrustedSender(event)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Video Studio inválido.')
      await studioSaveQueues.video
      return measureIpc('video-studio:get', () => readStudio(id, 'video'))
    })

    if (workspace === 'video') ipcMain.handle(`${channel}:save`, async (event, studio: StudioDocument): Promise<void> => {
      assertTrustedSender(event)
      const next = studioSaveQueues[workspace].catch(() => undefined).then(() => writeStudio(studio, workspace))
      studioSaveQueues[workspace] = next
      await measureIpc(`${channel}:save`, () => next)
    })

    if (workspace === 'video') ipcMain.handle(`${channel}:delete`, async (event, id: string): Promise<void> => {
      assertTrustedSender(event)
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
      const next = studioSaveQueues[workspace].catch(() => undefined).then(async () => {
        await removeStudio(id, workspace)
      })
      studioSaveQueues[workspace] = next
      await next
    })

    ipcMain.handle(`${channel}:folder`, (event): string => {
      assertTrustedSender(event)
      return join(app.getPath('appData'), 'projects', workspace === 'video' ? 'video-studio' : 'studio')
    })

    ipcMain.handle(`${channel}:import-image`, async (event, category: StudioAsset['category']): Promise<StudioAsset | null> => {
      assertTrustedSender(event)
      if (category !== 'background' && category !== 'object') throw new Error('Categoria de imagem inválida.')
      const label = workspace === 'video' ? 'Video Studio' : 'Studio'
      const result = await dialog.showOpenDialog({
        title: `${label}: ${category === 'background' ? 'adicionar imagem de fundo' : 'adicionar objeto à cena'}`,
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })
      if (result.canceled || !result.filePaths[0]) return null
      const path = result.filePaths[0]
      const size = (await stat(path)).size
      if (size > 50 * 1024 * 1024) throw new Error('A imagem excede o limite de 50 MB.')
      const bytes = await readFile(path)
      const canonical = await normalizeImageBuffer(bytes)
      return { id: randomUUID(), category, name: basename(path), mimeType: 'image/png', dataUrl: `data:image/png;base64,${canonical.bytes.toString('base64')}` }
    })

    if (workspace === 'video') {
      ipcMain.handle('video-studio:diagnostics:memory', (event) => {
        assertTrustedSender(event)
        if (process.platform !== 'win32') throw new Error('Diagnóstico de Video Studio somente no Windows.')
        return videoStudioMemoryReport(app.getAppMetrics(), {
          sampledAt: new Date().toISOString(),
          platform: process.platform,
          mainPid: process.pid,
          totalRamBytes: totalmem(),
          freeRamBytes: freemem(),
          mainRssBytes: process.memoryUsage().rss,
          recentProcessFailures: videoStudioRecentProcessFailures,
        })
      })
      ipcMain.handle('video-studio:stress:capture-page', async (event) => {
        assertTrustedSender(event)
        if (process.env.GACHA_VIDEO_STRESS_OFFSCREEN !== '1' || process.platform !== 'win32') {
          throw new Error('Capturas de página só estão disponíveis na sessão oculta de estresse do Windows.')
        }
        const image = await event.sender.capturePage()
        const size = image.getSize()
        return { width: size.width, height: size.height, pngBase64: image.toPNG().toString('base64') }
      })
      videoExportLibrary ??= new VideoExportLibrary(app.getPath('appData'))
  videoPreviewProxyStore ??= new VideoPreviewProxyStore(join(app.getPath('appData'), 'CACHE', 'video-studio', 'preview-media'))
      ipcMain.handle('video-studio:exports:list', async (event) => {
        assertTrustedSender(event)
        return videoExportLibrary!.list()
      })
      ipcMain.handle('video-studio:exports:open-folder', async (event, studioId?: string) => {
        assertTrustedSender(event)
        const folder = await videoExportLibrary!.folder(studioId)
        const error = await shell.openPath(folder)
        if (error) throw new Error(`Não foi possível abrir a pasta de exportações: ${error}`)
      })
      ipcMain.handle('video-studio:exports:delete', async (event, id: string) => {
        assertTrustedSender(event)
        await videoExportLibrary!.delete(id)
      })
      ipcMain.handle('video-studio:export:start', async (event, request: VideoExportStartRequest) => {
        assertTrustedSender(event)
        if (!videoExportCoordinator) throw new Error('Coordenador de exportação ainda não foi inicializado.')
        if (!request || !isStudioDocument(request.studio) || !request.studio.videoTimeline
          || !Array.isArray(request.characters) || request.characters.length > 500 || !request.characters.every(isCustomizerCharacter)
          || !['animated', 'static-characters'].includes(request.renderVariant)) {
          throw new Error('Solicitação de exportação inválida.')
        }
        // Validate the transitively captured dependency snapshot before accepting
        // a long-running job from the renderer.
        serializeVideoCharacterRenderAssetSnapshot(request.characterAssets)
        await studioSaveQueues.video.catch(() => undefined)
        await videoLibrary.ensureProjectAssets(request.studio.id, request.studio.videoTimeline.videoAssets ?? [])
        const jobId = videoExportCoordinator.start(request)
        videoExportJobOwners.set(jobId, event.sender.id)
        const current = videoExportCoordinator.status(jobId)
        if (current) event.sender.send('video-studio:export:progress', current)
        return { jobId }
      })
      ipcMain.handle('video-studio:export:status', (event, jobId: string) => {
        assertTrustedSender(event)
        if (!videoExportCoordinator || videoExportJobOwners.get(jobId) !== event.sender.id) throw new Error('Job de exportação não pertence a esta janela.')
        return videoExportCoordinator.status(jobId)
      })
      ipcMain.handle('video-studio:export:cancel', async (event, jobId: string) => {
        assertTrustedSender(event)
        if (!videoExportCoordinator || videoExportJobOwners.get(jobId) !== event.sender.id) throw new Error('Job de exportação não pertence a esta janela.')
        await videoExportCoordinator.cancel(jobId)
      })
      ipcMain.handle('video-studio:export:recoverable', async (event) => {
        assertTrustedSender(event)
        if (!videoExportCoordinator) throw new Error('Coordenador de exportação ainda não foi inicializado.')
        return videoExportCoordinator.listRecoverable()
      })
      ipcMain.handle('video-studio:export:resume', async (event, jobId: string) => {
        assertTrustedSender(event)
        if (!videoExportCoordinator) throw new Error('Coordenador de exportação ainda não foi inicializado.')
        const existingCleanup = videoExportTerminalCleanupTimers.get(jobId)
        if (existingCleanup) {
          clearTimeout(existingCleanup)
          videoExportTerminalCleanupTimers.delete(jobId)
        }
        const resumed = await videoExportCoordinator.resume(jobId)
        videoExportJobOwners.set(resumed, event.sender.id)
        const current = videoExportCoordinator.status(resumed)
        if (current) event.sender.send('video-studio:export:progress', current)
        return { jobId: resumed }
      })
      ipcMain.handle('video-studio:export:discard-recovery', async (event, jobId: string) => {
        assertTrustedSender(event)
        if (!videoExportCoordinator) throw new Error('Coordenador de exportação ainda não foi inicializado.')
        const owner = videoExportJobOwners.get(jobId)
        if (owner !== undefined && owner !== event.sender.id) throw new Error('Job de exportação pertence a outra janela.')
        await videoExportCoordinator.discardRecovery(jobId)
        const cleanupTimer = videoExportTerminalCleanupTimers.get(jobId)
        if (cleanupTimer) clearTimeout(cleanupTimer)
        videoExportTerminalCleanupTimers.delete(jobId)
        videoExportJobOwners.delete(jobId)
      })
      ipcMain.handle('video-studio:video-library:list', async (event) => { assertTrustedSender(event); return videoLibrary.list() })
      ipcMain.handle('video-studio:video-library:import', async (event, offscreenStressMediaPath?: string) => {
        assertTrustedSender(event)
        if (offscreenStressMediaPath !== undefined) {
          if (process.env.GACHA_VIDEO_STRESS_OFFSCREEN !== '1' || typeof offscreenStressMediaPath !== 'string') {
            throw new Error('A importação por caminho local só está disponível no runner oculto de estresse.')
          }
          const allowedRoot = resolve(app.getAppPath(), 'app-data', 'stress-media')
          const requested = resolve(offscreenStressMediaPath)
          if (dirname(requested) !== allowedRoot || !existsSync(allowedRoot) || !existsSync(requested)
            || lstatSync(allowedRoot).isSymbolicLink() || lstatSync(requested).isSymbolicLink()
            || realpathSync(allowedRoot) !== allowedRoot || realpathSync(requested) !== requested
            || !lstatSync(requested).isFile()) {
            throw new Error('O arquivo de estresse deve ser um arquivo local direto de app-data/stress-media.')
          }
          return videoLibrary.importFile(requested)
        }
        const result = await dialog.showOpenDialog({ title: 'Biblioteca de vídeos: importar', properties: ['openFile'], filters: [{ name: 'Vídeos', extensions: ['mp4', 'webm', 'mov', 'm4v'] }] })
        if (result.canceled || !result.filePaths[0]) return null
        return videoLibrary.importFile(result.filePaths[0])
      })
      ipcMain.handle('video-studio:video-library:finish', async (event, id: string, durationFrames: number) => { assertTrustedSender(event); return videoLibrary.finishImport(id, durationFrames) })
      ipcMain.handle('video-studio:video-library:rename', async (event, id: string, name: string) => { assertTrustedSender(event); return videoLibrary.rename(id, name) })
      ipcMain.handle('video-studio:video-library:delete', async (event, id: string) => {
        assertTrustedSender(event)
        const next = roteirosSaveQueue.catch(() => undefined).then(async () => {
          const reference = dataPlatform.database?.prepare("SELECT 1 FROM roteiro_sections WHERE json_extract(video_asset_json, '$.id') = ? LIMIT 1").get(id)
          if (reference) throw new Error('Este vídeo está sendo usado em uma abertura ou TikTok. Remova a referência no roteiro antes de excluí-lo da biblioteca.')
          await videoLibrary.delete(id)
        })
        roteirosSaveQueue = next
        await next
      })
      ipcMain.handle('video-studio:video-library:attach', async (event, studioId: string, ids: string[]) => { assertTrustedSender(event); return videoLibrary.attach(studioId, ids) })
      ipcMain.handle('video-studio:preview-media:prepare', async (event, studioId: string, asset: VideoStudioAsset) => {
        assertTrustedSender(event)
        if (!videoPreviewProxyStore) throw new Error('Cache de preview ainda não foi inicializado.')
        if (!asset || typeof asset !== 'object' || typeof asset.id !== 'string') throw new Error('Asset de preview inválido.')
        const source = await videoLibrary.resolveProjectMediaDependency(studioId, asset.id, asset)
        videoPreviewToolsPromise ??= resolveVideoStudioTools().then(async (paths) => ({ ffmpeg: await probeVideoStudioFfmpeg(paths.ffmpeg) }))
        void videoPreviewToolsPromise.catch(() => { videoPreviewToolsPromise = null })
        let tools: { ffmpeg: Awaited<ReturnType<typeof probeVideoStudioFfmpeg>> }
        try {
          tools = await videoPreviewToolsPromise
        } catch (error) {
          // A proxy is optional. If the pinned ffmpeg/ffprobe pair has not
          // been installed yet, Chromium can still play the original source.
          // Do not throw one identical Electron IPC error for every clip.
          if (error instanceof Error && error.message.includes('Prepare resources/video-tools')) {
            return {
              sourceSha256: '',
              proxyUrl: `gacha-video://studio/${studioId}/${asset.id}`,
              waveformUrl: null,
            }
          }
          throw error
        }
        const record = await videoPreviewProxyStore.ensure({ sourcePath: source.path, ffmpeg: tools.ffmpeg })
        return {
          sourceSha256: record.sourceSha256,
          proxyUrl: `gacha-video://preview-proxy/${record.sourceSha256}`,
          waveformUrl: record.waveformFilename ? `gacha-video://preview-waveform/${record.sourceSha256}` : null,
        }
      })
      ipcMain.handle('video-studio:background-library:list', async (event) => { assertTrustedSender(event); return videoBackgroundLibrary.list() })
      ipcMain.handle('video-studio:background-library:import', async (event) => {
        assertTrustedSender(event)
        const result = await dialog.showOpenDialog({ title: 'Biblioteca de fundos: importar', properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
        if (result.canceled || !result.filePaths[0]) return null
        return videoBackgroundLibrary.importFile(result.filePaths[0])
      })
      ipcMain.handle('video-studio:background-library:delete', async (event, id: string) => {
        assertTrustedSender(event)
        if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de fundo inválido.')
        const reference = dataPlatform.database?.prepare('SELECT id, title FROM roteiros WHERE background_asset_id=? LIMIT 1').get(id) as { id: string; title: string } | undefined
        if (reference) throw new Error(`Este fundo está selecionado no roteiro “${reference.title}”. Troque ou remova o fundo antes de excluí-lo permanentemente.`)
        return videoBackgroundLibrary.delete(id)
      })
      ipcMain.handle('video-studio:background-library:attach', async (event, studioId: string, id: string) => { assertTrustedSender(event); return videoBackgroundLibrary.attach(studioId, id) })
      ipcMain.handle('roteiros:ui-gifs:list', async (event) => {
        assertTrustedSender(event)
        const roots = [join(app.getAppPath(), 'src', 'renderer', 'public', 'assets', 'ui', 'loading.gif'), join(app.getAppPath(), 'out', 'renderer', 'assets', 'ui', 'loading.gif')]
        const defaultGifPath = roots.find((path) => existsSync(path))
        if (!defaultGifPath) throw new Error('O GIF padrão do Gacha V5 não foi encontrado na instalação.')
        return roteiroUiGifLibrary.list(defaultGifPath)
      })
      ipcMain.handle('roteiros:ui-gifs:import', async (event) => {
        assertTrustedSender(event)
        const result = await dialog.showOpenDialog({ title: 'Biblioteca de GIFs: adicionar', properties: ['openFile'], filters: [{ name: 'GIF animado', extensions: ['gif'] }] })
        if (result.canceled || !result.filePaths[0]) return null
        return roteiroUiGifLibrary.importFile(result.filePaths[0])
      })
      ipcMain.handle('roteiros:ui-gifs:delete', async (event, id: string) => {
        assertTrustedSender(event)
        if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de GIF inválido.')
        const reference = dataPlatform.database?.prepare('SELECT id, title FROM roteiros WHERE ui_gif_asset_id=? LIMIT 1').get(id) as { id: string; title: string } | undefined
        if (reference) throw new Error(`Este GIF está selecionado no roteiro “${reference.title}”. Remova a associação ao roteiro antes de excluí-lo permanentemente.`)
        return roteiroUiGifLibrary.delete(id)
      })

    }
    ipcMain.handle(`${channel}:save-print`, async (event, id: string, dataUrl: string): Promise<string | null> => {
      assertTrustedSender(event)
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
      const bytes = dataUrlBuffer(dataUrl)
      if (bytes.length > 50 * 1024 * 1024) throw new Error('O print excede o limite de 50 MB.')
      const printsFolder = join(studioPath(id, workspace), 'prints')
      await mkdir(printsFolder, { recursive: true })
      const printPath = join(printsFolder, `print-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.png`)
      await writeFile(printPath, bytes)
      return printPath
    })

    ipcMain.handle(`${channel}:open-prints`, async (event, id: string): Promise<void> => {
      assertTrustedSender(event)
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de Studio inválido.')
      const studioFolder = resolve(studioPath(id, workspace))
      const printsFolder = resolve(studioFolder, 'prints')
      if (dirname(printsFolder) !== studioFolder) throw new Error('Pasta de prints inválida.')
      let folderToOpen = printsFolder
      if (dataFileSystem.locate(printsFolder) && dataPlatform.getDomainState(dataFileSystem.locate(printsFolder)!.domainId).state !== 'legacy') {
        folderToOpen = join(app.getPath('temp'), 'exports', workspace, `studio-${id}`, 'prints')
        await rm(folderToOpen, { recursive: true, force: true })
        await dataFileSystem.materializeDirectory(printsFolder, folderToOpen)
      } else await mkdir(printsFolder, { recursive: true })
      const error = await shell.openPath(folderToOpen)
      if (error) throw new Error(`Não foi possível abrir a pasta de prints: ${error}`)
    })
  }

  registerStudioWorkspace('studio', 'studio')
  registerStudioWorkspace('video', 'video-studio')

  const getRoteiroCharacterExportStore = () => {
    if (!roteiroCharacterExportStore) {
      const root = configuredAppDataRoot ?? join(app.getPath('userData'), 'app-data')
      roteiroCharacterExportStore = new RoteiroCharacterExportStore(join(root, 'temp', 'roteiro-character-export'))
    }
    return roteiroCharacterExportStore
  }
  function assertRoteiroExportOwner(event: IpcMainInvokeEvent, jobId: unknown): asserts jobId is string {
    if (typeof jobId !== 'string' || roteiroCharacterExportJobOwners.get(jobId) !== event.sender.id) throw new Error('Esta exportação não pertence a esta janela.')
  }
  const getRoteiroProjectExportStore = () => {
    if (!roteiroProjectExportStore) roteiroProjectExportStore = new RoteiroProjectExportStore(
      async (id) => { const resolved = await videoBackgroundLibrary.resolve(id); return await dataFileSystem.resolvePhysicalPath(resolved.path) ?? resolved.path },
      async (id) => { const resolved = await roteiroUiGifLibrary.resolve(id); return await dataFileSystem.resolvePhysicalPath(resolved) ?? resolved },
      async (video) => {
        const resolved = await videoLibrary.resolveMedia(video.id)
        if (resolved.extension !== video.extension || resolved.durationFrames !== null && resolved.durationFrames !== video.durationFrames) throw new Error(`O vídeo “${video.name}” não corresponde ao arquivo da biblioteca.`)
        return await dataFileSystem.resolvePhysicalPath(resolved.path) ?? resolved.path
      }
    )
    return roteiroProjectExportStore
  }
  ipcMain.handle('roteiros:assets-export', async (event, request: unknown) => {
    assertTrustedSender(event)
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Solicitação de exportação inválida.')
    const value = request as { roteiro?: unknown; kind?: unknown; characters?: unknown }
    if (!isRoteiroDocument(value.roteiro) || !['background', 'videos', 'script', 'gif'].includes(String(value.kind))) throw new Error('Roteiro ou tipo de exportação inválido.')
    const roteiro = value.roteiro
    let characters: RoteiroExportCharacterInfo[] = []
    if (value.characters !== undefined) {
      if (!Array.isArray(value.characters) || value.characters.length > 500 || !value.characters.every((item) => Boolean(item && typeof item === 'object'
        && typeof item.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
        && roteiro.characterIds.includes(item.id) && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 100
        && Number.isInteger(item.modelSlot) && item.modelSlot >= 1 && item.modelSlot <= 100
        && typeof item.hair === 'string' && item.hair.length <= 255 && typeof item.outfit === 'string' && item.outfit.length <= 255 && typeof item.skin === 'string' && item.skin.length <= 255
        && typeof item.hasFaceAppearance === 'boolean' && Array.isArray(item.poseSlots) && item.poseSlots.length <= 100 && item.poseSlots.every((slot: unknown) => Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) <= 100)
        && Array.isArray(item.expressions) && item.expressions.length <= 500 && item.expressions.every((name: unknown) => typeof name === 'string' && name.length > 0 && name.length <= 100)))
        || new Set(value.characters.map((item: RoteiroExportCharacterInfo) => item.id)).size !== value.characters.length) throw new Error('Dados de personagens inválidos para o TXT.')
      characters = value.characters as RoteiroExportCharacterInfo[]
    }
    return getRoteiroProjectExportStore().export(roteiro, value.kind as 'background' | 'videos' | 'script' | 'gif', characters)
  })
  ipcMain.handle('roteiros:export-folder:open', async (event, request: unknown) => {
    assertTrustedSender(event)
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Solicitação para abrir pasta inválida.')
    const value = request as { roteiro?: unknown; kind?: unknown }
    if (!isRoteiroDocument(value.roteiro) || !['characters', 'background', 'videos', 'script', 'ui'].includes(String(value.kind))) throw new Error('Roteiro ou pasta de exportação inválida.')
    const folder = await getRoteiroProjectExportStore().ensureExportFolder(value.roteiro, value.kind as 'characters' | 'background' | 'videos' | 'script' | 'ui')
    const error = await shell.openPath(folder)
    if (error) throw new Error(`Não foi possível abrir a pasta: ${error}`)
  })
  ipcMain.handle('roteiros:characters-export:start', async (event, request: unknown) => {
    assertTrustedSender(event)
    const result = await getRoteiroCharacterExportStore().start(request)
    roteiroCharacterExportJobOwners.set(result.jobId, event.sender.id)
    event.sender.once('destroyed', () => {
      const abandoned = [...roteiroCharacterExportJobOwners].filter(([, owner]) => owner === event.sender.id).map(([id]) => id)
      for (const id of abandoned) {
        roteiroCharacterExportJobOwners.delete(id)
        void getRoteiroCharacterExportStore().cancel(id).catch(() => undefined)
      }
    })
    return result
  })
  ipcMain.handle('roteiros:characters-export:asset', async (event, jobId: unknown, asset: unknown) => {
    assertTrustedSender(event)
    assertRoteiroExportOwner(event, jobId)
    await getRoteiroCharacterExportStore().writeAsset(jobId, asset)
  })
  ipcMain.handle('roteiros:characters-export:finish', async (event, jobId: unknown) => {
    assertTrustedSender(event)
    assertRoteiroExportOwner(event, jobId)
    const result = await getRoteiroCharacterExportStore().finish(jobId)
    roteiroCharacterExportJobOwners.delete(jobId)
    return result
  })
  ipcMain.handle('roteiros:characters-export:cancel', async (event, jobId: unknown) => {
    assertTrustedSender(event)
    assertRoteiroExportOwner(event, jobId)
    try { await getRoteiroCharacterExportStore().cancel(jobId) }
    finally { roteiroCharacterExportJobOwners.delete(jobId) }
  })

  ipcMain.handle('roteiros:list', async (event): Promise<RoteiroDocument[]> => {
    assertTrustedSender(event)
    await roteirosSaveQueue.catch(() => undefined)
    const db = dataPlatform.database
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const roteiroRows = db.prepare('SELECT id, title, video_title, character_ids_json, background_asset_id, ui_gif_asset_id, preview_details_collapsed FROM roteiros ORDER BY position, created_at, id').all() as Array<{ id: string; title: string; video_title: string; character_ids_json: string; background_asset_id: string | null; ui_gif_asset_id: string | null; preview_details_collapsed: number }>
    const tiktokRows = db.prepare('SELECT id, roteiro_id, title, video_title FROM roteiro_tiktoks ORDER BY roteiro_id, position').all() as Array<{ id: string; roteiro_id: string; title: string; video_title: string }>
    const sectionRows = db.prepare('SELECT section_id, roteiro_id, section_kind, video_asset_json, blocks_json, description_text, timeline, scene_end_seconds, first_group_reaction_seconds, second_group_reaction_seconds, additional_context FROM roteiro_sections').all() as Array<{ section_id: string; roteiro_id: string; section_kind: 'opening' | 'tiktok'; video_asset_json: string | null; blocks_json: string; description_text: string; timeline: RoteiroSectionContent['timeline']; scene_end_seconds: number | null; first_group_reaction_seconds: number | null; second_group_reaction_seconds: number | null; additional_context: string }>
    const contentById = new Map(sectionRows.map((row) => [row.section_id, {
      video: row.video_asset_json ? JSON.parse(row.video_asset_json) as RoteiroVideoReference : null,
      blocks: JSON.parse(row.blocks_json) as RoteiroReactionBlock[],
      description: row.description_text,
      additionalContext: row.additional_context,
      timeline: row.timeline,
      ...(row.scene_end_seconds === null ? {} : { sceneEndSeconds: row.scene_end_seconds }),
      ...(row.first_group_reaction_seconds === null ? {} : { firstGroupReactionSeconds: row.first_group_reaction_seconds }),
      ...(row.second_group_reaction_seconds === null ? {} : { secondGroupReactionSeconds: row.second_group_reaction_seconds })
    }]))
    const tiktoksByRoteiro = new Map<string, RoteiroDocument['tiktoks']>()
    for (const row of tiktokRows) {
      const items = tiktoksByRoteiro.get(row.roteiro_id) ?? []
      items.push({ id: row.id, title: row.title, videoTitle: row.video_title, ...(contentById.get(row.id) ?? { video: null, blocks: [], description: '' }) })
      tiktoksByRoteiro.set(row.roteiro_id, items)
    }
    return roteiroRows.map((row) => ({
      id: row.id, title: row.title, videoTitle: row.video_title,
      characterIds: JSON.parse(row.character_ids_json) as string[],
      ...(row.background_asset_id ? { backgroundAssetId: row.background_asset_id } : {}),
      ...(row.ui_gif_asset_id ? { uiGifAssetId: row.ui_gif_asset_id } : {}),
      previewDetailsCollapsed: Boolean(row.preview_details_collapsed),
      opening: contentById.get(`${row.id}:opening`) ?? { video: null, blocks: [], description: '' },
      tiktoks: tiktoksByRoteiro.get(row.id) ?? []
    }))
  })

  ipcMain.handle('roteiros:save', async (event, roteiros: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (!Array.isArray(roteiros) || roteiros.length > 2000 || !roteiros.every(isRoteiroDocument)
      || new Set(roteiros.map((roteiro: RoteiroDocument) => roteiro.id)).size !== roteiros.length
      || new Set(roteiros.flatMap((roteiro: RoteiroDocument) => roteiro.tiktoks.map((tiktok) => tiktok.id))).size !== roteiros.reduce((total: number, roteiro: RoteiroDocument) => total + roteiro.tiktoks.length, 0)) {
      throw new Error('A lista de roteiros enviada para salvar é inválida.')
    }
    const next = roteirosSaveQueue.catch(() => undefined).then(() => {
      const db = dataPlatform.database
      if (!db) throw new Error('Catálogo de dados não inicializado.')
      const now = new Date().toISOString()
      const save = db.transaction((documents: RoteiroDocument[]) => {
        const oldRoteiros = db.prepare('SELECT id, title, video_title, character_ids_json, position FROM roteiros').all() as Array<{ id: string; title: string; video_title: string; character_ids_json: string; position: number }>
        const oldTikToks = db.prepare('SELECT id, roteiro_id, title, video_title, position FROM roteiro_tiktoks').all() as Array<{ id: string; roteiro_id: string; title: string; video_title: string; position: number }>
        const oldSections = db.prepare('SELECT section_id FROM roteiro_sections').all() as Array<{ section_id: string }>
        const routeIds = new Set(documents.map((item) => item.id))
        const tikTokIds = new Set(documents.flatMap((item) => item.tiktoks.map((tiktok) => tiktok.id)))
        const sectionIds = new Set(documents.flatMap((item) => [`${item.id}:opening`, ...item.tiktoks.map((tiktok) => tiktok.id)]))
        const deleteSection = db.prepare('DELETE FROM roteiro_sections WHERE section_id=?')
        const deleteTikTok = db.prepare('DELETE FROM roteiro_tiktoks WHERE id=?')
        const deleteRoteiro = db.prepare('DELETE FROM roteiros WHERE id=?')
        for (const row of oldSections) if (!sectionIds.has(row.section_id)) deleteSection.run(row.section_id)
        for (const row of oldTikToks) if (!tikTokIds.has(row.id)) deleteTikTok.run(row.id)
        for (const row of oldRoteiros) if (!routeIds.has(row.id)) deleteRoteiro.run(row.id)

        // Positions are unique per roteiro. Shift only parents whose order changed,
        // then write their final positions without transient uniqueness collisions.
        const oldTikToksByParent = new Map<string, typeof oldTikToks>()
        for (const row of oldTikToks) {
          if (!tikTokIds.has(row.id)) continue
          const rows = oldTikToksByParent.get(row.roteiro_id) ?? []
          rows.push(row)
          oldTikToksByParent.set(row.roteiro_id, rows)
        }
        const shiftTikTokPositions = db.prepare('UPDATE roteiro_tiktoks SET position=position+1000000 WHERE roteiro_id=?')
        for (const roteiro of documents) {
          const old = oldTikToksByParent.get(roteiro.id) ?? []
          const oldById = new Map(old.map((row) => [row.id, row]))
          if (roteiro.tiktoks.some((tiktok, position) => oldById.has(tiktok.id) && oldById.get(tiktok.id)!.position !== position)) shiftTikTokPositions.run(roteiro.id)
        }

        const upsertRoteiro = db.prepare(`INSERT INTO roteiros(id, title, video_title, character_ids_json, background_asset_id, ui_gif_asset_id, preview_details_collapsed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, video_title=excluded.video_title, character_ids_json=excluded.character_ids_json, background_asset_id=excluded.background_asset_id, ui_gif_asset_id=excluded.ui_gif_asset_id, preview_details_collapsed=excluded.preview_details_collapsed, position=excluded.position, updated_at=excluded.updated_at
          WHERE roteiros.title IS NOT excluded.title OR roteiros.video_title IS NOT excluded.video_title OR roteiros.character_ids_json IS NOT excluded.character_ids_json OR roteiros.background_asset_id IS NOT excluded.background_asset_id OR roteiros.ui_gif_asset_id IS NOT excluded.ui_gif_asset_id OR roteiros.preview_details_collapsed IS NOT excluded.preview_details_collapsed OR roteiros.position IS NOT excluded.position`)
        const upsertTikTok = db.prepare(`INSERT INTO roteiro_tiktoks(id, roteiro_id, title, video_title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET roteiro_id=excluded.roteiro_id, title=excluded.title, video_title=excluded.video_title, position=excluded.position, updated_at=excluded.updated_at
          WHERE roteiro_tiktoks.roteiro_id IS NOT excluded.roteiro_id OR roteiro_tiktoks.title IS NOT excluded.title OR roteiro_tiktoks.video_title IS NOT excluded.video_title OR roteiro_tiktoks.position IS NOT excluded.position`)
        const upsertSection = db.prepare(`INSERT INTO roteiro_sections(section_id, roteiro_id, section_kind, video_asset_json, blocks_json, description_text, timeline, scene_end_seconds, first_group_reaction_seconds, second_group_reaction_seconds, additional_context, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(section_id) DO UPDATE SET roteiro_id=excluded.roteiro_id, section_kind=excluded.section_kind, video_asset_json=excluded.video_asset_json, blocks_json=excluded.blocks_json, description_text=excluded.description_text, timeline=excluded.timeline, scene_end_seconds=excluded.scene_end_seconds, first_group_reaction_seconds=excluded.first_group_reaction_seconds, second_group_reaction_seconds=excluded.second_group_reaction_seconds, additional_context=excluded.additional_context, updated_at=excluded.updated_at
          WHERE roteiro_sections.roteiro_id IS NOT excluded.roteiro_id OR roteiro_sections.section_kind IS NOT excluded.section_kind OR roteiro_sections.video_asset_json IS NOT excluded.video_asset_json OR roteiro_sections.blocks_json IS NOT excluded.blocks_json OR roteiro_sections.description_text IS NOT excluded.description_text OR roteiro_sections.timeline IS NOT excluded.timeline OR roteiro_sections.scene_end_seconds IS NOT excluded.scene_end_seconds OR roteiro_sections.first_group_reaction_seconds IS NOT excluded.first_group_reaction_seconds OR roteiro_sections.second_group_reaction_seconds IS NOT excluded.second_group_reaction_seconds OR roteiro_sections.additional_context IS NOT excluded.additional_context`)
        documents.forEach((roteiro, position) => {
          upsertRoteiro.run(roteiro.id, roteiro.title.trim(), roteiro.videoTitle.trim(), JSON.stringify(roteiro.characterIds), roteiro.backgroundAssetId ?? null, roteiro.uiGifAssetId ?? null, roteiro.previewDetailsCollapsed ? 1 : 0, position, now, now)
          const opening = roteiro.opening ?? { video: null, blocks: [], description: '' }
          upsertSection.run(`${roteiro.id}:opening`, roteiro.id, 'opening', opening.video ? JSON.stringify(opening.video) : null, JSON.stringify(opening.blocks), opening.description ?? '', opening.timeline ?? 'unspecified', opening.sceneEndSeconds ?? null, opening.firstGroupReactionSeconds ?? null, opening.secondGroupReactionSeconds ?? null, opening.additionalContext ?? '', now)
          roteiro.tiktoks.forEach((tiktok, tiktokPosition) => {
            upsertTikTok.run(tiktok.id, roteiro.id, tiktok.title.trim(), tiktok.videoTitle.trim(), tiktokPosition, now, now)
            const content = { video: tiktok.video ?? null, blocks: tiktok.blocks ?? [], description: tiktok.description ?? '', timeline: tiktok.timeline ?? 'unspecified', sceneEndSeconds: tiktok.sceneEndSeconds, firstGroupReactionSeconds: tiktok.firstGroupReactionSeconds, secondGroupReactionSeconds: tiktok.secondGroupReactionSeconds, additionalContext: tiktok.additionalContext ?? '' }
            upsertSection.run(tiktok.id, roteiro.id, 'tiktok', content.video ? JSON.stringify(content.video) : null, JSON.stringify(content.blocks), content.description, content.timeline, content.sceneEndSeconds ?? null, content.firstGroupReactionSeconds ?? null, content.secondGroupReactionSeconds ?? null, content.additionalContext, now)
          })
        })
      })
      save(roteiros as RoteiroDocument[])
    })
    roteirosSaveQueue = next
    await next
  })

  ipcMain.handle('roteiros:export-logs:list', async (event, roteiroId: unknown): Promise<RoteiroExportLog[]> => {
    assertTrustedSender(event)
    if (typeof roteiroId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roteiroId)) throw new Error('Identificador de roteiro inválido.')
    await roteirosSaveQueue.catch(() => undefined)
    const db = dataPlatform.database
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    return (db.prepare('SELECT id, roteiro_id, created_at, action, status, details FROM roteiro_export_logs WHERE roteiro_id=? ORDER BY created_at DESC, id DESC LIMIT 50').all(roteiroId) as Array<{ id: string; roteiro_id: string; created_at: string; action: string; status: 'success' | 'error'; details: string }>).map((row) => ({ id: row.id, roteiroId: row.roteiro_id, createdAt: row.created_at, action: row.action, status: row.status, details: row.details }))
  })

  ipcMain.handle('roteiros:export-logs:append', async (event, roteiroId: unknown, value: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (typeof roteiroId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roteiroId)
      || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dados do log de exportação inválidos.')
    const entry = value as RoteiroExportLog
    if (entry.roteiroId !== roteiroId || typeof entry.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id)
      || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))
      || typeof entry.action !== 'string' || !entry.action.trim() || entry.action.length > 120
      || !['success', 'error'].includes(entry.status) || typeof entry.details !== 'string' || entry.details.length > 5000) throw new Error('Dados do log de exportação inválidos.')
    const db = dataPlatform.database
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const next = roteirosSaveQueue.catch(() => undefined).then(() => {
      const save = db.transaction(() => {
        db.prepare('INSERT INTO roteiro_export_logs(id, roteiro_id, created_at, action, status, details) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, roteiroId, entry.createdAt, entry.action.trim(), entry.status, entry.details)
        db.prepare('DELETE FROM roteiro_export_logs WHERE roteiro_id=? AND id NOT IN (SELECT id FROM roteiro_export_logs WHERE roteiro_id=? ORDER BY created_at DESC, id DESC LIMIT 50)').run(roteiroId, roteiroId)
      })
      save()
    })
    roteirosSaveQueue = next
    await next
  })

  ipcMain.handle('roteiros:export-logs:clear', async (event, roteiroId: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (typeof roteiroId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roteiroId)) throw new Error('Identificador de roteiro inválido.')
    const db = dataPlatform.database
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const next = roteirosSaveQueue.catch(() => undefined).then(() => { db.prepare('DELETE FROM roteiro_export_logs WHERE roteiro_id=?').run(roteiroId) })
    roteirosSaveQueue = next
    await next
  })

  // Módulo Base de Vídeos: IPC → casos de uso → repositório SQLite.
  // Compartilha a fila existente de Roteiros para conservar a ordem das gravações.
  registerBaseVideoHandlers(ipcMain, assertTrustedSender, new BaseVideoService({
    getDatabase: () => dataPlatform.database,
    enqueueWrite: <T>(operation: () => Promise<T> | T): Promise<T> => {
      const next = roteirosSaveQueue.catch(() => undefined).then(operation)
      roteirosSaveQueue = next.then(() => undefined)
      return next
    },
    resolveMedia: (id) => videoLibrary.resolveMedia(id),
    assertMediaAccessible: async (path) => {
      const physical = await dataFileSystem.resolvePhysicalPath(path)
      if (physical) await nativeAccess(physical)
      else await dataFileSystem.access(path)
    },
    deleteLibraryVideo: (id) => videoLibrary.delete(id)
  }))

  registerCustomizerCharacterHandlers(ipcMain, assertTrustedSender, customizerService, measureIpc)

  // A leitura do catálogo também recupera um slot que ficou sem nome após queda
  // entre as duas renomeações da publicação. Não remove nem escolhe backups ambíguos.
  const recoverSlot = (slot: number) =>
    recoverModelSourceSlot(slot, slotPath, { readdir, readFile, rename, rm })
  registerFabricatorModelCatalogHandlers(ipcMain, assertTrustedSender, {
    listSlots: async () => {
      for (let slot = 1; slot <= slotCount; slot += 1) await recoverSlot(slot)
      return fabricatorModelCatalog.listSlots()
    },
    loadSlot: async (slot) => {
      if (isValidSlot(slot)) await recoverSlot(slot)
      return fabricatorModelCatalog.loadSlot(slot)
    }
  })

  ipcMain.handle('fabricator:import-model', async (event, slot: number) => {
    assertTrustedSender(event)
    if (!isValidSlot(slot)) throw new Error('Slot inválido.')
    const result = await dialog.showOpenDialog({
      title: 'Importar folha de modelo',
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const extension = extname(path).toLowerCase()
    const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
    if (!supportedExtensions.has(extension)) throw new Error('Formato incompatível. Use PNG, JPG ou WebP.')
    const fileStat = await stat(path)
    if (fileStat.size > 50 * 1024 * 1024) throw new Error('A imagem excede o limite de 50 MB.')
    if (fileStat.size === 0) throw new Error('O arquivo de imagem está vazio.')
    const bytes = await readFile(path)
    const canonical = await normalizeImageBuffer(bytes)
    if (canonical.bitDepth > 8) throw new Error('O Fabricador processa a folha em 8 bits. O PNG de 16 bits não foi alterado; converta uma cópia para 8 bits para importar neste editor.')
    const sourceDataUrl = `data:image/png;base64,${canonical.bytes.toString('base64')}`
    const destination = slotPath(slot)
    const sourceAssetName = `source-${randomUUID()}.png`
    await mkdir(destination, { recursive: true })
    await writeFile(join(destination, sourceAssetName), canonical.bytes)
    return { sourceName: basename(path), sourceAssetName, sourceDataUrl }
  })

  ipcMain.handle('fabricator:save-project', async (event, project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidSlot(project.slot)) throw new Error('Projeto inválido.')
    const slot = project.slot
    const previous = fabricatorSaveQueues.get(slot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(() => writeFabricatorProject(project, changedAssets))
    fabricatorSaveQueues.set(slot, current)
    try { await current } finally {
      if (fabricatorSaveQueues.get(slot) === current) fabricatorSaveQueues.delete(slot)
    }
  })


  registerModelSourceDownloadHandlers(ipcMain, assertTrustedSender, () => app.getPath('downloads'))

  ipcMain.handle(fabricatorIpcChannels.publishFabricatorModelSource, async (event, request: ModelSourcePublishRequest): Promise<string> => {
    assertTrustedSender(event)
    if (!request || !isValidSlot(request.project?.slot)) throw new Error('Slot inválido.')
    const slot = request.project.slot
    const previous = fabricatorSaveQueues.get(slot) ?? Promise.resolve()
    const job = previous.catch(() => undefined).then(async () => {
      await recoverModelSourceSlot(slot, slotPath, { readdir, readFile, rename, rm })
      return publishModelSource(request, slotPath, writeFabricatorProject, { mkdir, readFile, writeFile, readdir, rename, rm })
    })
    const queue = job.then(() => undefined)
    fabricatorSaveQueues.set(slot, queue)
    try { return await job } finally {
      if (fabricatorSaveQueues.get(slot) === queue) fabricatorSaveQueues.delete(slot)
    }
  })

  ipcMain.handle('fabricator:load-history', async (event, slot: number): Promise<FabricatorHistoryState> => {
    assertTrustedSender(event)
    if (!isValidSlot(slot)) throw new Error('Slot inválido.')
    try { return await readFabricatorHistory(slot) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return { undo: [], redo: [] }
      throw reason
    }
  })

  ipcMain.handle('fabricator:save-history', async (event, slot: number, history: FabricatorHistorySaveState, current: FabricatorProjectSave, changedAssets: FabricatorAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidSlot(slot) || current.slot !== slot) throw new Error('Slot inválido.')
    const previous = fabricatorSaveQueues.get(slot) ?? Promise.resolve()
    const save = previous.catch(() => undefined).then(async () => {
      await writeFabricatorHistory(slot, history)
      await writeFabricatorProject(current, changedAssets)
    })
    fabricatorSaveQueues.set(slot, save)
    try { await save } finally {
      if (fabricatorSaveQueues.get(slot) === save) fabricatorSaveQueues.delete(slot)
    }
  })

  ipcMain.handle('fabricator:delete-slot', async (event, slot: number): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidSlot(slot)) throw new Error('Slot inválido.')
    const previous = fabricatorSaveQueues.get(slot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      const base = resolve(libraryPath())
      const target = resolve(slotPath(slot))
      if (dirname(target) !== base || basename(target) !== `slot-${slot}`) throw new Error('Caminho de exclusão inválido.')
      await rm(target, { recursive: true, force: true })
    })
    fabricatorSaveQueues.set(slot, current)
    try { await current } finally {
      if (fabricatorSaveQueues.get(slot) === current) fabricatorSaveQueues.delete(slot)
    }
  })

  registerFabricatorPoseHandlers({
    ipcMain, assertTrustedSender, ensureLegacyPoseMigration, isValidModelSlot, isValidPoseSlot,
    slotCount, poseSlotCount, poseSlotPath, poseModelPath, poseDraftPath,
    queuePoseWrite, readPoseProject, writePoseProject, readPoseDraft, writePoseDraft,
    files: { readFile, writeFile, mkdir, rename, rm }
  })

  registerFabricatorAnimatorHandlers({
    ipcMain, assertTrustedSender, isValidModelSlot, isValidAnimatorSlot, poseSlotCount,
    animatorLibraryPath, animatorModelPath, animatorSlotPath, animatorDraftPath,
    readAnimatorAnimation, writeAnimatorAnimation, readAnimatorDraft, writeAnimatorDraft,
    getQueue: () => animatorSaveQueue,
    setQueue: next => { animatorSaveQueue = next },
    files: { readFile, readdir, rm }
  })

    registerFabricatorWardrobeCatalogHandlers(ipcMain, assertTrustedSender,
      new FabricatorWardrobeCatalog(wardrobeModelPath, { readdir, readFile }, slotCount,
        (folder) => catalogPersistence.recoverWardrobeManifest(folder)))

  ipcMain.handle(fabricatorIpcChannels.loadWardrobeSet, async (event, modelSlot: number, id: string): Promise<WardrobeSet | null> => {
    assertTrustedSender(event)
    return readWardrobeSet(modelSlot, id)
  })

  ipcMain.handle(fabricatorIpcChannels.saveWardrobeSet, async (event, modelSlot: number, set: WardrobeSetSave, assets: WardrobeAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    const next = wardrobeSaveQueue.catch(() => undefined).then(() => writeWardrobeSet(modelSlot, set, assets))
    wardrobeSaveQueue = next
    await next
  })

  ipcMain.handle(fabricatorIpcChannels.deleteWardrobeSet, async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Conjunto de roupa inválido.')
    const base = resolve(wardrobeModelPath(modelSlot))
    const target = resolve(wardrobeSetPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `set-${id}`) throw new Error('Caminho de exclusão inválido.')
    const next = wardrobeSaveQueue.catch(() => undefined).then(() => rm(target, { recursive: true, force: true }))
    wardrobeSaveQueue = next
    await next
  })

  const catalogListings = createFabricatorCatalogListings({
    files:{readdir,readFile},
    validSlot:isValidModelSlot,
    faceModelPath,hairModelPath,
    validFace:validFaceSet,validHair:validHairStyle,
    recover:(folder,images)=>catalogPersistence.recoverCatalogManifest(folder,images),
    readLegacyHair:readHairWorkspace
  })
  ipcMain.handle('fabricator:face:list', async (event, modelSlot: number): Promise<FaceSetSummary[]> => {
    assertTrustedSender(event)
    return catalogListings.listFaces(modelSlot)
  })

  ipcMain.handle('fabricator:face:load', async (event, modelSlot: number, id: string): Promise<FaceSet | null> => {
    assertTrustedSender(event)
    return readFaceSet(modelSlot, id)
  })

  ipcMain.handle('fabricator:face:save', async (event, modelSlot: number, set: FaceSetSave, assets: FaceAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    const next = faceSaveQueue.catch(() => undefined).then(() => writeFaceSet(modelSlot, set, assets))
    faceSaveQueue = next
    await next
  })

  ipcMain.handle('fabricator:face:delete', async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Rosto inválido.')
    const base = resolve(faceModelPath(modelSlot))
    const target = resolve(faceSetPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `set-${id}`) throw new Error('Caminho de exclusão inválido.')
    const next = faceSaveQueue.catch(() => undefined).then(() => rm(target, { recursive: true, force: true }))
    faceSaveQueue = next
    await next
  })

  ipcMain.handle('fabricator:face-catalog:list', async (event, modelSlot: number): Promise<FaceCatalogItemSummary[]> => {
    assertTrustedSender(event)
    return listFaceCatalogItems(modelSlot)
  })

  ipcMain.handle('fabricator:face-catalog:load', async (event, modelSlot: number, id: string): Promise<FaceCatalogItem | null> => {
    assertTrustedSender(event)
    return readFaceCatalogItem(modelSlot, id)
  })

  ipcMain.handle('fabricator:face-catalog:save', async (event, modelSlot: number, item: FaceCatalogItemSave, assets: FaceAssetSave[]): Promise<void> => {
    assertTrustedSender(event)
    const next = faceSaveQueue.catch(() => undefined).then(() => writeFaceCatalogItem(modelSlot, item, assets))
    faceSaveQueue = next
    await next
  })

  ipcMain.handle('fabricator:face-catalog:delete', async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidFaceCatalogId(id)) throw new Error('Peça facial inválida.')
    const base = resolve(faceCatalogPath(modelSlot))
    const target = resolve(faceCatalogItemPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `item-${id}`) throw new Error('Caminho de exclusão inválido.')
    const next = faceSaveQueue.catch(() => undefined).then(() => rm(target, { recursive: true, force: true }))
    faceSaveQueue = next
    await next
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
    saveDraft: writeFaceExpressionWorkspaceDraft
  })

  ipcMain.handle('fabricator:face-animation:export', async (event, modelSlot: number, data: Uint8Array): Promise<boolean> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !(data instanceof Uint8Array) || data.byteLength < 4 || data.byteLength > 250 * 1024 * 1024 || data[0] !== 0x1a || data[1] !== 0x45 || data[2] !== 0xdf || data[3] !== 0xa3) {
      throw new Error('Arquivo de animação facial inválido ou maior que 250 MB.')
    }
    const options = {
      title: 'Exportar animação do rosto',
      defaultPath: `animador-rosto-modelo-${String(modelSlot).padStart(2, '0')}.webm`,
      filters: [{ name: 'Vídeo WebM', extensions: ['webm'] }]
    }
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    const destination = result.filePath.toLowerCase().endsWith('.webm') ? result.filePath : `${result.filePath}.webm`
    await writeFile(destination, Buffer.from(data))
    return true
  })
  ipcMain.handle(fabricatorIpcChannels.listFaceComponentAssets, async (event, modelSlot: number, kind?: FaceAssetKind): Promise<FaceComponentAssetSummary[]> => {
    assertTrustedSender(event)
    return listFaceComponentAssets(modelSlot, kind)
  })
  ipcMain.handle(fabricatorIpcChannels.loadFaceComponentAsset, async (event, modelSlot: number, id: string): Promise<FaceComponentAsset | null> => {
    assertTrustedSender(event)
    return readFaceComponentAsset(modelSlot, id)
  })
  ipcMain.handle(fabricatorIpcChannels.saveFaceComponentAsset, async (event, modelSlot: number, asset: FaceComponentAssetSave, dataUrl: string): Promise<void> => {
    assertTrustedSender(event)
    const next = faceSaveQueue.catch(() => undefined).then(() => writeFaceComponentAsset(modelSlot, asset, dataUrl))
    faceSaveQueue = next
    await next
  })
  ipcMain.handle(fabricatorIpcChannels.deleteFaceComponentAsset, async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Asset facial inválido.')
    const base = resolve(faceComponentPath(modelSlot))
    const target = resolve(faceComponentItemPath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `item-${id}`) throw new Error('Caminho de exclusão inválido.')
    const next = faceSaveQueue.catch(() => undefined).then(() => rm(target, { recursive: true, force: true }))
    faceSaveQueue = next
    await next
  })
  ipcMain.handle('fabricator:face-guides:load', async (event, profile: string) => {
    assertTrustedSender(event)
    if (!isFaceGuideProfile(profile)) throw new Error('Perfil de guias inválido.')
    return readFaceGuides(profile)
  })
  ipcMain.handle('fabricator:face-guides:save', async (event, profile: string, guides: unknown): Promise<void> => {
    assertTrustedSender(event)
    if (!isFaceGuideProfile(profile)) throw new Error('Perfil de guias inválido.')
    const next = faceGuideSaveQueue.catch(() => undefined).then(() => writeFaceGuides(profile, guides))
    faceGuideSaveQueue = next
    await next
  })

  ipcMain.handle(fabricatorIpcChannels.loadHairWorkspace, async (event, modelSlot: number): Promise<HairWorkspace | null> => {
    assertTrustedSender(event)
    return readHairWorkspace(modelSlot)
  })

  ipcMain.handle(fabricatorIpcChannels.saveHairWorkspace, async (event, modelSlot: number, workspace: HairWorkspaceSave, assets: HairWorkspaceAsset[]): Promise<void> => {
    assertTrustedSender(event)
    const previous = hairSaveQueues.get(modelSlot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(() => writeHairWorkspace(modelSlot, workspace, assets))
    hairSaveQueues.set(modelSlot, current)
    try { await current } finally { if (hairSaveQueues.get(modelSlot) === current) hairSaveQueues.delete(modelSlot) }
  })

  ipcMain.handle(fabricatorIpcChannels.listHairStyles, async (event, modelSlot: number): Promise<HairStyleSummary[]> => {
    assertTrustedSender(event)
    return catalogListings.listHair(modelSlot)
  })

  ipcMain.handle(fabricatorIpcChannels.loadHairStyle, async (event, modelSlot: number, id: string): Promise<HairStyle | null> => {
    assertTrustedSender(event)
    return readHairStyle(modelSlot, id)
  })

  ipcMain.handle(fabricatorIpcChannels.saveHairStyle, async (event, modelSlot: number, style: HairStyleSave, assets: HairStyleAsset[]): Promise<void> => {
    assertTrustedSender(event)
    const previous = hairSaveQueues.get(modelSlot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(() => writeHairStyle(modelSlot, style, assets))
    hairSaveQueues.set(modelSlot, current)
    try { await current } finally { if (hairSaveQueues.get(modelSlot) === current) hairSaveQueues.delete(modelSlot) }
  })

  ipcMain.handle(fabricatorIpcChannels.deleteHairStyle, async (event, modelSlot: number, id: string): Promise<void> => {
    assertTrustedSender(event)
    if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Estilo de cabelo inválido.')
    const base = resolve(join(hairModelPath(modelSlot), 'styles'))
    const target = resolve(hairStylePath(modelSlot, id))
    if (dirname(target) !== base || basename(target) !== `style-${id}`) throw new Error('Caminho de exclusão inválido.')
    const previous = hairSaveQueues.get(modelSlot) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(() => rm(target, { recursive: true, force: true }))
    hairSaveQueues.set(modelSlot, current)
    try { await current } finally { if (hairSaveQueues.get(modelSlot) === current) hairSaveQueues.delete(modelSlot) }
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
      const candidates = ['mp4', 'webm', 'mov', 'm4v'] as const
      let path: string | undefined
      let extension: typeof candidates[number] | undefined
      if (url.hostname === 'library' && parts.length === 1 && uuid.test(parts[0])) {
        const media = await videoLibrary.resolveMedia(parts[0])
        path = media.path
        extension = media.extension
      } else if (url.hostname === 'studio' && parts.length === 2 && parts.every((part) => uuid.test(part))) {
        const folder = join(studioPath(parts[0], 'video'), 'videos')
        for (const candidate of candidates) {
          const candidatePath = join(folder, `${parts[1]}.${candidate}`)
          try { await access(candidatePath); path = candidatePath; extension = candidate; break } catch { /* try next extension */ }
        }
      } else if (url.hostname === 'export-job' && parts.length === 2 && parts.every((part) => uuid.test(part))) {
        if (!videoExportJobStore) return new Response('Export job unavailable', { status: 503 })
        const media = await videoExportJobStore.resolvePinnedMedia(parts[0], parts[1])
        path = media.path
        extension = media.extension
      } else if ((url.hostname === 'preview-proxy' || url.hostname === 'preview-waveform') && parts.length === 1 && /^[a-f0-9]{64}$/i.test(parts[0])) {
        if (!videoPreviewProxyStore) return new Response('Preview cache unavailable', { status: 503 })
        const kind = url.hostname === 'preview-proxy' ? 'proxy' : 'waveform'
        path = await videoPreviewProxyStore.resolveFile(parts[0].toLowerCase(), kind)
        if (kind === 'proxy') extension = 'mp4'
        else {
          const file = await stat(path)
          const range = request.headers.get('range')
          const headers = new Headers({ 'content-type': 'image/png', 'content-length': String(file.size), 'cache-control': 'public, max-age=31536000, immutable' })
          if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
          if (range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
          return new Response(Readable.toWeb(createReadStream(path)) as unknown as BodyInit, { status: 200, headers })
        }
      }
      if (!path || !extension) return new Response('Not found', { status: 404 })
      path = await dataFileSystem.resolvePhysicalPath(path) ?? path
      const file = await stat(path)
      const mimeType = ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' } as const)[extension]
      const range = request.headers.get('range')
      const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': mimeType, 'cache-control': 'no-store' })
      if (request.method === 'HEAD') {
        headers.set('content-length', String(file.size))
        return new Response(null, { status: 200, headers })
      }
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
        const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]))
        const end = match[2] && match[1] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= file.size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
        headers.set('content-range', `bytes ${start}-${end}/${file.size}`)
        headers.set('content-length', String(end - start + 1))
        return new Response(Readable.toWeb(createReadStream(path, { start, end })) as unknown as BodyInit, { status: 206, headers })
      }
      headers.set('content-length', String(file.size))
      return new Response(Readable.toWeb(createReadStream(path)) as unknown as BodyInit, { status: 200, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
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

let fabricatorDesignSettingsActivation: Promise<void> | null = null
async function activateFabricatorDesignSettingsDomain(): Promise<void> {
  if (fabricatorDesignSettingsActivation) return fabricatorDesignSettingsActivation
  fabricatorDesignSettingsActivation = (async () => {
    const domainId = 'fabricator.design-settings'
    const current = dataPlatform.getDomainState(domainId).state
    if (current === 'active' || current === 'verified') return
    if (current !== 'legacy') throw new Error(`O armazenamento de Design Dev está em estado ${current}; a gravação foi interrompida.`)

    // Preserve and copy a pre-catalog settings file before switching this new
    // domain to app-data. The source remains untouched for rollback.
    const legacyPath = join(app.getPath('userData'), 'fabricator', 'design-settings', 'settings.json')
    let legacy: Buffer | null = null
    try { legacy = await nativeReadFile(legacyPath) }
    catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
    dataPlatform.setDomainState(domainId, 'active', { activatedAt: new Date().toISOString(), legacySourcePreserved: Boolean(legacy) })
    try {
      if (legacy) await writeFile(legacyPath, legacy)
    } catch (reason) {
      dataPlatform.setDomainState(domainId, 'legacy', { activationFailed: true, sourcePreserved: true })
      throw reason
    }
  })()
  try { await fabricatorDesignSettingsActivation }
  catch (reason) { fabricatorDesignSettingsActivation = null; throw reason }
}

app.whenReady().then(async () => {
  const packagedToolsSmokeOutput = process.env.GACHA_VIDEO_TOOLS_SMOKE_OUTPUT
  if (packagedToolsSmokeOutput) {
    if (!app.isPackaged) throw new Error('O smoke de ferramentas empacotadas exige app.isPackaged=true.')
    const output = resolve(packagedToolsSmokeOutput)
    if (output !== packagedToolsSmokeOutput) throw new Error('Smoke output precisa usar caminho absoluto.')
    const paths = await resolveVideoStudioTools()
    if (paths.source !== 'packaged') throw new Error(`Smoke empacotado resolveu ferramentas de origem inesperada: ${paths.source}.`)
    const capability = await probeVideoStudioFfmpeg(paths.ffmpeg)
    const report = {
      schemaVersion: 1,
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      toolSource: paths.source,
      videoEncoder: capability.videoEncoder,
      audioEncoder: capability.audioEncoder,
      smokeEncoded: capability.smokeEncoded,
      versionLine: capability.versionLine,
    }
    await nativeWriteFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    app.quit()
    return
  }
  dataBackupService = new DataBackupService({ dataRoot: app.getPath('appData'), catalog: dataPlatform })
  await dataBackupService.applyPendingRestore()
  dataPlatform.initialize()
  ipcMain.handle('app:image:normalize', async (event, input: Uint8Array) => {
    assertTrustedSender(event)
    if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > 50 * 1024 * 1024) throw new Error('O arquivo de imagem está vazio ou excede 50 MB.')
    const canonical = await normalizeImageBuffer(Buffer.from(input.buffer, input.byteOffset, input.byteLength))
    return { dataUrl: `data:image/png;base64,${canonical.bytes.toString('base64')}`, width: canonical.width,
      height: canonical.height, bitDepth: canonical.bitDepth, sourceBytes: canonical.sourceBytes, outputBytes: canonical.outputBytes }
  })
  ipcMain.handle('fabricator:design-settings:load', async (event) => {
    assertTrustedSender(event)
    await activateFabricatorDesignSettingsDomain()
    const target = join(app.getPath('userData'), 'fabricator', 'design-settings', 'settings.json')
    try { return JSON.parse(await readFile(target, 'utf8')) as unknown }
    catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null; throw reason }
  })
  ipcMain.handle('fabricator:design-settings:save', async (event, settings: unknown) => {
    assertTrustedSender(event)
    await activateFabricatorDesignSettingsDomain()
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Configuração de Design Dev inválida.')
    const value = settings as { bannerSlides?: unknown[] }
    if (!Array.isArray(value.bannerSlides) || value.bannerSlides.length < 1 || value.bannerSlides.length > 8) throw new Error('O Design Dev deve ter entre 1 e 8 slides.')
    const serialized = JSON.stringify(settings)
    if (serialized.length > 70_000_000) throw new Error('As imagens do Design Dev excedem o limite de armazenamento.')
    for (const raw of value.bannerSlides) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Slide do Design Dev inválido.')
      const slide = raw as { id?: unknown; title?: unknown; subtitle?: unknown; imageDataUrl?: unknown }
      if (typeof slide.id !== 'string' || slide.id.length > 160 || typeof slide.title !== 'string' || slide.title.length > 80
        || typeof slide.subtitle !== 'string' || slide.subtitle.length > 120
        || (slide.imageDataUrl !== null && (typeof slide.imageDataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(slide.imageDataUrl)))) {
        throw new Error('Dados ou imagem inválidos em um slide do Design Dev.')
      }
    }
    await mkdir(join(app.getPath('userData'), 'fabricator', 'design-settings'), { recursive: true })
    await writeFile(join(app.getPath('userData'), 'fabricator', 'design-settings', 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  })
  dataMigration = new DataMigrationService({
    dataRoot: app.getPath('appData'),
    userDataRoot: app.getPath('userData'),
    catalog: dataPlatform,
    onProgress: (progress) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('app:data-migration:progress', progress)
    }
  })
  ipcMain.handle('app:data-storage-summary', async (event) => {
    assertTrustedSender(event)
    return { disk: await getAppDataUsage(app.getPath('appData')), catalog: dataPlatform.storageSummary() }
  })
  ipcMain.handle('app:data-backups:list', async (event) => {
    assertTrustedSender(event)
    if (!dataBackupService) throw new Error('Serviço de backup ainda não inicializado.')
    return dataBackupService.listBackups()
  })
  ipcMain.handle('app:data-backups:create', async (event) => {
    assertTrustedSender(event)
    if (!dataBackupService) throw new Error('Serviço de backup ainda não inicializado.')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && !window.webContents.isLoading()) await window.webContents.executeJavaScript('window.desktop?.flushPendingWrites?.()')
    const pending = [
      ...fabricatorSaveQueues.values(), ...poseSaveWrites, ...hairSaveQueues.values(), animatorSaveQueue,
      wardrobeSaveQueue, faceSaveQueue, expressionPresetSaveQueue, faceGuideSaveQueue, customizerService.pendingWrites,
      studioSaveQueues.studio, studioSaveQueues.video
    ]
    const results = await Promise.allSettled(pending)
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failed) throw failed.reason
    return dataBackupService.createBackup()
  })
  ipcMain.handle('app:data-backups:verify', async (event, id: string) => {
    assertTrustedSender(event)
    if (!dataBackupService) throw new Error('Serviço de backup ainda não inicializado.')
    return dataBackupService.verifyBackup(id)
  })
  ipcMain.handle('app:data-backups:restore', async (event, id: string) => {
    assertTrustedSender(event)
    if (!dataBackupService) throw new Error('Serviço de backup ainda não inicializado.')
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: MessageBoxOptions = {
      type: 'warning', title: 'Restaurar dados',
      message: 'O app será reiniciado usando este backup. Antes disso, criará uma cópia de segurança do estado atual. A restauração só será concluída após o novo app abrir.',
      detail: 'Esse processo substitui as bibliotecas e os projetos atuais pelos dados do backup escolhido.',
      buttons: ['Restaurar e reiniciar', 'Cancelar'], defaultId: 1, cancelId: 1
    }
    const choice = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options)
    if (choice.response !== 0) return { cancelled: true }
    const safety = await dataBackupService.createBackup()
    const staged = await dataBackupService.stageRestore(id)
    app.relaunch()
    app.quit()
    return { cancelled: false, safetyBackupId: safety.id, ...staged }
  })
  ipcMain.handle('app:data-backups:delete', async (event, id: string) => {
    assertTrustedSender(event)
    if (!dataBackupService) throw new Error('Serviço de backup ainda não inicializado.')
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: MessageBoxOptions = {
      type: 'warning', title: 'Excluir backup', message: 'Excluir este backup permanentemente?',
      detail: 'A exclusão não altera os dados atuais do aplicativo.', buttons: ['Excluir backup', 'Cancelar'], defaultId: 1, cancelId: 1
    }
    const choice = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options)
    if (choice.response !== 0) return { deleted: false }
    await dataBackupService.deleteBackup(id)
    return { deleted: true }
  })
  ipcMain.handle('app:data-migration:prepare', async (event) => {
    assertTrustedSender(event)
    if (!dataMigration) throw new Error('Serviço de migração ainda não inicializado.')
    return dataMigration.prepare()
  })
  ipcMain.handle('app:data-migration:run-all', async (event) => {
    assertTrustedSender(event)
    if (!dataMigration) throw new Error('Serviço de migração ainda não inicializado.')
    if (dataMigrationRunning) throw new Error('Uma migração já está em andamento.')
    dataMigrationRunning = true
    dataMigrationPauseRequested = false
    const outcomes: Array<{ domainId: string; state: string; fileCount: number; byteLength: number }> = []
    const task = (async () => {
      const prepared = await dataMigration.prepare()
      if (!prepared.hasEnoughSpace) throw new Error('Espaço livre insuficiente para validar os dados com segurança.')
      for (const domain of prepared.domains) {
        if (dataMigrationPauseRequested) break
        if (domain.state === 'active' || domain.state === 'verified') continue
        outcomes.push(await dataMigration.migrateDomain(domain.domainId))
      }
      return { outcomes, paused: dataMigrationPauseRequested, summary: await dataMigration.prepare() }
    })()
    dataMigrationTask = task
    try { return await task }
    finally { dataMigrationRunning = false; dataMigrationTask = null }
  })
  ipcMain.handle('app:data-migration:pause', async (event) => {
    assertTrustedSender(event)
    dataMigrationPauseRequested = true
    return { paused: dataMigrationRunning }
  })
  ipcMain.handle('app:data-migration:restart', async (event) => {
    assertTrustedSender(event)
    if (dataMigrationRunning) throw new Error('Aguarde a migração atual terminar antes de reiniciar.')
    const summary = await dataMigration?.prepare()
    if (!summary || summary.domains.some((domain) => domain.state !== 'active' && domain.state !== 'verified')) throw new Error('Ainda há domínios que não foram migrados.')
    app.relaunch()
    app.quit()
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
  videoExportLibrary ??= new VideoExportLibrary(app.getPath('appData'))
  videoExportJobStore ??= new VideoExportJobStore(videoExportLibrary.jobRoot, (studioId, asset) =>
    videoLibrary.resolveProjectMediaDependency(studioId, asset.id, asset))
  videoExportSurfaceHost ??= new VideoExportSurfaceHost(videoExportJobStore, {
    preloadPath: join(__dirname, '../preload/video-export-preload.cjs'),
    ...(process.env.ELECTRON_RENDERER_URL
      ? { rendererUrl: process.env.ELECTRON_RENDERER_URL }
      : { rendererFile: join(__dirname, '../renderer/index.html') }),
  })
  videoExportCoordinator ??= new VideoExportCoordinator(
    videoExportJobStore,
    videoExportLibrary,
    videoExportSurfaceHost,
    (studioId, asset) => videoLibrary.resolveProjectMediaDependency(studioId, asset.id, asset),
    (progress: VideoExportProgress) => {
      const ownerId = videoExportJobOwners.get(progress.jobId)
      const owner = ownerId === undefined ? undefined : BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.id === ownerId)
      if (owner && !owner.isDestroyed()) owner.webContents.send('video-studio:export:progress', progress)
      if (['done', 'failed', 'cancelled'].includes(progress.stage)) {
        const previousTimer = videoExportTerminalCleanupTimers.get(progress.jobId)
        if (previousTimer) clearTimeout(previousTimer)
        const timer = setTimeout(() => {
          videoExportJobOwners.delete(progress.jobId)
          videoExportTerminalCleanupTimers.delete(progress.jobId)
          try { videoExportCoordinator?.forgetTerminal(progress.jobId) } catch { /* job may have resumed */ }
        }, 10 * 60_000)
        timer.unref?.()
        videoExportTerminalCleanupTimers.set(progress.jobId, timer)
      }
    },
  )
  registerVideoAssetProtocol()
  registerVideoBackgroundProtocol()
  await registerFabricatorHandlers()
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
  const pendingWrites = [
    ...fabricatorSaveQueues.values(), ...poseSaveWrites, ...hairSaveQueues.values(),
    studioSaveQueues.studio, studioSaveQueues.video, roteirosSaveQueue,
    ...(dataMigrationTask ? [dataMigrationTask] : [])
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
