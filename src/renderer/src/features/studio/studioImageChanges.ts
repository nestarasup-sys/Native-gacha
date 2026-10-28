import type { StudioAsset, StudioDocument, StudioElement } from '../../../../shared/studio'

export function addStudioImageAsset(document: StudioDocument, asset: StudioAsset, category: 'background' | 'object', createId: () => string): StudioDocument {
  if (category === 'background') {
    return {
      ...document,
      assets: [...document.assets, asset],
      backgroundAssetId: asset.id,
      backgroundX: 0,
      backgroundY: 0,
      backgroundWidth: 100,
      backgroundHeight: 100,
      backgroundRotation: 0,
      updatedAt: new Date().toISOString()
    }
  }

  const element: StudioElement = {
    id: createId(),
    kind: 'image',
    assetId: asset.id,
    text: '',
    x: 0,
    y: 0,
    width: 25,
    height: 25,
    rotation: 0,
    zIndex: Math.max(0, ...document.elements.map((item) => item.zIndex)) + 1
  }
  return {
    ...document,
    assets: [...document.assets, asset],
    elements: [...document.elements, element],
    updatedAt: new Date().toISOString()
  }
}
