import { describe, expect, it } from 'vitest'
import type { Session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { restrictRendererResources } from '../../electron/windowResourcePolicy'

type RequestListener = NonNullable<Parameters<Session['webRequest']['onBeforeRequest']>[1]>

function policy(html: string, options: { devUrl?: string; allowedSchemes?: string[] } = {}) {
  let listener: RequestListener | null = null
  restrictRendererResources({ webRequest: { onBeforeRequest: (_filter: unknown, callback?: unknown) => {
    // Electron supports both the listener-only and filter-plus-listener overloads.
    listener = (callback ?? _filter) as RequestListener
  } } } as unknown as Pick<Session, 'webRequest'>, { html, ...options })
  return (url: string) => {
    let cancelled: boolean | undefined
    listener?.({ url, resourceType: 'image' } as Parameters<RequestListener>[0], (result) => { cancelled = result.cancel })
    return cancelled
  }
}

describe('renderer resource policy', () => {
  it('allows app files under the packaged renderer directory and rejects adjacent paths', () => {
    const root = join('C:\\native-gacha\\out\\renderer', 'index.html')
    const isCancelled = policy(root)
    expect(isCancelled(pathToFileURL(join('C:\\native-gacha\\out\\renderer', 'assets', 'main.js')).href)).toBe(false)
    expect(isCancelled(pathToFileURL(join('C:\\native-gacha\\out\\renderer-evil', 'main.js')).href)).toBe(true)
    expect(isCancelled('https://example.com/image.png')).toBe(true)
  })

  it('allows only data, blob, the dev server origin, and explicitly registered app schemes', () => {
    const isCancelled = policy('unused.html', { devUrl: 'http://127.0.0.1:5188/', allowedSchemes: ['gacha-editor-media'] })
    expect(isCancelled('data:image/png;base64,AA==')).toBe(false)
    expect(isCancelled('blob:http://127.0.0.1:5188/asset')).toBe(false)
    let cancelled: boolean | undefined
    const session = { webRequest: { onBeforeRequest: (_filter: unknown, callback?: unknown) => {
      const listener = (callback ?? _filter) as RequestListener
      listener({ url: 'data:text/html,untrusted', resourceType: 'subFrame' } as Parameters<RequestListener>[0], (result) => { cancelled = result.cancel })
    } } } as unknown as Pick<Session, 'webRequest'>
    restrictRendererResources(session, { html: 'unused.html' })
    expect(cancelled).toBe(true)
    expect(isCancelled('http://127.0.0.1:5188/src/main.ts')).toBe(false)
    expect(isCancelled('http://localhost:5188/src/main.ts')).toBe(true)
    expect(isCancelled('gacha-editor-media://project/id/file.mp4')).toBe(false)
    expect(isCancelled('gacha-editor-media.evil://project/id/file.mp4')).toBe(true)
    expect(isCancelled('file:///tmp/secret.png')).toBe(true)
  })
})
