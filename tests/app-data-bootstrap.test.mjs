import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configureDevAiDataRoot, configureLocalAppDataRoot } from '../electron/application/appDataBootstrap.ts'

async function withTemporaryRoot(operation) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-gacha-app-data-bootstrap-'))
  try { await operation(root) } finally { await fs.rm(root, { recursive: true, force: true }) }
}

function fakeApp({ appPath, packaged = false, ready = false }) {
  const paths = new Map()
  return {
    paths,
    isPackaged: packaged,
    isReady: () => ready,
    getAppPath: () => appPath,
    getPath: (name) => paths.get(name) ?? join(appPath, name),
    setPath: (name, value) => paths.set(name, value)
  }
}

test('local app-data keeps profile/session split and temp variables under one canonical root', async () => {
  await withTemporaryRoot(async (root) => {
    const app = fakeApp({ appPath: join(root, 'application') })
    const env = {}
    const dataRoot = configureLocalAppDataRoot({ app, env })
    const profileRoot = join(root, 'application', 'app-data', 'runtime', 'profile')
    const sessionRoot = join(root, 'application', 'app-data', 'cache', 'electron-session')

    assert.equal(dataRoot, join(root, 'application', 'app-data'))
    assert.equal(app.paths.get('appData'), dataRoot)
    assert.equal(app.paths.get('userData'), profileRoot)
    assert.equal(app.paths.get('sessionData'), sessionRoot)
    for (const key of ['TEMP', 'TMP', 'TMPDIR']) assert.equal(env[key], join(dataRoot, 'temp'))
    await fs.access(profileRoot)
    await fs.access(sessionRoot)
    await fs.access(join(dataRoot, 'logs'))
  })
})

test('packaged app-data is placed beside the installed executable', async () => {
  await withTemporaryRoot(async (root) => {
    const executablePath = join(root, 'installed', 'Gacha Nymi.exe')
    const app = fakeApp({ appPath: join(root, 'resources'), packaged: true })
    const dataRoot = configureLocalAppDataRoot({ app, executablePath, env: {} })
    assert.equal(dataRoot, join(root, 'installed', 'app-data'))
    assert.equal(app.paths.get('userData'), join(dataRoot, 'runtime', 'profile'))
  })
})

test('stress offscreen refuses to fall back to the real app-data profile', async () => {
  await withTemporaryRoot(async (root) => {
    const app = fakeApp({ appPath: root })
    assert.throws(() => configureLocalAppDataRoot({
      app,
      env: { GACHA_VIDEO_STRESS_OFFSCREEN: '1' }
    }), /perfil temporário absoluto/)
    assert.equal(app.paths.size, 0)
  })
})

test('stress offscreen uses its explicit isolated profile root', async () => {
  await withTemporaryRoot(async (root) => {
    const isolatedRoot = join(root, 'stress-profile')
    const app = fakeApp({ appPath: join(root, 'application') })
    const dataRoot = configureLocalAppDataRoot({
      app,
      env: { GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_DATA_ROOT: isolatedRoot }
    })
    assert.equal(dataRoot, isolatedRoot)
    assert.equal(app.paths.get('appData'), isolatedRoot)
    assert.equal(app.paths.get('userData'), join(isolatedRoot, 'runtime', 'profile'))
  })
})

test('DEV AI accepts only a marked direct-child synthetic sandbox', async () => {
  await withTemporaryRoot(async (root) => {
    const repositoryRoot = join(root, 'repository')
    const runRoot = join(repositoryRoot, 'out', 'dev-ai', 'runs', 'run-001')
    const sandbox = join(runRoot, 'sandbox')
    await fs.mkdir(sandbox, { recursive: true })
    await fs.writeFile(join(runRoot, '.dev-ai-sandbox.json'), JSON.stringify({ schemaVersion: 1, runId: 'run-001', syntheticOnly: true }))

    const app = fakeApp({ appPath: repositoryRoot })
    const env = { GACHA_DEV_AI_TEST: '1', GACHA_DEV_AI_SANDBOX: sandbox }
    configureDevAiDataRoot({ app, env, repositoryRoot })

    assert.equal(app.paths.get('appData'), sandbox)
    assert.equal(app.paths.get('userData'), join(sandbox, 'electron-user-data'))
    assert.equal(app.paths.get('sessionData'), join(sandbox, 'electron-session-data'))
    await fs.access(app.paths.get('userData'))
    await fs.access(app.paths.get('sessionData'))
    assert.equal(configureLocalAppDataRoot({ app, env }), null)

    await fs.writeFile(join(runRoot, '.dev-ai-sandbox.json'), JSON.stringify({ schemaVersion: 1, runId: 'run-001', syntheticOnly: false }))
    const invalidMarkerApp = fakeApp({ appPath: repositoryRoot })
    assert.throws(() => configureDevAiDataRoot({ app: invalidMarkerApp, env, repositoryRoot }), /não identifica uma execução sintética válida/)
    assert.equal(invalidMarkerApp.paths.size, 0)

    const outsideSandbox = join(root, 'outside', 'sandbox')
    await fs.mkdir(outsideSandbox, { recursive: true })
    assert.throws(() => configureDevAiDataRoot({
      app: fakeApp({ appPath: repositoryRoot }),
      env: { ...env, GACHA_DEV_AI_SANDBOX: outsideSandbox },
      repositoryRoot
    }), /fora do diretório autorizado/)
  })
})

test('DEV AI private copy requires its verified backup marker and remains under the allowed root', async () => {
  await withTemporaryRoot(async (root) => {
    const allowedRoot = join(root, 'allowed')
    const privateRoot = join(allowedRoot, 'private-run')
    const sandbox = join(privateRoot, 'userData')
    const sourceBackup = join(allowedRoot, 'backups', 'verified-backup')
    await fs.mkdir(sandbox, { recursive: true })
    await fs.mkdir(sourceBackup, { recursive: true })
    await fs.writeFile(join(sourceBackup, 'backup-manifest.json'), '{}')
    const markerPath = join(privateRoot, 'private-copy-marker.json')
    const marker = {
      schemaVersion: 1,
      privateDataCopy: true,
      verifiedSha256: true,
      sourceBackup,
      copyMode: 'baseline'
    }
    await fs.writeFile(markerPath, JSON.stringify({ ...marker, verifiedSha256: false }))

    const app = fakeApp({ appPath: root })
    const env = {
      GACHA_DEV_AI_TEST: '1',
      GACHA_DEV_AI_PRIVATE_TEST: '1',
      GACHA_DEV_AI_PRIVATE_ROOT: privateRoot,
      GACHA_DEV_AI_PRIVATE_ALLOWED_ROOT: allowedRoot,
      GACHA_DEV_AI_SANDBOX: sandbox
    }
    const unverifiedApp = fakeApp({ appPath: root })
    assert.throws(() => configureDevAiDataRoot({ app: unverifiedApp, env }), /sem backup local validado/)
    assert.equal(unverifiedApp.paths.size, 0)

    await fs.writeFile(markerPath, JSON.stringify(marker))
    configureDevAiDataRoot({ app, env })

    assert.equal(app.paths.get('appData'), privateRoot)
    assert.equal(app.paths.get('userData'), sandbox)
    assert.equal(app.paths.get('sessionData'), join(privateRoot, 'session-data'))
    await fs.access(app.paths.get('sessionData'))
    assert.equal(configureLocalAppDataRoot({ app, env }), null)

    assert.throws(() => configureDevAiDataRoot({
      app: fakeApp({ appPath: root }),
      env: { ...env, GACHA_DEV_AI_SANDBOX: join(allowedRoot, 'outside-userData') }
    }), /fora da raiz local autorizada/)
  })
})

test('private-copy mode cannot run without the synthetic-test gate', async () => {
  await withTemporaryRoot(async (root) => {
    const app = fakeApp({ appPath: root })
    assert.throws(() => configureDevAiDataRoot({
      app,
      env: { GACHA_DEV_AI_PRIVATE_TEST: '1' }
    }), /exige o runner local isolado/)
  })
})
