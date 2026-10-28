import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectOriginalModelSource, selectMountedModelSource, projectForOriginalPreview } from '../src/shared/fabricatorModelViews.ts'
import { normalizeLayerOrder } from '../src/shared/modelRig.ts'
import { bindWardrobeComponent, mapWardrobeComponentToPose, wardrobePosePadding } from '../src/shared/wardrobePose.ts'

const png = name => 'data:image/png;base64,' + name
const model = () => ({
  schemaVersion: 1, slot: 1, name: 'Teste original/montagem', width: 400, height: 450,
  sourceName: 'bruto.png', sourceAssetName: 'source-a.png',
  sourceDataUrl: png('RAW-NAO-EDITADO'), tolerance: 55, updatedAt: '2026-10-22T19:00:00Z',
  joints: [], layerOrder: ['arm-left', 'body', 'arm-right'], hiddenPartIds: [],
  parts: [
    { id: 'arm-left', name: 'Braço esquerdo', x: 124, y: 120, width: 90, height: 120, rotation: -28, dataUrl: png('LEFT-EDITED'),
      sourceTransform: { x: 10, y: 26, width: 55, height: 93, rotation: 0 }},
    { id: 'body', name: 'Tronco', x: 145, y: 110, width: 95, height: 160, rotation: 0, dataUrl: png('BODY-EDITED'),
      sourceTransform: { x: 130, y: 35, width: 95, height: 160, rotation: 0 }},
    { id: 'arm-right', name: 'Braço direito', x: 210, y: 120, width: 62, height: 116, rotation: 38, dataUrl: png('RIGHT-EDITED'),
      sourceTransform: { x: 285, y: 29, width: 59, height: 96, rotation: 0 }}
  ]
})
const garment = (id, boneId, x, y, width, height, rotation = 0) => ({
  id, name: id, attachedPartId: boneId, category: 'manga-superior',
  x, y, width, height, rotation, dataUrl: png('GARMENT-' + id)
})
const almost = (a,b) => assert.ok(Math.abs(a-b) < 0.00001, String(a) + ' != ' + String(b))
function transformedPoint(mapping, dx, dy) {
  const [a,b,c,d] = mapping.matrix.slice(7,-1).split(',').map(Number)
  const angle = mapping.localRotation * Math.PI / 180
  const x = mapping.localLeft + mapping.renderWidth/2 + dx*Math.cos(angle)-dy*Math.sin(angle)
  const y = mapping.localTop + mapping.renderHeight/2 + dx*Math.sin(angle)+dy*Math.cos(angle)
  return {x:mapping.origin.x+a*x+c*y,y:mapping.origin.y+b*x+d*y}
}
function independentlyProjectedPoint(original, source, pose, dx, dy) {
  const radians = Math.PI / 180
  const old = source.sourceTransform
  const cx = original.x + original.width/2 - (old.x+old.width/2)
  const cy = original.y + original.height/2 - (old.y+old.height/2)
  const bx = cx*Math.cos(-old.rotation*radians)-cy*Math.sin(-old.rotation*radians)
  const by = cx*Math.sin(-old.rotation*radians)+cy*Math.cos(-old.rotation*radians)
  const garmentRotation = (original.rotation-old.rotation)*radians
  const lx = bx + dx*Math.cos(garmentRotation)-dy*Math.sin(garmentRotation)
  const ly = by + dx*Math.sin(garmentRotation)+dy*Math.cos(garmentRotation)
  const sx=pose.width/old.width, sy=pose.height/old.height, r=pose.rotation*radians
  return {x:pose.x+pose.width/2+Math.cos(r)*sx*lx-Math.sin(r)*sy*ly,
    y:pose.y+pose.height/2+Math.sin(r)*sx*lx+Math.cos(r)*sy*ly}
}

test('Roupas DEV e Customizador leem o MESMO PNG editado por ID, sem recortar a folha importada', () => {
  const saved = model()
  const source = selectOriginalModelSource(saved)
  const mounted = selectMountedModelSource(saved)
  const left = source.parts.find(part => part.id === 'arm-left')
  const right = source.parts.find(part => part.id === 'arm-right')
  assert.deepEqual([left.x,left.y,left.width,left.height], [10,26,55,93])
  assert.equal(left.dataUrl,png('LEFT-EDITED'))
  assert.equal(right.dataUrl,png('RIGHT-EDITED'))
  assert.notEqual(left.dataUrl,saved.sourceDataUrl)
  assert.deepEqual([mounted.parts[0].x,mounted.parts[0].rotation],[124,-28])
  const newer = {...saved, sourceAssetName:'source-b.png', parts:saved.parts.map(part =>
    part.id==='arm-left' ? {...part,dataUrl:png('LEFT-AFTER-EDIT')} : part)}
  const newSource = selectOriginalModelSource(newer)
  assert.equal(newSource.parts.find(part=>part.id==='arm-left').dataUrl,png('LEFT-AFTER-EDIT'))
  assert.equal(newSource.parts.find(part=>part.id==='arm-right').dataUrl,png('RIGHT-EDITED'))
  assert.equal(selectOriginalModelSource(saved).parts[0].dataUrl,png('LEFT-EDITED'))
  assert.deepEqual(projectForOriginalPreview(saved).parts.map(p=>p.id),saved.parts.map(p=>p.id))
})

test('mangas preservam lados e ajustes nas poses mesmo se a montagem mudar a ordem espacial', () => {
  const saved=model()
  const original = structuredClone(saved)
  const sleeves=[
    garment('manga-esquerda','arm-left',2,44,60,85,14),
    garment('manga-direita','arm-right',283,39,63,93,-17)
  ]
  const poses=[
    saved.parts.map(part=>({...part})),
    saved.parts.map(part=>({...part,x:part.id==='arm-left'?330:part.id==='arm-right'?12:155,
      y:part.y+30, width:part.width*(part.id==='arm-left'?1.4:0.8),
      height:part.height*(part.id==='arm-left'?0.75:1.3),
      rotation:part.rotation+(part.id==='arm-left'?92:-54)}))
  ]
  for(const poseParts of poses) for(const sleeve of sleeves) {
    const sourceBone=saved.parts.find(p=>p.id===sleeve.attachedPartId)
    const poseBone=poseParts.find(p=>p.id===sleeve.attachedPartId)
    const mapped=mapWardrobeComponentToPose({...sleeve,binding:bindWardrobeComponent(sleeve,sourceBone)},sourceBone,poseBone)
    for(const corner of [[0,0],[-sleeve.width/2,-sleeve.height/2],[sleeve.width/2,sleeve.height/2]]) {
      const actual=transformedPoint(mapped,...corner)
      const expected=independentlyProjectedPoint(sleeve,sourceBone,poseBone,...corner)
      almost(actual.x,expected.x);almost(actual.y,expected.y)
    }
  }
  assert.deepEqual(saved,original,'renderizações nunca reescrevem o modelo, PNGs ou encaixes')
})

test('mudanças na folha original atualizam a transformação sem reaproveitar binding geométrico antigo', () => {
  const saved=model(), source=saved.parts[0]
  const sleeve=garment('esquerda','arm-left',12,42,57,71)
  const bound={...sleeve,binding:bindWardrobeComponent(sleeve,source)}
  const modified={...source,sourceTransform:{...source.sourceTransform,x:18,y:32,width:66,height:100}}
  const pose={...source,x:210,y:180,width:120,height:83,rotation:71}
  const current=mapWardrobeComponentToPose(sleeve,modified,pose)
  const stale=mapWardrobeComponentToPose(bound,modified,pose)
  for(const pt of [[0,0],[-25,-20],[25,20]]) {
    const actual=transformedPoint(stale,...pt), expected=transformedPoint(current,...pt)
    almost(actual.x,expected.x);almost(actual.y,expected.y)
  }
  assert.equal(bound.binding.boneWidth,55)
  assert.equal(modified.sourceTransform.width,66)
})

test('prévia de poses e renderizador compartilham a ordem completa mesmo com parte oculta', async () => {
  const saved=model()
  const order=normalizeLayerOrder(saved.parts,['arm-left','body'])
  assert.deepEqual(order,['arm-left','body','arm-right'])
  const hidden=new Set(['arm-left'])
  const visible=order.filter(id=>!hidden.has(id))
  assert.deepEqual(visible,['body','arm-right'])
  assert.equal(order.indexOf('body'),1,'membro oculto ainda conta na ordem de sobreposição')
  assert.equal(order.indexOf('arm-right'),2)
  const preview=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  const customizer=await readFile('src/renderer/src/characters/characterWardrobeRenderer.ts','utf8')
  assert.match(preview,/previewPoseOrder = testPose \? normalizeLayerOrder/)
  assert.match(preview,/previewPoseOrder\.indexOf\(part\.id\)/)
  assert.match(preview,/previewPoseOrder\.indexOf\(component\.attachedPartId\)/)
  assert.match(customizer,/const bodyOrder = normalizeLayerOrder\(artwork\.parts, artwork\.layerOrder\)/)
})

test('encaixe utiliza fonte original persistida, não pixels recortados por ordem de detecção', async () => {
  const editor=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  assert.match(editor,/selectOriginalModelSource\(model\)/)
  assert.match(editor,/imageDataUrl: part\.dataUrl/)
  assert.match(editor,/projectForOriginalPreview\(model\)/)
  assert.doesNotMatch(editor,/imageProcessor\.worker\.ts/)
  assert.doesNotMatch(editor,/withSourceFrame\(/)
  assert.match(editor,/mapWardrobeComponentToPose\(testComponent, modelBone, poseBone/)
  assert.match(editor,/useModelSourceRefresh\(modelSlot, fresh => setModel\(fresh\)\)/)
})

test('costuras não são ampliadas quando outras categorias de roupa são equipadas', () => {
  const sleeve=garment('manga','arm-left',8,42,59,87)
  const source=model().parts[0]
  const posed={...source,rotation:35,width:110,height:64}
  const entire=[sleeve,{...garment('coxa','body',140,45,80,50),category:'calca-coxa'},
    {...garment('canela','arm-right',282,80,55,40),category:'calca-canela'}]
  const pad=wardrobePosePadding(sleeve,entire)
  assert.deepEqual(pad,{kneeOverlap:0,edgePadding:0})
  const mapped=mapWardrobeComponentToPose(sleeve,source,posed,pad.kneeOverlap,pad.edgePadding)
  almost(mapped.renderWidth*mapped.scaleX, sleeve.width*(posed.width/source.sourceTransform.width))
  almost(mapped.renderHeight*mapped.scaleY, sleeve.height*(posed.height/source.sourceTransform.height))
})
