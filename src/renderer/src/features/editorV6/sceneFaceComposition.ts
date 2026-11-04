import type { EditorV6Asset, EditorV6Element } from '../../../../shared/editorV6'

const MAX_DECODED_IMAGES = 16
const MAX_DECODED_IMAGE_BYTES = 96 * 1024 * 1024
const MAX_COMPOSITE_CACHE_CHARS = 32 * 1024 * 1024
const decodedImages = new Map<number, { asset: EditorV6Asset; promise: Promise<HTMLImageElement>; decodedBytes: number }>()
const compositeAssets = new Map<string, EditorV6Asset>()
const assetIdentity = new WeakMap<EditorV6Asset, number>()
let cachedCompositeChars = 0
let nextAssetIdentity = 1
let cachedDecodedImageBytes = 0

function loadImage(asset: EditorV6Asset): Promise<HTMLImageElement> {
  const key = identity(asset)
  const cached = decodedImages.get(key)
  if (cached) {
    decodedImages.delete(key)
    decodedImages.set(key, cached)
    return cached.promise
  }
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => { void image.decode().then(() => {
      const current = decodedImages.get(key)
      if (current?.promise === pending) {
        const decodedBytes = image.naturalWidth * image.naturalHeight * 4
        while ((decodedImages.size > MAX_DECODED_IMAGES || cachedDecodedImageBytes + decodedBytes > MAX_DECODED_IMAGE_BYTES) && decodedImages.size > 1) {
          const oldest = [...decodedImages.keys()].find((candidate) => candidate !== key)
          if (oldest === undefined) break
          const removed = decodedImages.get(oldest)!
          decodedImages.delete(oldest)
          cachedDecodedImageBytes -= removed.decodedBytes
        }
        if (decodedBytes <= MAX_DECODED_IMAGE_BYTES && decodedImages.size <= MAX_DECODED_IMAGES && cachedDecodedImageBytes + decodedBytes <= MAX_DECODED_IMAGE_BYTES) {
          current.decodedBytes = decodedBytes
          cachedDecodedImageBytes += decodedBytes
        } else decodedImages.delete(key)
      }
      resolve(image)
    }, reject) }
    image.onerror = () => reject(Error('Não foi possível decodificar a camada visual do personagem.'))
    image.src = asset.dataUrl
  })
  decodedImages.set(key, { asset, promise: pending, decodedBytes: 0 })
  void pending.catch(() => {
    const current = decodedImages.get(key)
    if (current?.promise === pending) {
      decodedImages.delete(key)
      cachedDecodedImageBytes -= current.decodedBytes
    }
  })
  return pending
}

function identity(asset: EditorV6Asset): number {
  const existing = assetIdentity.get(asset)
  if (existing !== undefined) return existing
  const next = nextAssetIdentity++
  assetIdentity.set(asset, next)
  return next
}

function compositeKey(element: EditorV6Element, base: EditorV6Asset, faceAsset: EditorV6Asset): string {
  return JSON.stringify([identity(base), identity(faceAsset), element.motionSprite ?? null, element.mouthPatch])
}

function cacheComposite(key: string, asset: EditorV6Asset): void {
  const chars = asset.dataUrl.length
  if (chars > MAX_COMPOSITE_CACHE_CHARS) return
  const previous = compositeAssets.get(key)
  if (previous) cachedCompositeChars -= previous.dataUrl.length
  compositeAssets.delete(key)
  while (cachedCompositeChars + chars > MAX_COMPOSITE_CACHE_CHARS && compositeAssets.size) {
    const oldestKey = compositeAssets.keys().next().value!
    cachedCompositeChars -= compositeAssets.get(oldestKey)!.dataUrl.length
    compositeAssets.delete(oldestKey)
  }
  compositeAssets.set(key, asset)
  cachedCompositeChars += chars
}

/** Applies a complete native-resolution RGBA face replacement before SVG scaling. */
export async function composeEditorV6FaceReplacements<T extends { elements: EditorV6Element[] }>(
  scene: T,
  assets: readonly EditorV6Asset[],
  options?: { assetIndex?: ReadonlyMap<string, EditorV6Asset>; additionsOnly?: boolean }
): Promise<{ scene: T; assets: EditorV6Asset[] }> {
  // The export worker can resolve persistent assets from its own stable index,
  // so it does not need to copy that entire catalog for every rendered frame.
  // Default behavior stays unchanged for preview and other consumers.
  if (!scene.elements.some(element => element.kind === 'character' && element.mouthPatch?.replace)) {
    return { scene, assets: options?.additionsOnly ? [] : [...assets] }
  }
  const assetsById = options?.assetIndex ?? new Map(assets.map((asset) => [asset.id, asset]))
  const additions: EditorV6Asset[] = []
  const elements = await Promise.all(scene.elements.map(async (element) => {
    const patch = element.mouthPatch
    if (element.kind !== 'character' || !patch?.replace) return element
    const base = element.assetId ? assetsById.get(element.assetId) : undefined
    const face = assetsById.get(patch.assetId)
    if (!base || !face) throw Error(`A camada facial de ${element.text || element.characterId || 'personagem'} está incompleta; a composição foi interrompida.`)
    if (!patch.replaceBounds) throw Error(`A camada facial de ${element.text || element.characterId || 'personagem'} não informa a região RGBA que deve ser substituída.`)
    const key = compositeKey(element, base, face)
    let composed = compositeAssets.get(key)
    if (!composed) {
      const [baseImage, faceImage] = await Promise.all([loadImage(base), loadImage(face)])
      const source = element.motionSprite ?? { x: 0, y: 0, width: baseImage.naturalWidth, height: baseImage.naturalHeight, atlasWidth: baseImage.naturalWidth, atlasHeight: baseImage.naturalHeight }
      if (source.x + source.width > baseImage.naturalWidth || source.y + source.height > baseImage.naturalHeight) throw Error(`O recorte corporal de ${element.text || element.characterId || 'personagem'} está fora do atlas.`)
      const leftExact = patch.x * source.width, topExact = patch.y * source.height
      const widthExact = patch.width * source.width, heightExact = patch.height * source.height
      const left = Math.round(leftExact), top = Math.round(topExact), width = Math.round(widthExact), height = Math.round(heightExact)
      const sprite = patch.sprite
      if ([leftExact - left, topExact - top, widthExact - width, heightExact - height].some((value) => Math.abs(value) > 0.001)
        || width !== sprite.width || height !== sprite.height
        || sprite.x + sprite.width > faceImage.naturalWidth || sprite.y + sprite.height > faceImage.naturalHeight
        || left < 0 || top < 0 || left + width > source.width || top + height > source.height) {
        throw Error(`A camada facial de ${element.text || element.characterId || 'personagem'} não corresponde ao recorte corporal em resolução nativa.`)
      }
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw Error('Não foi possível compor a camada facial em resolução nativa.')
      context.drawImage(baseImage, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height)
      const faceCanvas = document.createElement('canvas'); faceCanvas.width = width; faceCanvas.height = height
      const faceContext = faceCanvas.getContext('2d', { willReadFrequently: true })
      if (!faceContext) throw Error('Não foi possível ler a camada facial em resolução nativa.')
      faceContext.drawImage(faceImage, sprite.x, sprite.y, width, height, 0, 0, width, height)
      const replacement = faceContext.getImageData(0, 0, width, height)
      context.putImageData(replacement, left, top)
      const asset: EditorV6Asset = {
        id: crypto.randomUUID(), category: 'character', name: `${base.name} · composição facial`, mimeType: 'image/png',
        dataUrl: canvas.toDataURL('image/png'), timelineSnapshot: true
      }
      canvas.width = canvas.height = faceCanvas.width = faceCanvas.height = 1
      composed = asset
      cacheComposite(key, asset)
    }
    additions.push(composed)
    return { ...element, assetId: composed.id, ...(element.motionSprite ? { motionSprite: { x: 0, y: 0, width: element.motionSprite.width, height: element.motionSprite.height, atlasWidth: element.motionSprite.width, atlasHeight: element.motionSprite.height } } : {}), mouthPatch: undefined }
  }))
  const uniqueAdditions = [...new Map(additions.map((asset) => [asset.id, asset])).values()]
  return { scene: { ...scene, elements }, assets: options?.additionsOnly ? uniqueAdditions : [...assets, ...uniqueAdditions] }
}
