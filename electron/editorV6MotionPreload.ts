import { contextBridge, ipcRenderer } from 'electron'
import { editorV6MotionChannels, type EditorV6MotionBridge } from '../src/shared/editorV6Motion'
// Keep this sandboxed preload self-contained. Shared runtime imports make Rollup
// emit require(./chunks/...), which Chromium sandboxed preloads cannot load.
const bridge: EditorV6MotionBridge = {
  payload: () => ipcRenderer.invoke(editorV6MotionChannels.payload),
  complete: (result, error) => ipcRenderer.invoke(editorV6MotionChannels.complete, result, error),
  provider: {
    loadFabricatorSlot: (slot) => ipcRenderer.invoke('fabricator:load-slot', slot),
    loadFabricatorPose: (slot, pose) => ipcRenderer.invoke('fabricator:poses:load', slot, pose),
    loadHairStyle: (slot, id) => ipcRenderer.invoke('fabricator:hair:styles:load', slot, id),
    loadWardrobeSet: (slot, id) => ipcRenderer.invoke('fabricator:wardrobe:load', slot, id),
    loadFaceSet: (slot, id) => ipcRenderer.invoke('fabricator:face:load', slot, id),
    listFaceCatalog: (slot) => ipcRenderer.invoke('fabricator:face-catalog:list', slot),
    loadFaceCatalogItem: (slot, id) => ipcRenderer.invoke('fabricator:face-catalog:load', slot, id),
    listFaceExpressionPresets: (slot) => ipcRenderer.invoke('fabricator:expression-presets:list', slot),
    loadFaceExpressionPreset: (slot, id) => ipcRenderer.invoke('fabricator:expression-presets:load', slot, id),
    listFaceComponentAssets: (slot, kind) => ipcRenderer.invoke('fabricator:face-components:list', slot, kind),
    loadFaceComponentAsset: (slot, id) => ipcRenderer.invoke('fabricator:face-components:load', slot, id)
  }
}
contextBridge.exposeInMainWorld('editorV6MotionWorker', bridge)
