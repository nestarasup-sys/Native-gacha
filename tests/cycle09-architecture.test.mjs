import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as sharedExpressions from '../src/renderer/src/characters/studioExpressionTransforms.ts'
import * as legacyExpressions from '../src/renderer/src/features/studio/expressionTransforms.ts'

test('a API de expressões preserva identidade por reexport, sem mudar a geometria', () => {
  for (const name of ['buildStudioExpressionAppearance','buildStudioExpressionTransforms',
    'resolveStudioExpressionBase','studioExpressionCollection','transferExpressionTransform']) {
    assert.equal(legacyExpressions[name], sharedExpressions[name], name)
  }
})
test('roteamento carrega Roteiros como feature e não mantém regras da página no shell', async () => {
  const [shell,page]=await Promise.all([
    readFile('src/renderer/src/ui/App.tsx','utf8'),
    readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx','utf8')
  ])
  assert.match(shell,/lazy\(async \(\) => \(\{ default: \(await import\('\.\.\/features\/roteiros\/RoteirosPage'\)\)\.RoteirosPage \}\)\)/)
  assert.match(shell,/<LazyRoteirosPage\s*\/>/)
  assert.doesNotMatch(shell,/window\.desktop|RoteiroSectionEditor|const roteiroAreas/)
  assert.match(page,/export function RoteirosPage\(/)
  assert.doesNotMatch(page,/import\(['"]\.\.\/studio\/expressionTransforms['"]\)/)
})
test('editor reconstruído não importa páginas completas; oráculo export ainda usa renderizador Gacha compartilhado', async () => {
  const [app,video,portrait,oracle]=await Promise.all([
    readFile('src/renderer/src/ui/App.tsx','utf8'),
    readFile('src/renderer/src/features/videoStudioRebuild/VideoStudioRebuildPage.tsx','utf8'),
    readFile('src/renderer/src/ui/components/RenderedCharacterPortrait.tsx','utf8'),
    readFile('src/renderer/src/features/videoStudio/VideoPreviewOraclePage.tsx','utf8')
  ])
  assert.match(app,/features\/videoStudioRebuild\/VideoStudioRebuildPage/)
  for(const source of [video,portrait,oracle]) {
    assert.doesNotMatch(source,/import\(['"][^'"]*CustomizerPage['"]\)/)
  }
  assert.match(video,/VideoStudioFrameEngine/)
  assert.match(video,/GachaGpuStage/)
  assert.match(portrait,/characters\/characterRenderer/)
  assert.match(oracle,/videoCharacterFrameRenderer/)
})
