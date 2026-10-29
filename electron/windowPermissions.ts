import type { Session } from 'electron'

/** Restrict renderer permissions; fullscreen stays available only to visible app windows. */
export function restrictRendererPermissions(
  target: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  options: { allowFullscreen?: boolean } = {}
): void {
  const isAllowed = (permission: string) => options.allowFullscreen !== false && permission === 'fullscreen'
  target.setPermissionCheckHandler((_contents, permission) => isAllowed(permission))
  target.setPermissionRequestHandler((_contents, permission, callback) => callback(isAllowed(permission)))
}
