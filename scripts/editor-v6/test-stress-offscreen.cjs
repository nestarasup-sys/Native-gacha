const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const outputRoot = path.join(root, 'out', 'editor-v6-stress')
const projectRoot = path.join(root, 'app-data', 'runtime', 'profile', 'studios', 'Editor V6')
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const runDurationMs = Number(process.env.GACHA_EDITOR_V6_STRESS_RUN_MS || 6000)

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForDebugger(port, child) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron fechou durante a inicialização (código ${child.exitCode}).`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error('O Electron offscreen não abriu a porta CDP em 120 segundos.')
}

async function connectCdp(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('A sessão CDP do Electron foi encerrada.'))
    pending.clear()
  })
  const send = (method, params = {}, timeoutMs = 60_000) => new Promise((resolve, reject) => {
    const requestId = ++id
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP ${method} excedeu ${timeoutMs} ms.`)) }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
  return { send, close: () => socket.close() }
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true })
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-v6-stress-offscreen-'))
  const bundlePath = path.join(tempRoot, 'real-characters.json')
  const projectSummaryPath = path.join(outputRoot, 'projects-summary.json')
  const port = await freePort()
  const env = {
    ...process.env,
    GACHA_VIDEO_STRESS_OFFSCREEN: '1',
    GACHA_VIDEO_STRESS_DEBUG_PORT: String(port),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  let cdp
  let success = false
  try {
    console.log('[V6 stress] Iniciando o app Electron fora da área visível e habilitando CDP local.')
    const target = await waitForDebugger(port, child)
    cdp = await connectCdp(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "try { sessionStorage.setItem('gv5:perf', '1') } catch {}" })

    const origin = new URL(target.url).origin
    const captureUrl = `${origin}/?editorV6StressCapture=1&run=${Date.now()}#/editor-v6-stress-harness`
    await cdp.send('Page.navigate', { url: captureUrl })
    console.log('[V6 stress] Renderizando os quatro STRESS e as transições reais com o motor de personagens do Editor V6.')
    const captureStatus = await waitForExpression(cdp, "window.__editorV6StressCapture?.status", (value) => value === 'done' || value === 'error', 180_000)
    if (captureStatus === 'error') {
      const details = await evaluate(cdp, 'window.__editorV6StressCapture?.error || "Erro desconhecido ao preparar personagens."')
      throw new Error(details)
    }
    const captured = await evaluate(cdp, 'window.__editorV6StressCapture.result')
    if (!Array.isArray(captured) || captured.length !== 4) throw new Error('A captura offscreen não entregou os quatro personagens STRESS.')
    await fs.writeFile(bundlePath, JSON.stringify(captured), 'utf8')
    console.log(`[V6 stress] ${captured.length} personagens capturados; bundle temporário: ${Math.round((await fs.stat(bundlePath)).size / 1024)} KB.`)

    const generate = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.editor-v6.config.ts', 'tests/editor-v6/editorV6StressProjects.test.ts'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...env,
        GACHA_EDITOR_V6_STRESS_FIXTURES: '1',
        GACHA_EDITOR_V6_STRESS_ROOT: projectRoot,
        GACHA_EDITOR_V6_STRESS_CHARACTERS_BUNDLE: bundlePath,
        GACHA_EDITOR_V6_STRESS_SUMMARY_PATH: projectSummaryPath
      },
      timeout: 180_000,
      windowsHide: true
    })
    if (generate.error) throw generate.error
    if (generate.status !== 0) throw new Error(`A geração/validação dos projetos falhou (Vitest ${generate.status}).`)
    const projectSummaries = JSON.parse(await fs.readFile(projectSummaryPath, 'utf8'))

    const scenarios = [
      { key: 'light', title: '[TESTE] Estresse leve — 4 personagens STRESS' },
      { key: 'medium', title: '[TESTE] Estresse médio — 4 personagens STRESS' },
      { key: 'heavy', title: '[TESTE] Estresse pesado — 4 personagens STRESS' }
    ]
    const measurements = []
    for (const scenario of scenarios) {
      const appUrl = `${origin}/?editorV6Offscreen=${scenario.key}-${Date.now()}#/editor-v6`
      await cdp.send('Page.navigate', { url: appUrl })
      await waitForExpression(cdp, `Boolean(document.querySelector(${JSON.stringify(`button[aria-label="Abrir ${scenario.title}"]`)}))`, Boolean, 90_000)
      const opened = await evaluate(cdp, `(() => { const button = document.querySelector(${JSON.stringify(`button[aria-label="Abrir ${scenario.title}"]`)}); if (!button) return false; button.click(); return true })()`)
      if (!opened) throw new Error(`Não foi possível abrir o projeto ${scenario.key} na interface real do Editor V6.`)
      await waitForExpression(cdp, `Boolean(document.querySelector(${JSON.stringify(`.studio-editor[aria-label="Editor do ${scenario.title}"]`)}))`, Boolean, 90_000)
      await waitForExpression(cdp, 'document.querySelectorAll(".editor-v6-timeline-block").length > 0', Boolean, 30_000)
      const motionPreparation = await waitForMotionPreparation(cdp, 180_000)

      const prepared = projectSummaries.find((item) => item.key === scenario.key)
      const expectedStressIds = captured.map(({ character }) => character.id).sort().join(',')
      if (!prepared || prepared.missingMotions !== 0 || prepared.characters !== 4 || prepared.characterNames.join(',') !== captured.map(({ character }) => character.name).join(',') || prepared.characterIds.sort().join(',') !== expectedStressIds) {
        throw new Error(`${scenario.key}: o projeto aberto no app perdeu personagens STRESS ou transições 250 ms. Dados: ${JSON.stringify(prepared)}`)
      }
      await evaluate(cdp, 'document.querySelector("button[aria-label=\\"Fechar inspector\\"]")?.click()')
      await waitForExpression(cdp, 'Boolean(!document.querySelector(".studio-inspector"))', (value) => value === true, 5000)
      const playButton = await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]") !== null')
      if (!playButton) throw new Error(`${scenario.key}: botão de reprodução não apareceu no Editor V6.`)
      const expectedSceneNames = captured.map(({ character }) => character.name)
      const visualSurface = await evaluate(cdp, `({ cast: document.querySelectorAll(".studio-cast-item").length, timeline: document.querySelectorAll(".editor-v6-timeline-block").length, scene: Boolean(document.querySelector(".v6-scene-canvas")), sceneCharacterNames: [...document.querySelectorAll(".v6-scene-surface g[data-element-id]")].map(element => element.getAttribute("aria-label")).filter(name => ${JSON.stringify(expectedSceneNames)}.includes(name)) })`)
      if (visualSurface.cast !== 4 || visualSurface.sceneCharacterNames.slice().sort().join(',') !== expectedSceneNames.slice().sort().join(',') || !visualSurface.scene || visualSurface.timeline === 0) throw new Error(`${scenario.key}: a interface não desenhou os quatro personagens reais na cena. ${JSON.stringify(visualSurface)}`)
      await evaluate(cdp, 'window.__gv5PerformanceReset?.()')
      await evaluate(cdp, `(() => {
        const state = { samples: [], last: null, started: performance.now(), active: true }
        window.__editorV6StressFrames = state
        const tick = (time) => { if (!state.active) return; if (state.last !== null) state.samples.push(time - state.last); state.last = time; requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      })()`)
      await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]").click()')
      const playbackStarted = await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]"))', (value) => value === true, 5000).catch(() => false)
      if (!playbackStarted) {
        const blocked = await evaluate(cdp, `({
          preview: document.querySelector('.v6-preview-time')?.textContent?.trim() ?? null,
          playButton: document.querySelector('.editor-v6-timeline-actions button[aria-label="Reproduzir"]')?.outerHTML ?? null,
          pauseButton: Boolean(document.querySelector('.editor-v6-timeline-actions button[aria-label="Pausar"]')),
          notices: [...document.querySelectorAll('.v6-timeline-notice,[role="alert"],[role="status"]')].map(item => item.textContent?.trim()).filter(Boolean).slice(0,8)
        })`)
        throw new Error(`${scenario.key}: o botão foi chamado, mas o Editor V6 não iniciou a reprodução. ${JSON.stringify(blocked)}`)
      }
      const clockAtStart = await evaluate(cdp, 'document.querySelector(".v6-preview-time")?.textContent?.trim() ?? null')
      await new Promise((resolve) => setTimeout(resolve, runDurationMs))
      const clockAtEnd = await evaluate(cdp, 'document.querySelector(".v6-preview-time")?.textContent?.trim() ?? null')
      if (!clockAtEnd?.startsWith('Reproduzindo') || clockAtEnd === clockAtStart) throw new Error(`${scenario.key}: a prévia não avançou durante a reprodução. ${clockAtStart} → ${clockAtEnd}`)
      await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]")?.click()')
      const measurement = await evaluate(cdp, `(() => {
        const state = window.__editorV6StressFrames
        state.active = false
        const sorted = [...state.samples].sort((a,b) => a-b)
        const percentile = (p) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(2) : 0
        const mean = state.samples.length ? state.samples.reduce((a,b) => a+b,0) / state.samples.length : 0
        return {
          rafSamples: state.samples.length,
          elapsedMs: +(performance.now() - state.started).toFixed(1),
          averageFps: mean ? +(1000 / mean).toFixed(1) : 0,
          p50FrameMs: percentile(.5), p95FrameMs: percentile(.95), worstFrameMs: sorted.at(-1) ? +sorted.at(-1).toFixed(2) : 0,
          framesOver33ms: state.samples.filter(frame => frame > 33.34).length,
          framesOver50ms: state.samples.filter(frame => frame > 50).length,
          clockAtStart: ${JSON.stringify(clockAtStart)},
          clockAtEnd: ${JSON.stringify(clockAtEnd)},
          playbackClock: document.querySelector('.v6-preview-time')?.textContent?.trim() ?? null,
          react: window.__gv5PerformanceReport?.() ?? []
        }
      })()`)
      const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const screenshotPath = path.join(outputRoot, `${scenario.key}-offscreen.png`)
      await fs.writeFile(screenshotPath, Buffer.from(image.data, 'base64'))
      measurements.push({ ...scenario, project: prepared, visualSurface, motionReadyWaitMs: motionPreparation.durationMs, ...measurement, screenshotPath })
      console.log(`[V6 stress] ${scenario.key}: ${prepared.blocks} blocos, ${measurement.averageFps} fps estimado por requestAnimationFrame, p95 ${measurement.p95FrameMs} ms.`)

    }
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'Electron Chromium: janela nativa movida para fora de todos os monitores; background throttling desativado; CDP local.',
      runDurationMs,
      characters: captured.map(({ character, poses, transitions }) => ({ name: character.name, id: character.id, renderedPoses: poses.map(({ poseSlot, width, height }) => ({ poseSlot, width, height })), bakedTransitions: transitions.map(({ fromPoseSlot, toPoseSlot, metrics }) => ({ fromPoseSlot, toPoseSlot, ...metrics })) })),
      measurements
    }
    const reportPath = path.join(outputRoot, 'offscreen-performance.json')
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`[V6 stress] Relatório completo: ${reportPath}`)
    success = true
  } finally {
    cdp?.close()
    if (process.platform === 'win32' && child.pid) {
      const stopped = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      if (stopped.error || stopped.status !== 0) child.kill()
    } else child.kill()
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
  if (!success) process.exitCode = 1
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, 180_000)
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Falha de execução no renderer offscreen.')
  return response.result?.value
}

async function waitForExpression(cdp, expression, ready, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression)
      if (ready(value)) return value
    } catch (error) { lastError = error }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Tempo limite aguardando condição do teste offscreen: ${expression}${lastError ? ` (${lastError.message})` : ''}`)
}

async function waitForMotionPreparation(cdp, timeoutMs) {
  const startedAt = Date.now(), deadline = startedAt + timeoutMs
  let readySince = null
  while (Date.now() < deadline) {
    const state = await evaluate(cdp, `(() => {
      const pending = [...document.querySelectorAll('small[role="status"].studio-save-notice')].map(node => node.textContent?.trim() || '')
      const errors = [...document.querySelectorAll('small[role="status"].studio-error-message')].map(node => node.textContent?.trim() || '')
      return { pending: pending.some(text => /Preparando anima/i.test(text)), errors }
    })()`)
    if (state.errors.length) throw new Error(`Falha ao preparar a animação real no Editor V6: ${state.errors.join(' | ')}`)
    if (state.pending) readySince = null
    else if (readySince === null) readySince = Date.now()
    else if (Date.now() - readySince >= 700) return { durationMs: readySince - startedAt }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`O Editor V6 não terminou de preparar as transições em ${timeoutMs} ms.`)
}

main().catch((error) => { console.error('[V6 stress] Falha:', error); process.exitCode = 1 })
