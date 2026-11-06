const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')

const root = path.resolve(__dirname, '../..')
const width = 1920
const height = 1080
const markerSize = 24
const markerToken = 0x654321
const samples = 7
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))]
const inside = (parent, child) => {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function main() {
  if (!process.versions.electron) {
    const taskRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-v6-frame-transfer-'))
    try {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const child = spawn(require('electron'), [__filename, taskRoot], { cwd: root, env, stdio: 'inherit', windowsHide: true })
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
      if (typeof code !== 'number' || code !== 0) process.exitCode = typeof code === 'number' ? code : 1
    } finally {
      const tempRoot = await fs.realpath(os.tmpdir())
      const realTaskRoot = await fs.realpath(taskRoot)
      if (!inside(tempRoot, realTaskRoot) || path.dirname(realTaskRoot) !== tempRoot || !path.basename(realTaskRoot).startsWith('editor-v6-frame-transfer-')) throw Error('Recusa de limpeza: o perfil do microbenchmark saiu da pasta temporária própria.')
      await fs.rm(realTaskRoot, { recursive: true, force: false })
    }
    return
  }

  const { app, BrowserWindow, MessageChannelMain } = require('electron')
  const taskRoot = await fs.realpath(path.resolve(process.argv[2] ?? ''))
  const tempRoot = await fs.realpath(os.tmpdir())
  if (!inside(tempRoot, taskRoot) || path.dirname(taskRoot) !== tempRoot || !path.basename(taskRoot).startsWith('editor-v6-frame-transfer-')) throw Error('Perfil Electron inválido para o microbenchmark.')
  app.setPath('userData', path.join(taskRoot, 'profile'))
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  await app.whenReady()

  const window = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: width + markerSize,
    height,
    enableLargerThanScreen: true,
    frame: false,
    webPreferences: { preload: path.join(taskRoot, 'frame-transfer-preload.cjs'), backgroundThrottling: false, contextIsolation: true, sandbox: true, offscreen: true }
  })
  window.setContentSize(width + markerSize, height)
  const timeout = setTimeout(() => { console.error('Frame transfer: limite de 60s.'); app.exit(1) }, 60_000)
  let transferPort
  try {
    const htmlPath = path.join(taskRoot, 'frame-transfer.html')
    await fs.writeFile(path.join(taskRoot, 'frame-transfer-preload.cjs'), `const { ipcRenderer } = require('electron')
      const loaded = new Promise(resolve => { if (document.readyState === 'complete') resolve(); else window.addEventListener('load', resolve, { once:true }) })
      ipcRenderer.on('frame-transfer-port', async event => { await loaded; window.postMessage('frame-transfer-port', '*', event.ports) })
    `)
    await fs.writeFile(htmlPath, `<!doctype html><html><body style="margin:0;overflow:hidden;background:#000"><canvas id="scene" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px"></canvas><div id="token" style="position:absolute;left:${width}px;top:0;width:${markerSize}px;height:16px;pointer-events:none"></div><script>
      const canvas = document.getElementById('scene')
      const context = canvas.getContext('2d')
      const horizontal = context.createLinearGradient(0, 0, ${width}, 0)
      horizontal.addColorStop(0, '#0b59dd'); horizontal.addColorStop(.5, '#e3268b'); horizontal.addColorStop(1, '#39d852')
      context.fillStyle = horizontal; context.fillRect(0, 0, ${width}, ${height})
      const vertical = context.createLinearGradient(0, 0, 0, ${height})
      vertical.addColorStop(0, 'rgba(255,255,255,.37)'); vertical.addColorStop(1, 'rgba(0,0,0,.43)')
      context.fillStyle = vertical; context.fillRect(0, 0, ${width}, ${height})
      const marker = document.getElementById('token'), cells = []
      let framePort
      window.onmessage = event => {
        if (event.source !== window || event.data !== 'frame-transfer-port' || !event.ports[0]) return
        framePort = event.ports[0]
        framePort.onmessage = () => {}
        framePort.start()
        framePort.postMessage({ type:'ready' })
      }
      for (let bit=0; bit<24; bit++) { const cell=document.createElement('div'); cell.style.cssText='position:absolute;width:4px;height:4px;left:'+((bit%6)*4)+'px;top:'+((bit/6|0)*4)+'px'; cells.push(cell); marker.append(cell) }
      window.renderFrame = token => {
        if (!Number.isSafeInteger(token) || token < 1 || token > 0xffffff) throw Error('Token inválido')
        window.currentToken = token
        for (let bit=0; bit<24; bit++) cells[bit].style.backgroundColor = ((token>>>bit)&1) ? '#fff' : '#000'
        for (let bit=0; bit<24; bit++) { context.fillStyle=((token>>>bit)&1)?'#fff':'#000'; context.fillRect(${width}-6+(bit%6),${height}-4+((bit/6)|0),1,1) }
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }
      window.readDirectFrame = () => ({ width:${width}, height:${height}, token:window.currentToken, format:'rgba-unorm8-srgb', pixels:context.getImageData(0,0,${width},${height}).data })
      window.sendFrameOverPort = token => {
        if (!framePort || token !== window.currentToken) throw Error('Port ou token de quadro inválido')
        const started = performance.now(), pixels = context.getImageData(0,0,${width},${height}).data
        const readbackMs = performance.now() - started
        framePort.postMessage({ type:'frame', token, readbackMs, pixels })
        return { token, readbackMs }
      }
    </script></body></html>`)
    await window.loadFile(htmlPath)
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const channel = new MessageChannelMain()
    transferPort = channel.port1
    transferPort.start()
    const portReady = new Promise((resolve, reject) => {
      const readyTimeout = setTimeout(() => reject(Error('Timeout aguardando o canal de transporte')), 10_000)
      transferPort.on('message', (event) => {
        if (event.data?.type !== 'ready') return
        clearTimeout(readyTimeout)
        resolve()
      })
    })
    window.webContents.postMessage('frame-transfer-port', null, [channel.port2])
    await portReady

    const pixelBytes = width * height * 4
    const directMs = []
    const directConvertMs = []
    const portMs = []
    const portRendererReadbackMs = []
    const portConvertMs = []
    const captureMs = []
    const directHashes = []
    const portHashes = []
    const captureHashes = []
    const pixelDifferenceCounts = []
    let transferredType = ''
    let transferredBytes = 0

    const readCapturePageBgra = async (expectedToken) => {
      const image = await window.webContents.capturePage({ x: 0, y: 0, width: width + markerSize, height })
      const size = image.getSize()
      if (size.width !== width + markerSize || size.height !== height) throw Error(`Captura com dimensão inesperada: ${size.width}×${size.height}.`)
      const raw = image.toBitmap({ scaleFactor: 1 })
      if (raw.length !== size.width * size.height * 4) throw Error('NativeImage retornou stride ou formato não suportado.')
      for (let bit = 0; bit < 24; bit++) {
        const x = width + (bit % 6) * 4 + 2, y = Math.floor(bit / 6) * 4 + 2
        const offset = (y * size.width + x) * 4
        if ((raw[offset + 2] > 127) !== (((expectedToken >>> bit) & 1) === 1) || raw[offset + 3] < 254) throw Error(`Token de paint inválido no bit ${bit}.`)
      }
      const output = Buffer.allocUnsafe(pixelBytes), rowBytes = width * 4, stride = size.width * 4
      for (let row = 0; row < height; row++) raw.copy(output, row * rowBytes, row * stride, row * stride + rowBytes)
      return output
    }

    const readTransferredFrame = async (expectedToken) => {
      let resolvePacket, rejectPacket, timeoutId
      const received = new Promise((resolve, reject) => { resolvePacket = resolve; rejectPacket = reject })
      const onMessage = (event) => {
        if (event.data?.type !== 'frame' || event.data.token !== expectedToken) return
        clearTimeout(timeoutId)
        transferPort.removeListener('message', onMessage)
        resolvePacket(event.data)
      }
      transferPort.on('message', onMessage)
      timeoutId = setTimeout(() => { transferPort.removeListener('message', onMessage); rejectPacket(Error('Timeout aguardando quadro pelo MessagePort')) }, 10_000)
      const started = performance.now()
      try {
        const acknowledgement = await window.webContents.executeJavaScript(`window.sendFrameOverPort(${expectedToken})`)
        if (acknowledgement.token !== expectedToken) throw Error('O renderer confirmou outro token pelo MessagePort.')
        const packet = await received
        const elapsedMs = performance.now() - started
        const pixels = packet.pixels
        const rgba = ArrayBuffer.isView(pixels) ? new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength) : pixels instanceof ArrayBuffer ? new Uint8Array(pixels) : null
        if (packet.token !== expectedToken || !rgba || rgba.byteLength !== pixelBytes) throw Error('O MessagePort não entregou o buffer completo do quadro esperado.')
        return { rgba, elapsedMs, rendererReadbackMs: packet.readbackMs }
      } catch (error) {
        clearTimeout(timeoutId)
        transferPort.removeListener('message', onMessage)
        throw error
      }
    }

    const convertRgbaToBgra = (rgba) => {
      const bgra = Buffer.allocUnsafe(pixelBytes)
      const sourceWords = new Uint32Array(rgba.buffer, rgba.byteOffset, pixelBytes / 4)
      const targetWords = new Uint32Array(bgra.buffer, bgra.byteOffset, pixelBytes / 4)
      for (let index = 0; index < sourceWords.length; index++) {
        const value = sourceWords[index]
        targetWords[index] = (value & 0xff00ff00) | ((value & 0x00ff0000) >>> 16) | ((value & 0x000000ff) << 16)
      }
      return bgra
    }

    // Discard one warm-up of each API; measured iterations remain inside this single job.
    await window.webContents.executeJavaScript(`window.renderFrame(${markerToken})`)
    await window.webContents.executeJavaScript('window.readDirectFrame()')
    const portWarmup = await readTransferredFrame(markerToken)
    if (portWarmup.rgba.byteLength !== pixelBytes) throw Error('O aquecimento MessagePort retornou dimensão inválida.')
    await readCapturePageBgra(markerToken)
    for (let sample = 0; sample < samples; sample++) {
      const expectedToken = markerToken + sample + 1
      await window.webContents.executeJavaScript(`window.renderFrame(${expectedToken})`)
      const directStarted = performance.now()
      const directFrame = await window.webContents.executeJavaScript('window.readDirectFrame()')
      const transferTime = performance.now() - directStarted
      if (directFrame.width !== width || directFrame.height !== height || directFrame.token !== expectedToken || directFrame.format !== 'rgba-unorm8-srgb') throw Error('O readback direto perdeu dimensões, token ou espaço de cor declarado.')
      let rgba
      if (ArrayBuffer.isView(directFrame.pixels)) {
        transferredType = directFrame.pixels.constructor.name
        transferredBytes = directFrame.pixels.byteLength
        rgba = new Uint8Array(directFrame.pixels.buffer, directFrame.pixels.byteOffset, directFrame.pixels.byteLength)
      } else if (directFrame.pixels instanceof ArrayBuffer) {
        transferredType = 'ArrayBuffer'
        transferredBytes = directFrame.pixels.byteLength
        rgba = new Uint8Array(directFrame.pixels)
      } else throw Error(`Electron não transportou os pixels como TypedArray/ArrayBuffer (recebido: ${typeof directFrame.pixels}).`)
      if (rgba.byteLength !== pixelBytes) throw Error(`TypedArray de ${rgba.byteLength} bytes; esperados ${pixelBytes}.`)
      directMs.push(transferTime)

      const convertStarted = performance.now()
      const bgra = convertRgbaToBgra(rgba)
      directConvertMs.push(performance.now() - convertStarted)
      directHashes.push(createHash('sha256').update(bgra).digest('hex'))

      const transferred = await readTransferredFrame(expectedToken)
      portMs.push(transferred.elapsedMs)
      portRendererReadbackMs.push(transferred.rendererReadbackMs)
      const portConvertStarted = performance.now()
      const portBgra = convertRgbaToBgra(transferred.rgba)
      portConvertMs.push(performance.now() - portConvertStarted)
      portHashes.push(createHash('sha256').update(portBgra).digest('hex'))

      const captureStarted = performance.now()
      const captured = await readCapturePageBgra(expectedToken)
      captureMs.push(performance.now() - captureStarted)
      captureHashes.push(createHash('sha256').update(captured).digest('hex'))
      let differences = 0
      for (let index = 0; index < pixelBytes; index++) if (bgra[index] !== captured[index]) differences++
      pixelDifferenceCounts.push(differences)
    }

    const summary = {
      passed: directHashes.every((hash, index) => hash === captureHashes[index]) && portHashes.every((hash, index) => hash === captureHashes[index]) && pixelDifferenceCounts.every((count) => count === 0),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      width, height, bytesPerFrame: pixelBytes, format: 'BGRA for FFmpeg; direct source RGBA/unorm8/sRGB',
      samples, warmups: 1, tokenChecks: samples + 1, transferType: transferredType, transferredBytes,
      medianDirectReadbackAndTransferMs: percentile(directMs, .5), medianDirectRgbaToBgraMs: percentile(directConvertMs, .5),
      medianMessagePortReadbackAndTransferMs: percentile(portMs, .5), medianMessagePortRendererReadbackMs: percentile(portRendererReadbackMs, .5), medianMessagePortRgbaToBgraMs: percentile(portConvertMs, .5),
      medianCapturePageNativeImageAndCopyMs: percentile(captureMs, .5), pixelDifferenceCounts,
      directHashes, portHashes, captureHashes
    }
    if (!summary.passed) throw Error(`Readback direto não preservou os pixels: ${JSON.stringify(summary)}`)
    console.log(JSON.stringify(summary, null, 2))
    clearTimeout(timeout)
    transferPort.close()
    window.destroy()
    app.exit(0)
  } catch (error) {
    clearTimeout(timeout)
    console.error(error)
    transferPort?.close()
    window.destroy()
    app.exit(1)
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
