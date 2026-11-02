import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const componentUrl = new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeTestPosePicker.tsx', import.meta.url)
const pageUrl = new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url)

test('seletor mantém o diálogo acessível e a instrução de que a pose salva não muda', async () => {
  const component = await readFile(componentUrl, 'utf8')

  assert.match(component, /role="dialog" aria-modal="true" aria-labelledby="wardrobe-test-picker-title"/)
  assert.match(component, /Escolha uma pose/)
  assert.match(component, /A roupa será exibida sobre uma cópia visual da pose\. A pose salva não será modificada\./)
})

test('lista mantém numeração, resumo da pose, data local e bloqueio durante carregamento', async () => {
  const component = await readFile(componentUrl, 'utf8')

  assert.match(component, /String\(pose\.slot\)\.padStart\(2, '0'\)/)
  assert.match(component, /pose\.partCount} peças · .*pose\.updatedAt.*toLocaleDateString\('pt-BR'\)/)
  assert.match(component, /disabled=\{loading\}/)
  assert.match(component, /onClick=\{\(\) => onSelect\(pose\.slot\)\}/)
  assert.match(component, /Carregando poses…/)
  assert.match(component, /Este modelo ainda não tem poses salvas\./)
})

test('fechar pelo fundo ou botão delega o cancelamento para a página', async () => {
  const component = await readFile(componentUrl, 'utf8')
  const page = await readFile(pageUrl, 'utf8')

  assert.match(component, /event\.target === event\.currentTarget\) onClose\(\)/)
  assert.match(component, /button onClick=\{onClose\} aria-label="Fechar"/)
  assert.match(page, /const closeTestPosePicker = testPoseCommands\.closePicker/)
  assert.match(page, /const loadTestPose = \(slot: number\) => testPoseCommands\.loadPose\(modelSlot, slot\)/)
  assert.match(page, /<WardrobeTestPosePicker poses=\{testPoseSlots\} loading=\{testPoseLoading\} onClose=\{closeTestPosePicker\} onSelect=\{\(slot\) => void loadTestPose\(slot\)\} \/>/)
})
