const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const argument = (prefix) => process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
const projectFolder = argument('--project=') && path.resolve(argument('--project='))
const libraryFolder = argument('--library=') && path.resolve(argument('--library='))
const charactersPath = argument('--characters=') && path.resolve(argument('--characters='))
const fabricatorFolder = argument('--fabricator=') && path.resolve(argument('--fabricator='))
const sourceMotionCache = argument('--motion-cache=') && path.resolve(argument('--motion-cache='))
const defaultOutput = path.join(root, 'out', 'editor-v6-stress', 'runs', `actual-project-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
const outputFolder = path.resolve(argument('--output=') ?? defaultOutput)
const cacheProbe = process.argv.includes('--cache-probe')
const verifiedBackupRoot = path.join(root, 'out', 'editor-v6-stress', 'backups')
const inside = (parent, child) => {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function main() {
  const sources = [projectFolder, libraryFolder, charactersPath, fabricatorFolder, sourceMotionCache]
  if (sources.some((source) => !source) || (!process.argv.includes('--compare-workers') && !cacheProbe)) {
    throw Error('Uso: npm run bench:editor-v6:project -- --project=<cópia verificada> --library=<mídias vinculadas> --characters=<personagens copiados> --fabricator=<cópia dos dados Fabricador> --motion-cache=<cache copiado> (--compare-workers | --cache-probe)')
  }
  const allowedRunsRoot = path.join(root, 'out', 'editor-v6-stress', 'runs')
  const immutableSources = [projectFolder, libraryFolder, charactersPath, fabricatorFolder]
  if (!immutableSources.every((source) => inside(verifiedBackupRoot, source))
    || !(inside(verifiedBackupRoot, sourceMotionCache) || inside(allowedRunsRoot, sourceMotionCache))) {
    throw Error('Projeto, mídias, personagens e Fabricador precisam vir do backup verificado; o cache pode vir do backup ou de uma execução isolada anterior.')
  }
  if (!inside(allowedRunsRoot, outputFolder) || outputFolder === allowedRunsRoot
    || sources.some((source) => inside(source, outputFolder) || inside(outputFolder, source))) {
    throw Error('A pasta de resultados precisa ficar isolada das fontes verificadas.')
  }

  const manifest = JSON.parse(await fs.readFile(path.join(projectFolder, 'editorV6.json'), 'utf8'))
  await fs.access(path.join(libraryFolder, 'catalog.json'))
  for (const media of manifest.media ?? []) if (media.libraryVideoId) await fs.access(path.join(libraryFolder, 'videos', media.fileName))
  await fs.access(charactersPath)
  await fs.access(sourceMotionCache)
  await fs.access(path.join(fabricatorFolder, 'models', 'slot-1', 'project.json'))
  await fs.access(path.join(root, 'out', 'main', 'main.js'))

  await fs.mkdir(path.dirname(outputFolder), { recursive: true })
  await fs.mkdir(outputFolder, { recursive: false })
  const dataRoot = path.join(outputFolder, 'isolated-app-data')
  const profile = path.join(dataRoot, 'runtime', 'profile')
  const projectTarget = path.join(profile, 'studios', 'Editor V6', `editorV6-${manifest.id}`)
  const libraryTarget = path.join(profile, 'studios', 'Editor Gacha', 'media-library')
  const charactersTarget = path.join(profile, 'customizer', 'characters', 'characters.json')
  await fs.mkdir(path.dirname(projectTarget), { recursive: true })
  await fs.mkdir(path.dirname(libraryTarget), { recursive: true })
  await fs.mkdir(path.dirname(charactersTarget), { recursive: true })
  await fs.cp(projectFolder, projectTarget, { recursive: true, errorOnExist: true, force: false })
  await fs.cp(libraryFolder, libraryTarget, { recursive: true, errorOnExist: true, force: false })
  await fs.cp(charactersPath, charactersTarget, { errorOnExist: true, force: false })
  await fs.cp(fabricatorFolder, path.join(profile, 'fabricator'), { recursive: true, errorOnExist: true, force: false })
  await fs.cp(sourceMotionCache, path.join(profile, 'cache', 'editor-v6-motion-v2'), { recursive: true, errorOnExist: true, force: false })

  const childEnv = { ...process.env, GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_DATA_ROOT: dataRoot,
    GACHA_EDITOR_V6_STRESS_AUTORUN: '1', GACHA_EDITOR_V6_STRESS_PROJECT_ID: manifest.id,
    ...(cacheProbe ? { GACHA_EDITOR_V6_STRESS_CACHE_PROBE: '1' } : {}),
    GACHA_EDITOR_V6_STRESS_OUTPUT_ROOT: outputFolder, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  delete childEnv.ELECTRON_RUN_AS_NODE
  const exportChild = spawn(require('electron'), [path.join(root, 'out', 'main', 'main.js')], { cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true })
  const code = await new Promise((resolve, reject) => {
    exportChild.once('error', reject)
    exportChild.once('exit', (status, signal) => status === null ? reject(Error(`Electron encerrou por sinal ${signal}.`)) : resolve(status))
  })
  if (code !== 0) throw Error(`A comparação do projeto real falhou (Electron ${code}); os relatórios parciais ficaram em ${outputFolder}.`)
  const summaryPath = path.join(outputFolder, 'stress-export-validation.json')
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
  if (!summary.passed || (cacheProbe
    ? summary.benchmarkKind !== 'motion-cache-repeat' || summary.runs?.length !== 3 || summary.runs.some((run) => !run.motionCache || !run.motionCacheTotal)
    : summary.benchmarkKind !== 'worker-comparison' || summary.runs?.length !== 6 || summary.variants?.some((variant) => variant.runs !== 3))) {
    throw Error(`O processo terminou sem as rodadas completas e validadas esperadas. Revise ${summaryPath}.`)
  }
  console.log(`Comparação completa: ${summaryPath}`)
}

main().catch((error) => { console.error('[V6 project benchmark] Falha:', error); process.exitCode = 1 })
