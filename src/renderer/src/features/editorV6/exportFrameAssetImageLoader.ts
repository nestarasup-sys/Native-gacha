type RenderAsset = { id: string; name: string; dataUrl: string }
export type EditorV6AssetDecodeDiagnostic = { index: number; state: 'loading' | 'decoding' | 'waiting-cache' | 'ready' | 'failed'; mime: string; bytes: number }
const MAX_CONCURRENT_IMAGE_DECODES = 4

/** Preloads only the currently selected render assets into a bounded worker-local decode cache. */
export function createEditorV6ExportFrameAssetImageLoader(
  images: Map<string, Promise<void>>,
  onDiagnostic?: (status: EditorV6AssetDecodeDiagnostic) => void
) {
  const prepareImage = async (asset: RenderAsset, index: number) => {
    const diagnostic: EditorV6AssetDecodeDiagnostic = {
      index, state: 'waiting-cache',
      mime: /^data:([^;,]+)/.exec(asset.dataUrl)?.[1] ?? /^([a-z][a-z\d+.-]*):/i.exec(asset.dataUrl)?.[1] ?? 'unknown',
      bytes: asset.dataUrl.length
    }
    const report = (state: EditorV6AssetDecodeDiagnostic['state']) => {
      diagnostic.state = state
      onDiagnostic?.({ ...diagnostic })
    }
    let prepared = images.get(asset.id)
    if (!prepared) {
      prepared = new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onerror = () => { report('failed'); reject(Error(`Não foi possível preparar ${asset.name}.`)) }
        image.onload = () => {
          report('decoding')
          void image.decode().then(() => {
            report('ready')
            resolve()
          }, () => { report('failed'); reject(Error(`Não foi possível decodificar ${asset.name}.`)) })
        }
        report('loading')
        // The worker's scoped media protocol requires CORS mode. The hair and
        // native renderers already set this before loading the same URLs.
        if (asset.dataUrl.startsWith('gacha-editor-media://')) image.crossOrigin = 'anonymous'
        image.src = asset.dataUrl
      })
      if (images.size >= 32) images.delete(images.keys().next().value!)
      images.set(asset.id, prepared)
    } else {
      report('waiting-cache')
      // Map insertion order is the worker-local LRU order.
      images.delete(asset.id)
      images.set(asset.id, prepared)
    }
    try { await prepared; report('ready') }
    catch (error) {
      // A failed decode must not poison later attempts for this asset.
      if (images.get(asset.id) === prepared) images.delete(asset.id)
      throw error
    }
  }

  const prepare = async (assets: readonly RenderAsset[]) => {
    for (let index = 0; index < assets.length; index += MAX_CONCURRENT_IMAGE_DECODES) {
      const batch = assets.slice(index, index + MAX_CONCURRENT_IMAGE_DECODES)
      const results = await Promise.allSettled(batch.map((asset, batchIndex) => prepareImage(asset, index + batchIndex)))
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    }
  }

  return { prepare }
}
