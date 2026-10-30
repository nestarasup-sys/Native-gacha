import type { WardrobeAssetSave, WardrobeSet } from '../../../../../shared/fabricator'

/** Every current image must participate, regardless of which editor produced it. */
export function wardrobeSaveAssets(set: WardrobeSet): WardrobeAssetSave[] {
  return set.components.flatMap(component => {
    if (!component.dataUrl) throw new Error(`Imagem ausente na roupa: ${component.name}.`)
    const assets = [{ id: component.id, dataUrl: component.dataUrl }]
    if (component.hasDeformationOriginal) {
      if (!component.deformationOriginalDataUrl) throw new Error(`Imagem original ausente na roupa: ${component.name}. Reabra o conjunto antes de salvar.`)
      assets.push({ id: `${component.id}_deform_original`, dataUrl: component.deformationOriginalDataUrl })
    }
    return assets
  })
}
