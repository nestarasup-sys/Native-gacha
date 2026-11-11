type RenderAsset = { id: string; name: string; dataUrl: string }

/** Preloads only the currently selected render assets into a bounded worker-local decode cache. */
export function createEditorV6ExportFrameAssetImageLoader(images: Map<string, Promise<void>>) {
  const prepare = async (assets: readonly RenderAsset[]) => {
    for (const asset of assets) {
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
      }
      await prepared
    }
  }

  return { prepare }
}
