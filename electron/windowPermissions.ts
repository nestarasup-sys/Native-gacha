import type { Session, WebContents } from 'electron'

export type RendererFullscreenRequest = {
  webContents: WebContents | null
  requestingUrl: string
  isMainFrame: boolean
}

/** Denies renderer permissions by default; fullscreen requires an explicit app-window policy. */
export function restrictRendererPermissions(
  target: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  options: { canRequestFullscreen?: (request: RendererFullscreenRequest) => boolean } = {}
): void {
  const isAllowed = (request: RendererFullscreenRequest, permission: string) =>
    permission === 'fullscreen' && options.canRequestFullscreen?.(request) === true

  target.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => isAllowed({
    webContents,
    requestingUrl: details.requestingUrl ?? requestingOrigin,
    isMainFrame: details.isMainFrame
  }, permission))

  target.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const request = details as Electron.PermissionRequest
    callback(isAllowed({ webContents, requestingUrl: request.requestingUrl, isMainFrame: request.isMainFrame }, permission))
  })
}
