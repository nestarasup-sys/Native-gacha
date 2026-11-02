import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canVisibleRendererRequestFullscreen,
  createRendererTrustPolicy,
  isTrustedRendererFrame,
  isTrustedRendererUrl
} from '../../electron/application/rendererTrust.ts'

test('development renderer trusts only the configured loopback origin', () => {
  const policy = createRendererTrustPolicy('http://127.0.0.1:5173/app?mode=dev', '/app/index.html')

  assert.equal(isTrustedRendererUrl('http://127.0.0.1:5173/other-route', policy), true)
  assert.equal(isTrustedRendererUrl('http://127.0.0.1:5174/app', policy), false)
  assert.equal(isTrustedRendererUrl('https://127.0.0.1:5173/app', policy), false)
  assert.equal(isTrustedRendererUrl('http://localhost:5173/app', policy), false)
  assert.equal(isTrustedRendererUrl('https://example.com/app', policy), false)
})

test('development policy rejects remote origins, credentials and invalid URLs', () => {
  for (const url of [
    'https://example.com',
    'http://127.0.0.1:5173@evil.example',
    'http://user:password@127.0.0.1:5173',
    'file:///app/index.html',
    'not a URL'
  ]) {
    assert.throws(() => createRendererTrustPolicy(url, '/app/index.html'), /ELECTRON_RENDERER_URL/)
  }

  assert.deepEqual(createRendererTrustPolicy(undefined, '/app/index.html'), {
    kind: 'file',
    rendererPath: resolve('/app/index.html')
  })
})

test('packaged renderer trusts only the exact configured HTML file', () => {
  const rendererPath = resolve('build path', 'index.html')
  const rendererUrl = pathToFileURL(rendererPath).href
  const policy = createRendererTrustPolicy(undefined, rendererPath)

  assert.equal(isTrustedRendererUrl(rendererUrl, policy), true)
  assert.equal(isTrustedRendererUrl(pathToFileURL(`${rendererPath}.backup`).href, policy), false)
  assert.equal(isTrustedRendererUrl('https://127.0.0.1:5173/index.html', policy), false)
  assert.equal(isTrustedRendererUrl('file:///invalid%zz', policy), false)
})

test('IPC trust rejects subframes even when their URL has an allowed origin', () => {
  const policy = createRendererTrustPolicy('http://localhost:5173', '/app/index.html')

  assert.equal(isTrustedRendererFrame('http://localhost:5173/', true, policy), true)
  assert.equal(isTrustedRendererFrame('http://localhost:5173/embedded', false, policy), false)
  assert.equal(isTrustedRendererFrame('https://example.com/', true, policy), false)
})

test('fullscreen requires a visible main frame and trusted request and current URLs', () => {
  const policy = createRendererTrustPolicy('http://localhost:5173', '/app/index.html')
  const trustedUrl = 'http://localhost:5173/'

  assert.equal(canVisibleRendererRequestFullscreen(true, true, trustedUrl, trustedUrl, policy), true)
  assert.equal(canVisibleRendererRequestFullscreen(false, true, trustedUrl, trustedUrl, policy), false)
  assert.equal(canVisibleRendererRequestFullscreen(true, false, trustedUrl, trustedUrl, policy), false)
  assert.equal(canVisibleRendererRequestFullscreen(true, true, 'https://evil.example', trustedUrl, policy), false)
  assert.equal(canVisibleRendererRequestFullscreen(true, true, trustedUrl, 'https://evil.example', policy), false)
})
