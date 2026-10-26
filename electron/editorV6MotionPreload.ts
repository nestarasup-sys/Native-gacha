import { contextBridge, ipcRenderer } from 'electron'
import { createFabricatorInvoker } from '../src/shared/fabricatorIpcChannels'
import { editorV6MotionChannels, type EditorV6MotionBridge } from '../src/shared/editorV6Motion'
const invoke = createFabricatorInvoker(ipcRenderer)
const bridge: EditorV6MotionBridge = {
  payload: () => ipcRenderer.invoke(editorV6MotionChannels.payload),
  complete: (result, error) => ipcRenderer.invoke(editorV6MotionChannels.complete, result, error),
  provider: {
    loadFabricatorSlot: (slot) => invoke('loadFabricatorSlot', slot),
    loadFabricatorPose: (slot, pose) => invoke('loadFabricatorPose', slot, pose),
    loadHairStyle: (slot, id) => invoke('loadHairStyle', slot, id),
    loadWardrobeSet: (slot, id) => invoke('loadWardrobeSet', slot, id),
    loadFaceSet: (slot, id) => ipcRenderer.invoke('fabricator:face:load', slot, id),
    listFaceCatalog: (slot) => ipcRenderer.invoke('fabricator:face-catalog:list', slot),
    loadFaceCatalogItem: (slot, id) => ipcRenderer.invoke('fabricator:face-catalog:load', slot, id),
    listFaceExpressionPresets: (slot) => ipcRenderer.invoke('fabricator:expression-presets:list', slot),
    loadFaceExpressionPreset: (slot, id) => ipcRenderer.invoke('fabricator:expression-presets:load', slot, id),
    listFaceComponentAssets: (slot, kind) => invoke('listFaceComponentAssets', slot, kind),
    loadFaceComponentAsset: (slot, id) => invoke('loadFaceComponentAsset', slot, id)
  }
}
contextBridge.exposeInMainWorld('editorV6MotionWorker', bridge)
