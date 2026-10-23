const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const debugBase = 'http://127.0.0.1:9229'
const fixturePath = path.join(root, 'scripts', 'video-studio', 'windows-stress-fixture.js')
const mediaPaths = [
  path.join(root, 'app-data', 'stress-media', 'synthetic-moving-24fps-audio440hz.mp4'),
  path.join(root, 'app-data', 'stress-media', 'synthetic-moving-30fps-audio660hz.mp4'),
]

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const fixture = fs.readFileSync(fixturePath, 'utf8')
  for (const mediaPath of mediaPaths) {
    if (!fs.statSync(mediaPath).isFile()) throw new Error(`Mídia local ausente: ${mediaPath}`)
  }
  const response = await fetch(`${debugBase}/json/list`)
  if (!response.ok) throw new Error(`Electron oculto indisponível: HTTP ${response.status}`)
  const pages = await response.json()
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://localhost:5173/'))
  if (!page) throw new Error('A janela oculta do Native Gacha não expôs uma página renderer local.')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')
  const outRoot = path.join(root, 'app-data', 'stress-runs')
  fs.mkdirSync(outRoot, { recursive: true })
  const runDir = path.join(outRoot, `windows-${stamp}-${process.pid}`)
  fs.mkdirSync(runDir, { recursive: false })
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 0

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression, options = {}) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...options,
    })
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      throw new Error(detail)
    }
    return result.result?.value
  }

  await send('Runtime.enable')
  await send('Page.enable')
  const expression = `(async()=>{window.eval(${JSON.stringify(fixture)});return await window.__runNativeGachaStressFixture(${JSON.stringify(mediaPaths)})})()`
  const runPromise = evaluate(expression, { userGesture: true })
  let result
  try {
    while (true) {
      const raced = await Promise.race([
        runPromise.then((value) => ({ done: true, value }), (error) => ({ done: true, error })),
        delay(10000).then(() => ({ done: false })),
      ])
      if (raced.done) {
        if (raced.error) throw raced.error
        result = raced.value
        break
      }
      try {
        const progress = await evaluate('window.__nativeGachaStressProgress ?? null')
        console.log(JSON.stringify({ at: new Date().toISOString(), progress }))
      } catch (error) {
        console.log(JSON.stringify({ at: new Date().toISOString(), progressError: String(error) }))
      }
    }

    const contactSheet = await evaluate('window.__nativeGachaStressContactSheet ?? null')
    if (typeof contactSheet === 'string' && contactSheet.startsWith('data:image/png;base64,')) {
      fs.writeFileSync(path.join(runDir, 'characters-contact-sheet.png'), Buffer.from(contactSheet.slice(contactSheet.indexOf(',') + 1), 'base64'), { flag: 'wx' })
    }
    const report = {
      createdAt: new Date().toISOString(),
      offscreen: true,
      rendererUrl: page.url,
      result,
      artifacts: { runDirectory: runDir, contactSheet: fs.existsSync(path.join(runDir, 'characters-contact-sheet.png')) ? 'characters-contact-sheet.png' : null },
    }
    fs.writeFileSync(path.join(runDir, 'setup-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ success: true, runDirectory: runDir, result }, null, 2))
  } catch (error) {
    let progress = null
    try { progress = await evaluate('window.__nativeGachaStressProgress ?? null') } catch {}
    const failure = { createdAt: new Date().toISOString(), offscreen: true, rendererUrl: page.url, error: String(error?.stack ?? error), progress }
    fs.writeFileSync(path.join(runDir, 'setup-failure.json'), JSON.stringify(failure, null, 2), { flag: 'wx' })
    console.error(JSON.stringify({ success: false, runDirectory: runDir, failure }, null, 2))
    process.exitCode = 1
  } finally {
    ws.close()
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error)
  process.exitCode = 1
})
