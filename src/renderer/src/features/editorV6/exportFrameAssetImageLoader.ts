type RenderAsset = { id: string; name: string; dataUrl: string }
const MAX_CONCURRENT_IMAGE_DECODES = 4

/** Preloads only the currently selected render assets into a bounded worker-local decode cache. */
export function createEditorV6ExportFrameAssetImageLoader(images: Map<string, Promise<void>>) {
  const prepareImage = async (asset: RenderAsset) => {
    let prepared = images.get(asset.id)
    if (!prepared) {
      prepared = new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onerror = () => reject(Error(`Não foi possível preparar ${asset.name}.`))
        image.onload = () => {
          void image.decode().then(() => {
            resolve()
          }, () => reject(Error(`Não foi possível decodificar ${asset.name}.`)))
        }
        image.src = asset.dataUrl
      })
      if (images.size >= 32) images.delete(images.keys().next().value!)
      images.set(asset.id, prepared)
    } else {
      // Map insertion order is the worker-local LRU order.
      images.delete(asset.id)
      images.set(asset.id, prepared)
    }
    try { await prepared }
    catch (error) {
      // A failed decode must not poison later attempts for this asset.
      if (images.get(asset.id) === prepared) images.delete(asset.id)
      throw error
    }
  }

  const prepare = async (assets: readonly RenderAsset[]) => {
    for (let index = 0; index < assets.length; index += MAX_CONCURRENT_IMAGE_DECODES) {
      const results = await Promise.allSettled(assets.slice(index, index + MAX_CONCURRENT_IMAGE_DECODES).map(prepareImage))
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    }
  }

  return { prepare }
}
