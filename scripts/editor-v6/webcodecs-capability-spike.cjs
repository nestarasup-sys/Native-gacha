const { app, BrowserWindow } = require('electron')
const { createServer } = require('node:http')

const configurations = [
  { label: 'hardware', codec: 'avc1.64001f', hardwareAcceleration: 'prefer-hardware' },
  { label: 'software', codec: 'avc1.64001f', hardwareAcceleration: 'prefer-software' }
]

async function main() {
  await app.whenReady()
  const server = createServer((_request, response) =>
    response.end('<!doctype html><meta charset="utf-8"><title>WebCodecs probe</title>')
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor local do spike não iniciou.')
  const window = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: true }
  })
  await window.loadURL(`http://127.0.0.1:${address.port}`)
  const result = await window.webContents.executeJavaScript(
    `(async () => {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return { available: false, secureContext: isSecureContext, userAgent: navigator.userAgent, reason: 'WebCodecs não está disponível neste contexto Chromium.' }
    const configs = ${JSON.stringify(configurations)}
    const results = []
    for (const candidate of configs) {
      const config = { codec: candidate.codec, width: 320, height: 180, framerate: 30, bitrate: 1000000, bitrateMode: 'constant', hardwareAcceleration: candidate.hardwareAcceleration, latencyMode: 'realtime' }
      try {
        const support = await VideoEncoder.isConfigSupported(config)
        if (!support.supported) { results.push({ label: candidate.label, supported: false }); continue }
        let chunks = 0, bytes = 0, timestamps = [], failure = null
        const encoder = new VideoEncoder({ output: (chunk) => { chunks++; bytes += chunk.byteLength; if (timestamps.length < 3) timestamps.push({ timestamp: chunk.timestamp, type: chunk.type }) }, error: (error) => { failure = String(error) } })
        encoder.configure(support.config)
        const canvas = new OffscreenCanvas(320, 180), context = canvas.getContext('2d')
        for (let index = 0; index < 60; index++) {
          context.fillStyle = index % 2 ? '#f0c' : '#28a'
          context.fillRect(0, 0, 320, 180)
          context.fillStyle = '#fff'
          context.fillRect(index * 4, 20, 24, 24)
          const frame = new VideoFrame(canvas, { timestamp: Math.round(index * 1e6 / 30), duration: Math.round(1e6 / 30) })
          encoder.encode(frame, { keyFrame: index % 30 === 0 })
          frame.close()
          if (encoder.encodeQueueSize > 8) await new Promise((resolve) => { encoder.addEventListener('dequeue', resolve, { once: true }) })
        }
        await encoder.flush()
        encoder.close()
        results.push({ label: candidate.label, supported: true, encodedFrames: 60, chunks, bytes, timestamps, failure })
      } catch (error) { results.push({ label: candidate.label, supported: false, error: String(error) }) }
    }
    return { available: true, userAgent: navigator.userAgent, results }
  })()`,
    true
  )
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  await window.destroy()
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  app.quit()
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
