import { BrowserWindow } from 'electron'
import type { EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { restrictRendererNavigation } from '../../windowNavigation'
import { restrictRendererPermissions } from '../../windowPermissions'
import { restrictRendererResources } from '../../windowResourcePolicy'
import { createEditorV6WorkerMediaProtocolHandler, hasEditorV6WorkerMedia, type EditorV6WorkerAssetSources } from './exportWorkerMediaProtocol'
import { EDITOR_V6_PAINT_TOKEN_SIZE } from './exportFrameCapture'

export type EditorV6WorkerWindowDependencies = {
  html: string
  preload: string
  devUrl?: string
  mediaPath?: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
  resolveLibraryAsset?: (assetId: string) => Promise<{ path: string; mimeType: string }>
}

/** Creates and locks down the isolated offscreen window used by one export worker. */
export function createEditorV6WorkerWindow(payload: EditorV6WorkerPayload, deps: EditorV6WorkerWindowDependencies, assetSources?: EditorV6WorkerAssetSources): BrowserWindow {
  const layeredVideo = payload.layeredVideo
  const window = new BrowserWindow({ show: false, useContentSize: true, width: payload.width, height: payload.height + EDITOR_V6_PAINT_TOKEN_SIZE, enableLargerThanScreen: true, frame: false, transparent: layeredVideo, ...(layeredVideo ? { backgroundColor: '#00000000' } : {}),
    webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, partition: `editor-v6-export-${crypto.randomUUID()}` } })
  const session = window.webContents.session
  const hasWorkerMedia = hasEditorV6WorkerMedia({ payload, mediaPath: deps.mediaPath, resolveLibraryAsset: deps.resolveLibraryAsset, assetSources })
  let mediaProtocolRegistered = false
  if (hasWorkerMedia) {
    session.protocol.handle('gacha-editor-media', createEditorV6WorkerMediaProtocolHandler({
      payload, mediaPath: deps.mediaPath, resolveLibraryAsset: deps.resolveLibraryAsset, assetSources
    }))
    mediaProtocolRegistered = true
  }
  window.once('closed', () => {
    if (!mediaProtocolRegistered) return
    mediaProtocolRegistered = false
    session.protocol.unhandle('gacha-editor-media')
  })
  restrictRendererNavigation(window.webContents)
  restrictRendererPermissions(window.webContents.session)
  window.removeMenu()
  // Initial native bounds can be clamped to the monitor work area on Windows.
  window.setContentSize(payload.width, payload.height + EDITOR_V6_PAINT_TOKEN_SIZE)
  window.webContents.setFrameRate(60)
  restrictRendererResources(window.webContents.session, {
    html: deps.html,
    devUrl: deps.devUrl,
    allowedSchemes: hasWorkerMedia ? ['gacha-editor-media'] : []
  })
  return window
}
