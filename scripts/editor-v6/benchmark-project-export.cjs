const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const http = require('node:http')

const root = path.resolve(__dirname, '../..')
const argument = (prefix) => process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
const projectFolder = argument('--project=') && path.resolve(argument('--project='))
const libraryFolder = argument('--library=') && path.resolve(argument('--library='))
const charactersPath = argument('--characters=') && path.resolve(argument('--characters='))
const fabricatorFolder = argument('--fabricator=') && path.resolve(argument('--fabricator='))
const sessionDataPath = argument('--session-data=') && path.resolve(argument('--session-data='))
const sourceMotionCache = argument('--motion-cache=') && path.resolve(argument('--motion-cache='))
const defaultOutput = path.join(root, 'out', 'editor-v6-stress', 'runs', `actual-project-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
const outputFolder = path.resolve(argument('--output=') ?? defaultOutput)
const cacheProbe = process.argv.includes('--cache-probe')
const singleMotionRun = process.argv.includes('--single-motion-run')
const hairPreparationOnly = process.argv.includes('--hair-preparation-only')
const noHairControl = process.argv.includes('--no-hair-control')
const motionConcurrency = argument('--motion-bake-concurrency=')
const hairPresetSlot = argument('--hair-preset-slot=')
const segmentStartFrameValue = argument('--start-frame=')
const segmentDurationSecondsValue = argument('--duration-seconds=')
const repeatValue = argument('--repeat=')
const fullTimeline = process.argv.includes('--full-timeline')
const authorizedProjectTitle = 'Teste de Importação — Personagens do Pacote'
const rendererPortValue = argument('--renderer-port=')
const rendererPort = rendererPortValue === undefined ? 5188 : Number(rendererPortValue)
const reuseRendererServer = process.argv.includes('--reuse-renderer-server')
const verifiedBackupRoot = path.join(root, 'out', 'editor-v6-stress', 'backups')
const inside = (parent, child) => {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function serveBuiltRenderer(root, port) {
  const rendererRoot = path.join(root, 'out', 'renderer')
  const mimeTypes = new Map([
    ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
    ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.woff2', 'font/woff2'], ['.json', 'application/json; charset=utf-8']
  ])
  const server = http.createServer((request, response) => {
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url || '/', `http://127.0.0.1:${port}`).pathname) }
    catch { response.writeHead(400).end(); return }
    const requestedPath = pathname === '/' ? '/index.html' : pathname
    const filePath = path.resolve(rendererRoot, `.${requestedPath}`)
    if (!inside(rendererRoot, filePath)) { response.writeHead(404).end(); return }
    fs.readFile(filePath).then((bytes) => {
      response.writeHead(200, { 'Content-Type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream', 'Cache-Control': 'no-store' })
      response.end(bytes)
    }, () => response.writeHead(404).end())
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({
      origin: `http://127.0.0.1:${port}`,
      close: () => new Promise((closeResolve, closeReject) => {
        server.close((error) => error ? closeReject(error) : closeResolve())
        server.closeAllConnections?.()
      })
    }))
  })
}

function verifyExistingRenderer(origin) {
  return new Promise((resolve, reject) => {
    const request = http.get(new URL('/editor-v6-export.html', origin), { timeout: 3000 }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { if (body.length < 16_000) body += chunk })
      response.once('end', () => {
        if (response.statusCode !== 200 || !body.includes('<html') || !body.includes('Editor V6 Export')) {
          reject(Error(`O renderer existente em ${origin} não serviu a página de exportação V6 esperada.`))
        } else resolve()
      })
    })
    request.once('timeout', () => request.destroy(Error(`Tempo limite ao verificar o renderer em ${origin}.`)))
    request.once('error', reject)
  })
}

async function main() {
  const sources = [projectFolder, libraryFolder, charactersPath, fabricatorFolder, sourceMotionCache]
  if (sources.some((source) => !source) || (!process.argv.includes('--compare-workers') && !cacheProbe && !singleMotionRun)
    && !hairPresetSlot && !noHairControl
    || singleMotionRun && !['1', '2'].includes(motionConcurrency)
    || hairPreparationOnly && (!hairPresetSlot || cacheProbe || singleMotionRun || noHairControl || process.argv.includes('--compare-workers'))
    || noHairControl && (hairPresetSlot || cacheProbe || singleMotionRun || hairPreparationOnly || process.argv.includes('--compare-workers'))) {
    throw Error('Uso: node scripts/editor-v6/benchmark-project-export.cjs --project=<cópia verificada> --library=<mídias vinculadas> --characters=<personagens copiados> --fabricator=<cópia do Fabricador> --motion-cache=<cache copiado> (--compare-workers | --cache-probe | --single-motion-run --motion-bake-concurrency=1|2 | --hair-preset-slot=1..5 --session-data=<sessão copiada> [--hair-preparation-only] | --no-hair-control)')
  }
  if (!Number.isInteger(rendererPort) || rendererPort < 1024 || rendererPort > 65535) throw Error('--renderer-port precisa ser uma porta local válida.')
  if (hairPresetSlot && (!/^\d+$/.test(hairPresetSlot) || Number(hairPresetSlot) < 1 || Number(hairPresetSlot) > 5 || !sessionDataPath)) {
    throw Error('A medição de cabelo requer --hair-preset-slot=1..5 e --session-data apontando para a sessão localStorage copiada.')
  }
  const segmentStartFrame = segmentStartFrameValue === undefined ? 0 : Number(segmentStartFrameValue)
  const segmentDurationSeconds = segmentDurationSecondsValue === undefined ? (fullTimeline ? null : 20) : Number(segmentDurationSecondsValue)
  const repeatCount = repeatValue === undefined ? 1 : Number(repeatValue)
  if ((hairPresetSlot || noHairControl) && (!Number.isSafeInteger(segmentStartFrame) || segmentStartFrame < 0
    || segmentDurationSeconds !== null && (!Number.isSafeInteger(segmentDurationSeconds) || segmentDurationSeconds < 1)
    || !Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 3
    || fullTimeline && segmentDurationSecondsValue !== undefined
    || (segmentStartFrameValue !== undefined || segmentDurationSecondsValue !== undefined || fullTimeline) && hairPreparationOnly)) {
    throw Error('Benchmark de cabelo aceita --start-frame=, --duration-seconds= e --repeat=1..3; janela e repetição não se aplicam ao perfil somente de preparação.')
  }
  const allowedRunsRoot = path.join(root, 'out', 'editor-v6-stress', 'runs')
  const immutableSources = [projectFolder, libraryFolder, charactersPath, fabricatorFolder, ...(hairPresetSlot ? [sessionDataPath] : [])]
  if (!immutableSources.every((source) => inside(verifiedBackupRoot, source))
    || !(inside(verifiedBackupRoot, sourceMotionCache) || inside(allowedRunsRoot, sourceMotionCache))) {
    throw Error('Projeto, mídias, personagens e Fabricador precisam vir do backup verificado; o cache pode vir do backup ou de uma execução isolada anterior.')
  }
  if (!inside(allowedRunsRoot, outputFolder) || outputFolder === allowedRunsRoot
    || sources.some((source) => inside(source, outputFolder) || inside(outputFolder, source))) {
    throw Error('A pasta de resultados precisa ficar isolada das fontes verificadas.')
  }

  const manifest = JSON.parse(await fs.readFile(path.join(projectFolder, 'editorV6.json'), 'utf8'))
  if ((hairPresetSlot || noHairControl) && (manifest.title?.trim() !== authorizedProjectTitle || !Number.isSafeInteger(manifest.timeline?.durationFrames) || manifest.timeline.durationFrames < 1)) {
    throw Error(`O benchmark com cabelo exige uma cópia verificada do projeto autorizado "${authorizedProjectTitle}" com duração válida; nenhum projeto foi modificado.`)
  }
  const segmentFrameCount = segmentDurationSeconds === null ? manifest.timeline?.durationFrames : segmentDurationSeconds * 30
  if ((hairPresetSlot || noHairControl) && (!Number.isSafeInteger(segmentFrameCount) || segmentStartFrame + segmentFrameCount > manifest.timeline.durationFrames)) {
    throw Error('A janela solicitada excede a duração da timeline do projeto autorizado.')
  }
  await fs.access(path.join(libraryFolder, 'catalog.json'))
  for (const media of manifest.media ?? []) if (media.libraryVideoId) await fs.access(path.join(libraryFolder, 'videos', media.fileName))
  await fs.access(charactersPath)
  await fs.access(sourceMotionCache)
  if (singleMotionRun && (await fs.readdir(sourceMotionCache)).length !== 0) throw Error('A comparação fria de movimentos exige uma pasta de cache-fonte vazia.')
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
  if (hairPresetSlot) {
    const isolatedSessionData = path.join(dataRoot, 'cache', 'electron-session')
    await fs.mkdir(path.dirname(isolatedSessionData), { recursive: true })
    await fs.cp(sessionDataPath, isolatedSessionData, { recursive: true, errorOnExist: true, force: false })
  }

  const rendererOrigin = `http://127.0.0.1:${rendererPort}`
  const rendererServer = reuseRendererServer
    ? (await verifyExistingRenderer(rendererOrigin), { origin: rendererOrigin, close: async () => {} })
    : await serveBuiltRenderer(root, rendererPort)
  const childEnv = { ...process.env, ELECTRON_RENDERER_URL: rendererServer.origin, GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_DATA_ROOT: dataRoot,
    GACHA_EDITOR_V6_STRESS_AUTORUN: '1', GACHA_EDITOR_V6_STRESS_PROJECT_ID: manifest.id,
    ...(cacheProbe ? { GACHA_EDITOR_V6_STRESS_CACHE_PROBE: '1' } : {}),
    ...(singleMotionRun ? { GACHA_EDITOR_V6_STRESS_SINGLE_MOTION_RUN: '1', GACHA_EDITOR_V6_STRESS_MOTION_CONCURRENCY: motionConcurrency } : {}),
    ...(hairPresetSlot ? { GACHA_EDITOR_V6_STRESS_HAIR_PRESET_SLOT: hairPresetSlot } : {}),
    ...(noHairControl ? { GACHA_EDITOR_V6_STRESS_NO_HAIR_CONTROL: '1' } : {}),
    ...(hairPreparationOnly ? { GACHA_EDITOR_V6_STRESS_HAIR_PREPARATION_ONLY: '1' } : {}),
    ...((hairPresetSlot || noHairControl) && !hairPreparationOnly ? {
      GACHA_EDITOR_V6_STRESS_START_FRAME: String(segmentStartFrame),
      GACHA_EDITOR_V6_STRESS_FRAME_COUNT: String(segmentFrameCount),
      GACHA_EDITOR_V6_STRESS_REPEAT: String(repeatCount)
    } : {}),
    GACHA_EDITOR_V6_STRESS_OUTPUT_ROOT: outputFolder, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  delete childEnv.ELECTRON_RUN_AS_NODE
  let code
  try {
    const exportChild = spawn(require('electron'), [path.join(root, 'out', 'main', 'main.js')], { cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true })
    code = await new Promise((resolve, reject) => {
      exportChild.once('error', reject)
      exportChild.once('exit', (status, signal) => status === null ? reject(Error(`Electron encerrou por sinal ${signal}.`)) : resolve(status))
    })
  } finally { await rendererServer.close() }
  if (code !== 0) throw Error(`A comparação do projeto real falhou (Electron ${code}); os relatórios parciais ficaram em ${outputFolder}.`)
  const summaryPath = path.join(outputFolder, 'stress-export-validation.json')
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
  const invalidSummary = hairPreparationOnly
    ? summary.benchmarkKind !== 'real-project-hair-preparation' || summary.projectTitle !== authorizedProjectTitle
      || summary.durationFrames !== manifest.timeline.durationFrames || summary.hairPresetSlot !== Number(hairPresetSlot)
      || summary.rigCount < 1 || summary.preparedTransitions < 1 || !Number.isFinite(summary.preparationWallMs)
    : noHairControl
    ? summary.benchmarkKind !== 'real-project-no-hair-control' || summary.projectTitle !== authorizedProjectTitle
      || summary.timelineDurationFrames !== manifest.timeline.durationFrames || summary.startFrame !== segmentStartFrame || summary.durationFrames !== segmentFrameCount || summary.runs?.length !== repeatCount
      || summary.runs.some((run) => run.totalFrames !== segmentFrameCount || run.width !== 1920 || run.height !== 1080 || run.fps !== '30/1'
        || !Number.isFinite(run.milliseconds) || run.milliseconds <= 0 || !Number.isSafeInteger(run.audioClips) || run.audioClips < 0
        || run.audioOutput !== (run.audioClips > 0))
    : hairPresetSlot
    ? summary.benchmarkKind !== 'real-project-hair-export' || summary.projectTitle !== authorizedProjectTitle
      || summary.timelineDurationFrames !== manifest.timeline.durationFrames || summary.startFrame !== segmentStartFrame || summary.durationFrames !== segmentFrameCount || summary.runs?.length !== repeatCount
      || summary.hairPresetSlot !== Number(hairPresetSlot)
      || summary.runs.some((run) => run.totalFrames !== segmentFrameCount || run.width !== 1920 || run.height !== 1080 || run.fps !== '30/1'
        || !Number.isSafeInteger(run.audioClips) || run.audioClips < 0 || run.audioOutput !== (run.audioClips > 0)
        || run.audioClips !== summary.runs[0].audioClips || !run.selectedEncoder)
    : singleMotionRun
    ? summary.benchmarkKind !== 'motion-concurrency-single' || summary.runs?.length !== 1
      || summary.motionBakeConcurrency !== Number(motionConcurrency)
      || summary.runs[0].motionConcurrency !== Number(motionConcurrency)
      || summary.runs[0].motionCache?.rasterized !== summary.motionTransitionsPreparedPerRun
      || summary.runs[0].motionCache?.diskHits !== 0
      || summary.runs[0].motionConcurrentPeak !== Math.min(Number(motionConcurrency), summary.motionTransitionsPreparedPerRun)
    : cacheProbe
    ? summary.benchmarkKind !== 'motion-cache-repeat' || summary.runs?.length !== 3 || summary.runs.some((run) => !run.motionCache || !run.motionCacheTotal)
    : summary.benchmarkKind !== 'worker-comparison' || summary.runs?.length !== 6 || summary.variants?.some((variant) => variant.runs !== 3)
  if (!summary.passed || invalidSummary) {
    throw Error(`O processo terminou sem as rodadas completas e validadas esperadas. Revise ${summaryPath}.`)
  }
  if (hairPreparationOnly && (await fs.readdir(outputFolder)).some((name) => name.toLowerCase().endsWith('.mp4'))) {
    throw Error(`O perfil de preparação não deveria gerar MP4. Revise ${outputFolder}.`)
  }
  console.log(`Comparação completa: ${summaryPath}`)
}

main().catch((error) => { console.error('[V6 project benchmark] Falha:', error); process.exitCode = 1 })
