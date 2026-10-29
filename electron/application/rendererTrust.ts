import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type RendererTrustPolicy =
  | { kind: 'dev'; origin: string }
  | { kind: 'file'; rendererPath: string }

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLoopback(hostname: string): boolean {
  return loopbackHosts.has(hostname.toLowerCase())
}

/** Allows the development server only on loopback; packaged builds always trust one local HTML file. */
export function createRendererTrustPolicy(devUrl: string | undefined, rendererPath: string): RendererTrustPolicy {
  if (!devUrl) return { kind: 'file', rendererPath: resolve(rendererPath) }

  let url: URL
  try { url = new URL(devUrl) }
  catch { throw new Error('ELECTRON_RENDERER_URL precisa apontar para o servidor local do aplicativo.') }
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopback(url.hostname) || url.username || url.password) {
    throw new Error('ELECTRON_RENDERER_URL só pode usar HTTP(S) em localhost ou loopback, sem credenciais.')
  }
  return { kind: 'dev', origin: url.origin }
}

/** Confirms IPC came from the configured renderer origin or exact packaged entry file. */
export function isTrustedRendererUrl(senderUrl: string, policy: RendererTrustPolicy): boolean {
  try {
    const url = new URL(senderUrl)
    if (policy.kind === 'dev') return url.origin === policy.origin
    return url.protocol === 'file:' && resolve(fileURLToPath(url)) === policy.rendererPath
  } catch {
    return false
  }
}

export function isTrustedRendererFrame(senderUrl: string, isMainFrame: boolean, policy: RendererTrustPolicy): boolean {
  return isMainFrame && isTrustedRendererUrl(senderUrl, policy)
}

export function canVisibleRendererRequestFullscreen(
  isMainFrame: boolean,
  isVisible: boolean,
  requestingUrl: string,
  currentUrl: string,
  policy: RendererTrustPolicy
): boolean {
  return isMainFrame && isVisible
    && isTrustedRendererUrl(requestingUrl, policy)
    && isTrustedRendererUrl(currentUrl, policy)
}
