'use strict'
/** Gera material sintético e reprodutível para screenshot E2E do Fabricador.
 * Os componentes são PNGs reais, criados num sandbox separado do perfil do usuário.
 */
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

async function writePng(filename, width, height, rgba) {
  fs.mkdirSync(path.dirname(filename), {recursive:true})
  const pixel=Buffer.alloc(width*height*4)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4
    const on = x>1 && y>1 && x<width-2 && y<height-2
    pixel[i]=rgba[0]; pixel[i+1]=rgba[1]; pixel[i+2]=rgba[2]; pixel[i+3]=on?rgba[3]:0
  }
  fs.writeFileSync(filename,await sharp(pixel,{raw:{width,height,channels:4}}).png().toBuffer())
}
function writeJson(filename,data){fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(data,null,2))}
const T='2026-10-22T12:00:00.000Z'
async function createCompleteCharacterFixture(root){
  const base=path.join(root,'fabricator')
  const model=path.join(base,'models','slot-1')
  const manifest={
    schemaVersion:1,slot:1,name:'Boneco sintético de regressão',sourceName:'fixture-source.png',
    sourceAssetName:'source-aaaa1111.png',sourceFile:'source-aaaa1111.png',
    width:256,height:384,tolerance:74,updatedAt:T,
    joints:[],layerOrder:['body','head'],hiddenPartIds:[],
    parts:[
      {id:'body',name:'Corpo',x:74,y:118,width:110,height:230,rotation:0,
       sourceTransform:{x:20,y:126,width:110,height:230,rotation:0}},
      {id:'head',name:'Cabeça',x:90,y:20,width:76,height:100,rotation:0,
       sourceTransform:{x:158,y:28,width:76,height:100,rotation:0}}
    ]
  }
  writeJson(path.join(model,'project.json'),manifest)
  await writePng(path.join(model,'source-aaaa1111.png'),256,384,[65,200,120,255])
  await writePng(path.join(model,'parts','body.png'),110,230,[87,130,207,255])
  await writePng(path.join(model,'parts','head.png'),76,100,[241,185,151,255])
  const pose=path.join(base,'poses','model-1','slot-1')
  writeJson(path.join(pose,'pose.json'),{
    schemaVersion:1,slot:1,name:'Parado, com cabelo e roupa',sourceModelSlot:1,
    sourceModelName:manifest.name,sourceModelUpdatedAt:T,width:256,height:384,
    category:'Parado',parts:manifest.parts.map(({sourceTransform,...part})=>part),
    joints:[],layerOrder:['body','head'],hiddenPartIds:[],updatedAt:T
  })
  await writePng(path.join(pose,'parts','body.png'),110,230,[87,130,207,255])
  await writePng(path.join(pose,'parts','head.png'),76,100,[241,185,151,255])
  const outfit=path.join(base,'wardrobe','model-1','set-uniform')
  const sourceBone = manifest.parts[0].sourceTransform
  const fitBinding = part => ({
    version: 1, boneId: 'body', boneWidth: sourceBone.width, boneHeight: sourceBone.height,
    boneRotation: sourceBone.rotation,
    localCenterX: (part.x + part.width / 2 - sourceBone.x - sourceBone.width / 2) / sourceBone.width,
    localCenterY: (part.y + part.height / 2 - sourceBone.y - sourceBone.height / 2) / sourceBone.height,
    widthRatio: part.width / sourceBone.width, heightRatio: part.height / sourceBone.height,
    relativeRotation: part.rotation - sourceBone.rotation
  })
  // Encaixes deliberadamente movidos nos dois eixos em relação ao recorte;
  // o Customizador deve usar estes X/Y, não um posicionamento automático.
  const fittedClothes = [
    {id:'coat',name:'Casaco',category:'camisa',attachedPartId:'body',
      x:68,y:141,width:110,height:135,rotation:0},
    {id:'sleeve-left',name:'Manga superior esquerda',category:'manga-superior',attachedPartId:'body',
      x:45,y:154,width:38,height:102,originWidth:32,originHeight:95,rotation:0},
    {id:'sleeve-right',name:'Manga superior direita',category:'manga-superior',attachedPartId:'body',
      x:161,y:131,width:25,height:120,originWidth:32,originHeight:95,rotation:0}
  ].map(part => ({...part,binding:fitBinding(part)}))
  writeJson(path.join(outfit,'wardrobe.json'),{
    schemaVersion:1,edition:1,id:'uniform',modelSlot:1,modelName:manifest.name,
    name:'Jaqueta de teste',width:256,height:384,updatedAt:T,
    components:fittedClothes
  })
  await writePng(path.join(outfit,'parts','coat.png'),110,135,[212,82,115,255])
  await writePng(path.join(outfit,'parts','sleeve-left.png'),32,95,[42,174,207,255])
  await writePng(path.join(outfit,'parts','sleeve-right.png'),32,95,[237,177,60,255])
  const hair=path.join(base,'hair','model-1','styles','style-short')
  writeJson(path.join(hair,'hair-style.json'),{
    schemaVersion:1,id:'short',modelSlot:1,name:'Cabelo de teste',
    front:{width:82,height:36},back:{width:88,height:42},fringe:null,
    transforms:{
      front:{x:90,y:18,scaleX:1,scaleY:1,rotation:0},
      back:{x:88,y:12,scaleX:1,scaleY:1,rotation:0}
    },createdAt:T,updatedAt:T
  })
  await writePng(path.join(hair,'images','front.png'),82,36,[60,40,105,255])
  await writePng(path.join(hair,'images','back.png'),88,42,[54,31,89,255])
  const eye=path.join(base,'face-components','model-1','item-eyesL')
  writeJson(path.join(eye,'asset.json'),{
    schemaVersion:1,id:'eyesL',modelSlot:1,kind:'eye',name:'Olho azul',
    width:18,height:10,defaultTransform:{x:104,y:65,scaleX:1,scaleY:1,rotation:0},updatedAt:T
  })
  await writePng(path.join(eye,'asset.png'),18,10,[41,104,196,255])
  const eyebrow=path.join(base,'face-components','model-1','item-browL')
  writeJson(path.join(eyebrow,'asset.json'),{
    schemaVersion:1,id:'browL',modelSlot:1,kind:'eyebrow',name:'Sobrancelha expressiva',
    width:26,height:7,defaultTransform:{x:100,y:56,scaleX:1,scaleY:1,rotation:0},updatedAt:T
  })
  await writePng(path.join(eyebrow,'asset.png'),26,7,[66,29,81,255])
  const expression=path.join(base,'expression-presets','model-1','preset-smile.json')
  writeJson(expression,{
    schemaVersion:1,id:'smile',modelSlot:1,name:'Expressão sorridente',
    selections:{
      eyes:{left:'eyesL',right:null},pupils:{left:null,right:null},
      eyebrows:{left:'browL',right:null},nose:null,mouth:null
    },
    transforms:{},noseOpacity:1,updatedAt:T
  })
  return {model,pose,outfit,hair,eye,eyebrow,expression}
}
module.exports={createCompleteCharacterFixture}
