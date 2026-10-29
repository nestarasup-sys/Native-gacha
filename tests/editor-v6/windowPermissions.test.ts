import { describe, expect, it } from 'vitest'
import type { Session, WebContents } from 'electron'
import { restrictRendererPermissions } from '../../electron/windowPermissions'

type CheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
type RequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>

describe('renderer permission policy', () => {
  it('allows fullscreen only when the app explicitly approves its visible main frame', () => {
    let checkHandler: CheckHandler | undefined
    let requestHandler: RequestHandler | undefined
    const appContents = {} as WebContents
    const session = {
      setPermissionCheckHandler: (handler: CheckHandler | null) => { checkHandler = handler ?? undefined },
      setPermissionRequestHandler: (handler: RequestHandler | null) => { requestHandler = handler ?? undefined }
    }
    restrictRendererPermissions(session, {
      canRequestFullscreen: ({ webContents, requestingUrl, isMainFrame }) =>
        webContents === appContents && isMainFrame && requestingUrl === 'file://app/index.html'
    })

    const permissions: Parameters<CheckHandler>[1][] = [
      'fullscreen', 'media', 'display-capture', 'geolocation', 'notifications', 'clipboard-read', 'openExternal'
    ]
    for (const permission of permissions) {
      expect(checkHandler?.(appContents, permission, 'file://app/index.html', {
        requestingUrl: 'file://app/index.html', isMainFrame: true
      } as Parameters<CheckHandler>[3]))
        .toBe(permission === 'fullscreen')
      let granted: boolean | undefined
      requestHandler?.(appContents, permission, (value) => { granted = value }, {
        requestingUrl: 'file://app/index.html', isMainFrame: true
      } as Parameters<RequestHandler>[3])
      expect(granted).toBe(permission === 'fullscreen')
    }
  })

  it('denies every permission by default', () => {
    let checkHandler: CheckHandler | undefined
    let requestHandler: RequestHandler | undefined
    const session = {
      setPermissionCheckHandler: (handler: CheckHandler | null) => { checkHandler = handler ?? undefined },
      setPermissionRequestHandler: (handler: RequestHandler | null) => { requestHandler = handler ?? undefined }
    }
    restrictRendererPermissions(session)

    for (const permission of ['fullscreen', 'media', 'geolocation']) {
      expect(checkHandler?.(null, permission, 'file://app/index.html', {
        requestingUrl: 'file://app/index.html', isMainFrame: true
      } as Parameters<CheckHandler>[3])).toBe(false)
      let granted: boolean | undefined
      requestHandler?.({} as Parameters<RequestHandler>[0], permission, (value) => { granted = value }, {
        requestingUrl: 'file://app/index.html', isMainFrame: false
      } as Parameters<RequestHandler>[3])
      expect(granted).toBe(false)
    }
  })

  it('passes main-frame and requesting URL details to the fullscreen policy', () => {
    let requestHandler: RequestHandler | undefined
    const appContents = {} as WebContents
    const session = {
      setPermissionCheckHandler: (_handler: CheckHandler | null) => undefined,
      setPermissionRequestHandler: (handler: RequestHandler | null) => { requestHandler = handler ?? undefined }
    }
    restrictRendererPermissions(session, {
      canRequestFullscreen: ({ webContents, requestingUrl, isMainFrame }) =>
        webContents === appContents && requestingUrl === 'file://app/index.html' && isMainFrame
    })

    const request = (isMainFrame: boolean, requestingUrl: string) => {
      let granted: boolean | undefined
      requestHandler?.(appContents, 'fullscreen', (value) => { granted = value }, {
        requestingUrl, isMainFrame
      } as Parameters<RequestHandler>[3])
      return granted
    }

    expect(request(false, 'file://app/index.html')).toBe(false)
    expect(request(true, 'https://attacker.example')).toBe(false)
    expect(request(true, 'file://app/index.html')).toBe(true)
  })
})
