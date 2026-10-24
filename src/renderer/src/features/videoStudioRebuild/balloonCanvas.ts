import type { StudioElement } from '../../../../shared/studio'

const WIDTH=512
const HEIGHT=256

/** The V1 text clip's authored state wins. This is an intentionally small
 * on-demand GPU balloon fallback; legacy/export pixel parity is not claimed. */
export function previewBalloonKey(element: StudioElement): string {
  return JSON.stringify([element.kind,element.text,element.speakerName,
    element.speakerColor,element.timelineColor])
}

export function createPreviewBalloonCanvas(element: StudioElement): HTMLCanvasElement {
  if(element.kind!=='speech'&&element.kind!=='thought')
    throw new Error('Balão requer uma camada de fala ou pensamento.')
  const canvas=document.createElement('canvas')
  canvas.width=WIDTH;canvas.height=HEIGHT
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Canvas de balão indisponível.')
  const thought=element.kind==='thought'
  const color=/^#[0-9a-f]{6}$/i.test(element.speakerColor??'')?element.speakerColor!:'#f2f5fd'
  ctx.fillStyle=color
  ctx.strokeStyle='#1b2538'
  ctx.lineWidth=5
  ctx.beginPath()
  ctx.roundRect(8,8,WIDTH-16,HEIGHT-16,thought?70:26)
  ctx.fill();ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(20,20,WIDTH-40,HEIGHT-40,thought?60:18)
  ctx.clip()
  ctx.font='600 30px system-ui, sans-serif'
  ctx.textBaseline='top'
  ctx.fillStyle='#111827'
  const text=element.text??''
  const lines:string[]=[]
  for(const paragraph of text.split(/\r?\n/)) {
    let line=''
    for(const word of paragraph.split(/\s+/)) {
      const attempt=line?line+' '+word:word
      if(line&&ctx.measureText(attempt).width>WIDTH-70) {
        lines.push(line);line=word
      } else line=attempt
    }
    lines.push(line)
  }
  lines.slice(0,6).forEach((line,index)=>ctx.fillText(line,34,24+index*37,WIDTH-68))
  ctx.restore()
  return canvas
}
