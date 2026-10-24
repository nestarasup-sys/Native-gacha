import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { recordStudioHistory, undoStudioHistory, redoStudioHistory, STUDIO_HISTORY_LIMIT } from '../src/shared/studioHistory.ts'
const base={schemaVersion:1,id:'test',backgroundColor:'#fff',backgroundAssetId:null,backgroundX:0,backgroundY:0,backgroundWidth:100,backgroundHeight:100,backgroundRotation:0,assets:[],elements:[],updatedAt:'2026-01-01T00:00:00Z'}
test('history engine reproduz undo/redo e descarta redo depois de nova edição',()=>{
 const old={...base,backgroundX:1}
 const now={...base,backgroundX:2}
 let history=recordStudioHistory({undo:[],redo:[]},old)
 const undone=undoStudioHistory(history,now)
 assert.ok(undone)
 assert.equal(undone.document.backgroundX,1)
 assert.equal(now.backgroundX,2)
 const redone=redoStudioHistory(undone.history,undone.document)
 assert.equal(redone?.document.backgroundX,2)
 history=recordStudioHistory(undone.history,{...base,backgroundX:5})
 assert.equal(history.redo.length,0)
})
test('histórico fica limitado a 30 snapshots mesmo em edições sucessivas',()=>{
 let h={undo:[],redo:[]}
 for(let i=0;i<80;i++)h=recordStudioHistory(h,{...base,backgroundX:i})
 assert.equal(h.undo.length,STUDIO_HISTORY_LIMIT)
 assert.equal(h.undo[0].backgroundX,50)
})
test('todos editores usam o resolvedor compartilhado sem dependência de páginas',async()=>{
 const [renderer,resolver,studio,video,transition]=await Promise.all([
 readFile('src/renderer/src/characters/characterRenderer.ts','utf8'),
 readFile('src/renderer/src/characters/characterSourceResolver.ts','utf8'),
 readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
 readFile('src/renderer/src/features/videoStudioRebuild/VideoStudioRebuildPage.tsx','utf8'),
 readFile('src/renderer/src/features/videoStudio/transitionRenderer.ts','utf8')
 ])
 assert.match(renderer,/await resolveSavedCharacterSource\(character, renderSource\)/)
 assert.match(resolver,/export async function resolveSavedCharacterSource/)
 assert.match(resolver,/loadFabricatorPose/)
 assert.match(resolver,/loadFabricatorSlot/)
 assert.match(resolver,/applyCharacterBodyShape/)
 assert.match(studio,/studioSceneModel/)
 assert.match(video,/VideoStudioFrameEngine/)
 assert.match(video,/GachaGpuStage/)
 assert.doesNotMatch(video,/from ['\"][^'\"]*\/(?:VideoStudioEditor|CustomizerPage)(?:\.tsx)?['\"]/)
 assert.match(transition,/characterRenderer/)
 assert.doesNotMatch(resolver,/\.\.\/features\/|CustomizerPage|StudioPage/)
})

test('Video Studio não importa mais runtime do Customizador e pages não contêm comandos de save',async()=>{
 const [transitions,baseline,customizer,studio,commands]=await Promise.all([
 readFile('src/renderer/src/features/videoStudio/transitionRenderer.ts','utf8'),
 readFile('scripts/architecture/boundaries-baseline.json','utf8'),
 readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
 readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
 readFile('src/renderer/src/features/customizer/useCustomizerCharacterCommands.ts','utf8')
 ])
 assert.doesNotMatch(transitions,/import\(['"]\.\.\/customizer\//)
 assert.match(transitions,/from '\.\.\/\.\.\/characters\/characterRenderer'/)
 assert.equal(JSON.parse(baseline).crossFeatureRuntimeImports['videoStudio -> customizer'],0)
 assert.match(customizer,/useCustomizerCharacterCommands\(/)
 assert.doesNotMatch(customizer,/function saveCharacterCustomization\(/)
 assert.match(commands,/function saveCharacterCustomization\(/)
 assert.match(studio,/undoStudioHistory\(/)
})

test('sandbox DEV AI configura appData dentro do perfil validado para migração',async()=>{
 const main=await readFile('electron/main.ts','utf8')
 assert.match(main,/marker\.syntheticOnly !== true/)
 assert.match(main,/app\.setPath\('appData', sandbox\)/)
 assert.match(main,/app\.setPath\('appData', privateRoot\)/)
 assert.match(main,/Root sintético DEV AI fora do diretório autorizado/)
})
