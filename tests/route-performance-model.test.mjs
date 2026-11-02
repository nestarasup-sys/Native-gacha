import test from 'node:test'
import assert from 'node:assert/strict'
import { APPLICATION_ROUTES } from '../src/shared/applicationRoutes.ts'
import { routePerformanceScenarios, summarizeRoutePerformance } from '../electron/domains/storage/routePerformanceModel.ts'

test('a captura de latência cobre todas as rotas canônicas principais sem duplicar compatibilidade', () => {
  assert.deepEqual(routePerformanceScenarios.map(({ route }) => route), [
    APPLICATION_ROUTES.customizer,
    APPLICATION_ROUTES.fabricatorDev,
    APPLICATION_ROUTES.studio,
    APPLICATION_ROUTES.editorV6,
    APPLICATION_ROUTES.roteiro,
    APPLICATION_ROUTES.baseVideos,
    APPLICATION_ROUTES.logsDev
  ])
  assert.equal(new Set(routePerformanceScenarios.map(({ id }) => id)).size, routePerformanceScenarios.length)
  assert.ok(routePerformanceScenarios.every(({ settledCondition }) => settledCondition))
  assert.ok(routePerformanceScenarios.every(({ settleExpression }) => settleExpression === undefined))
})

test('resume min, mediana e max por rota sem esconder amostras individuais', () => {
  const samples = [
    { id: 'customizer', durationMs: 40, shellDurationMs: 30 },
    { id: 'customizer', durationMs: 10, shellDurationMs: 5 },
    { id: 'customizer', durationMs: 20, shellDurationMs: 10 },
    { id: 'studio', durationMs: 30, shellDurationMs: 15 },
    { id: 'studio', durationMs: 10, shellDurationMs: 5 },
    { id: 'studio', durationMs: 20, shellDurationMs: 10 },
    { id: 'editor-v6', durationMs: 8, shellDurationMs: 4 }
  ]
  const summary = summarizeRoutePerformance(samples)

  assert.deepEqual(summary[0], {
    id: 'customizer', route: APPLICATION_ROUTES.customizer,
    sampleCount: 3, minMs: 10, medianMs: 20, maxMs: 40, medianShellMs: 10
  })
  assert.equal(summary.find((item) => item.id === 'studio')?.medianMs, 20)
  assert.deepEqual(summary.find((item) => item.id === 'base-videos'), {
    id: 'base-videos', route: APPLICATION_ROUTES.baseVideos,
    sampleCount: 0, minMs: null, medianMs: null, maxMs: null, medianShellMs: null
  })
})
