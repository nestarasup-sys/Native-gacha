const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs/promises')
const folder = process.argv[2], html = process.argv[3]
app.setPath('userData', path.join(folder, 'profile'))
const watchdog = setTimeout(() => { console.error('Bootstrap timeout'); app.exit(1) }, 30000)
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(folder, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const resources = []
  window.webContents.session.webRequest.onCompleted(details => resources.push(details.url))
  await window.loadFile(html, { hash: '/editor-v6-transition-baker' })
  const deadline = Date.now() + 15000
  let started = false
  while (Date.now() < deadline) {
    started = await window.webContents.executeJavaScript('window.bootstrapProbe.read()')
    if (started) break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal(started, true, 'worker must request its payload')
  const state = await window.webContents.executeJavaScript(`({ rootChildren: document.getElementById('root').childElementCount, styles: document.styleSheets.length, flush: typeof window.__flushPendingRendererWrites })`)
  assert.equal(state.rootChildren, 0)
  assert.equal(state.styles, 0)
  assert.equal(state.flush, 'function')
  assert.equal(resources.some(url => /mountApp|\.css(?:$|\?)/.test(url)), false, 'worker must not load UI shell or styles')
  const result = { passed: true, mode: 'production-transition-baker', ...state, resources: resources.map(url => path.basename(new URL(url).pathname)) }
  await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2))
  clearTimeout(watchdog)
  window.destroy()
  app.exit(0)
}).catch(error => { console.error(error); clearTimeout(watchdog); app.exit(1) })
