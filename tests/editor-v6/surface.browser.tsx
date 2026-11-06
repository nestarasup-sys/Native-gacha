import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { EditorV6ExportPanel } from '../../src/renderer/src/features/editorV6/EditorV6ExportPanel'
import { createCanvas2dFrameSurface } from '../../src/renderer/src/features/editorV6/adapters/canvas2dFrameSurface'
import { captureEditorV6Frame, captureEditorV6Frames } from '../../src/renderer/src/features/editorV6/sceneCapture'
import { createEditorV6Timeline, type EditorV6DesktopApi, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { FIRST_HAIR_MOTION_PRESET, HAIR_MOTION_PRESET_KEY } from '../../src/shared/hairMotionEngine'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import type { EditorV6ExportStatus } from '../../src/shared/editorV6Export'
import { addEditorV6ElementAtFrame, editEditorV6BackgroundAtFrame, editEditorV6DocumentAtBlock, prepareEditorV6PositionAtFrame, resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6Timeline'

const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
function colorPng(color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 2
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 2, 2)
  return canvas.toDataURL('image/png')
}
function patternPng(width: number, height: number, colors: readonly string[]) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const columns = colors.length
  colors.forEach((color, index) => {
    context.fillStyle = color
    context.fillRect(Math.floor(index * width / columns), 0, Math.ceil(width / columns), height)
  })
  return canvas.toDataURL('image/png')
}
async function pixels(source: string) {
  const image = new Image()
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = source })
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0, 960, 540)
  return context.getImageData(0, 0, 960, 540).data
}
function pixel(data: Uint8ClampedArray, x: number, y: number) { return Array.from(data.slice((y * 960 + x) * 4, (y * 960 + x) * 4 + 4)).join(',') }
let expectedCapture = ''
let panelProject: EditorV6Document
let closePanelTest: () => void
;(globalThis as unknown as { checkExportPanel: () => Promise<unknown> }).checkExportPanel = async () => {
  let linked = 0, started = 0, prepared = 0, startedWithoutHair = false
  localStorage.setItem(HAIR_MOTION_PRESET_KEY, JSON.stringify([FIRST_HAIR_MOTION_PRESET, FIRST_HAIR_MOTION_PRESET, null, null, null]))
  const clip = { id: crypto.randomUUID(), name: 'Trilha de teste.wav', fileName: `${crypto.randomUUID()}.wav`, sourceFrames: 120, sourceInFrame: 0, startFrame: 0, durationFrames: 120, gain: 1, muted: false }
  const job: EditorV6ExportStatus = { id: crypto.randomUUID(), state: 'completed', frames: 300, totalFrames: 300, message: 'MP4 exportado e validado.', fallback: false }
  const libraryAudio = { id: crypto.randomUUID(), category: 'audio' as const, name: 'Trilha compartilhada.wav', mimeType: 'audio/wav', extension: 'wav', size: 20000, createdAt: '2026-01-01T00:00:00.000Z', available: true, references: [] }
  const editorV6: Pick<EditorV6DesktopApi, 'getEditorV6ExportStatus' | 'getEditorV6ExportFolder' | 'chooseEditorV6ExportFolder' | 'clearEditorV6ExportFolder' | 'linkEditorV6LibraryExportAudio' | 'startEditorV6Export'> = {
    getEditorV6ExportFolder: async () => null,
    chooseEditorV6ExportFolder: async () => 'C:/exportacoes',
    clearEditorV6ExportFolder: async () => {},
    getEditorV6ExportStatus: async (id: string) => { if (id === 'latest') throw Error('Nenhuma exportação anterior.'); return job },
    linkEditorV6LibraryExportAudio: async (_projectId, audioId) => { assert(audioId === libraryAudio.id, 'O exportador vinculou um áudio com ID diferente.'); linked++; return { ...clip, id: audioId, name: libraryAudio.name } },
    startEditorV6Export: async (project: EditorV6Document, options: { turbo: boolean; width: number; height: number; encoder: string; forceTurbo1080?: boolean; hairPosteriorOnly?: boolean; hairPoseReactionOnly?: boolean; hairAnimationPresetSlot?: number }) => {
      assert(project.exportAudio?.length === 1 && options.turbo && options.width === 1920 && options.height === 1080 && options.encoder === 'cpu' && options.forceTurbo1080, 'Painel perdeu trilha de áudio ou configurações do Turbo.')
      if (options.hairAnimationPresetSlot === undefined) {
        assert(options.hairPosteriorOnly === false && options.hairPoseReactionOnly === false, 'Exportação sem cabelo manteve opções de animação incompatíveis.')
        startedWithoutHair = true
      } else assert(options.hairPosteriorOnly && options.hairPoseReactionOnly && options.hairAnimationPresetSlot === 2, 'Exportação padrão perdeu as opções de animação do cabelo.')
      started++
      return job
    }
  }
  Object.defineProperty(window, 'desktop', { configurable: true, value: { editorV6, editorV6MediaLibrary: { list: async (category: 'object' | 'audio') => { assert(category === 'audio', 'O exportador pediu a categoria errada da biblioteca.'); return [libraryAudio] }, import: async () => null } } })
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  const findButton = (text: string) => {
    const button = Array.from(mount.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
    assert(button, `Painel de exportação não mostrou o botão: ${text}. Conteúdo: ${mount.textContent?.slice(-900)}`)
    return button
  }
  function Demo() {
    const [project, setProject] = useState(panelProject)
    return <EditorV6ExportPanel project={project} open onClose={() => {}} onChange={setProject} trackOperation={async (operation) => operation()} prepareHair={async (_project, slot, preset) => { assert(slot === 2 && preset.enabled.front && !preset.enabled.back && !preset.enabled.fringe, 'Preset padrão não isolou o cabelo posterior.'); prepared++; return {} as EditorV6HairMotionBundle }} />
  }
  flushSync(() => root.render(<Demo />))
  await new Promise((resolve) => requestAnimationFrame(resolve))
  assert(document.activeElement?.getAttribute('role') === 'dialog', 'Exportador não recebeu o foco.')
  findButton('Escolher pasta fixa').click()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  assert(mount.textContent?.includes('C:/exportacoes') && mount.textContent?.includes('Mudar pasta fixa'), 'Painel não mostrou a pasta escolhida.')
  findButton('Selecionar da biblioteca').click()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  findButton(libraryAudio.name).click()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  assert(linked === 1 && mount.textContent?.includes(libraryAudio.name), 'A seleção da biblioteca não vinculou o áudio ao projeto.')
  findButton('EXPORTAR SEM ANIMAÇÃO DE CABELO').click()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  assert(startedWithoutHair && prepared === 0 && started === 1, 'A opção sem cabelo preparou animação ou não iniciou a exportação.')
  findButton('COM ANIMAÇÃO DE CABELO').click()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  assert(prepared === 1 && started === 2 && mount.textContent?.includes('MP4 exportado e validado.'), 'Exportação padrão não preservou a animação ou não mostrou o resultado.')
  closePanelTest = () => { root.unmount(); mount.remove() }
  return { passed: true, linkedLibraryAudio: linked, startedExports: started, startedWithoutHair }
}
;(globalThis as unknown as { closeExportPanelCheck: () => void }).closeExportPanelCheck = () => closePanelTest()
;(globalThis as unknown as { compareNativeSurface: (image: string) => Promise<unknown> }).compareNativeSurface = async (image) => {
  const actual = await pixels(image), expected = await pixels(expectedCapture)
  const textRegions = Array.from(document.querySelectorAll('#surface-test text')).map((node) => node.getBoundingClientRect())
  let difference = 0, maximum = 0, sum = 0, outsideText = 0
  for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) {
    difference++
    const delta = Math.abs(actual[index] - expected[index])
    maximum = Math.max(maximum, delta)
    sum += delta
    const pixelIndex = Math.floor(index / 4), x = pixelIndex % 960, y = Math.floor(pixelIndex / 960)
    if (!textRegions.some((rect) => x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2)) outsideText++
  }
  // Native Windows text can use LCD antialiasing; SVG image rasterization uses grayscale.
  // Geometry and images must match exactly, and text differences must stay small and local.
  const meanChannelError = sum / actual.length
  assert(outsideText === 0 && difference / actual.length < .01 && maximum <= 100 && meanChannelError < .25, `Prévia e captura divergiram além da suavização do texto: ${JSON.stringify({ difference, maximum, outsideText, meanChannelError })}`)
  return { differentTextChannels: difference, outsideText, meanChannelError }
}

;(globalThis as unknown as { runSurfaceCheck: () => Promise<unknown> }).runSurfaceCheck = async () => {
  const imageId = crypto.randomUUID()
  const mouthAssetId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId: imageId, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
  let project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'SceneSurface check', color: '#d7b5cd', createdAt: '2026-10-25T12:00:00.000Z', updatedAt: '2026-10-25T12:00:00.000Z', backgroundColor: '#0000ff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: imageId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: colorPng('#ff0000') }, { id: mouthAssetId, category: 'character', name: 'Boca de Alice', mimeType: 'image/png', dataUrl: colorPng('#ff00ff') }], timeline: createEditorV6Timeline([actor]) }
  const prepared = prepareEditorV6PositionAtFrame(project, actor.id, 90)!
  project = editEditorV6DocumentAtBlock(prepared.document, prepared.blockId, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, x: 25 })), assets: working.assets.map((asset) => asset.id === imageId ? { ...asset, dataUrl: colorPng('#00ff00') } : asset) }))
  const speech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', text: 'Olá, esta fala aparece no quadro escolhido.\nTexto igual na prévia e na captura.', x: 0, y: -30, width: 38, height: 18, rotation: 0, zIndex: 2 }
  project = addEditorV6ElementAtFrame(project, speech, 60)
  project = editEditorV6BackgroundAtFrame(project, 150, { backgroundColor: '#ffffff' })
  panelProject = project
  const mount = document.getElementById('surface-test')!
  const root = createRoot(mount)
  flushSync(() => root.render(<SceneSurface scene={resolveEditorV6SceneAtFrame(project, 120)} assets={project.assets} />))
  const svg = mount.querySelector('svg')!
  assert(svg.getAttribute('data-frame') === '120', 'Prévia não avançou para o quadro 120.')
  const serialized = svg.cloneNode(true) as SVGElement
  serialized.setAttribute('width', '960')
  serialized.setAttribute('height', '540')
  const liveSource = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(serialized)], { type: 'image/svg+xml' }))
  const livePixels = await pixels(liveSource)
  URL.revokeObjectURL(liveSource)
  const capture = await captureEditorV6Frame(project, 120, 960, 540)
  expectedCapture = capture
  const capturedPixels = await pixels(capture)
  let different = 0
  for (let index = 0; index < livePixels.length; index++) if (livePixels[index] !== capturedPixels[index]) different++
  assert(different === 0, `Prévia e captura divergiram em ${different} canais de pixel.`)
  assert(pixel(capturedPixels, 720, 270) === '0,255,0,255', 'Estado do personagem não corresponde ao quadro 120.')
  const earlier = await pixels(await captureEditorV6Frame(project, 30, 960, 540))
  // Character position is shared by all periods; image state still changes at frame 90.
  assert(pixel(earlier, 720, 270) === '255,0,0,255', 'O quadro anterior perdeu a imagem original na posição compartilhada.')
  assert(pixel(earlier, 480, 270) === '0,0,255,255', 'O quadro anterior manteve uma posição antiga do personagem.')
  assert(pixel(earlier, 10, 10) === '0,0,255,255', 'O fundo inicial mudou retroativamente.')
  const later = await pixels(await captureEditorV6Frame(project, 200, 960, 540))
  assert(pixel(later, 10, 10) === '255,255,255,255', 'O fundo não mudou no instante escolhido.')
  const mouthPatch = { assetId: mouthAssetId, sprite: { x: 0, y: 0, width: 2, height: 2, atlasWidth: 2, atlasHeight: 2 }, x: .7, y: .7, width: .2, height: .12, replace: true, replaceBounds: { x: 0, y: 0, width: 1, height: 1 } }
  const sequential = []
  for await (const result of captureEditorV6Frames(project, { startFrame: 88, endFrame: 92, width: 480, height: 270 })) sequential.push(result)
  assert(sequential.map(({ frame }) => frame).join(',') === '88,89,90,91', 'Captura sequencial pulou quadros.')
  assert(sequential[0].dataUrl === sequential[1].dataUrl && sequential[2].dataUrl === sequential[3].dataUrl, 'Cena estática não reutilizou a imagem preparada.')
  assert(sequential[1].dataUrl !== sequential[2].dataUrl, 'A captura ignorou a mudança de estado no quadro 90.')
  const controller = new AbortController()
  controller.abort()
  let aborted = false
  try { for await (const _result of captureEditorV6Frames(project, { signal: controller.signal })) { void _result } } catch { aborted = true }
  assert(aborted, 'Cancelamento da captura não foi respeitado.')
  const area = document.createElement('section'), canvas = document.createElement('div')
  area.className = 'studio-scene-area v6-scene-area'
  area.style.cssText = 'position:absolute;left:0;top:600px;width:960px;height:400px'
  canvas.className = 'studio-scene-canvas v6-scene-canvas'
  area.append(canvas)
  document.body.append(area)
  const aspectChecks = []
  for (const [width, height] of [[960, 400], [640, 500]]) {
    area.style.width = `${width}px`
    area.style.height = `${height}px`
    const rect = canvas.getBoundingClientRect()
    assert(rect.width > 0 && rect.height > 0 && Math.abs(rect.width / rect.height - 16 / 9) < .01, 'Prévia perdeu a proporção 16:9 ao redimensionar.')
    assert(rect.width <= width && rect.height <= height, 'Prévia ultrapassou o painel disponível.')
    aspectChecks.push({ width: rect.width, height: rect.height })
  }
  area.remove()
  const foreignObjectScene = resolveEditorV6SceneAtFrame(project, 120)
  const hairOnlyScene = { ...foreignObjectScene, elements: foreignObjectScene.elements.filter((element) => element.id === actor.id).map((element) => ({ ...element, mouthPatch, flipX: true, rotation: 11 })) }
  const hairCanvas = document.createElement('canvas')
  hairCanvas.width = hairCanvas.height = 32
  const hairContext = hairCanvas.getContext('2d')!
  hairContext.fillStyle = 'rgb(17, 221, 103)'
  hairContext.beginPath()
  hairContext.ellipse(12, 16, 13, 14, 0, 0, Math.PI * 2)
  hairContext.fill()
  ;(globalThis as unknown as { compareCanvasStaticScene: (reference: string) => Promise<unknown> }).compareCanvasStaticScene = async (reference) => {
    const mountCanvas = document.createElement('div')
    Object.assign(mountCanvas.style, { position: 'fixed', left: '-2000px', top: '0', width: '960px', height: '540px' })
    document.body.append(mountCanvas)
    const textRegions = Array.from(mount.querySelectorAll('#surface-test text')).map((node) => node.getBoundingClientRect())
    const surface = createCanvas2dFrameSurface(mountCanvas, 960, 540)
    try {
      await surface.present({ scene: resolveEditorV6SceneAtFrame(project, 120), assets: project.assets, width: 960, height: 540, renderLayer: 'all', rasterCanvases: new Map(), paintToken: 1 })
      const expected = await pixels(reference)
      const actual = await pixels(surface.canvas.toDataURL('image/png'))
      let differentChannels = 0, outsideText = 0, maximumChannelError = 0, errorSum = 0, worstIndex = 0
      for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) {
        differentChannels++
        const error = Math.abs(actual[index] - expected[index])
        if (error > maximumChannelError) { maximumChannelError = error; worstIndex = index }
        errorSum += error
        const pixelIndex = Math.floor(index / 4), x = pixelIndex % 960, y = Math.floor(pixelIndex / 960)
        if (!textRegions.some((rect) => x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2)) outsideText++
      }
      const meanChannelError = errorSum / actual.length
      const worstPixelIndex = Math.floor(worstIndex / 4)
      const worstPixel = { x: worstPixelIndex % 960, y: Math.floor(worstPixelIndex / 960), channel: worstIndex % 4, expected: expected[worstIndex], actual: actual[worstIndex] }
      assert(outsideText === 0 && differentChannels / actual.length < .01 && maximumChannelError <= 101 && meanChannelError < .25,
        `Canvas2D divergiu da cena SVG além da tolerância de texto: ${JSON.stringify({ differentChannels, outsideText, maximumChannelError, meanChannelError, worstPixel })}`)
      return { passed: true, differentChannels, outsideText, maximumChannelError, meanChannelError, worstPixel }
    } finally { surface.dispose(); mountCanvas.remove() }
  }
  ;(globalThis as unknown as { compareCanvasExpandedGolden: () => Promise<unknown> }).compareCanvasExpandedGolden = async () => {
    const atlasId = crypto.randomUUID(), landscapeId = crypto.randomUUID(), backgroundId = crypto.randomUUID()
    const atlas = { id: atlasId, category: 'character' as const, name: 'Atlas facial', mimeType: 'image/png', dataUrl: patternPng(12, 8, ['#ef3340', '#3478f6', '#39aa72']) }
    const landscape = { id: landscapeId, category: 'object' as const, name: 'Objeto paisagem', mimeType: 'image/png', dataUrl: patternPng(8, 2, ['#ff6b00', '#ffd400', '#18a2b8', '#5b45cc']) }
    const backgroundAsset = { id: backgroundId, category: 'background' as const, name: 'Fundo panorâmico', mimeType: 'image/png', dataUrl: patternPng(6, 2, ['#e33a3a', '#2abf68', '#315be5']) }
    const unusedAsset = { id: crypto.randomUUID(), category: 'object' as const, name: 'Asset não usado', mimeType: 'image/png' as const, dataUrl: 'not-an-image-url' }
    const sprite: EditorV6Element = {
      ...actor, id: crypto.randomUUID(), x: -33, y: -4, width: 24, height: 46, rotation: 8, flipX: true,
      assetId: atlasId, motionSprite: { x: 2, y: 1, width: 5, height: 6, atlasWidth: 12, atlasHeight: 8 }
    }
    const image: EditorV6Element = {
      ...actor, id: crypto.randomUUID(), kind: 'image', characterId: undefined, x: 31, y: -1, width: 17, height: 42,
      rotation: -6, assetId: landscapeId, motionSprite: undefined
    }
    const narrator: EditorV6Element = {
      ...actor, id: crypto.randomUUID(), kind: 'narrator', characterId: undefined, assetId: undefined,
      text: 'Narrador: uma linha para conferir o alinhamento e a quebra do texto.', speakerName: 'Cena',
      x: 0, y: 32, width: 56, height: 16, rotation: 2, motionSprite: undefined
    }
    const speech: EditorV6Element = {
      ...actor, id: crypto.randomUUID(), kind: 'speech', characterId: undefined, assetId: undefined,
      text: 'Balão de fala com nome e quebra em mais de uma linha.', speakerName: 'Personagem',
      x: -8, y: -32, width: 49, height: 23, rotation: -3, balloonScalePercent: 110, balloonOffsetY: 1, speakerColor: '#405477', motionSprite: undefined
    }
    const thought: EditorV6Element = {
      ...actor, id: crypto.randomUUID(), kind: 'thought', characterId: undefined, assetId: undefined,
      text: 'Pensamento com contorno desenhado e texto limitado.', speakerName: 'Ideia',
      x: 30, y: 20, width: 30, height: 20, rotation: 4, balloonScalePercent: 105, balloonOffsetY: -1, speakerColor: '#73504a', motionSprite: undefined
    }
    const elements = [sprite, narrator, image, speech, thought]
    const goldenProject: EditorV6Document = {
      ...project, id: crypto.randomUUID(), title: 'Golden sintético expandido', backgroundColor: '#e8e0fa',
      backgroundAssetId: backgroundId, backgroundX: -25, backgroundY: -9, backgroundWidth: 45, backgroundHeight: 55, backgroundRotation: 0,
      elements, assets: [atlas, landscape, backgroundAsset, unusedAsset], timeline: createEditorV6Timeline(elements)
    }
    const goldenScene = resolveEditorV6SceneAtFrame(goldenProject, 1)
    const expected = await pixels(await captureEditorV6Frame(goldenProject, 1, 960, 540))
    const actualRoot = document.createElement('div')
    Object.assign(actualRoot.style, { position: 'fixed', left: '-2000px', top: '0', width: '960px', height: '540px' })
    document.body.append(actualRoot)
    const surface = createCanvas2dFrameSurface(actualRoot, 960, 540)
    try {
      await surface.present({ scene: goldenScene, assets: goldenProject.assets, width: 960, height: 540, renderLayer: 'all', rasterCanvases: new Map(), paintToken: 1 })
      const actual = await pixels(surface.canvas.toDataURL('image/png'))
      let differentChannels = 0, errorSum = 0, maximumChannelError = 0
      for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) {
        differentChannels++
        errorSum += Math.abs(actual[index] - expected[index])
        maximumChannelError = Math.max(maximumChannelError, Math.abs(actual[index] - expected[index]))
      }
      const meanChannelError = errorSum / actual.length
      const regions = [
        { name: 'sprite', left: 100, top: 90, right: 440, bottom: 365 },
        { name: 'narrator', left: 170, top: 350, right: 790, bottom: 530 },
        { name: 'landscape-image', left: 660, top: 115, right: 900, bottom: 410 },
        { name: 'speech', left: 120, top: 0, right: 700, bottom: 240 },
        { name: 'thought', left: 590, top: 280, right: 950, bottom: 500 },
        { name: 'background', left: 0, top: 0, right: 960, bottom: 540 }
      ].map(({ name, left, top, right, bottom }) => {
        let channels = 0, error = 0, max = 0
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) for (let channel = 0; channel < 4; channel++) {
          const index = (y * 960 + x) * 4 + channel
          if (actual[index] !== expected[index]) { channels++; const delta = Math.abs(actual[index] - expected[index]); error += delta; max = Math.max(max, delta) }
        }
        return { name, channels, meanError: error / ((right - left) * (bottom - top) * 4), maximumChannelError: max }
      })
      const samples = [[163, 248], [120, 248], [205, 248], [480, 400], [480, 440], [778, 265], [403, 102], [768, 373], [30, 30]].map(([x, y]) => ({ x, y, reference: pixel(expected, x, y), candidate: pixel(actual, x, y) }))
      const grid = []
      for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
        const left = column * 240, top = row * 135
        let channels = 0, error = 0
        for (let y = top; y < top + 135; y++) for (let x = left; x < left + 240; x++) for (let channel = 0; channel < 4; channel++) {
          const index = (y * 960 + x) * 4 + channel
          if (actual[index] !== expected[index]) { channels++; error += Math.abs(actual[index] - expected[index]) }
        }
        grid.push({ row, column, channels, meanError: error / (240 * 135 * 4) })
      }
      const isolated = []
      let isolatedToken = 2
      for (const element of elements) {
        const singleProject: EditorV6Document = { ...goldenProject, id: crypto.randomUUID(), elements: [element], timeline: createEditorV6Timeline([element]) }
        const singleScene = resolveEditorV6SceneAtFrame(singleProject, 1)
        const reference = await pixels(await captureEditorV6Frame(singleProject, 1, 960, 540))
        await surface.present({ scene: singleScene, assets: singleProject.assets, width: 960, height: 540, renderLayer: 'all', rasterCanvases: new Map(), paintToken: isolatedToken++ })
        const candidate = await pixels(surface.canvas.toDataURL('image/png'))
        let channels = 0, sum = 0, max = 0
        for (let index = 0; index < candidate.length; index++) if (candidate[index] !== reference[index]) { channels++; const delta = Math.abs(candidate[index] - reference[index]); sum += delta; max = Math.max(max, delta) }
        isolated.push({ kind: element.kind, channels, meanError: sum / candidate.length, maximumChannelError: max })
      }
      const backgroundOnlyProject: EditorV6Document = { ...goldenProject, elements: [], timeline: createEditorV6Timeline([]) }
      const backgroundOnlyScene = resolveEditorV6SceneAtFrame(backgroundOnlyProject, 1)
      const backgroundExpected = await pixels(await captureEditorV6Frame(backgroundOnlyProject, 1, 960, 540))
      await surface.present({ scene: backgroundOnlyScene, assets: backgroundOnlyProject.assets, width: 960, height: 540, renderLayer: 'all', rasterCanvases: new Map(), paintToken: isolatedToken })
      const backgroundActual = await pixels(surface.canvas.toDataURL('image/png'))
      let backgroundChannels = 0, backgroundError = 0, backgroundMaximum = 0
      for (let index = 0; index < backgroundActual.length; index++) if (backgroundActual[index] !== backgroundExpected[index]) { backgroundChannels++; const delta = Math.abs(backgroundActual[index] - backgroundExpected[index]); backgroundError += delta; backgroundMaximum = Math.max(backgroundMaximum, delta) }
      const backgroundMeanError = backgroundError / backgroundActual.length
      const backgroundSamples = [[20, 20], [240, 270], [120, 270], [360, 270]].map(([x, y]) => ({ x, y, reference: pixel(backgroundExpected, x, y), candidate: pixel(backgroundActual, x, y) }))
      assert(differentChannels / actual.length < .01 && maximumChannelError <= 101 && meanChannelError < .25 && backgroundSamples.every((sample) => sample.reference === sample.candidate),
        `Golden expandido Canvas2D excedeu as tolerâncias visuais: ${JSON.stringify({ differentChannels, maximumChannelError, meanChannelError, regions, samples, grid, isolated, backgroundChannels, backgroundMaximum, backgroundMeanError, backgroundSamples })}`)
      assert(backgroundSamples.every((sample) => sample.reference === sample.candidate), `Canvas2D mudou o aspect ratio, enquadramento ou as cores do fundo: ${JSON.stringify(backgroundSamples)}`)
      return { passed: true, differentChannels, maximumChannelError, meanChannelError, tested: ['speech', 'thought', 'speaker labels', 'narrator', 'motion sprite atlas', 'flip', 'rotation', 'letterboxed image', 'background asset stretch', 'unused asset not decoded'], backgroundSamples }
    } finally { surface.dispose(); actualRoot.remove() }
  }
  ;(globalThis as unknown as { runForeignObjectSurfaceCheck: () => Promise<unknown> }).runForeignObjectSurfaceCheck = async () => {
    flushSync(() => root.render(<SceneSurface scene={hairOnlyScene} assets={project.assets} rasterCanvases={new Map([[actor.id, hairCanvas]])} />))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    assert(mount.querySelector('foreignObject canvas') !== null, 'A camada raster não foi montada dentro do foreignObject.')
    return { mountedCanvas: true, canvasWidth: hairCanvas.width, canvasHeight: hairCanvas.height }
  }
  ;(globalThis as unknown as { compareForeignObjectSurface: (image: string) => Promise<unknown> }).compareForeignObjectSurface = async (image) => {
    const nativePixels = await pixels(image)
    const nativeCenter = pixel(nativePixels, 720, 270)
    assert(nativeCenter === '17,221,103,255', `capturePage não preservou os pixels do canvas do cabelo: ${nativeCenter}`)
    const svg = mount.querySelector('svg')!
    const serialized = svg.cloneNode(true) as SVGElement
    serialized.setAttribute('width', '960')
    serialized.setAttribute('height', '540')
    const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(serialized)], { type: 'image/svg+xml' }))
    let serializedCenter: string | null = null
    let serializationError: string | undefined
    try { serializedCenter = pixel(await pixels(source), 720, 270) } catch (error) { serializationError = error instanceof Error ? error.message : String(error) }
    finally { URL.revokeObjectURL(source) }
    assert(serializedCenter !== '17,221,103,255', 'A serialização SVG preservou inesperadamente o bitmap do canvas clonado; revise o contrato de renderização.')
    return { capturePageCenter: nativeCenter, serializedSvgCenter: serializedCenter, serializedSvgDecodeError: serializationError, foreignObjectCanvasRoundTripsPixels: false }
  }
  ;(globalThis as unknown as { compareCanvasFrameSurface: (reference: string) => Promise<unknown> }).compareCanvasFrameSurface = async (reference) => {
    const surface = createCanvas2dFrameSurface(mount, 960, 540)
    try {
      await surface.present({ scene: hairOnlyScene, assets: project.assets, width: 960, height: 540, renderLayer: 'all', rasterCanvases: new Map([[actor.id, hairCanvas]]), paintToken: 1 })
      const expected = await pixels(reference)
      const actual = await pixels(surface.canvas.toDataURL('image/png'))
      let differentChannels = 0, outsideActorChannels = 0, errorSum = 0, maximumChannelError = 0
      for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) {
        differentChannels++
        const error = Math.abs(actual[index] - expected[index])
        errorSum += error
        maximumChannelError = Math.max(maximumChannelError, error)
        const pixelIndex = Math.floor(index / 4), x = pixelIndex % 960, y = Math.floor(pixelIndex / 960)
        if (x < 600 || x >= 840 || y < 150 || y >= 390) outsideActorChannels++
      }
      const meanChannelError = errorSum / actual.length
      assert(pixel(actual, 720, 270) === '17,221,103,255', 'A superfície Canvas2D não compôs o canvas raster diretamente.')
      assert(outsideActorChannels === 0 && differentChannels / actual.length < .01 && maximumChannelError <= 100 && meanChannelError < .25,
        `A superfície Canvas2D divergiu do capturePage fora da tolerância na camada de cabelo: ${JSON.stringify({ differentChannels, outsideActorChannels, maximumChannelError, meanChannelError })}`)
      await surface.present({ scene: hairOnlyScene, assets: project.assets, width: 960, height: 540, renderLayer: 'foreground', rasterCanvases: new Map([[actor.id, hairCanvas]]), paintToken: 2 })
      const transparent = surface.canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data
      assert(transparent[3] === 0, `A camada frontal Canvas2D perdeu transparência: ${Array.from(transparent)}`)
      await surface.present({ scene: hairOnlyScene, assets: project.assets, width: 960, height: 540, renderLayer: 'background', rasterCanvases: new Map([[actor.id, hairCanvas]]), paintToken: 3 })
      const background = Array.from(surface.canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data)
      assert(background.join(',') === '0,0,255,255', `A camada de fundo Canvas2D mudou: ${background}`)
      let videoRequiresFallback = false
      try {
        await surface.present({ scene: { ...hairOnlyScene, mediaVideo: { blockId: 'video', mediaId: 'media', url: '', layout: { x: 0, y: 0, width: 10, height: 10, rotation: 0 }, startFrame: 0, sourceInFrame: 0, durationFrames: 1, hasAudio: false, audioEnabled: false, gain: 1 } }, assets: project.assets, width: 960, height: 540, renderLayer: 'all', rasterCanvases: new Map(), paintToken: 4 })
      } catch (error) { videoRequiresFallback = error instanceof Error && error.message.includes('não compõe vídeo embutido') }
      assert(videoRequiresFallback, 'Canvas2D aceitou vídeo sem suporte de composição, em vez de solicitar fallback.')
      const ownedCanvas = surface.canvas
      surface.dispose()
      assert(ownedCanvas.width === 1 && ownedCanvas.height === 1, 'Canvas2D manteve uma superfície grande após dispose.')
      return { passed: true, differentChannels, outsideActorChannels, maximumChannelError, meanChannelError, foregroundAlpha: transparent[3], backgroundPixel: background, videoRequiresFallback, releasedCanvas: true }
    } finally { surface.dispose() }
  }
  return { passed: true, differentPixelChannels: different, sequentialFrames: sequential.map(({ frame }) => frame), aspectChecks }
}
