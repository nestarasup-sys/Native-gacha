import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('CSS de Roteiros e Base de Vídeos pertence às folhas de suas features ou ao componente compartilhado', async () => {
  const [page, baseVideosPage, sectionEditor, featureCss, baseVideosCss, sharedCss, globalCss] = await Promise.all([
    readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/baseVideos/BaseVideosPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/roteiros/RoteiroSectionEditor.tsx', 'utf8'),
    readFile('src/renderer/src/features/roteiros/roteiros.css', 'utf8'),
    readFile('src/renderer/src/features/baseVideos/baseVideos.css', 'utf8'),
    readFile('src/renderer/src/ui/components/videoEditorialFields.css', 'utf8'),
    readFile('src/renderer/src/ui/styles.css', 'utf8')
  ])

  assert.match(page, /import '\.\/roteiros\.css'/)
  assert.match(baseVideosPage, /import '\.\.\/\.\.\/ui\/components\/videoEditorialFields\.css'/)
  assert.match(sectionEditor, /import '\.\.\/\.\.\/ui\/components\/videoEditorialFields\.css'/)
  assert.match(baseVideosPage, /import '\.\/baseVideos\.css'/)
  const selectors = [
    '.roteiros-layout', '.roteiros-sidebar-empty', '.roteiros-subnav', '.roteiros-subnav-button',
    '.roteiros-main-empty', '.roteiros-area-titlebar', '.roteiros-title-content', '.roteiros-title-actions'
  ]
  for (const selector of selectors) {
    assert.ok(featureCss.includes(selector), `${selector} deve ficar na folha da feature.`)
    assert.ok(!globalCss.includes(selector), `${selector} não deve voltar à folha global.`)
  }
  assert.match(sharedCss, /\.roteiro-video-stage/)
  assert.match(sharedCss, /\.roteiro-video-placeholder/)
  assert.match(sharedCss, /\.roteiro-scene-settings/)
  assert.doesNotMatch(featureCss, /\.roteiro-video-placeholder/)
  assert.match(featureCss, /\.roteiro-video-picker-modal/)
  assert.match(baseVideosCss, /\.base-video-confirm-modal/)
  assert.doesNotMatch(globalCss, /\.(?:base-videos?|roteiros?)-[\w-]+/)
})
