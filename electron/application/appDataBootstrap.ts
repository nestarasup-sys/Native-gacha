import type { App } from 'electron'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { migrateElectronProfile } from '../electronProfileMigration.cjs'

type ElectronAppPaths = Pick<App, 'isPackaged' | 'isReady' | 'getAppPath' | 'getPath' | 'setPath'>

export type AppDataBootstrapDependencies = {
  app: ElectronAppPaths
  env?: NodeJS.ProcessEnv
  repositoryRoot?: string
  executablePath?: string
  platform?: NodeJS.Platform
}

function isWithin(root: string, path: string): boolean {
  const pathRelative = relative(root, path)
  return !!pathRelative && pathRelative !== '..' && !pathRelative.startsWith(`..${sep}`)
}

function sameCanonicalPath(left: string, right: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** Validates and configures isolated data roots for synthetic Electron runs. */
export function configureDevAiDataRoot({
  app,
  env = process.env,
  repositoryRoot,
  platform = process.platform
}: AppDataBootstrapDependencies): void {
  const privateCopyTest = env.GACHA_DEV_AI_PRIVATE_TEST === '1'
  if (privateCopyTest && env.GACHA_DEV_AI_TEST !== '1') {
    throw new Error('O modo privado DEV AI exige o runner local isolado.')
  }
  if (env.GACHA_DEV_AI_TEST !== '1') return
  if (app.isPackaged || app.isReady()) throw new Error('DEV AI IPC só pode configurar o root antes do boot em build de desenvolvimento.')
  const requestedSandbox = env.GACHA_DEV_AI_SANDBOX
  if (!requestedSandbox || !resolve(requestedSandbox)) throw new Error('Root sintético DEV AI ausente.')

  if (privateCopyTest) {
    const privateRoot = resolve(env.GACHA_DEV_AI_PRIVATE_ROOT ?? '')
    const allowedRoot = resolve(env.GACHA_DEV_AI_PRIVATE_ALLOWED_ROOT ?? '')
    const sandbox = resolve(requestedSandbox)
    const userData = join(privateRoot, 'userData')
    const markerPath = join(privateRoot, 'private-copy-marker.json')
    const relativePrivate = relative(allowedRoot, privateRoot)
    const relativeSandbox = relative(privateRoot, sandbox)
    const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf8')) as {
      schemaVersion?: number; privateDataCopy?: boolean; verifiedSha256?: boolean; sourceBackup?: string; copyMode?: string
    } : null
    const sourceBackup = marker?.sourceBackup ? resolve(marker.sourceBackup) : ''
    const backupManifest = sourceBackup ? join(sourceBackup, 'backup-manifest.json') : ''
    if (!relativePrivate || !isWithin(allowedRoot, privateRoot) || relativeSandbox !== 'userData'
      || !sameCanonicalPath(sandbox, userData, platform)) {
      throw new Error('Cópia privada DEV AI fora da raiz local autorizada.')
    }
    if (marker?.schemaVersion !== 1 || marker.privateDataCopy !== true || marker.verifiedSha256 !== true
      || !['baseline', 'wardrobe-reset'].includes(marker.copyMode ?? '')
      || !isWithin(allowedRoot, sourceBackup) || sourceBackup.toLowerCase() === privateRoot.toLowerCase()
      || !existsSync(backupManifest) || !existsSync(sandbox)) {
      throw new Error('Cópia privada DEV AI sem backup local validado.')
    }
    for (const path of [allowedRoot, privateRoot, markerPath, sourceBackup, backupManifest, sandbox]) {
      if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !sameCanonicalPath(realpathSync(path), path, platform)) {
        throw new Error('Path não canônico ou symlink recusado no teste privado.')
      }
    }
    const sessionData = join(privateRoot, 'session-data')
    mkdirSync(sessionData, { recursive: true })
    if (lstatSync(sessionData).isSymbolicLink() || !sameCanonicalPath(realpathSync(sessionData), sessionData, platform)) {
      throw new Error('Diretório de sessão privado inválido.')
    }
    // appData deve conter userData: requisito da migração segura e dos backups.
    app.setPath('appData', privateRoot)
    app.setPath('userData', userData)
    app.setPath('sessionData', sessionData)
    return
  }

  const repoRoot = repositoryRoot ?? resolve(__dirname, '../..')
  const runsRoot = resolve(repoRoot, 'out', 'dev-ai', 'runs')
  const sandbox = resolve(requestedSandbox)
  const runRoot = dirname(sandbox)
  const relativeRun = relative(runsRoot, runRoot)
  if (!relativeRun || relativeRun === '..' || relativeRun.startsWith(`..${sep}`) || relativeRun.includes(sep)
    || basename(sandbox) !== 'sandbox' || !existsSync(sandbox)) {
    throw new Error('Root sintético DEV AI fora do diretório autorizado.')
  }

  for (const path of [resolve(repoRoot, 'out'), resolve(repoRoot, 'out', 'dev-ai'), runsRoot, runRoot, sandbox]) {
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !sameCanonicalPath(realpathSync(path), path, platform)) {
      throw new Error('Root sintético DEV AI ausente, não canônico ou ligado por symlink.')
    }
  }
  const markerPath = join(runRoot, '.dev-ai-sandbox.json')
  if (!existsSync(markerPath) || lstatSync(markerPath).isSymbolicLink() || !sameCanonicalPath(realpathSync(markerPath), markerPath, platform)) {
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

/** Creates portable app-data folders and moves Electron profile data safely. */
export function configureLocalAppDataRoot({
  app,
  env = process.env,
  executablePath = process.execPath
}: AppDataBootstrapDependencies): string | null {
  if (env.GACHA_DEV_AI_TEST === '1') return null

  const stressRoot = env.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
    ? env.GACHA_EDITOR_V6_STRESS_DATA_ROOT
    : undefined
  if (env.GACHA_VIDEO_STRESS_OFFSCREEN === '1' && (!stressRoot || !isAbsolute(stressRoot))) {
    throw new Error('O teste offscreen precisa de um perfil temporário absoluto; o perfil normal foi protegido.')
  }
  const defaultRoot = stressRoot ?? (app.isPackaged
    ? join(dirname(executablePath), 'app-data')
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
  env.TEMP = join(dataRoot, 'temp')
  env.TMP = join(dataRoot, 'temp')
  env.TMPDIR = join(dataRoot, 'temp')
  return dataRoot
}
