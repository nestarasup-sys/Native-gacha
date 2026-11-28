const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { join } = require('node:path')

const folder = process.argv[2]
app.setPath('userData', join(folder, 'profile'))
const timeout = setTimeout(() => app.exit(1), 20000)
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await window.loadFile(join(folder, 'index.html'))
  const run = source => window.webContents.executeJavaScript(source)
  await run(`(async () => {
    const wait = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await wait()
    const width = document.querySelector('input[aria-label="Largura Total"]')
    width.focus()
    width.select()
  })()`)
  const inputDriver = window.webContents.debugger
  inputDriver.attach()
  await inputDriver.sendCommand('Input.insertText', { text: '47' })
  assert.equal(await run(`document.querySelector('input[aria-label="Largura Total"]').value`), '47')
  const point = await run(`(() => {
    const apply = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Aplicar Largura Total a Todos os Vídeos')
    apply.scrollIntoView({ block: 'center' })
    const rect = apply.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })()`)
  await inputDriver.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', button: 'left', clickCount: 1 })
  await inputDriver.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', button: 'left', clickCount: 1 })
  inputDriver.detach()
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const afterClick = await run("JSON.parse(document.getElementById('timeline').textContent)")
  assert.equal(afterClick.tracks.length, 2, 'A aplicação deve preservar as faixas separadas')
  assert.equal(afterClick.tracks[1].blocks[1].mediaLayout.width, 47, 'O clipe futuro deve receber a largura antes de ser selecionado')
  await run(`(async () => {
    const select = [...document.querySelectorAll('button')].find(button => button.textContent === 'Selecionar destino')
    select.click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })()`)
  const result = await run(`({
    timeline: JSON.parse(document.getElementById('timeline').textContent),
    inspectorWidth: document.querySelector('input[aria-label="Largura Total"]').value,
    preview: document.querySelector('[data-editor-v6-video]')?.getAttribute('width')
  })`)
  assert.equal(result.timeline.tracks.length, 2, 'A aplicação deve preservar as faixas separadas')
  assert.equal(result.timeline.tracks[0].hidden, true)
  assert.equal(result.timeline.tracks[0].blocks[0].mediaLayout.width, 47, 'A largura deve chegar aos vídeos ocultos')
  const target = result.timeline.tracks[1].blocks[1]
  assert.deepEqual(target.mediaLayout, { x: 8, y: -5, width: 47, height: 65, rotation: 12 })
  assert.deepEqual([target.gain, target.audioEnabled, target.mediaInFrame, target.startFrame, target.durationFrames], [.4, false, 6, 60, 60])
  assert.equal(result.inspectorWidth, '47')
  assert.ok(Math.abs(Number(result.preview) - 47 * 19.2) < .001, 'A prévia deve usar a nova largura no futuro clipe')
  clearTimeout(timeout)
  window.destroy()
  console.log('Clique no Inspetor verificado: largura 47%, clipe oculto, parâmetros preservados e prévia atualizada.')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
