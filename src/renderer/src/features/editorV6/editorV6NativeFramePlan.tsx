import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EditorV6Asset, EditorV6SceneElement } from '../../../../shared/editorV6'
import { editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import type { EditorV6NativeFramePlan, EditorV6NativeImageCommand } from '../../../../shared/editorV6Export'
import type { EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'
import { editorV6ElementsWithBalloonsOnTop } from './editorV6SceneLayerOrder'
import { SceneTextContent } from './SceneTextContent'

type Layer = 'all' | 'background' | 'foreground' | 'stacked'
type CanvasMap = ReadonlyMap<string, HTMLCanvasElement>
const textRasterCache = new Map<string, { id: string; dataUrl: string }>()
const assetUrlCache = new Map<string, string>()
const MAX_TEXT_CACHE = 128
const MAX_ASSET_URL_CACHE = 512

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? Error('Não foi possível preparar uma imagem para o renderizador nativo.'))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(Error('O asset nativo não foi codificado como imagem.'))
    reader.readAsDataURL(blob)
  })
}

async function pngDataUrlFromImage(bitmap: ImageBitmap): Promise<string> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw Error('Canvas de conversão indisponível no renderizador nativo.')
  try { context.drawImage(bitmap, 0, 0) }
  catch (error) { bitmap.close(); throw Error(`Não foi possível copiar uma imagem para o canvas nativo: ${error instanceof Error ? error.message : String(error)}`) }
  bitmap.close()
  return dataUrlFromBlob(await canvas.convertToBlob({ type: 'image/png' }))
}

async function resolveNativeAsset(asset: EditorV6Asset, suppliedAssets: Map<string, { id: string; dataUrl: string }>): Promise<string> {
  const cachedUrl = assetUrlCache.get(asset.id)
  const dataUrl = asset.dataUrl.startsWith('data:') ? asset.dataUrl : cachedUrl ?? await (async () => {
    const response = await fetch(asset.dataUrl, { credentials: 'omit' })
    if (!response.ok) throw Error(`Não foi possível ler o asset “${asset.name}” para o renderizador nativo.`)
    let bitmap: ImageBitmap
    try { bitmap = await createImageBitmap(await response.blob()) }
    catch (error) { throw Error(`O navegador não decodificou o asset “${asset.name}” (${asset.id}) para o renderizador nativo: ${error instanceof Error ? error.message : String(error)}`) }
    return pngDataUrlFromImage(bitmap)
  })()
  if (!asset.dataUrl.startsWith('data:') && !cachedUrl) {
    assetUrlCache.set(asset.id, dataUrl)
    while (assetUrlCache.size > MAX_ASSET_URL_CACHE) assetUrlCache.delete(assetUrlCache.keys().next().value!)
  }
  suppliedAssets.set(asset.id, { id: asset.id, dataUrl })
  return asset.id
}

async function rasterizeTextElement(element: EditorV6SceneElement, width: number, height: number): Promise<{ id: string; dataUrl: string }> {
  const key = JSON.stringify([element.kind, element.text, element.speakerName, element.speakerColor, element.balloonScalePercent, width, height])
  const cached = textRasterCache.get(key)
  if (cached) return cached
  await document.fonts.ready
  const markup = renderToStaticMarkup(createElement(SceneTextContent, { element, width, height }))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}">${markup}</svg>`
  const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)))
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw Error('Canvas de texto indisponível no renderizador nativo.')
  let bitmap: ImageBitmap | HTMLImageElement
  try { bitmap = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })) }
  catch (bitmapError) {
    // SVGs with larger wrapped text/clip paths can fail createImageBitmap's
    // decoder even though Chromium can load the same SVG as an image resource.
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(Error('O Chromium não conseguiu carregar o SVG do elemento.'))
        image.src = objectUrl
      })
    } catch (imageError) {
      throw Error(`Não foi possível rasterizar o texto ${element.kind} “${element.id}” para o renderizador nativo (createImageBitmap: ${bitmapError instanceof Error ? bitmapError.message : String(bitmapError)}; img: ${imageError instanceof Error ? imageError.message : String(imageError)}).`)
    } finally { URL.revokeObjectURL(objectUrl) }
  }
  try { context.drawImage(bitmap, 0, 0, canvas.width, canvas.height) }
  finally { if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close() }
  const dataUrl = await dataUrlFromBlob(await canvas.convertToBlob({ type: 'image/png' }))
  const result = { id: `text-${stableHash(key)}`, dataUrl }
  textRasterCache.set(key, result)
  while (textRasterCache.size > MAX_TEXT_CACHE) textRasterCache.delete(textRasterCache.keys().next().value!)
  return result
}

function scenePosition(x: number, y: number) { return { x: (50 + x) * 19.2, y: (50 + y) * 10.8 } }

function addImageCommand(
  commands: EditorV6NativeImageCommand[],
  assetId: string,
  position: { x: number; y: number },
  width: number,
  height: number,
  rotation: number,
  options: Pick<EditorV6NativeImageCommand, 'flipX' | 'contain' | 'source' | 'cutout'> = {}
) {
  commands.push({ kind: 'image', assetId, ...position, width, height, rotation, opacity: 1, ...options })
}

async function elementCommands(
  element: EditorV6SceneElement,
  assetsById: ReadonlyMap<string, EditorV6Asset>,
  rasterCanvases: CanvasMap,
  frame: number,
  suppliedAssets: Map<string, { id: string; dataUrl: string }>,
  commands: EditorV6NativeImageCommand[]
): Promise<void> {
  const size = editorV6ElementSize(element)
  const isBalloon = element.kind === 'speech' || element.kind === 'thought'
  const balloonScale = isBalloon ? Math.max(1, Math.min(2.5, (element.balloonScalePercent ?? 100) / 100)) : 1
  const width = size.width * 19.2 * balloonScale, height = size.height * 10.8 * balloonScale
  const position = scenePosition(element.x, element.y + (isBalloon ? element.balloonOffsetY ?? 0 : 0))
  if (element.kind === 'narrator' || element.kind === 'speech' || element.kind === 'thought') {
    const raster = await rasterizeTextElement(element, width, height)
    suppliedAssets.set(raster.id, raster)
    addImageCommand(commands, raster.id, position, width, height, element.rotation)
    return
  }

  const rasterCanvas = rasterCanvases.get(element.id)
  const sourceAsset = element.assetId ? assetsById.get(element.assetId) : undefined
  if (!rasterCanvas && !sourceAsset) return
  const assetId = rasterCanvas
    ? `hair-${stableHash(`${element.id}:${frame}`)}`
    : await resolveNativeAsset(sourceAsset!, suppliedAssets)
  if (rasterCanvas) {
    try { suppliedAssets.set(assetId, { id: assetId, dataUrl: rasterCanvas.toDataURL('image/png') }) }
    catch (error) { throw Error(`Não foi possível copiar o canvas de cabelo do elemento “${element.id}” para o renderizador nativo: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const sprite = rasterCanvas ? undefined : element.motionSprite
  const patch = rasterCanvas ? undefined : element.mouthPatch
  const cutout = patch?.replace ? {
    x: patch.x + (patch.replaceBounds?.x ?? 0) * patch.width,
    y: patch.y + (patch.replaceBounds?.y ?? 0) * patch.height,
    width: (patch.replaceBounds?.width ?? 1) * patch.width,
    height: (patch.replaceBounds?.height ?? 1) * patch.height
  } : undefined
  addImageCommand(commands, assetId, position, width, height, element.rotation, {
    flipX: Boolean(element.flipX), contain: element.kind !== 'character' && !sprite,
    ...(sprite ? { source: { x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height } } : {}),
    ...(cutout ? { cutout } : {})
  })
  if (patch) {
    const mouthAsset = assetsById.get(patch.assetId)
    if (!mouthAsset) throw Error(`A boca do personagem “${element.id}” não está disponível para o renderizador nativo.`)
    const mouthId = await resolveNativeAsset(mouthAsset, suppliedAssets)
    const flipX = Boolean(element.flipX)
    const localX = (-width / 2 + patch.x * width + patch.width * width / 2) * (flipX ? -1 : 1)
    const localY = -height / 2 + patch.y * height + patch.height * height / 2
    const radians = element.rotation * Math.PI / 180
    addImageCommand(commands, mouthId, {
      x: position.x + localX * Math.cos(radians) - localY * Math.sin(radians),
      y: position.y + localX * Math.sin(radians) + localY * Math.cos(radians)
    }, patch.width * width, patch.height * height, element.rotation, {
      flipX: Boolean(element.flipX),
      source: { x: patch.sprite.x, y: patch.sprite.y, width: patch.sprite.width, height: patch.sprite.height }
    })
  }
}

export async function createEditorV6NativeFramePlan({
  scene, assets, resolveAssetById, rasterCanvases, frame, width, height, layer
}: {
  scene: EditorV6ResolvedScene
  assets: readonly EditorV6Asset[]
  resolveAssetById: (id: string) => EditorV6Asset | undefined
  rasterCanvases: CanvasMap
  frame: number
  width: number
  height: number
  layer: Layer
}): Promise<EditorV6NativeFramePlan> {
  const stacked = layer === 'stacked'
  const backgroundOnly = layer === 'background'
  const foregroundOnly = layer === 'foreground'
  const logicalHeight = stacked ? 2160 : 1080
  const outputHeight = stacked ? height * 2 : height
  const assetIndex = new Map(assets.map(asset => [asset.id, asset]))
  const suppliedAssets = new Map<string, { id: string; dataUrl: string }>()
  const commands: EditorV6NativeImageCommand[] = []
  const solidCommands: EditorV6NativeFramePlan['commands'] = []
  let backgroundColor = 'transparent'
  const background = scene.background
  if (!foregroundOnly) {
    backgroundColor = background.backgroundColor
    if (stacked) solidCommands.push({ kind: 'solid', x: 0, y: 0, width: 1920, height: 1080, color: background.backgroundColor })
    if (background.backgroundAssetId) {
      const asset = resolveAssetById(background.backgroundAssetId)
      if (asset) {
        const id = await resolveNativeAsset(asset, suppliedAssets)
        const size = { width: background.backgroundWidth * 19.2, height: background.backgroundHeight * 10.8 }
        addImageCommand(commands, id, scenePosition(background.backgroundX, background.backgroundY), size.width, size.height, background.backgroundRotation)
      }
    }
  }
  if (!backgroundOnly) {
    const elements = editorV6ElementsWithBalloonsOnTop(scene.elements)
    for (const element of elements) {
      const firstCommand = commands.length
      await elementCommands(element, assetIndex, rasterCanvases, frame, suppliedAssets, commands)
      if (stacked) for (let index = firstCommand; index < commands.length; index++) commands[index].y += 1080
    }
  }
  if (stacked) {
    // Background assets stay in the top half; foreground commands start at y=1080.
    return { width, height: outputHeight, logicalHeight, backgroundColor: 'transparent', assets: [...suppliedAssets.values()], commands: [...solidCommands, ...commands] }
  }
  return { width, height: outputHeight, logicalHeight, backgroundColor, assets: [...suppliedAssets.values()], commands: [...solidCommands, ...commands] }
}
