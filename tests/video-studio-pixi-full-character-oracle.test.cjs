'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const esbuild=require('esbuild')
const root=path.resolve(__dirname,'..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
test('full Fabricador Gacha character GPU benchmark bundles with actual compositor dependencies',()=>{
 const entry=path.join(root,'scripts/video-studio/pixi-gacha-full-character-benchmark.entry.ts')
 const bundled=esbuild.buildSync({
  entryPoints:[entry],bundle:true,format:'iife',platform:'browser',target:'es2022',
  write:false,logLevel:'silent',
 })
 assert.equal(bundled.outputFiles.length,1)
 const source=bundled.outputFiles[0].text
 assert.ok(source.length>50000,'actual renderer and PixiJS must be part of browser bundle')
 assert.match(source,/__fullGachaGpuReport/)
 assert.match(source,/prepareSavedCharacterRenderer/)
 assert.match(source,/PixiGachaLayerStack/)
 assert.match(source,/compareGachaPixels/)
 assert.match(source,/PixiGachaVisualGate/)
})
test('fixture runs exact canonical Gacha layers with outfits, front/rear hair, mouth, blink and glasses',()=>{
 const s=read('scripts/video-studio/pixi-gacha-full-character-benchmark.cjs')
 for(const mark of ['createCharacterMediaFixture','loadHairStyle','loadWardrobeSet',
 'oracle-outfit','oracle-hair','renderAboveHair:true','face',
 'front','back','glasses','wardrobeGroups']){
  assert.ok(s.includes(mark),'expected full asset: '+mark)
 }
 const entry=read('scripts/video-studio/pixi-gacha-full-character-benchmark.entry.ts')
 for(const mark of ['prepareSavedCharacterRenderer','renderLayersToCanvas',
 'renderToCanvas','PixiGachaLayerStack','PixiGachaVisualGate',
 "'talk', 'blink'",'eligibleForProduction']){
  assert.ok(entry.includes(mark),'expected oracle operation: '+mark)
 }
 assert.ok(!s.includes('app.disableHardwareAcceleration()'))
})
test('fixture only runs in sandbox and never loads the user project library',()=>{
 const source=read('scripts/video-studio/pixi-gacha-full-character-benchmark.cjs')
 assert.match(source,/fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\)/)
 assert.match(source,/fs\.rmSync\(dir,\{recursive:true,force:true/)
 assert.match(source,/new BrowserWindow\(/)
 assert.doesNotMatch(source,/APPDATA|GACHA_APP_DATA_DIR|realUserProject/)
})
test('real GPU path has safe pixel admission and never silently changes the Studio preview',()=>{
 const surface=read('src/renderer/src/features/videoStudio/pixiGachaLayerSurface.ts')
 const editor=read('src/renderer/src/features/videoStudio/VideoStudioEditor.tsx')
 assert.match(surface,/this\.parityGate\.shouldCheck\(layers\)/)
 assert.match(surface,/this\.parityGate\.verify\(layers, gpuPixels\)/)
 assert.match(surface,/catch \{\s*const exact = await prepared\.renderToCanvas/)
 assert.doesNotMatch(editor,/PixiGachaLayerSurface/)
})
test('legacy compositor avoids extra face canvas allocation until experimental layer mode is requested',()=>{
 const s=read('src/renderer/src/characters/characterRenderer.ts')
 assert.match(s,/let faceLayer: HTMLCanvasElement \| null = null/)
 assert.match(s,/const ensureFaceLayer = \(\) => \{/)
 assert.match(s,/const \{ faceLayer, faceContext \} = ensureFaceLayer\(\)/)
 const legacy =s.slice(s.indexOf('const renderToCanvas = async'))
 assert.ok(!legacy.includes('ensureFaceLayer()'))
 assert.match(legacy,/await paintPreparedFace\(context,/)
})
test('out-of-order Worker replies and canceled timeline seeks cannot repaint old Gacha frames',()=>{
 const source=read('src/renderer/src/features/videoStudio/pixiGachaPoseSurface.ts')
 assert.match(source,/const serial = \+\+this\.poseFrameSerial/)
 assert.match(source,/if \(serial !== this\.poseFrameSerial\)/)
 assert.match(source,/worker\.cancelPending\(new Error/)
 assert.match(source,/this\.poseFrameSerial\+\+/)
})
