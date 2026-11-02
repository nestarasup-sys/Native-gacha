import test from 'node:test'
import assert from 'node:assert/strict'

test('global renderer diagnostics attach safe route and structured UI metadata', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const recorded = []
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { hash: '', pathname: '/logs-dev' },
      desktop: { dataManagement: { recordLocalDiagnosticEvent: (event) => { recorded.push(event); return Promise.resolve() } } }
    }
  })

  try {
    const { recordLocalRendererDiagnostic } = await import('../src/renderer/src/ui/diagnosticCapture.ts?structured-event-test')
    recordLocalRendererDiagnostic('renderer.uncaught-error', new Error('fixture failure'))
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].route, '/logs-dev')
    assert.equal(recorded[0].domain, 'ui')
    assert.equal(recorded[0].operation, 'renderer.diagnostic-capture')
    assert.equal(recorded[0].stage, 'global-handler')
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
