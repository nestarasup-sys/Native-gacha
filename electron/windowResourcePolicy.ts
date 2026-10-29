import type { Session } from 'electron'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type RendererResourcePolicy = {
  html: string
  devUrl?: string
  allowedSchemes?: readonly string[]
}

/** Restrict a renderer session to app files, its dev server, and explicit app schemes. */
export function restrictRendererResources(target: Pick<Session, 'webRequest'>, policy: RendererResourcePolicy): void {
  const rendererRoot = resolve(dirname(policy.html))
  const devOrigin = policy.devUrl ? new URL(policy.devUrl).origin : undefined
  const allowedSchemes = new Set((policy.allowedSchemes ?? []).map((scheme) => scheme.replace(/:$/, '').toLowerCase()))

  target.webRequest.onBeforeRequest((request, callback) => {
    let allowed = false
    try {
      const url = new URL(request.url)
      if (url.protocol === 'data:' || url.protocol === 'blob:') allowed = ['image', 'font', 'media'].includes(request.resourceType)
      else if (allowedSchemes.has(url.protocol.slice(0, -1).toLowerCase())) allowed = true
      else if (devOrigin) allowed = url.origin === devOrigin
      else if (url.protocol === 'file:') {
        const requestedPath = resolve(fileURLToPath(url))
        const pathFromRenderer = relative(rendererRoot, requestedPath)
        allowed = pathFromRenderer !== '..' && !pathFromRenderer.startsWith(`..${sep}`) && pathFromRenderer !== ''
      }
    } catch {
      // Invalid or unsupported URLs are denied.
    }
    callback({ cancel: !allowed })
  })
}
