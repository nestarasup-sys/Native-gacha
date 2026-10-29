import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import test from 'node:test'
import * as nativeFiles from 'node:fs/promises'
import ts from 'typescript'
import { createRoteiroProjectExportTransaction, isRoteiroProjectExportAssetPath, roteiroProjectExportManifestPath } from '../electron/domains/roteiros/projectExportTransaction.ts'

const transactionPrefix = '.gacha-v5-roteiro-export-transaction-'
const scriptId = '5b181b53-e8f9-4a54-b434-e968f1efc3e1'

async function createProject(t) {
  const root = await mkdtemp(join(tmpdir(), 'gacha-roteiro-export-'))
  const project = join(root, 'project')
  await mkdir(project)
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, project }
}

function boundFileApi() {
  return Object.fromEntries([
    'copyFile', 'lstat', 'mkdir', 'readdir', 'readFile', 'rename', 'rm', 'rmdir', 'stat', 'writeFile'
  ].map((name) => [name, nativeFiles[name].bind(nativeFiles)]))
}

function loadProjectExportStore() {
  const modulePath = resolve('electron/domains/roteiros/projectExportStore.ts')
  const source = readFileSync(modulePath, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const requireFromModule = createRequire(modulePath)
  const injectedRequire = (name) => name === './projectExportTransaction.ts'
    ? { createRoteiroProjectExportTransaction, isRoteiroProjectExportAssetPath, roteiroProjectExportManifestPath }
    : requireFromModule(name)
  new Function('require', 'exports', 'module', compiled)(injectedRequire, module.exports, module)
  return module.exports.RoteiroProjectExportStore
}

test('publicação atualiza arquivos controlados e remove obsoletos sem alterar arquivos externos', async (t) => {
  const { project } = await createProject(t)
  const background = join(project, 'assets', 'backgrounds', '01.png')
  const staleVideo = join(project, 'assets', 'tiktoks', '01.mp4')
  const userFile = join(project, 'anotacoes.txt')
  await mkdir(join(project, 'assets', 'backgrounds'), { recursive: true })
  await mkdir(join(project, 'assets', 'tiktoks'), { recursive: true })
  await writeFile(background, 'fundo antigo')
  await writeFile(staleVideo, 'video antigo')
  await writeFile(userFile, 'arquivo do usuário')

  const transaction = createRoteiroProjectExportTransaction()
  await transaction.publish(project, {
    writes: [
      { path: 'assets/backgrounds/01.png', bytes: Buffer.from('fundo novo') },
      { path: roteiroProjectExportManifestPath, bytes: Buffer.from('{"files":["assets/backgrounds/01.png"]}\n') }
    ],
    removes: ['assets/tiktoks/01.mp4', 'assets/tiktoks/02.mp4']
  })

  assert.equal(await readFile(background, 'utf8'), 'fundo novo')
  assert.equal(await readFile(join(project, roteiroProjectExportManifestPath), 'utf8'), '{"files":["assets/backgrounds/01.png"]}\n')
  await assert.rejects(readFile(staleVideo), { code: 'ENOENT' })
  assert.equal(await readFile(userFile, 'utf8'), 'arquivo do usuário')
  assert.deepEqual((await readdir(project)).filter((name) => name.startsWith(transactionPrefix)), [])
})

test('recupera uma troca interrompida e restaura outputs e manifesto anteriores', async (t) => {
  const { project } = await createProject(t)
  const scriptPath = join(project, 'roteiro.txt')
  const manifestPath = join(project, roteiroProjectExportManifestPath)
  const staleVideoPath = join(project, 'assets', 'tiktoks', '01.mp4')
  const userFile = join(project, 'anotacoes.txt')
  await mkdir(join(project, 'assets', 'tiktoks'), { recursive: true })
  await writeFile(scriptPath, 'roteiro anterior')
  await writeFile(manifestPath, '{"app":"GACHA_V5_ROTEIRO_EXPORT","files":["roteiro.txt"]}\n')
  await writeFile(staleVideoPath, 'video ainda publicado')
  await writeFile(userFile, 'preservar')

  let processStopped = false
  const interruptedApi = new Proxy(boundFileApi(), {
    get(target, property, receiver) {
      const operation = Reflect.get(target, property, receiver)
      if (typeof operation !== 'function') return operation
      return (...args) => {
        if (processStopped) return Promise.reject(new Error('processo interrompido'))
        const result = operation(...args)
        if (property !== 'rename') return result
        return result.then((value) => {
          const source = String(args[0])
          const destination = resolve(String(args[1]))
          if (!processStopped && basename(source) === '0.tmp' && destination === scriptPath) {
            processStopped = true
            throw new Error('processo interrompido')
          }
          return value
        })
      }
    }
  })

  const interruptedTransaction = createRoteiroProjectExportTransaction(interruptedApi)
  await assert.rejects(interruptedTransaction.publish(project, {
    writes: [
      { path: 'roteiro.txt', bytes: Buffer.from('roteiro novo') },
      { path: roteiroProjectExportManifestPath, bytes: Buffer.from('{"app":"GACHA_V5_ROTEIRO_EXPORT","files":[]}\n') }
    ],
    removes: ['assets/tiktoks/01.mp4']
  }), /journal de recuperação/)
  assert.equal(await readFile(scriptPath, 'utf8'), 'roteiro novo')
  assert.notDeepEqual((await readdir(project)).filter((name) => name.startsWith(transactionPrefix)), [])

  await createRoteiroProjectExportTransaction().recover(project)

  assert.equal(await readFile(scriptPath, 'utf8'), 'roteiro anterior')
  assert.equal(await readFile(manifestPath, 'utf8'), '{"app":"GACHA_V5_ROTEIRO_EXPORT","files":["roteiro.txt"]}\n')
  assert.equal(await readFile(staleVideoPath, 'utf8'), 'video ainda publicado')
  assert.equal(await readFile(userFile, 'utf8'), 'preservar')
  assert.deepEqual((await readdir(project)).filter((name) => name.startsWith(transactionPrefix)), [])
})

test('recusa caminhos fora da lista controlada', async (t) => {
  const { project } = await createProject(t)
  const userFile = join(project, 'anotacoes.txt')
  await writeFile(userFile, 'não sobrescrever')

  await assert.rejects(createRoteiroProjectExportTransaction().publish(project, {
    writes: [{ path: 'anotacoes.txt', bytes: Buffer.from('conteúdo malicioso') }]
  }), /fora dos arquivos controlados/)

  assert.equal(await readFile(userFile, 'utf8'), 'não sobrescrever')
  assert.deepEqual((await readdir(project)).filter((name) => name.startsWith(transactionPrefix)), [])
})

test('recusa manifesto que tenta declarar propriedade de arquivo externo', async (t) => {
  const { root } = await createProject(t)
  const project = join(root, 'Roteiro')
  await mkdir(project)
  const userFile = join(project, 'anotacoes.txt')
  const manifestPath = join(project, roteiroProjectExportManifestPath)
  const manifest = { app: 'GACHA_V5_ROTEIRO_EXPORT', scriptId, files: ['anotacoes.txt'] }
  await writeFile(userFile, 'não apagar')
  await writeFile(manifestPath, JSON.stringify(manifest))
  const RoteiroProjectExportStore = loadProjectExportStore()
  const store = new RoteiroProjectExportStore(async () => '', async () => '', async () => '', root)

  await assert.rejects(store.export({
    id: scriptId,
    title: 'Roteiro',
    videoTitle: 'Teste',
    characterIds: [],
    tiktoks: []
  }, 'script'), /caminhos duplicados ou fora dos arquivos exportados/)

  assert.equal(await readFile(userFile, 'utf8'), 'não apagar')
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), manifest)
})
