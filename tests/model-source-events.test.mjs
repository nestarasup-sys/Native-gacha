import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { broadcastModelSourceUpdate, subscribeModelSourceUpdate } from '../src/renderer/src/features/fabricator/models/modelSourceEvents.ts'
import { appendModelSourceGuideLine, createModelSourceGuideLine, emptyModelSourceGuideSet, modelSourceGuideLinesForPart } from '../src/renderer/src/features/fabricator/models/modelSourceGuides.ts'

test('Model Source anuncia apenas o slot alterado e não atinge outros modelos',()=>{
  const bus=new EventTarget()
  const a=[],b=[]
  const unA=subscribeModelSourceUpdate(1, update=>a.push(update),bus)
  const unB=subscribeModelSourceUpdate(2, update=>b.push(update),bus)
  broadcastModelSourceUpdate({slot:1,sourceAssetName:'source-new.png'},bus)
  assert.deepEqual(a,[{slot:1,sourceAssetName:'source-new.png'}])
  assert.deepEqual(b,[])
  unA();unB()
  broadcastModelSourceUpdate({slot:1,sourceAssetName:'source-next.png'},bus)
  assert.equal(a.length,1)
})
test('Model Source rejeita slot inválido antes de emitir evento',()=>{
  const bus=new EventTarget();let count=0
  bus.addEventListener('fabricator:model-source:updated',()=>count++)
  assert.throws(()=>broadcastModelSourceUpdate({slot:0,sourceAssetName:'a'},bus),/Slot/)
  assert.equal(count,0)
})

test('guias aceitam traços úteis e descartam movimentos abaixo do mínimo', () => {
  const start = { x: 2, y: 4 }
  assert.equal(createModelSourceGuideLine(start, { x: 3, y: 4 }, 'short'), null)
  assert.deepEqual(createModelSourceGuideLine(start, { x: 5, y: 4 }, 'valid'), {
    id: 'valid', start, end: { x: 5, y: 4 }
  })
})

test('guias encadeiam somente dentro da mesma peça e somem ao trocar de peça', () => {
  const first = createModelSourceGuideLine({ x: 0, y: 0 }, { x: 8, y: 0 }, 'first')
  const second = createModelSourceGuideLine({ x: 8, y: 0 }, { x: 8, y: 9 }, 'second')
  assert.ok(first && second)
  const existing = appendModelSourceGuideLine(emptyModelSourceGuideSet('arm'), 'arm', first)
  const connected = appendModelSourceGuideLine(existing, 'arm', second)
  assert.deepEqual(connected.lines.map(line => line.id), ['first', 'second'])
  const otherPart = appendModelSourceGuideLine(connected, 'leg', { ...second, id: 'leg-line' })
  assert.deepEqual(otherPart.lines.map(line => line.id), ['leg-line'])
  assert.deepEqual(modelSourceGuideLinesForPart(otherPart, 'arm'), [])
  assert.deepEqual(modelSourceGuideLinesForPart(otherPart, 'leg'), otherPart.lines)
})

test('Model Source delega o ciclo das guias ao hook da feature', async () => {
  const [editor, hook] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/ModelSourceEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/useModelSourceGuides.ts', import.meta.url), 'utf8')
  ])
  assert.match(editor, /useModelSourceGuides\(/)
  assert.doesNotMatch(editor, /const guideDrag =|const startGuide =|const finishGuide =/)
  assert.match(editor, /clearGuideStroke\(\)/)
  assert.match(hook, /capturePointer\(pointerId\)/)
  assert.match(hook, /releasePointer\(event\.pointerId\)/)
  assert.match(hook, /modelSourceGuideLinesForPart\(guides, selectedId\)/)
})

test('Model Source isola o rascunho, o undo e o ciclo das edições temporárias', async () => {
  const [editor, draft] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/ModelSourceEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/useModelSourceDraft.ts', import.meta.url), 'utf8')
  ])

  assert.match(editor, /useModelSourceDraft\(/)
  assert.doesNotMatch(editor, /const undoStack =|const pixelEditAbort =|const runMutation =|const runPixelEdit =/)
  assert.match(draft, /\.slice\(-8\)/, 'mantém o limite de oito snapshots')
  assert.match(draft, /validateModelSourceDimensions\(draft, dimensions\)/)
  assert.match(draft, /pixelEditAbort\.current\?\.abort\(\)/)
  assert.match(draft, /if \(pixelEditAbort\.current === controller\) pixelEditAbort\.current = null/)
  assert.match(draft, /setDimensions\(\{\}\)/)
  assert.doesNotMatch(draft, /window\.desktop|localStorage|saveFabricatorProject/)
})
