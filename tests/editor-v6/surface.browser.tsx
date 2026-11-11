import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { EditorV6ExportPanel } from '../../src/renderer/src/features/editorV6/EditorV6ExportPanel'
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
    // Library pickers render through a portal under document.body, outside the React mount node.
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
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
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId: imageId, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
  let project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'SceneSurface check', color: '#d7b5cd', createdAt: '2026-10-25T12:00:00.000Z', updatedAt: '2026-10-25T12:00:00.000Z', backgroundColor: '#0000ff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: imageId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: colorPng('#ff0000') }], timeline: createEditorV6Timeline([actor]) }
  const prepared = prepareEditorV6PositionAtFrame(project, actor.id, 90)!
  project = editEditorV6DocumentAtBlock(prepared.document, prepared.blockId, (working) => ({ ...working, elements: working.elements.map((element) => ({ ...element, x: 25 })), assets: working.assets.map((asset) => ({ ...asset, dataUrl: colorPng('#00ff00') })) }))
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
  return { passed: true, differentPixelChannels: different, sequentialFrames: sequential.map(({ frame }) => frame), aspectChecks, capture }
}
