import { createBoundedImageCache } from '../../../ui/image/boundedImageCache.ts'

const animatorImageCache = createBoundedImageCache<HTMLImageElement>({
  load: (source) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      image.onload = null
      image.onerror = null
      resolve(image)
    }
    image.onerror = () => {
      image.onload = null
      image.onerror = null
      reject(new Error('Não foi possível carregar uma imagem da animação.'))
    }
    image.src = source
  }),
  estimateValueBytes: (image) => Math.max(1, image.naturalWidth) * Math.max(1, image.naturalHeight) * 4,
  maxEntries: 48,
  maxBytes: 64 * 1024 * 1024
})

export function loadAnimatorImage(source: string): Promise<HTMLImageElement> {
  return animatorImageCache.load(source)
}
