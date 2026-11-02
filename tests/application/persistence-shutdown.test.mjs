import test from 'node:test'
import assert from 'node:assert/strict'
import { createPersistenceShutdownHandler } from '../../electron/application/persistenceShutdown.ts'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function createHarness({ getPendingOperations = () => [], drainIpc = () => Promise.resolve(), hasUsableWindow = true } = {}) {
  const calls = []
  let resolveQuit
  let resolveFailure
  const quitFinished = new Promise((resolve) => { resolveQuit = resolve })
  const failurePresented = new Promise((resolve) => { resolveFailure = resolve })
  const handler = createPersistenceShutdownHandler({
    flushRendererWrites: async () => calls.push('flush-renderer'),
    getPendingOperations: () => {
      calls.push('collect')
      return getPendingOperations()
    },
    drainIpc: () => { calls.push('drain-ipc'); return drainIpc() },
    cancelExports: () => calls.push('cancel'),
    resumeAfterFailedShutdown: () => calls.push('resume'),
    hasUsableWindow: () => hasUsableWindow,
    createWindow: () => calls.push('create-window'),
    showPersistenceFailure: () => {
      calls.push('show-error')
      resolveFailure()
    },
    closeDataPlatform: () => calls.push('close-data'),
    quit: () => {
      calls.push('quit')
      resolveQuit()
    }
  })

  return { calls, handler, quitFinished, failurePresented }
}

function createQuitEvent() {
  return { prevented: false, preventDefault() { this.prevented = true } }
}

test('aguarda a drenagem, ignora before-quit duplicado e permite a saída reentrante após sucesso', async () => {
  const operation = deferred()
  const ipcOperation = deferred()
  const harness = createHarness({ getPendingOperations: () => [operation.promise], drainIpc: () => ipcOperation.promise })
  const firstEvent = createQuitEvent()
  const concurrentEvent = createQuitEvent()

  harness.handler(firstEvent)
  harness.handler(concurrentEvent)
  assert.equal(firstEvent.prevented, true)
  assert.equal(concurrentEvent.prevented, true)
  assert.deepEqual(harness.calls, ['cancel', 'flush-renderer'])

  operation.resolve()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(harness.calls.includes('close-data'), false, 'o catálogo deve permanecer aberto enquanto um handler IPC ainda está em voo')
  ipcOperation.resolve()
  await harness.quitFinished
  assert.deepEqual(harness.calls, ['cancel', 'flush-renderer', 'collect', 'drain-ipc', 'close-data', 'quit'])

  const reentrantEvent = createQuitEvent()
  harness.handler(reentrantEvent)
  assert.equal(reentrantEvent.prevented, false)
  assert.equal(harness.calls.filter((call) => call === 'collect').length, 1)
})

test('uma falha preserva a sessão, reabre a janela ausente e permite nova tentativa', async () => {
  let attempt = 0
  const harness = createHarness({
    hasUsableWindow: false,
    getPendingOperations: () => attempt++ === 0
      ? [Promise.resolve().then(() => { throw new Error('falha sintética') })]
      : [Promise.resolve()]
  })

  const firstEvent = createQuitEvent()
  harness.handler(firstEvent)
  await harness.failurePresented
  assert.equal(firstEvent.prevented, true)
  assert.deepEqual(harness.calls, ['cancel', 'flush-renderer', 'collect', 'drain-ipc', 'resume', 'create-window', 'show-error'])

  const retryEvent = createQuitEvent()
  harness.handler(retryEvent)
  await harness.quitFinished
  assert.equal(retryEvent.prevented, true)
  assert.deepEqual(harness.calls, [
    'cancel', 'flush-renderer', 'collect', 'drain-ipc', 'resume', 'create-window', 'show-error',
    'cancel', 'flush-renderer', 'collect', 'drain-ipc', 'close-data', 'quit'
  ])
})

test('uma falha ao descarregar o renderer mantém o catálogo e a janela disponíveis', async () => {
  const calls = []
  const failurePresented = new Promise((resolve) => { calls.push(resolve) })
  const handler = createPersistenceShutdownHandler({
    flushRendererWrites: async () => { calls.push('flush-renderer'); throw new Error('falha sintética') },
    getPendingOperations: () => { calls.push('collect'); return [] },
    drainIpc: async () => calls.push('drain-ipc'),
    cancelExports: () => calls.push('cancel'),
    resumeAfterFailedShutdown: () => calls.push('resume'),
    hasUsableWindow: () => true,
    createWindow: () => calls.push('create-window'),
    showPersistenceFailure: () => { calls.push('show-error'); calls[0]() },
    closeDataPlatform: () => calls.push('close-data'),
    quit: () => calls.push('quit')
  })

  const event = createQuitEvent()
  handler(event)
  await failurePresented
  assert.equal(event.prevented, true)
  assert.deepEqual(calls.slice(1), ['cancel', 'flush-renderer', 'resume', 'show-error'])
})
