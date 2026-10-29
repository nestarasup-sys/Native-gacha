import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildAnimatorRigDiagnostics } from '../src/renderer/src/features/fabricator/models/animatorRigDiagnostics.ts'

const part = (id, name) => ({ id, name, x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: '' })

test('AnimatorWorkspace delegates rig diagnostics and stabilizes frame projections', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', 'utf8')
  assert.match(page, /const rigProject = useMemo\(/)
  assert.match(page, /const displayProject = useMemo\(/)
  assert.match(page, /const dirtyFrame = useMemo\(/)
  assert.match(page, /buildAnimatorRigDiagnostics\(rigProject\)/)
  assert.doesNotMatch(page, /rigProject\.parts\.find\(\(part\) => part\.id === joint\./)
})

test('diagnósticos preservam juntas, nomes, órfãos e ordem dos dados do rig', () => {
  const project = {
    parts: [part('head', 'Cabeça'), part('torso', 'Tronco'), part('arm', 'Braço'), part('unused', 'Peça solta')],
    joints: [
      { id: 'joint-1', parentPartId: 'torso', childPartId: 'head', fixed: true },
      { id: 'joint-2', parentPartId: 'arm', childPartId: 'missing', fixed: false }
    ]
  }

  assert.deepEqual(buildAnimatorRigDiagnostics(project), [
    { id: 'joint-1', parent: 'Tronco', child: 'Cabeça', fixed: true, exists: true },
    { id: 'joint-2', parent: 'Braço', child: 'Peça ausente', fixed: false, exists: false },
    { id: 'unused', parent: '—', child: 'Peça solta', fixed: false, exists: true }
  ])
})

test('sem projeto carregado, o painel não recebe diagnósticos antigos', () => {
  assert.deepEqual(buildAnimatorRigDiagnostics(null), [])
})

test('IDs duplicados preservam a primeira peça como a busca original', () => {
  const project = {
    parts: [part('head', 'Cabeça original'), part('head', 'Cabeça repetida')],
    joints: [{ id: 'joint', parentPartId: 'head', childPartId: 'head' }]
  }
  assert.deepEqual(buildAnimatorRigDiagnostics(project), [
    { id: 'joint', parent: 'Cabeça original', child: 'Cabeça original', fixed: undefined, exists: true }
  ])
})
