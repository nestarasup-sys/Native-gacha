const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json()
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://localhost:5173/'))
  if (!page) throw new Error('A sessão offscreen do Native Gacha não está disponível.')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let id = 0
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const nextId = ++id
    pending.set(nextId, { resolve, reject })
    ws.send(JSON.stringify({ id: nextId, method, params }))
  })
  const expression = `(${async () => {
    const desktop = window.desktop
    const character = (await desktop.listCustomizerCharacters()).find((entry) => entry.name === 'STRESS_Aurora')
    if (!character) throw new Error('STRESS_Aurora ainda não foi salvo no Customizador.')
    const summaries = await desktop.listFaceExpressionPresets(1)
    const summary = summaries.find((entry) => entry.name.toLocaleLowerCase('pt-BR') === 'normal' && (entry.collectionId ?? 'standard') === 'standard')
    if (!summary) throw new Error('Preset Normal não encontrado.')
    const preset = await desktop.loadFaceExpressionPreset(1, summary.id)
    const { prepareSavedCharacterRenderer } = await import('/src/characters/characterRenderer.ts')
    const { trimTransparentImage } = await import('/src/features/videoStudio/characterGeometry.ts')
    const { buildStudioExpressionAppearance, buildStudioExpressionTransforms } = await import('/src/characters/studioExpressionTransforms.ts')
    const renderer = await prepareSavedCharacterRenderer(character)
    const loadComponent = (assetId) => desktop.loadFaceComponentAsset(1, assetId)
    const loadCatalog = (assetId) => desktop.loadFaceCatalogItem(1, assetId)
    const appearance = await buildStudioExpressionAppearance(preset, character.customization.faceAppearance, loadCatalog)
    const right = await buildStudioExpressionTransforms(preset, appearance, {}, loadComponent, loadCatalog, 'right')
    const left = await buildStudioExpressionTransforms(preset, appearance, {}, loadComponent, loadCatalog, 'left')
    const changed = structuredClone(left)
    for (const side of ['left', 'right']) {
      const key = 'expression-component:pupil-' + side
      changed[key] = { ...changed[key], sourceTransformOverride: { ...changed[key].sourceTransformOverride, x: changed[key].sourceTransformOverride.x + (side === 'left' ? 24 : 0) } }
    }
    const outputs = []
    for (const transforms of [right, left, changed]) {
      const rendered = await renderer.render(appearance, transforms, preset.effects, 'idle')
      const crop = await trimTransparentImage(rendered.dataUrl)
      outputs.push({ dataUrl: crop?.dataUrl ?? rendered.dataUrl, width: rendered.width, height: rendered.height, cropWidth: crop?.width ?? rendered.width, cropHeight: crop?.height ?? rendered.height })
    }
    const px = (transform, side) => transform['expression-component:pupil-' + side]?.sourceTransformOverride ?? null
    return { characterId: character.id, presetId: preset.id, imagesEqual: { rightLeft: outputs[0].dataUrl === outputs[1].dataUrl, leftPlus24: outputs[1].dataUrl === outputs[2].dataUrl }, transforms: { rightLeft: px(right, 'left'), rightRight: px(right, 'right'), leftLeft: px(left, 'left'), leftRight: px(left, 'right'), manualLeft: px(changed, 'left'), manualRight: px(changed, 'right') }, images: outputs }
  }})()`
  try {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    const result = response.result.value
    const outRoot = path.join(process.cwd(), 'app-data', 'stress-runs')
    fs.mkdirSync(outRoot, { recursive: true })
    const runDir = path.join(outRoot, `pupil-diagnosis-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
    fs.mkdirSync(runDir)
    result.images.forEach((image, index) => fs.writeFileSync(path.join(runDir, `gaze-${['right', 'left', 'left-plus-24'][index]}.png`), Buffer.from(image.dataUrl.split(',')[1], 'base64'), { flag: 'wx' }))
    delete result.images
    result.runDirectory = runDir
    fs.writeFileSync(path.join(runDir, 'diagnosis.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    ws.close()
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error)
  process.exitCode = 1
})
