import { describe, expect, it } from 'vitest'
import type { Session } from 'electron'
import { restrictRendererPermissions } from '../../electron/windowPermissions'

type CheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
type RequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>

describe('renderer permission policy', () => {
  it('allows fullscreen and denies other checks and requests', () => {
    let checkHandler: CheckHandler | undefined
    let requestHandler: RequestHandler | undefined
    const session = {
      setPermissionCheckHandler: (handler: CheckHandler | null) => { checkHandler = handler ?? undefined },
      setPermissionRequestHandler: (handler: RequestHandler | null) => { requestHandler = handler ?? undefined }
    }
    restrictRendererPermissions(session)

    const permissions: Parameters<CheckHandler>[1][] = [
      'fullscreen', 'media', 'display-capture', 'geolocation', 'notifications', 'clipboard-read', 'openExternal'
    ]
    for (const permission of permissions) {
      expect(checkHandler?.(null, permission, 'file://app/index.html', {} as Parameters<CheckHandler>[3]))
        .toBe(permission === 'fullscreen')
      let granted: boolean | undefined
      requestHandler?.({} as Parameters<RequestHandler>[0], permission, (value) => { granted = value }, {} as Parameters<RequestHandler>[3])
      expect(granted).toBe(permission === 'fullscreen')
    }
  })
})
