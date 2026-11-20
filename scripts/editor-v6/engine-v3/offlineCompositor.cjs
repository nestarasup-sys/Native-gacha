'use strict'

// F1 laboratory: consumes the existing EditorV6NativeFramePlan JSON contract.
// No Electron, DOM, file reads, project writes or FFmpeg in this module.
const sharp = require('sharp')

const MAX_PIXELS = 4096 * 2160
const MAX_COMMANDS = 20000
const MAX_ASSET_BYTES = 256 * 1024 * 1024
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i
const COLOR = /^(?:transparent|#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i

const finite = value => typeof value === 'number' && Number.isFinite(value)
const positive = value => finite(value) && value > 0

function validateFramePlan(plan) {
  if (!plan || !Number.isSafeInteger(plan.width) || !Number.isSafeInteger(plan.height)
    || !Number.isSafeInteger(plan.logicalHeight) || plan.width < 1 || plan.height < 1
    || plan.width > 4096 || plan.height > 2160 || plan.width * plan.height > MAX_PIXELS
    || plan.logicalHeight < 1 || plan.logicalHeight > 2160) throw Error('Dimensões inválidas para o compositor offline.')
  if (!COLOR.test(plan.backgroundColor)) throw Error('Cor de fundo não suportada pelo compositor offline.')
  if (!Array.isArray(plan.assets) || !Array.isArray(plan.commands) || plan.commands.length > MAX_COMMANDS) throw Error('Comandos/assets inválidos no plano offline.')
  const assets = new Map()
  let totalBytes = 0
  for (const asset of plan.assets) {
    if (typeof asset?.id !== 'string' || !asset.id || assets.has(asset.id) || typeof asset.dataUrl !== 'string') throw Error('ID de asset ausente ou repetido.')
    const match = DATA_IMAGE.exec(asset.dataUrl)
    if (!match) throw Error(`Asset offline inválido: ${asset.id}.`)
    const bytes = Buffer.from(match[2], 'base64')
    totalBytes += bytes.length
    if (totalBytes > MAX_ASSET_BYTES) throw Error('Assets excedem o limite de memória do experimento.')
    assets.set(asset.id, bytes)
  }
  for (const command of plan.commands) {
    if (command?.kind === 'solid') {
      if (![command.x, command.y, command.width, command.height].every(finite) || !COLOR.test(command.color)) throw Error('Retângulo sólido inválido.')
      continue
    }
    if (command?.kind !== 'image' || !assets.has(command.assetId)
      || ![command.x, command.y, command.width, command.height, command.rotation, command.opacity].every(finite)
      || command.opacity < 0 || command.opacity > 1) throw Error('Comando de imagem inválido no compositor offline.')
    for (const rect of [command.source, command.cutout]) {
      if (rect && (![rect.x, rect.y, rect.width, rect.height].every(finite) || !positive(rect.width) || !positive(rect.height))) throw Error('Recorte inválido no plano offline.')
    }
  }
  return assets
}

function intersect(left, top, width, height, maxWidth, maxHeight) {
  const x = Math.max(0, left), y = Math.max(0, top)
  const right = Math.min(maxWidth, left + width), bottom = Math.min(maxHeight, top + height)
  return right <= x || bottom <= y ? null : { left: x, top: y, width: right - x, height: bottom - y }
}

async function buildImageOverlay(command, encoded, width, height) {
  const scaleX = width / 1920, scaleY = height / command.logicalHeight
  const info = await sharp(encoded, { limitInputPixels: MAX_PIXELS }).metadata()
  if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height)) throw Error('Metadados de imagem offline indisponíveis.')
  const source = command.source ?? { x: 0, y: 0, width: info.width, height: info.height }
  // Atlas crops are pixel rectangles in the existing V6 native plan.
  if (![source.x, source.y, source.width, source.height].every(Number.isSafeInteger)
    || source.x < 0 || source.y < 0 || source.x + source.width > info.width || source.y + source.height > info.height) {
    throw Error(`Recorte de atlas excede o asset ${command.assetId}.`)
  }
  let logicalWidth = command.width, logicalHeight = command.height
  if (command.contain) {
    const factor = Math.min(logicalWidth / source.width, logicalHeight / source.height)
    logicalWidth = source.width * factor
    logicalHeight = source.height * factor
  }
  const rasterWidth = Math.round(logicalWidth * scaleX), rasterHeight = Math.round(logicalHeight * scaleY)
  if (rasterWidth < 1 || rasterHeight < 1) return null
  if (rasterWidth > 4096 || rasterHeight > 2160) throw Error('Imagem transformada excede o limite do compositor offline.')
  let image = sharp(encoded, { limitInputPixels: MAX_PIXELS })
    .extract({ left: source.x, top: source.y, width: source.width, height: source.height })
    .resize(rasterWidth, rasterHeight, { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
  if (command.flipX) image = image.flop()
  if (command.cutout) {
    const cut = command.cutout
    const box = intersect(Math.floor(cut.x * rasterWidth), Math.floor(cut.y * rasterHeight),
      Math.ceil(cut.width * rasterWidth), Math.ceil(cut.height * rasterHeight), rasterWidth, rasterHeight)
    if (box) {
      const hole = await sharp({ create: { width: box.width, height: box.height, channels: 4, background: '#ffffffff' } }).png().toBuffer()
      image = image.composite([{ input: hole, left: box.left, top: box.top, blend: 'dest-out' }])
    }
  }
  if (command.opacity < 1) {
    const { data, info: rawInfo } = await image.raw().toBuffer({ resolveWithObject: true })
    for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * command.opacity)
    image = sharp(data, { raw: { width: rawInfo.width, height: rawInfo.height, channels: 4 } })
  }
  // Sharp rotates clockwise. Keep the expanded raster centred at the V6 command position.
  if (command.rotation % 360) image = image.rotate(command.rotation, { background: '#00000000' })
  const { data: png, info: rotated } = await image.png().toBuffer({ resolveWithObject: true })
  return { input: png, left: Math.round(command.x * scaleX - rotated.width / 2),
    top: Math.round(command.y * scaleY - rotated.height / 2), width: rotated.width, height: rotated.height }
}

async function buildSolidOverlay(command, width, height, logicalHeight) {
  const scaleX = width / 1920, scaleY = height / logicalHeight
  const left = Math.round(command.x * scaleX), top = Math.round(command.y * scaleY)
  const w = Math.round(command.width * scaleX), h = Math.round(command.height * scaleY)
  if (w < 1 || h < 1) return null
  const clipped = intersect(left, top, w, h, width, height)
  if (!clipped) return null
  const input = await sharp({ create: { width: clipped.width, height: clipped.height, channels: 4, background: command.color } }).png().toBuffer()
  return { input, left: clipped.left, top: clipped.top }
}

/** Returns straight-alpha RGBA; the caller must declare pix_fmt=rgba to FFmpeg. */
async function renderOfflineFrame(plan) {
  const assets = validateFramePlan(plan)
  const overlays = []
  for (const command of plan.commands) {
    if (command.kind === 'image' && (!positive(command.width) || !positive(command.height) || command.opacity === 0)) continue
    const result = command.kind === 'solid'
      ? await buildSolidOverlay(command, plan.width, plan.height, plan.logicalHeight)
      : await buildImageOverlay({ ...command, logicalHeight: plan.logicalHeight }, assets.get(command.assetId), plan.width, plan.height)
    if (!result) continue
    // Sharp requires overlays to remain inside the base. Clip here after rotation.
    const clipped = intersect(result.left, result.top, result.width ?? plan.width, result.height ?? plan.height, plan.width, plan.height)
    if (!clipped) continue
    if (result.left === clipped.left && result.top === clipped.top
      && (result.width ?? clipped.width) === clipped.width && (result.height ?? clipped.height) === clipped.height) {
      overlays.push({ input: result.input, left: result.left, top: result.top })
    } else {
      const cut = await sharp(result.input).extract({ left: clipped.left - result.left, top: clipped.top - result.top,
        width: clipped.width, height: clipped.height }).png().toBuffer()
      overlays.push({ input: cut, left: clipped.left, top: clipped.top })
    }
  }
  return sharp({ create: { width: plan.width, height: plan.height, channels: 4, background: plan.backgroundColor } })
    .composite(overlays).ensureAlpha().raw().toBuffer()
}

module.exports = { renderOfflineFrame, validateFramePlan }
