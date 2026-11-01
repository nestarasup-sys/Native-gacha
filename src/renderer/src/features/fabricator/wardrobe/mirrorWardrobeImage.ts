/** Creates a horizontally mirrored PNG without resampling or changing its dimensions. */
export async function mirrorWardrobeImageDataUrl(dataUrl: string): Promise<string> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('A imagem editada da roupa está vazia.')

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Não foi possível espelhar a imagem da peça duplicada.')

  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < Math.floor(pixels.width / 2); x++) {
      const left = (y * pixels.width + x) * 4
      const right = (y * pixels.width + pixels.width - 1 - x) * 4
      for (let channel = 0; channel < 4; channel++) {
        const pixel = pixels.data[left + channel]
        pixels.data[left + channel] = pixels.data[right + channel]
        pixels.data[right + channel] = pixel
      }
    }
  }
  context.putImageData(pixels, 0, 0)
  const mirroredDataUrl = canvas.toDataURL('image/png')
  canvas.width = canvas.height = 1
  return mirroredDataUrl
}
