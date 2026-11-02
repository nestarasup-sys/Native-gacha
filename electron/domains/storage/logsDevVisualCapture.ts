import type { BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readElectronAppMetrics } from '../../application/electronAppMetrics'
import type { IpcPerformanceDiagnosticsSnapshot } from '../../../src/shared/dataManagement'
import { routePerformanceScenarios, summarizeRoutePerformance, type RoutePerformanceSample, type RouteStartupPerformance } from './routePerformanceModel'

async function waitFor(win: BrowserWindow, selector: string, description: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('Janela sintética da Logs Dev foi fechada.')
    const exists = await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`) as boolean
    if (exists) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Conteúdo da Logs Dev não abriu: ${description}`)
}

async function waitForRendered(win: BrowserWindow, selector: string, description: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let consecutive = 0
  while (Date.now() < deadline) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('Janela sintética da Logs Dev foi fechada.')
    const ready = await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element || !element.isConnected) return false
      const rectangle = element.getBoundingClientRect()
      return rectangle.width > 0 && rectangle.height > 0 && !document.body.innerText.includes('Carregando área…')
    })()`) as boolean
    consecutive = ready ? consecutive + 1 : 0
    if (consecutive >= 4) return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`A interface da Logs Dev não estabilizou: ${description}`)
}

async function clickText(win: BrowserWindow, selector: string, text: string): Promise<void> {
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(element => element.textContent?.trim() === ${JSON.stringify(text)})
    if (!target || target.matches(':disabled')) return false
    target.click()
    return true
  })()`) as boolean
  if (!clicked) throw new Error(`Ação sintética indisponível na Logs Dev: ${text}`)
}

async function waitForOverviewEvents(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const settled = await win.webContents.executeJavaScript(
      `document.querySelector('.options-health-copy strong')?.textContent?.trim() !== 'Carregando os registros locais'`
    ) as boolean
    if (settled) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('A visão geral da Logs Dev não terminou de carregar os eventos locais.')
}

async function captureInitialStartup(win: BrowserWindow): Promise<RouteStartupPerformance> {
  const routes = routePerformanceScenarios.map(({ id, route, selector, settledCondition }) => ({ id, route, selector, settledCondition }))
  const deadline = Date.now() + 20_000
  let initialRoute: (typeof routes)[number] | null = null
  while (Date.now() < deadline) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('Janela sintética da Logs Dev foi fechada.')
    initialRoute = await win.webContents.executeJavaScript(`(() => {
      const routes = ${JSON.stringify(routes)}
      return routes.find(({ selector }) => {
        const element = document.querySelector(selector)
        const rectangle = element?.getBoundingClientRect()
        return Boolean(element?.isConnected && rectangle && rectangle.width > 0 && rectangle.height > 0)
      }) ?? null
    })()`) as (typeof routes)[number] | null
    if (initialRoute) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (!initialRoute) throw new Error('A primeira tela do aplicativo não apareceu durante a captura sintética.')
  const firstShellAtMs = Date.now()

  const settleDeadline = Date.now() + 20_000
  let initialRouteSettled = false
  while (Date.now() < settleDeadline) {
    const settled = await win.webContents.executeJavaScript(`Boolean(${initialRoute.settledCondition})`) as boolean
    if (settled) { initialRouteSettled = true; break }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!initialRouteSettled) throw new Error(`A tela inicial ${initialRoute.route} não terminou de carregar os dados.`)
  await new Promise(resolve => setTimeout(resolve, 100))

  const renderer = await win.webContents.executeJavaScript(`(() => {
    const navigation = performance.getEntriesByType('navigation')[0]
    const paints = performance.getEntriesByType('paint')
    const elapsed = (value) => Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
    const paint = (name) => elapsed(paints.find((entry) => entry.name === name)?.startTime)
    return {
      rendererNavigation: {
        domInteractiveMs: elapsed(navigation?.domInteractive),
        domContentLoadedMs: elapsed(navigation?.domContentLoadedEventEnd),
        loadEventEndMs: elapsed(navigation?.loadEventEnd)
      },
      rendererPaint: { firstPaintMs: paint('first-paint'), firstContentfulPaintMs: paint('first-contentful-paint') },
      rendererJsHeapBytes: Number.isFinite(performance.memory?.usedJSHeapSize) ? performance.memory.usedJSHeapSize : null
    }
  })()`) as Pick<RouteStartupPerformance, 'rendererNavigation' | 'rendererPaint' | 'rendererJsHeapBytes'>
  const ipcPerformance = await win.webContents.executeJavaScript('window.desktop.dataManagement.getIpcPerformanceSnapshot()') as IpcPerformanceDiagnosticsSnapshot
  const appMetrics = readElectronAppMetrics()
  const rendererMetric = appMetrics.metrics.find((metric) => metric.pid === win.webContents.getOSProcessId())
  const mainMemory = process.memoryUsage()
  const launchStartedAtMs = Number(process.env.GACHA_LOGS_DEV_CAPTURE_LAUNCH_STARTED_AT_MS)
  const kb = (value: number | undefined) => Number.isFinite(value) && (value ?? -1) >= 0 ? value! : null
  return {
    initialRouteId: initialRoute.id,
    initialRoute: initialRoute.route,
    launchToFirstShellMs: Number.isSafeInteger(launchStartedAtMs) && launchStartedAtMs > 0
      ? Math.max(0, firstShellAtMs - launchStartedAtMs)
      : null,
    electronProcessUptimeMs: Math.round(process.uptime() * 100) / 100,
    ...renderer,
    rendererWorkingSetKiB: kb(rendererMetric?.memory?.workingSetSize),
    rendererPrivateKiB: kb(rendererMetric?.memory?.privateBytes),
    mainRssBytes: mainMemory.rss,
    mainHeapUsedBytes: mainMemory.heapUsed,
    ipcPerformance
  }
}

async function measureRouteShell(
  win: BrowserWindow,
  scenario: (typeof routePerformanceScenarios)[number],
  round: number
): Promise<RoutePerformanceSample> {
  readElectronAppMetrics()
  const measured = await win.webContents.executeJavaScript(`new Promise(resolve => {
    const startedAt = performance.now()
    const targetHash = ${JSON.stringify(`#${scenario.route}`)}
    let settled = false
    let shellDurationMs = null
    let timeout = 0
    let observer
    let longTaskObserver
    let longTaskCount = 0
    let longTaskTotalMs = 0
    let longTaskMaxMs = 0
    let longTaskSupported = false
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        longTaskObserver = new PerformanceObserver(list => {
          for (const task of list.getEntries()) {
            longTaskCount += 1
            longTaskTotalMs += task.duration
            longTaskMaxMs = Math.max(longTaskMaxMs, task.duration)
          }
        })
        longTaskObserver.observe({ type: 'longtask' })
        longTaskSupported = true
      }
    } catch { longTaskObserver?.disconnect(); longTaskObserver = undefined }
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      observer?.disconnect()
      for (const task of longTaskObserver?.takeRecords() ?? []) {
        longTaskCount += 1
        longTaskTotalMs += task.duration
        longTaskMaxMs = Math.max(longTaskMaxMs, task.duration)
      }
      longTaskObserver?.disconnect()
      const resources = performance.getEntriesByType('resource').filter(entry => entry.startTime >= startedAt)
      const encodedSizes = resources.map(entry => entry.encodedBodySize).filter(size => Number.isFinite(size) && size >= 0)
      resolve({ ...result,
        longTaskSupported,
        longTaskCount: longTaskSupported ? longTaskCount : null,
        longTaskTotalMs: longTaskSupported ? Math.round(longTaskTotalMs * 100) / 100 : null,
        longTaskMaxMs: longTaskSupported ? Math.round(longTaskMaxMs * 100) / 100 : null,
        newResourceEntryCount: resources.length,
        newResourceEncodedBytes: encodedSizes.length ? encodedSizes.reduce((sum, size) => sum + size, 0) : null })
    }
    const check = () => {
      const element = document.querySelector(${JSON.stringify(scenario.selector)})
      const rect = element?.getBoundingClientRect()
      const visible = Boolean(element?.isConnected && rect && rect.width > 0 && rect.height > 0)
      if (location.hash !== targetHash || !visible) return
      if (shellDurationMs === null) shellDurationMs = performance.now() - startedAt
      if (Boolean(${scenario.settledCondition})) finish({ status: 'ready', startedAt, durationMs: performance.now() - startedAt,
        shellDurationMs, rendererJsHeapBytes: Number.isFinite(performance.memory?.usedJSHeapSize) ? performance.memory.usedJSHeapSize : null })
    }
    timeout = setTimeout(() => finish({ status: 'timeout', durationMs: performance.now() - startedAt,
      shellDurationMs, rendererJsHeapBytes: Number.isFinite(performance.memory?.usedJSHeapSize) ? performance.memory.usedJSHeapSize : null }), 20000)
    observer = new MutationObserver(check)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
    window.location.hash = targetHash
    check()
  })`) as {
    status: 'ready' | 'timeout'
    startedAt?: number
    durationMs: number
    rendererJsHeapBytes: number | null
    shellDurationMs: number | null
    longTaskSupported: boolean
    longTaskCount: number | null
    longTaskTotalMs: number | null
    longTaskMaxMs: number | null
    newResourceEntryCount: number
    newResourceEncodedBytes: number | null
  }
  if (measured.status !== 'ready' || !Number.isFinite(measured.durationMs) || !Number.isFinite(measured.startedAt)) {
    throw new Error(`A rota ${scenario.route} não exibiu o shell esperado (${scenario.selector}).`)
  }
  const completedMetrics = readElectronAppMetrics()
  const rendererPid = win.webContents.getOSProcessId()
  const renderer = completedMetrics.metrics.find((metric) => metric.pid === rendererPid)
  const main = completedMetrics.metrics.find((metric) => metric.pid === process.pid)
  const cpuPercent = (percent: number | undefined) => completedMetrics.sampleIntervalMs !== null &&
    completedMetrics.sampleIntervalMs >= 100 && Number.isFinite(percent) && (percent ?? -1) >= 0 ? percent! : null
  const memoryKiB = (value: number | undefined) => Number.isFinite(value) && (value ?? -1) >= 0 ? value! : null
  const mainMemory = process.memoryUsage()
  return {
    round,
    id: scenario.id,
    route: scenario.route,
    durationMs: Math.round(measured.durationMs * 100) / 100,
    shellDurationMs: Math.round(measured.shellDurationMs! * 100) / 100,
    rendererCpuPercent: cpuPercent(renderer?.cpu.percentCPUUsage),
    mainCpuPercent: cpuPercent(main?.cpu.percentCPUUsage),
    cpuSampleIntervalMs: completedMetrics.sampleIntervalMs,
    rendererWorkingSetKiB: memoryKiB(renderer?.memory?.workingSetSize),
    rendererPrivateKiB: memoryKiB(renderer?.memory?.privateBytes),
    rendererJsHeapBytes: measured.rendererJsHeapBytes,
    longTaskSupported: measured.longTaskSupported,
    longTaskCount: measured.longTaskCount,
    longTaskTotalMs: measured.longTaskTotalMs,
    longTaskMaxMs: measured.longTaskMaxMs,
    newResourceEntryCount: measured.newResourceEntryCount,
    newResourceEncodedBytes: measured.newResourceEncodedBytes,
    mainRssBytes: mainMemory.rss,
    mainHeapUsedBytes: mainMemory.heapUsed
  }
}

async function captureRoutePerformance(win: BrowserWindow, outputDirectory: string, startup: RouteStartupPerformance): Promise<void> {
  const ids = new Map<string, (typeof routePerformanceScenarios)[number]>(routePerformanceScenarios.map((scenario) => [scenario.id, scenario]))
  const orders = [
    ['customizer', 'fabricator', 'studio', 'editor-v6', 'roteiros', 'base-videos', 'logs-dev'],
    ['customizer', 'logs-dev', 'base-videos', 'roteiros', 'editor-v6', 'studio', 'fabricator'],
    ['studio', 'base-videos', 'fabricator', 'editor-v6', 'logs-dev', 'customizer', 'roteiros']
  ]
  const samples: RoutePerformanceSample[] = []
  await win.webContents.executeJavaScript('window.desktop.dataManagement.setIpcPerformanceCollection(true)')
  let ipcPerformance
  try {
    for (const [index, order] of orders.entries()) {
      for (const id of order) {
        const scenario = ids.get(id)
        if (!scenario) throw new Error(`Cenário de navegação não cadastrado: ${id}`)
        samples.push(await measureRouteShell(win, scenario, index + 1))
      }
    }
    ipcPerformance = await win.webContents.executeJavaScript('window.desktop.dataManagement.setIpcPerformanceCollection(false)')
  } finally {
    if (!ipcPerformance) {
      await win.webContents.executeJavaScript('window.desktop.dataManagement.setIpcPerformanceCollection(false)').catch(() => undefined)
    }
  }
  await writeFile(join(outputDirectory, 'route-performance.json'), JSON.stringify({
    schemaVersion: 1,
    syntheticOnly: true,
    source: 'electron-renderer-route-shell',
    method: 'hash navigation to visible route shell and each page’s settled state; opt-in IPC aggregate, Long Tasks observer, process metrics, and new Resource Timing entries',
    loadCondition: 'external load uncontrolled; compare only samples captured under similar conditions',
    startup,
    ipcPerformance,
    samples,
    summary: summarizeRoutePerformance(samples)
  }, null, 2), 'utf8')
}

export async function captureLogsDevRealScreens(win: BrowserWindow, outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true })
  const startup = await captureInitialStartup(win)
  await win.webContents.executeJavaScript("window.location.hash = '#/logs-dev'")
  await waitFor(win, 'main[aria-label="Logs Dev"] .options-overview-grid', 'Visão geral')
  await waitForRendered(win, 'main[aria-label="Logs Dev"] .options-overview-grid', 'Visão geral')
  await waitForOverviewEvents(win)

  async function capture(name: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 250))
    const image = await win.webContents.capturePage()
    await writeFile(join(outputDirectory, `${name}.png`), image.toPNG())
  }

  await capture('01-overview')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Eventos e logs')
  await waitFor(win, 'section[aria-label="Eventos e logs"]', 'Eventos e logs')
  await waitForRendered(win, 'section[aria-label="Eventos e logs"]', 'Eventos e logs')
  await capture('02-events')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Desempenho')
  await waitFor(win, 'section[aria-label="Leituras de desempenho"]', 'Desempenho')
  await waitForRendered(win, 'section[aria-label="Leituras de desempenho"]', 'Desempenho')
  await clickText(win, 'section[aria-label="Leituras de desempenho"] button', 'Medir agora')
  await waitFor(win, 'section[aria-label="Métricas por processo"]', 'Métricas por processo')
  await waitForRendered(win, 'section[aria-label="Métricas por processo"]', 'Métricas por processo')
  await waitFor(win, 'section[aria-label="Estatísticas agregadas de IPC"]', 'Latências IPC')
  await capture('03-performance')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Armazenamento')
  await waitFor(win, 'section[aria-label="Armazenamento local"]', 'Armazenamento')
  await clickText(win, 'section[aria-label="Armazenamento local"] button', 'Medir armazenamento')
  await waitFor(win, '.options-storage-total', 'Resumo de armazenamento')
  await waitForRendered(win, 'section[aria-label="Armazenamento local"]', 'Armazenamento')
  await capture('04-storage')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Backups e recuperação')
  await waitFor(win, 'section[aria-label="Backups e recuperação"]', 'Backups e recuperação')
  await waitForRendered(win, 'section[aria-label="Backups e recuperação"]', 'Backups e recuperação')
  await capture('05-backups')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Ferramentas Dev')
  await waitFor(win, 'details.options-advanced summary', 'Ferramentas Dev')
  await win.webContents.executeJavaScript('document.querySelector("details.options-advanced summary")?.click()')
  await waitFor(win, 'section[aria-label="Migração de dados antigos"]', 'Migração legada')
  await waitForRendered(win, 'section[aria-label="Migração de dados antigos"]', 'Migração legada')
  await capture('06-tools')
  await captureRoutePerformance(win, outputDirectory, startup)
}
