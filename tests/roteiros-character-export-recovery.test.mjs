import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import test from 'node:test'
import * as nativeFiles from 'node:fs/promises'
import ts from 'typescript'
import { createKeyedOperationQueue } from '../electron/domains/storage/keyedOperationQueue.ts'
import { createRoteiroCharacterExportPublication, isRoteiroCharacterExportAssetPath } from '../electron/domains/roteiros/characterExportPublication.ts'
import { roteiroV4ProjectsRoot } from '../electron/domains/roteiros/projectPaths.ts'

const roteiroId = 'a137c167-d500-441a-b0af-0ccfbbf5c220'
const characterId = 'c3ab6d6a-a69b-4fdc-b214-23e6f150aa10'
const secondCharacterId = 'e93e611d-cbd0-448e-b0df-9b091c19ccfd'
const transactionPrefix = '.gacha-v5-character-export-transaction-'

function loadCharacterStore(files) {
  const modulePath = resolve('electron/domains/roteiros/characterExportStore.ts')
  const source = readFileSync(modulePath, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const requireFromModule = createRequire(modulePath)
  const injectedRequire = (name) => {
    if (name === '../storage/keyedOperationQueue.ts') return { createKeyedOperationQueue }
    if (name === './characterExportPublication.ts') return { createRoteiroCharacterExportPublication, isRoteiroCharacterExportAssetPath }
    if (name === './projectPaths.ts') return { roteiroV4ProjectsRoot }
    return requireFromModule(name)
  }
  new Function('require', 'exports', 'module', compiled)(injectedRequire, module.exports, module)
  return new module.exports.RoteiroCharacterExportStore(files.tempRoot, files.projectsRoot, files.files)
}

function fileApi(crashWhen = () => false) {
  const functions = Object.fromEntries([
    'copyFile', 'lstat', 'mkdir', 'readFile', 'readdir', 'realpath', 'rename', 'rm', 'writeFile'
  ].map((name) => [name, nativeFiles[name].bind(nativeFiles)]))
  let stopped = false
  const files = new Proxy(functions, {
    get(target, property, receiver) {
      const operation = Reflect.get(target, property, receiver)
      if (typeof operation !== 'function') return operation
      return (...args) => {
        if (stopped) return Promise.reject(new Error('simulated process stop'))
        const result = operation(...args)
        if (property !== 'rename') return result
        return result.then((value) => {
          if (!stopped && crashWhen(String(args[0]), String(args[1]))) {
            stopped = true
            throw new Error('simulated process stop')
          }
          return value
        })
      }
    }
  })
  return { files, hasStopped: () => stopped }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gacha-character-export-'))
  const projectsRoot = join(root, 'projects')
  const tempRoot = join(root, 'runtime', 'roteiro-character-export')
  const project = join(projectsRoot, 'Roteiro')
  const characterRoot = join(project, 'assets', 'characters', 'Ana', 'POSE 1')
  const otherCharacterRoot = join(project, 'assets', 'characters', 'Outro', 'POSE 1')
  const projectFile = join(project, 'Roteiro.gacha.json')
  await mkdir(characterRoot, { recursive: true })
  await mkdir(otherCharacterRoot, { recursive: true })
  const previousProject = {
    schema_version: 3,
    project: { title: 'Roteiro', resolution: [1920, 1080], fps: 30, background: '' },
    characters: { Outro: { asset_dir: 'assets/characters/Outro' } },
    initial_state: { Outro: { pose: 'POSE 1', expression: 'normal', visible: true } },
    timeline: [],
    timeline_tracks: [],
    timeline_tracks_version: 1
  }
  await writeFile(projectFile, `${JSON.stringify(previousProject)}\n`)
  await writeFile(join(characterRoot, 'normal.png'), 'previous normal')
  await writeFile(join(characterRoot, 'happy.png'), 'stale expression')
  await writeFile(join(characterRoot, 'readme.txt'), 'manual file')
  await writeFile(join(otherCharacterRoot, 'normal.png'), 'other character')
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, projectsRoot, tempRoot, project, projectFile, characterRoot, otherCharacterRoot, previousProject }
}

function pngDataUrl() {
  const bytes = Buffer.alloc(32, 17)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  return `data:image/png;base64,${bytes.toString('base64')}`
}

async function beginExport(store, id = characterId, name = 'Ana') {
  const { jobId } = await store.start({ id: roteiroId, title: 'Roteiro', characters: [{ id, name }] })
  await store.writeAsset(jobId, { characterId: id, pose: 1, expression: 'normal', role: 'base', dataUrl: pngDataUrl() })
  return jobId
}

test('publica personagens, remove somente PNGs obsoletos e mescla o projeto existente', async (t) => {
  const paths = await fixture(t)
  const store = loadCharacterStore({ ...paths, files: fileApi().files })
  const jobId = await beginExport(store)

  const result = await store.finish(jobId)

  assert.equal(result.files, 1)
  assert.deepEqual((await readFile(join(paths.characterRoot, 'normal.png'))).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  await assert.rejects(readFile(join(paths.characterRoot, 'happy.png')), { code: 'ENOENT' })
  assert.equal(await readFile(join(paths.characterRoot, 'readme.txt'), 'utf8'), 'manual file')
  assert.equal(await readFile(join(paths.otherCharacterRoot, 'normal.png'), 'utf8'), 'other character')
  assert.deepEqual(JSON.parse(await readFile(paths.projectFile, 'utf8')).characters, {
    Outro: paths.previousProject.characters.Outro,
    Ana: { asset_dir: 'assets/characters/Ana', default_pose: 'POSE 1', default_expression: 'normal', default_variant: 'v1', poses: { 'POSE 1': {} } }
  })
  assert.deepEqual((await readdir(paths.project)).filter((name) => name.startsWith(transactionPrefix)), [])
  await assert.rejects(store.finish(jobId), /expirada ou inexistente/)
})

test('valida o hash do temporário antes de substituir arquivos existentes', async (t) => {
  const paths = await fixture(t)
  const baseFiles = fileApi().files
  const files = new Proxy(baseFiles, {
    get(target, property, receiver) {
      if (property === 'copyFile') return async (source, destination, mode) => {
        await target.copyFile(source, destination, mode)
        await writeFile(destination, 'conteúdo corrompido')
      }
      return Reflect.get(target, property, receiver)
    }
  })
  const store = loadCharacterStore({ ...paths, files })
  const jobId = await beginExport(store)

  await assert.rejects(store.finish(jobId), /não corresponde ao conteúdo preparado/)

  assert.equal(await readFile(join(paths.characterRoot, 'normal.png'), 'utf8'), 'previous normal')
  assert.equal(await readFile(join(paths.characterRoot, 'happy.png'), 'utf8'), 'stale expression')
  assert.deepEqual(JSON.parse(await readFile(paths.projectFile, 'utf8')), paths.previousProject)
  assert.deepEqual((await readdir(paths.project)).filter((name) => name.startsWith(transactionPrefix)), [])
})

test('recupera rollback após interrupção no primeiro asset publicado e limpa staging órfão', async (t) => {
  const paths = await fixture(t)
  let jobId = ''
  const crash = fileApi((source, destination) => source.endsWith(`.${jobId}.tmp`) && resolve(destination) === join(paths.characterRoot, 'normal.png'))
  const store = loadCharacterStore({ ...paths, files: crash.files })
  jobId = await beginExport(store)

  await assert.rejects(store.finish(jobId), /journal foi preservado/)
  assert.equal(crash.hasStopped(), true)
  assert.equal((await readFile(join(paths.characterRoot, 'normal.png'))).length > 0, true)
  assert.notDeepEqual((await readdir(paths.project)).filter((name) => name.startsWith(transactionPrefix)), [])

  const recoveryStore = loadCharacterStore({ ...paths, files: fileApi().files })
  await recoveryStore.recoverProject(paths.project)

  assert.equal(await readFile(join(paths.characterRoot, 'normal.png'), 'utf8'), 'previous normal')
  assert.equal(await readFile(join(paths.characterRoot, 'happy.png'), 'utf8'), 'stale expression')
  assert.equal(await readFile(join(paths.characterRoot, 'readme.txt'), 'utf8'), 'manual file')
  assert.deepEqual(JSON.parse(await readFile(paths.projectFile, 'utf8')), paths.previousProject)
  await assert.rejects(readFile(join(paths.project, '.nymi-script.json')), { code: 'ENOENT' })
  assert.deepEqual((await readdir(paths.project)).filter((name) => name.startsWith(transactionPrefix)), [])
  assert.deepEqual((await readdir(paths.tempRoot)).filter((name) => /^[0-9a-f-]{36}$/i.test(name)), [])
})

test('preserva alterações externas encontradas durante recuperação e mantém o journal', async (t) => {
  const paths = await fixture(t)
  let jobId = ''
  const crash = fileApi((source, destination) => source.endsWith(`.${jobId}.tmp`) && resolve(destination) === join(paths.characterRoot, 'normal.png'))
  const store = loadCharacterStore({ ...paths, files: crash.files })
  jobId = await beginExport(store)
  await assert.rejects(store.finish(jobId), /journal foi preservado/)
  await writeFile(join(paths.characterRoot, 'normal.png'), 'alteração externa')

  const recoveryStore = loadCharacterStore({ ...paths, files: fileApi().files })
  await assert.rejects(recoveryStore.recoverProject(paths.project), /mudou durante a recuperação/)

  assert.equal(await readFile(join(paths.characterRoot, 'normal.png'), 'utf8'), 'alteração externa')
  assert.notDeepEqual((await readdir(paths.project)).filter((name) => name.startsWith(transactionPrefix)), [])
})

test('mantém publicação concluída ao recuperar uma interrupção após o marcador de commit', async (t) => {
  const paths = await fixture(t)
  const crash = fileApi((source, destination) => basename(source).endsWith('.committed.tmp') && destination.endsWith('.committed'))
  const store = loadCharacterStore({ ...paths, files: crash.files })
  const jobId = await beginExport(store)

  await assert.rejects(store.finish(jobId), /journal foi preservado/)
  assert.equal(crash.hasStopped(), true)
  assert.equal((await readFile(join(paths.characterRoot, 'normal.png'))).length > 0, true)

  const recoveryStore = loadCharacterStore({ ...paths, files: fileApi().files })
  await recoveryStore.recoverProject(paths.project)

  assert.equal((await readFile(join(paths.characterRoot, 'normal.png'))).length, 32)
  await assert.rejects(readFile(join(paths.characterRoot, 'happy.png')), { code: 'ENOENT' })
  assert.equal(await readFile(join(paths.characterRoot, 'readme.txt'), 'utf8'), 'manual file')
  assert.equal(JSON.parse(await readFile(paths.projectFile, 'utf8')).characters.Ana.default_expression, 'normal')
  assert.equal(JSON.parse(await readFile(join(paths.project, '.nymi-script.json'), 'utf8')).scriptId, roteiroId)
  assert.deepEqual((await readdir(paths.project)).filter((name) => name.startsWith(transactionPrefix)), [])
})

test('serializa exports do mesmo projeto e mescla ambos os personagens no JSON final', async (t) => {
  const paths = await fixture(t)
  const store = loadCharacterStore({ ...paths, files: fileApi().files })
  const anaJob = await beginExport(store, characterId, 'Ana')
  const biaJob = await beginExport(store, secondCharacterId, 'Bia')

  await Promise.all([store.finish(anaJob), store.finish(biaJob)])

  const project = JSON.parse(await readFile(paths.projectFile, 'utf8'))
  assert.deepEqual(Object.keys(project.characters).sort(), ['Ana', 'Bia', 'Outro'])
  assert.deepEqual(Object.keys(project.initial_state).sort(), ['Ana', 'Bia', 'Outro'])
})
