import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
const require=createRequire(import.meta.url)
const {createCompleteCharacterFixture}=require('../scripts/fabricator/complete-character-fixture.cjs')

// Golden independente da implementação Sharp: cores e posições especificadas
// em pixels no fixture, não derivadas de screenshots instáveis do Chromium.
const goldenHash='b852aaf417c33ffcfe95a709532795e6cab8ca21659c02194278cd146dbbe873'
const width=256,height=384
const pixel=(raw,x,y)=>[...raw.subarray((y*width+x)*4,(y*width+x)*4+4)]
test('composição PNG real: corpo, roupa sobre corpo, cabelo sobre rosto e expressão',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'native-character-golden-'))
 t.after(()=>rm(temp,{recursive:true,force:true}))
 const f=await createCompleteCharacterFixture(temp)
 const layers=[
  [join(f.model,'parts','body.png'),74,118],
  [join(f.outfit,'parts','coat.png'),74,130],
  [join(f.hair,'images','back.png'),88,12],
  [join(f.model,'parts','head.png'),90,20],
  [join(f.eye,'asset.png'),104,65],
  [join(f.eyebrow,'asset.png'),100,56],
  [join(f.hair,'images','front.png'),90,18]
 ]
 const png=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite(await Promise.all(layers.map(async([file,left,top])=>({
    input:await readFile(file),left,top
  })))).png().toBuffer()
 const raw=await sharp(png).ensureAlpha().raw().toBuffer()
 assert.equal(raw.length,width*height*4)
 assert.equal(createHash('sha256').update(raw).digest('hex'),goldenHash)
 assert.deepEqual(pixel(raw,80,150),[212,82,115,255],'Casaco desenhado acima do corpo')
 assert.deepEqual(pixel(raw,102,59),[66,29,81,255],'Sobrancelha por cima da pele')
 assert.deepEqual(pixel(raw,115,40),[60,40,105,255],'Cabelo acima da cabeça')
 assert.deepEqual(pixel(raw,120,68),[241,185,151,255],'Rosto original não deve desaparecer')
 assert.deepEqual(pixel(raw,0,0),[0,0,0,0],'Alpha do PNG')
 await writeFile(join(temp,'golden-full-character.png'),png)
})
