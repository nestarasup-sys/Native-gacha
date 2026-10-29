import type { Session } from 'electron'

/** Allow only fullscreen, which the app uses for its character preview. */
export function restrictRendererPermissions(target: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>): void {
  const isAllowed = (permission: string) => permission === 'fullscreen'
  target.setPermissionCheckHandler((_contents, permission) => isAllowed(permission))
  target.setPermissionRequestHandler((_contents, permission, callback) => callback(isAllowed(permission)))
}
