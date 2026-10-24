/**
 * The Gacha compositor has two groups of invariant layers around the
 * per-frame facial expression. Prepare them exactly once per rig/pose:
 *
 *    body + back hair + wardrobe
 *    [dynamic expression/eye/pupil/mouth/blink rendered between]
 *    front hair + wardrobe elements that sit above hair
 *
 * The relative draw order matches prepareSavedCharacterRenderer's historical
 * source-over draws. Never combine the face with the static groups: PT pupils,
 * clipping masks and mouth transformations remain frame-local.
 */
export type GachaStaticLayers = Readonly<{
  behindFace: HTMLCanvasElement
  inFrontOfFace: HTMLCanvasElement | null
}>

function newLayerCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas de camada Gacha indisponível.')
  return [canvas, context]
}

export function prepareGachaStaticLayers(
  bodyAndBackHair: HTMLCanvasElement,
  wardrobe: CanvasImageSource | null,
  frontHair: HTMLCanvasElement | null,
  wardrobeOverHair: CanvasImageSource | null,
  options: Readonly<{ adoptSourceCanvases?: boolean }> = {},
): GachaStaticLayers {
  const { width, height } = bodyAndBackHair
  if (!width || !height) throw new Error('Dimensões da pose Gacha inválidas.')
  // The prepared pose owns these disposable canvases exclusively, so reuse
  // them instead of allocating and copying another two full-resolution
  // buffers at every intermediate pose. Other callers keep copy semantics.
  const adopt = options.adoptSourceCanvases === true
  const [behindFace, back] = adopt
    ? [bodyAndBackHair, bodyAndBackHair.getContext('2d')]
    : newLayerCanvas(width, height)
  if (!back) throw new Error('Canvas da camada inferior Gacha indisponível.')
  // New neutral layer buffers use default 'low' sampling. Reused source
  // contexts may have 'high' from part painting: match the historic static
  // compositor when the wardrobe bitmap is resized into the output canvas.
  if (adopt) {
    back.imageSmoothingEnabled = true
    back.imageSmoothingQuality = 'low'
  }
  if (!adopt) back.drawImage(bodyAndBackHair, 0, 0, width, height)
  if (wardrobe) back.drawImage(wardrobe, 0, 0, width, height)
  let inFrontOfFace: HTMLCanvasElement | null = null
  if (frontHair || wardrobeOverHair) {
    const reuseFront = adopt && Boolean(frontHair)
      && frontHair?.width === width && frontHair?.height === height
    const [over, front] = reuseFront
      ? [frontHair!, frontHair!.getContext('2d')]
      : newLayerCanvas(width, height)
    if (!front) throw new Error('Canvas da camada superior Gacha indisponível.')
    if (reuseFront) {
      front.imageSmoothingEnabled = true
      front.imageSmoothingQuality = 'low'
    }
    if (frontHair && !reuseFront) front.drawImage(frontHair, 0, 0, width, height)
    if (wardrobeOverHair) front.drawImage(wardrobeOverHair, 0, 0, width, height)
    inFrontOfFace = over
  }
  return { behindFace, inFrontOfFace }
}
