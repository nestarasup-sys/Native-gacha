const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const http = require('node:http')

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
const singleMotionRun = process.argv.includes('--single-motion-run')
const hairPreparationOnly = process.argv.includes('--hair-preparation-only')
const noHairControl = process.argv.includes('--no-hair-control')
const motionConcurrency = argument('--motion-bake-concurrency=') ?? '2'
const renderWorkers = argument('--render-workers=')
const hairPreparationWorkers = argument('--hair-prep-workers=')
const exportTestMode = argument('--export-test-mode=')
const hairPresetSlot = argument('--hair-preset-slot=')
const segmentStartFrameValue = argument('--start-frame=')
const segmentDurationSecondsValue = argument('--duration-seconds=')
const repeatValue = argument('--repeat=')
const fullTimeline = process.argv.includes('--full-timeline')
const authorizedProjectTitle = 'Teste de Importação — Personagens do Pacote'
const rendererPortValue = argument('--renderer-port=')
const rendererPort = rendererPortValue === undefined ? 5188 : Number(rendererPortValue)
const captureModeValue = argument('--capture-mode=')
const sceneSurface = argument('--scene-surface=') ?? 'svg'
const uiExportProfile = process.argv.includes('--ui-export-profile')
const hairPresetFile = argument('--hair-preset-file=') && path.resolve(argument('--hair-preset-file='))
const encoder = argument('--encoder=') ?? (uiExportProfile ? 'cpu' : 'auto')
const x264Preset = argument('--x264-preset=') ?? 'ultrafast'
const x264ThreadsValue = argument('--x264-threads=')
const x264Threads = x264ThreadsValue === undefined ? undefined : Number(x264ThreadsValue)
const capturePixelHashes = process.argv.includes('--capture-pixel-hashes')
const retainMp4ForQuality = process.argv.includes('--retain-mp4-for-quality')
const MAX_RUN_OUTPUT_BYTES = 2 * 1024 ** 3
const MIN_FREE_SPACE_BYTES = 3 * 1024 ** 3
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

async function directoryBytes(directory) {
  let entries
  try { entries = await fs.readdir(directory, { withFileTypes: true }) }
  catch (error) { if (error?.code === 'ENOENT') return 0; throw error }
  let total = 0
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total += await directoryBytes(target)
    else if (entry.isFile()) {
      try { total += (await fs.stat(target)).size }
      catch (error) { if (error?.code !== 'ENOENT') throw error }
    } else throw Error('A saída do benchmark contém um tipo de arquivo não suportado: ' + entry.name)
  }
  return total
}
async function cleanupGeneratedRun(outputFolder, { retainMp4 = false } = {}) {
  const allowedRunsRoot = path.join(root, 'out', 'editor-v6-stress', 'runs')
  let realRoot, realOutput
  try {
    realRoot = await fs.realpath(allowedRunsRoot)
    realOutput = await fs.realpath(outputFolder)
  } catch (error) { if (error?.code === 'ENOENT') return; throw error }
  if (!inside(realRoot, realOutput) || realRoot === realOutput) throw Error('Recusa de limpeza: a saída não está dentro da raiz real de execuções do LAB.')
  const markerPath = path.join(realOutput, '.v6-benchmark-run.json')
  let marker
  try { marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) }
  catch (error) { if (error?.code === 'ENOENT') return; throw error }
  if (marker.schemaVersion !== 1 || marker.runId !== path.basename(realOutput)) throw Error('Recusa de limpeza: o marcador não pertence a esta execução do benchmark.')
  const isolatedData = path.join(realOutput, 'isolated-app-data')
  try {
    const info = await fs.lstat(isolatedData)
    if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Recusa de limpeza: isolated-app-data não é uma pasta física regular.')
    await fs.rm(isolatedData, { recursive: true, force: false })
  } catch (error) { if (error?.code !== 'ENOENT') throw error }
  async function removeHeavyOutputs(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw Error('Recusa de limpeza: link simbólico em saída gerada.')
      if (entry.isDirectory()) await removeHeavyOutputs(target)
      else if (entry.isFile() && !['.json', '.txt'].includes(path.extname(entry.name).toLowerCase()) && !(retainMp4 && path.extname(entry.name).toLowerCase() === '.mp4')) await fs.rm(target, { force: false })
      else if (!entry.isFile()) throw Error('Recusa de limpeza: tipo de entrada não regular em saída gerada.')
    }
  }
  await removeHeavyOutputs(realOutput)
}

async function main() {
  const sources = [projectFolder, libraryFolder, charactersPath, fabricatorFolder, sourceMotionCache]
  if (sources.some((source) => !source) || (!process.argv.includes('--compare-workers') && !cacheProbe && !singleMotionRun)
    && !hairPresetSlot && !noHairControl
    || singleMotionRun && !['1', '2', '3'].includes(motionConcurrency)
    || hairPreparationOnly && (!hairPresetSlot || cacheProbe || singleMotionRun || noHairControl || process.argv.includes('--compare-workers'))
    || noHairControl && (hairPresetSlot || cacheProbe || singleMotionRun || hairPreparationOnly || process.argv.includes('--compare-workers'))) {
    throw Error('Uso: node scripts/editor-v6/benchmark-project-export.cjs --project=<cópia verificada> --library=<mídias vinculadas> --characters=<personagens copiados> --fabricator=<cópia do Fabricador> --motion-cache=<cache vazio> (--compare-workers | --cache-probe | --single-motion-run --motion-bake-concurrency=1|2|3 | --hair-preset-slot=1..5 [--hair-preparation-only] | --no-hair-control) [--render-workers=2|4|6|8] [--hair-prep-workers=1|2|3|4]')
  }
  if (!Number.isInteger(rendererPort) || rendererPort < 1024 || rendererPort > 65535) throw Error('--renderer-port precisa ser uma porta local válida.')
  if (argument('--session-data=') !== undefined) throw Error('Reutilizar sessão Electron não é permitido no protocolo frio; cada execução cria uma sessão nova.')
  if (hairPresetSlot && (!/^\d+$/.test(hairPresetSlot) || Number(hairPresetSlot) < 1 || Number(hairPresetSlot) > 5)) {
    throw Error('--hair-preset-slot precisa ser um inteiro entre 1 e 5.')
  }
  const segmentStartFrame = segmentStartFrameValue === undefined ? 0 : Number(segmentStartFrameValue)
  const segmentDurationSeconds = segmentDurationSecondsValue === undefined ? (fullTimeline ? null : 20) : Number(segmentDurationSecondsValue)
  const repeatCount = repeatValue === undefined ? 1 : Number(repeatValue)
  if (exportTestMode !== undefined && !['controle', 'captura-8'].includes(exportTestMode)) {
    throw Error('--export-test-mode aceita somente controle ou captura-8 no benchmark isolado do projeto autorizado.')
  }
  if (captureModeValue !== undefined && !['capturePage', 'paint-event'].includes(captureModeValue)) throw Error('--capture-mode aceita capturePage ou paint-event.')
  if (!['svg', 'canvas2d'].includes(sceneSurface)) throw Error('--scene-surface aceita svg ou canvas2d.')
  if (sceneSurface === 'canvas2d' && (!uiExportProfile || hairPreparationOnly || !(hairPresetSlot || noHairControl))) throw Error('Canvas2D experimental exige uma exportação completa do perfil UI em processo isolado.')
  if (!['auto', 'cpu'].includes(encoder)) throw Error('--encoder aceita auto ou cpu.')
  if (x264ThreadsValue !== undefined && (!/^[1-8]$/.test(x264ThreadsValue) || encoder !== 'cpu')) throw Error('--x264-threads aceita 1 a 8 e exige --encoder=cpu.')
  if (!['1', '2', '3'].includes(motionConcurrency)) throw Error('--motion-bake-concurrency aceita 1, 2 ou 3.')
  if (renderWorkers && !['2', '4', '6', '8'].includes(renderWorkers)) throw Error('--render-workers aceita 2, 4, 6 ou 8 no harness Turbo.')
  if (hairPreparationWorkers && (!['1', '2', '3', '4'].includes(hairPreparationWorkers) || uiExportProfile)) throw Error('--hair-prep-workers aceita 1, 2, 3 ou 4 somente no caminho de preparo isolado; o perfil UI ignora essa instrumentação.')
  if (renderWorkers && process.argv.includes('--compare-workers')) throw Error('--render-workers não se combina com --compare-workers.')
  if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'].includes(x264Preset)) throw Error('--x264-preset aceita ultrafast, superfast, veryfast, faster, fast ou medium.')
  if (retainMp4ForQuality && (!uiExportProfile || !(hairPresetSlot || noHairControl) || hairPreparationOnly || repeatValue && repeatValue !== '1')) throw Error('--retain-mp4-for-quality exige uma única exportação completa do perfil UI.')
  if (uiExportProfile && (hairPresetSlot && (Number(hairPresetSlot) !== 2 || !hairPresetFile) || !hairPresetSlot && !noHairControl)) {
    throw Error('--ui-export-profile exige Preset 2 salvo para cabelo ativo ou --no-hair-control para o controle sem cabelo.')
  }
  if ((hairPresetSlot || noHairControl) && (!Number.isSafeInteger(segmentStartFrame) || segmentStartFrame < 0
    || segmentDurationSeconds !== null && (!Number.isSafeInteger(segmentDurationSeconds) || segmentDurationSeconds < 1)
    || !Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 3
    || fullTimeline && segmentDurationSecondsValue !== undefined
    || (segmentStartFrameValue !== undefined || segmentDurationSecondsValue !== undefined || fullTimeline) && hairPreparationOnly)) {
    throw Error('Benchmark de cabelo aceita --start-frame=, --duration-seconds= e --repeat=1..3; janela e repetição não se aplicam ao perfil somente de preparação.')
  }
  if (hairPreparationOnly && uiExportProfile) throw Error('--hair-preparation-only usa o preparo direto em processo isolado; não combine com --ui-export-profile.')
  const allowedRunsRoot = path.join(root, 'out', 'editor-v6-stress', 'runs')
  const allowedPresetRoot = path.join(root, 'out', 'editor-v6-stress', 'preferences')
  const immutableSources = [projectFolder, libraryFolder, charactersPath, fabricatorFolder]
  if (!immutableSources.every((source) => inside(verifiedBackupRoot, source))
    || !(inside(verifiedBackupRoot, sourceMotionCache) || inside(allowedRunsRoot, sourceMotionCache))) {
    throw Error('Projeto, mídias, personagens e Fabricador precisam vir do backup verificado; o cache pode vir do backup ou de uma execução isolada anterior.')
  }
  if (!inside(allowedRunsRoot, outputFolder) || outputFolder === allowedRunsRoot
    || sources.some((source) => inside(source, outputFolder) || inside(outputFolder, source))) {
    throw Error('A pasta de resultados precisa ficar isolada das fontes verificadas.')
  }
  let uiPreset = null
  if ((uiExportProfile || hairPreparationOnly) && hairPresetSlot) {
    const resolvedPresetPath = await fs.realpath(hairPresetFile)
    if (!inside(allowedPresetRoot, resolvedPresetPath)) throw Error('O preset UI deve estar na área local isolada out/editor-v6-stress/preferences.')
    const presetStats = await fs.stat(resolvedPresetPath)
    if (!presetStats.isFile() || presetStats.size > 32_768) throw Error('O arquivo de preset UI deve ser um JSON pequeno e regular.')
    const presetEnvelope = JSON.parse(await fs.readFile(resolvedPresetPath, 'utf8'))
    if (presetEnvelope.slot !== 2 || !presetEnvelope.preset || typeof presetEnvelope.preset !== 'object') throw Error('O arquivo não contém o preset 2 salvo na interface.')
    uiPreset = presetEnvelope.preset
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
  if ((hairPresetSlot || noHairControl || singleMotionRun) && (await fs.readdir(sourceMotionCache)).length !== 0) throw Error('A exportação fria exige cache-fonte de movimentos vazio.')
  await fs.access(path.join(fabricatorFolder, 'models', 'slot-1', 'project.json'))
  await fs.access(path.join(root, 'out', 'main', 'main.js'))

  await fs.mkdir(path.dirname(outputFolder), { recursive: true })
  await fs.mkdir(outputFolder, { recursive: false })
  const canonicalOutput = await fs.realpath(outputFolder)
  if (!inside(await fs.realpath(allowedRunsRoot), canonicalOutput) || (await fs.lstat(outputFolder)).isSymbolicLink()) {
    throw Error('A pasta de saída não é um diretório físico canônico dentro da raiz de execuções do LAB.')
  }
  await fs.writeFile(path.join(outputFolder, '.v6-benchmark-run.json'), JSON.stringify({ schemaVersion: 1, runId: path.basename(canonicalOutput), createdAt: new Date().toISOString() }), { flag: 'wx' })
  const disk = await fs.statfs(outputFolder)
  if (disk.bavail * disk.bsize < MIN_FREE_SPACE_BYTES) throw Error('O benchmark foi interrompido: são necessários pelo menos 3 GiB livres na unidade de saída.')
  // Resolve a run-folder junction before Electron's canonical-path check.
  // This lets stress outputs live on a separate volume when the repository
  // volume is full while keeping all writes inside the requested run folder.
  const dataRoot = path.join(await fs.realpath(outputFolder), 'isolated-app-data')
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
  // The UI's fixed-folder preference avoids an interactive Save As dialog.
  // Point that same IPC path at this run's disposable output directory.
  await fs.writeFile(path.join(profile, 'editor-v6-export-folder.json'), JSON.stringify({ folder: outputFolder }), { flag: 'wx' })
  const rendererOrigin = `http://127.0.0.1:${rendererPort}`
  const rendererServer = reuseRendererServer
    ? (await verifyExistingRenderer(rendererOrigin), { origin: rendererOrigin, close: async () => {} })
    : await serveBuiltRenderer(root, rendererPort)
  const childEnv = { ...process.env, ELECTRON_RENDERER_URL: rendererServer.origin, GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_DATA_ROOT: dataRoot,
    GACHA_EDITOR_V6_STRESS_AUTORUN: '1', GACHA_EDITOR_V6_STRESS_PROJECT_ID: manifest.id,
    ...(cacheProbe ? { GACHA_EDITOR_V6_STRESS_CACHE_PROBE: '1' } : {}),
    ...(singleMotionRun ? { GACHA_EDITOR_V6_STRESS_SINGLE_MOTION_RUN: '1', GACHA_EDITOR_V6_STRESS_MOTION_CONCURRENCY: motionConcurrency } : {}),
    ...(exportTestMode ? { GACHA_EDITOR_V6_STRESS_EXPORT_TEST_MODE: exportTestMode } : {}),
    ...(captureModeValue ? { GACHA_EDITOR_V6_STRESS_CAPTURE_MODE: captureModeValue } : {}),
    ...(sceneSurface === 'canvas2d' ? { GACHA_EDITOR_V6_STRESS_SCENE_SURFACE: 'canvas2d' } : {}),
    ...(uiExportProfile ? { GACHA_EDITOR_V6_STRESS_UI_EXPORT_PROFILE: '1' } : {}),
    ...((uiExportProfile || hairPreparationOnly) && uiPreset ? { GACHA_EDITOR_V6_STRESS_HAIR_PRESET_JSON: JSON.stringify(uiPreset) } : {}),
    GACHA_EDITOR_V6_STRESS_ENCODER: encoder,
    GACHA_EDITOR_V6_STRESS_X264_PRESET: x264Preset,
    ...(x264Threads === undefined ? {} : { GACHA_EDITOR_V6_STRESS_X264_THREADS: String(x264Threads) }),
    GACHA_EDITOR_V6_STRESS_MOTION_CONCURRENCY: motionConcurrency,
    ...(renderWorkers ? { GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS: renderWorkers } : {}),
    ...(hairPreparationWorkers ? { GACHA_EDITOR_V6_STRESS_HAIR_PREP_WORKERS: hairPreparationWorkers } : {}),
    ...(capturePixelHashes ? { GACHA_EDITOR_V6_STRESS_CAPTURE_PIXEL_HASHES: '1' } : {}),
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
  if (x264Threads === undefined) delete childEnv.GACHA_EDITOR_V6_STRESS_X264_THREADS
  let code
  try {
    const exportChild = spawn(require('electron'), [path.join(root, 'out', 'main', 'main.js')], { cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true })
    let outputLimitExceeded = false, sizeCheckRunning = false
    const sizeCheck = setInterval(() => {
      if (sizeCheckRunning || outputLimitExceeded) return
      sizeCheckRunning = true
      void directoryBytes(outputFolder).then((bytes) => {
        if (bytes > MAX_RUN_OUTPUT_BYTES) {
          outputLimitExceeded = true
          exportChild.kill()
        }
      }).catch((error) => {
        outputLimitExceeded = true
        exportChild.kill()
        console.error('[V6 benchmark output guard]', error)
      }).finally(() => { sizeCheckRunning = false })
    }, 3000)
    sizeCheck.unref()
    try {
      code = await new Promise((resolve, reject) => {
        exportChild.once('error', reject)
        exportChild.once('exit', (status, signal) => status === null ? reject(Error(`Electron encerrou por sinal ${signal}.`)) : resolve(status))
      })
    } finally { clearInterval(sizeCheck) }
    if (outputLimitExceeded) throw Error('O benchmark excedeu o limite de 2 GiB; a saída parcial foi preservada para diagnóstico.')
  } finally { await rendererServer.close() }
  if (code !== 0) throw Error(`A comparação do projeto real falhou (Electron ${code}); os relatórios parciais ficaram em ${outputFolder}.`)
  const summaryPath = path.join(outputFolder, 'stress-export-validation.json')
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
  const invalidSummary = hairPreparationOnly
    ? summary.benchmarkKind !== 'real-project-hair-preparation' || summary.projectTitle !== authorizedProjectTitle
      || summary.durationFrames !== manifest.timeline.durationFrames || summary.hairPresetSlot !== Number(hairPresetSlot)
      || summary.rigCount < 1 || !Number.isFinite(summary.preparationWallMs)
    : noHairControl
    ? summary.benchmarkKind !== 'real-project-no-hair-control' || summary.projectTitle !== authorizedProjectTitle
      || summary.sceneSurface !== sceneSurface
      || summary.sceneSurfaceRuns?.length !== repeatCount
      || sceneSurface === 'canvas2d' && summary.sceneSurfaceRuns.some((run) => run.canvas2dPresentations < 1)
      || sceneSurface === 'svg' && summary.sceneSurfaceRuns.some((run) => run.canvas2dPresentations !== 0 || run.svgFallbackPresentations !== 0)
      || uiExportProfile && summary.profile !== 'editor-v6-ui-default-no-hair'
      || uiExportProfile && summary.x264Preset !== x264Preset
      || summary.motionConcurrency !== Number(motionConcurrency)
      || summary.renderWorkers !== (renderWorkers ? Number(renderWorkers) : 2)
      || summary.timelineDurationFrames !== manifest.timeline.durationFrames || summary.startFrame !== segmentStartFrame || summary.durationFrames !== segmentFrameCount || summary.runs?.length !== repeatCount
      || summary.requestedEncoder !== encoder
      || summary.runs.some((run) => run.totalFrames !== segmentFrameCount || run.width !== 1920 || run.height !== 1080 || run.fps !== '30/1'
        || !Number.isFinite(run.milliseconds) || run.milliseconds <= 0 || !Number.isSafeInteger(run.audioClips) || run.audioClips < 0
        || !Number.isFinite(run.exportWallMs) || run.exportWallMs < run.milliseconds
        || !Number.isFinite(run.clickToValidatedWallMs) || (uiExportProfile ? run.clickToValidatedWallMs < run.exportWallMs : run.clickToValidatedWallMs !== run.exportWallMs)
        || run.audioOutput !== (run.audioClips > 0))
    : hairPresetSlot
    ? summary.benchmarkKind !== 'real-project-hair-export' || summary.projectTitle !== authorizedProjectTitle
      || summary.sceneSurface !== sceneSurface
      || summary.sceneSurfaceRuns?.length !== repeatCount
      || sceneSurface === 'canvas2d' && summary.sceneSurfaceRuns.some((run) => run.canvas2dPresentations < 1)
      || sceneSurface === 'svg' && summary.sceneSurfaceRuns.some((run) => run.canvas2dPresentations !== 0 || run.svgFallbackPresentations !== 0)
      || summary.timelineDurationFrames !== manifest.timeline.durationFrames || summary.startFrame !== segmentStartFrame || summary.durationFrames !== segmentFrameCount || summary.runs?.length !== repeatCount
      || summary.hairPresetSlot !== Number(hairPresetSlot)
      || summary.requestedEncoder !== encoder
      || summary.motionConcurrency !== Number(motionConcurrency)
      || summary.renderWorkers !== (renderWorkers ? Number(renderWorkers) : 2)
      || uiExportProfile && (summary.profile !== (x264ThreadsValue === undefined ? 'editor-v6-ui-default' : 'stress-custom')
        || summary.x264Preset !== x264Preset || x264ThreadsValue !== undefined && summary.encoderThreads !== Number(x264ThreadsValue)
        || summary.hairPoseReactionOnly !== true || summary.hairPosteriorOnly !== true)
      || summary.runs.some((run) => run.totalFrames !== segmentFrameCount || run.width !== 1920 || run.height !== 1080 || run.fps !== '30/1'
        || run.requestedEncoder !== encoder || !Number.isSafeInteger(run.audioClips) || run.audioClips < 0 || run.audioOutput !== (run.audioClips > 0)
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
  // Retain only a small run marker and JSON/text evidence after validation.
  await cleanupGeneratedRun(outputFolder, { retainMp4: retainMp4ForQuality })
  if (retainMp4ForQuality) console.log('MP4 temporário para comparação visual: ' + path.join(outputFolder, (await fs.readdir(outputFolder)).find((name) => name.toLowerCase().endsWith('.mp4')) ?? '(não encontrado)'))
  console.log('Comparação completa: ' + summaryPath)
}

main().catch(async (error) => {
  console.error('[V6 project benchmark] Falha:', error)
  try { await cleanupGeneratedRun(outputFolder) }
  catch (cleanupError) { console.error('[V6 project benchmark] Falha ao limpar temporários próprios:', cleanupError) }
  process.exitCode = 1
})
