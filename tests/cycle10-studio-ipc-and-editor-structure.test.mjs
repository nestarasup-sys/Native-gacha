import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { studioIpcChannels, createStudioInvoker } from '../src/shared/studioIpcChannels.ts'

test('oito canais do Studio permanecem únicos e compatíveis com legado', () => {
  assert.deepEqual(studioIpcChannels,{
    flushPendingWrites:'app:flush-pending-writes',
    listStudios:'studio:list',saveStudio:'studio:save',deleteStudio:'studio:delete',
    getStudioFolder:'studio:folder',importStudioImage:'studio:import-image',
    saveStudioPrint:'studio:save-print',openStudioPrints:'studio:open-prints'
  })
  assert.equal(new Set(Object.values(studioIpcChannels)).size,8)
})
test('invocador Studio respeita a correspondência de métodos e argumentos',async()=>{
  const calls=[]
  const invoke=createStudioInvoker({invoke:async (...args)=>{calls.push(args);return args.length}})
  assert.equal(await invoke('saveStudio',{id:'scene-id'}),2)
  assert.equal(await invoke('saveStudioPrint','id','data:image/png;base64,AA=='),3)
  assert.equal(await invoke('getStudioFolder'),1)
  assert.deepEqual(calls,[
    ['studio:save',{id:'scene-id'}],
    ['studio:save-print','id','data:image/png;base64,AA=='],
    ['studio:folder']
  ])
})
test('preload e handlers do Studio não duplicam strings IPC fora do contrato',async()=>{
  const [preload,main,domain]=await Promise.all([
    readFile('electron/preload.ts','utf8'),
    readFile('electron/main.ts','utf8'),
    readFile('electron/domains/studio/primaryIpc.ts','utf8')
  ])
  assert.match(preload,/createStudioInvoker/)
  assert.match(preload,/invokeStudio\('saveStudio'/)
  assert.match(main,/studioIpcChannels\.flushPendingWrites/)
  assert.match(domain,/studioIpcChannels\.deleteStudio/)
  assert.match(domain,/studioIpcChannels\.saveStudio/)
  assert.match(domain,/studioIpcChannels\.listStudios/)
})
test('Roteiros e Customizador mantêm UI separada dos componentes centrais',async()=>{
  const [page,editor,customizer,roster]=await Promise.all([
    readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx','utf8'),
    readFile('src/renderer/src/features/roteiros/RoteiroSectionEditor.tsx','utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerCharacterRoster.ts','utf8')
  ])
  assert.doesNotMatch(page,/function RoteiroSectionEditor/)
  assert.match(editor,/export function RoteiroSectionEditor/)
  assert.match(page,/from '\.\/RoteiroSectionEditor'/)
  assert.match(customizer,/useCustomizerCharacterRoster\(\)/)
  assert.doesNotMatch(customizer,/window\.desktop\.listCustomizerCharacters\(\)/)
  assert.match(roster,/window\.desktop\.listCustomizerCharacters\(\)/)
})
