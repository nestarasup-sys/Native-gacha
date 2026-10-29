import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createMainWindowFactory } from '../../electron/application/mainWindow.ts'

class FakeWebContents extends EventEmitter {
  loading = false
  scripts = []

  isLoading() { return this.loading }
  executeJavaScript(source) { this.scripts.push(source); return Promise.resolve() }
}

class FakeWindow extends EventEmitter {
  webContents = new FakeWebContents()
  destroyed = false
  menuRemoved = false
  skippedTaskbar = false
  shownInactive = false
  position = null
  loadTarget = null
  closeCalls = 0

  removeMenu() { this.menuRemoved = true }
  setSkipTaskbar(value) { this.skippedTaskbar = value }
  setPosition(x, y) { this.position = [x, y] }
  showInactive() { this.shownInactive = true }
  isDestroyed() { return this.destroyed }
  loadURL(url) { this.loadTarget = { type: 'url', value: url }; return Promise.resolve() }
  loadFile(path) { this.loadTarget = { type: 'file', value: path }; return Promise.resolve() }

  requestClose() {
    let prevented = false
    this.emit('close', { preventDefault: () => { prevented = true } })
    if (!prevented) {
      this.destroyed = true
      this.emit('closed')
    }
    return prevented
  }

  close() {
    this.closeCalls += 1
    this.requestClose()
  }
}

function makeWindow(env = {}, overrides = {}) {
  const calls = { clearMenu: 0, navigation: 0, loaded: 0, closed: 0, flush: 0, failures: [] }
  let window
  const create = createMainWindowFactory({
    env,
    createWindow: (options) => { calls.options = options; window = new FakeWindow(); return window },
    clearApplicationMenu: () => { calls.clearMenu += 1 },
    iconPath: '/app/icon.ico',
    preloadPath: '/app/preload.cjs',
    rendererPath: '/app/index.html',
    restrictNavigation: (contents) => { calls.navigation += 1; calls.webContents = contents },
    onRendererLoaded: () => { calls.loaded += 1 },
    onClosed: () => { calls.closed += 1 },
    flushRendererWrites: () => { calls.flush += 1; return Promise.resolve() },
    onFlushFailure: (_window, reason) => calls.failures.push(reason),
    ...overrides
  })
  return { create, calls, get window() { return window } }
}

test('janela normal mantém isolamento, política de navegação e caminho de renderer', () => {
  const fixture = makeWindow({}, { rendererUrl: 'http://127.0.0.1:5188/' })
  const window = fixture.create()

  assert.equal(fixture.calls.clearMenu, 1)
  assert.equal(fixture.calls.navigation, 1)
  assert.equal(fixture.calls.webContents, window.webContents)
  assert.equal(window.menuRemoved, true)
  assert.equal(fixture.calls.options.show, true)
  assert.deepEqual(fixture.calls.options.webPreferences, {
    preload: '/app/preload.cjs', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true
  })
  assert.deepEqual(window.loadTarget, { type: 'url', value: 'http://127.0.0.1:5188/' })

  window.webContents.emit('did-finish-load')
  window.emit('closed')
  assert.equal(fixture.calls.loaded, 1)
  assert.equal(fixture.calls.closed, 1)
})

test('modo offscreen usa uma janela fora da tela sem mostrá-la na taskbar', () => {
  const fixture = makeWindow({ GACHA_VIDEO_STRESS_OFFSCREEN: '1' })
  const window = fixture.create()

  assert.equal(fixture.calls.options.show, false)
  assert.equal(fixture.calls.options.webPreferences.backgroundThrottling, false)
  assert.equal(window.skippedTaskbar, true)
  assert.deepEqual(window.loadTarget, { type: 'file', value: '/app/index.html' })

  window.emit('ready-to-show')
  assert.deepEqual(window.position, [-32000, -32000])
  assert.equal(window.shownInactive, true)
})

test('fechamento aguarda o flush, bloqueia fechamentos concorrentes e tenta novamente após erro', async () => {
  let finishFlush
  let failFlush = true
  const fixture = makeWindow({}, {
    flushRendererWrites: () => {
      fixture.calls.flush += 1
      if (failFlush) {
        failFlush = false
        return Promise.reject(new Error('falha sintética de flush'))
      }
      return new Promise((resolve) => { finishFlush = resolve })
    }
  })
  const window = fixture.create()

  assert.equal(window.requestClose(), true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(window.destroyed, false)
  assert.equal(fixture.calls.failures.length, 1)
  assert.match(fixture.calls.failures[0].message, /falha sintética/)

  assert.equal(window.requestClose(), true)
  assert.equal(window.requestClose(), true)
  assert.equal(fixture.calls.flush, 2, 'um flush em curso deve ser compartilhado pelas tentativas de fechar')
  finishFlush()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(window.closeCalls, 1)
  assert.equal(window.destroyed, true)
})

test('ambiente DEV AI também oculta a janela sem desativar o sandbox', () => {
  const fixture = makeWindow({ GACHA_DEV_AI_TEST: '1' })
  const window = fixture.create()
  assert.equal(fixture.calls.options.show, false)
  assert.equal(fixture.calls.options.webPreferences.sandbox, true)
  assert.equal(fixture.calls.options.webPreferences.backgroundThrottling, false)
  assert.equal(window.skippedTaskbar, false)
})
