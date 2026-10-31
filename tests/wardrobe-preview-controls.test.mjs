import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Roupas DEV compõe controles da prévia sem transferir estado da tela', async () => {
  const [workspace, controls] = await Promise.all([
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobePreviewControls.tsx', 'utf8')
  ])

  assert.match(workspace, /import \{ WardrobeDeformationBrushControls, WardrobePreviewToolbar \} from '\.\/WardrobePreviewControls'/)
  assert.match(workspace, /<WardrobePreviewToolbar[\s\S]*showToolbar=\{!testPose\}/)
  assert.match(workspace, /deformation=\{\{ active: deformMode/)
  assert.ok(workspace.indexOf('<WardrobeDeformationBrushControls') > workspace.indexOf('<div ref={previewRef}'))
  assert.doesNotMatch(workspace, /wardrobe-preview-controls|wardrobe-warp-controls/)

  for (const label of ['Juntar juntas', 'Separar juntas', 'Restaurar deformação', 'Ímã ligado', 'Centralizar prévia', 'Cor do fundo das prévias', 'Raio do pincel de deformação', 'Força do pincel de deformação']) {
    assert.ok(controls.includes(label), `controle preservado: ${label}`)
  }
  assert.doesNotMatch(controls, /Mover corpo|Repor corpo/)
  assert.match(controls, /min="12" max="280"/)
  assert.match(controls, /min="10" max="100"/)
  assert.match(controls, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/)
  assert.match(controls, /if \(!showToolbar\) return null/)
  assert.match(controls, /if \(!active\) return null/)
  assert.doesNotMatch(controls, /window\.desktop/)
})
