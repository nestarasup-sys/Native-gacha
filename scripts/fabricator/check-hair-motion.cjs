const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

async function main() {
  if (!process.versions.electron) {
    const { build } = require('esbuild')
    const { spawn } = require('node:child_process')
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-motion-check-'))
    const bundle = path.join(folder, 'fixture.js')
    await build({ entryPoints: [path.resolve(__dirname, '../../tests/hair-motion.browser.tsx')], outfile: bundle, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', target: 'chrome140', logLevel: 'warning' })
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), [__filename, bundle, folder], { stdio: 'inherit', windowsHide: true, env })
    process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
    return
  }
  const { app, BrowserWindow } = require('electron')
  const folder = process.argv[3]
  app.setPath('userData', path.join(folder, 'profile'))
  await app.whenReady()
  const window = new BrowserWindow({ width: 300, height: 300, useContentSize: true, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true } })
  try {
    const html = path.join(folder, 'index.html')
    await fs.writeFile(html, '<!doctype html><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:white}#root{height:100vh;display:flex}.hair-motion-mesh{position:absolute;left:-40%;top:-15%;width:180%;height:130%}.hair-motion-fallback{position:absolute;inset:0;width:100%;height:100%}</style><div id="root"></div>')
    await window.loadFile(html)
    await window.webContents.executeJavaScript(await fs.readFile(process.argv[2], 'utf8'))
    await window.webContents.executeJavaScript('window.runHairMotionFixture()')
    const captured = await window.webContents.capturePage()
    const size = captured.getSize(), pixels = captured.toBitmap()
    const pixel = (x, y) => { const at = (y * size.width + x) * 4; return { b: pixels[at], g: pixels[at + 1], r: pixels[at + 2] } }
    const upper = pixel(150, 115), lower = pixel(150, 185), outside = pixel(80, 150)
    if (!(upper.r > 200 && upper.b < 50 && lower.b > 200 && lower.r < 50 && outside.r > 240 && outside.g > 240 && outside.b > 240)) throw new Error(`Malha incorreta: ${JSON.stringify({ upper, lower, outside, size })}`)
    for (let y = 105; y < 195; y += 5) for (let x = 105; x < 195; x += 5) {
      const color = pixel(x, y)
      if (color.g > 80) throw new Error(`Falha transparente na malha em ${x},${y}: ${JSON.stringify(color)}`)
    }
    await window.webContents.executeJavaScript('window.startHairMotionFixture()')
    const moved = (await window.webContents.capturePage()).toBitmap()
    let changed = 0
    for (let y = 105; y < 195; y++) for (let x = 80; x < 235; x++) {
      const at = (y * size.width + x) * 4
      if (Math.abs(pixels[at] - moved[at]) + Math.abs(pixels[at + 1] - moved[at + 1]) + Math.abs(pixels[at + 2] - moved[at + 2]) > 60) changed++
    }
    if (changed < 100) throw new Error(`A malha não reagiu ao vento: ${changed} pixels alterados.`)
    for (let y = 108; y < 192; y += 3) {
      const opaque = []
      for (let x = 75; x < 240; x++) if (moved[(y * size.width + x) * 4 + 1] < 40) opaque.push(x)
      if (opaque.length < 20) throw new Error(`A malha deformada perdeu a linha ${y}.`)
      for (let x = opaque[0] + 3; x < opaque.at(-1) - 3; x++) if (moved[(y * size.width + x) * 4 + 1] > 80) throw new Error(`Fenda na malha deformada em ${x},${y}.`)
    }
    console.log(`Malha WebGL: orientação, transparência e continuidade verificadas; vento moveu ${changed} pixels.`)
    await window.webContents.executeJavaScript('window.runAlphaHairFixture()')
    const translucent = (await window.webContents.capturePage()).toBitmap()
    for (let y = 105; y < 195; y += 3) for (let x = 105; x < 195; x += 3) {
      const at = (y * size.width + x) * 4
      if (translucent[at + 2] < 250 || Math.abs(translucent[at + 1] - 127) > 5 || Math.abs(translucent[at] - 127) > 5) throw new Error(`Emenda na malha semitransparente em ${x},${y}: ${[...translucent.subarray(at, at + 4)]}`)
    }
    console.log('Malha semitransparente: bordas internas uniformes.')
    window.setContentSize(1200, 800)
    await window.webContents.executeJavaScript('window.runHairWorkspaceFixture()')
    const previewPath = path.join(folder, 'workspace.png')
    await fs.writeFile(previewPath, (await window.webContents.capturePage()).toPNG())
    console.log(`Área experimental: seleção e pausa verificadas. Prévia sintética: ${previewPath}`)
    window.destroy(); app.exit(0)
  } catch (error) { console.error(error); window.destroy(); app.exit(1) }
}
main().catch((error) => { console.error(error); process.exit(1) })
