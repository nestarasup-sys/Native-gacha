import { APPLICATION_ROUTES } from '../../../src/shared/applicationRoutes'
import type { IpcPerformanceDiagnosticsSnapshot } from '../../../src/shared/dataManagement'

/** Main application routes whose visible-shell transition can be measured safely. */
export const routePerformanceScenarios = [
  {
    id: 'customizer', route: APPLICATION_ROUTES.customizer, selector: '.home-layout',
    settledCondition: "!document.body.innerText.includes('Carregando personagens…')"
  },
  {
    id: 'fabricator', route: APPLICATION_ROUTES.fabricatorDev, selector: '.fabricator-section-list',
    settledCondition: 'document.querySelector("main.fabricator-layout")?.getAttribute("aria-busy") === "false"'
  },
  {
    id: 'studio', route: APPLICATION_ROUTES.studio, selector: 'main.studio-page[aria-label="Studio"]',
    settledCondition: "!document.body.innerText.includes('Carregando Studios…')"
  },
  {
    id: 'editor-v6', route: APPLICATION_ROUTES.editorV6, selector: 'main.studio-page[aria-label="Editor V6"]',
    settledCondition: "!document.body.innerText.includes('Carregando projetos…')"
  },
  {
    id: 'editor-v7', route: APPLICATION_ROUTES.editorV7, selector: 'main.editor-v7-page',
    settledCondition: '!document.body.innerText.includes("Carregando")'
  },
  {
    id: 'roteiros', route: APPLICATION_ROUTES.roteiro, selector: '.roteiros-sidebar-empty',
    settledCondition: "!document.body.innerText.includes('Carregando roteiros…') && !document.body.innerText.includes('Carregando seus roteiros…')"
  },
  {
    id: 'base-videos', route: APPLICATION_ROUTES.baseVideos, selector: '.base-videos-page',
    settledCondition: 'document.querySelector(".base-videos-page")?.getAttribute("aria-busy") === "false"'
  },
  {
    id: 'logs-dev', route: APPLICATION_ROUTES.logsDev, selector: 'main[aria-label="Logs Dev"] .options-overview-grid',
    settledCondition: "!document.body.innerText.includes('Carregando os registros locais')"
  }
] as const

export type RoutePerformanceSample = {
  round: number
  id: string
  route: string
  durationMs: number
  shellDurationMs: number
  rendererCpuPercent: number | null
  mainCpuPercent: number | null
  cpuSampleIntervalMs: number | null
  rendererWorkingSetKiB: number | null
  rendererPrivateKiB: number | null
  rendererJsHeapBytes: number | null
  longTaskSupported: boolean
  longTaskCount: number | null
  longTaskTotalMs: number | null
  longTaskMaxMs: number | null
  newResourceEntryCount: number
  newResourceEncodedBytes: number | null
  mainRssBytes: number
  mainHeapUsedBytes: number
}

export type RouteStartupPerformance = {
  initialRouteId: string
  initialRoute: string
  launchToFirstShellMs: number | null
  electronProcessUptimeMs: number
  rendererNavigation: {
    domInteractiveMs: number | null
    domContentLoadedMs: number | null
    loadEventEndMs: number | null
  }
  rendererPaint: {
    firstPaintMs: number | null
    firstContentfulPaintMs: number | null
  }
  rendererWorkingSetKiB: number | null
  rendererPrivateKiB: number | null
  rendererJsHeapBytes: number | null
  mainRssBytes: number
  mainHeapUsedBytes: number
  ipcPerformance: IpcPerformanceDiagnosticsSnapshot
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/** Summarizes visible-shell to data-ready timings while keeping samples intact. */
export function summarizeRoutePerformance(samples: readonly RoutePerformanceSample[]) {
  return routePerformanceScenarios.map((scenario) => {
    const durations = samples
      .filter((sample) => sample.id === scenario.id && Number.isFinite(sample.durationMs) && sample.durationMs >= 0)
      .map((sample) => sample.durationMs)
    return durations.length
      ? {
          id: scenario.id,
          route: scenario.route,
          sampleCount: durations.length,
          minMs: Math.min(...durations),
          medianMs: median(durations),
          maxMs: Math.max(...durations),
          medianShellMs: median(samples.filter((sample) => sample.id === scenario.id && Number.isFinite(sample.shellDurationMs)).map((sample) => sample.shellDurationMs)),
          medianLongTaskCount: medianNullable(samples.filter((sample) => sample.id === scenario.id).map((sample) => sample.longTaskCount)),
          maxLongTaskMs: maxNullable(samples.filter((sample) => sample.id === scenario.id).map((sample) => sample.longTaskMaxMs)),
          medianNewResourceEntryCount: medianNullable(samples.filter((sample) => sample.id === scenario.id).map((sample) => sample.newResourceEntryCount))
        }
      : { id: scenario.id, route: scenario.route, sampleCount: 0, minMs: null, medianMs: null, maxMs: null, medianShellMs: null, medianLongTaskCount: null, maxLongTaskMs: null, medianNewResourceEntryCount: null }
  })
}

function medianNullable(values: Array<number | null | undefined>): number | null {
  const available = values.filter((value): value is number => Number.isFinite(value) && value! >= 0)
  return available.length ? median(available) : null
}

function maxNullable(values: Array<number | null | undefined>): number | null {
  const available = values.filter((value): value is number => Number.isFinite(value) && value! >= 0)
  return available.length ? Math.max(...available) : null
}
