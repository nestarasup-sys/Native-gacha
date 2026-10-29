import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Roteiros mantém catálogo/persistência separados do editor do projeto', async () => {
  const [page, workspace, defaults] = await Promise.all([
    readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/roteiros/RoteiroWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/roteiros/roteiroDefaults.ts', 'utf8')
  ])

  assert.match(page, /import \{ RoteiroWorkspace \} from '\.\/RoteiroWorkspace'/)
  assert.match(page, /if \(openedRoteiro\) return <RoteiroWorkspace/)
  assert.doesNotMatch(page, /function RoteiroWorkspace\(/)
  assert.match(page, /registerPendingWriteFlusher\(flushRoteirosWrites\)/)
  assert.match(page, /const flushRoteirosWrites =/)

  assert.match(workspace, /export function RoteiroWorkspace\(/)
  assert.match(workspace, /onDeleteDraftVideo/)
  assert.match(workspace, /exportRoteiroAssets/)
  assert.doesNotMatch(workspace, /saveRoteiros\(/)

  assert.match(page, /emptyRoteiroContent/)
  assert.match(workspace, /emptyRoteiroContent/)
  assert.match(defaults, /timeline: 'unspecified'/)
})
