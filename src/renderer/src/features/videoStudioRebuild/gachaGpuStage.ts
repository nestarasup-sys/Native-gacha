import { videoStageRect } from '../../../../shared/videoStageGeometry'
import type { StudioElement } from '../../../../shared/studio'

export type GachaGpuLayer = Readonly<{
  /** Stable identity, e.g. body, wardrobe, hair, eye-L, pupil-R or mouth. */
  textureId: string
  source: TexImageSource
  element: Pick<StudioElement, 'x'|'y'|'width'|'height'|'rotation'|'flipX'>
  opacity?: number
  /** Video textures need fresh pixels each frame without allocating a new texture. */
  dynamic?: boolean
}>
type CachedTexture = { texture: WebGLTexture; bytes: number; lastUsed: number }

/** WebGL2 textured layers with persistent GPU resources and finite LRU.
 * This first runtime can draw existing authored snapshots; the dedicated
 * Gacha catalog-to-sprite compiler still needs real normal/PT golden tests.
 */
export class GachaGpuStage {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vertices: WebGLBuffer
  private readonly textures = new Map<string, CachedTexture>()
  private tick = 0
  private bytes = 0
  private closed = false
  private lost = false
  private readonly onLost = (event: Event) => { event.preventDefault(); this.lost = true; this.textures.clear(); this.bytes = 0 }
  private readonly onRestored = () => { this.lost = false; this.textures.clear(); this.bytes = 0 }

  constructor(private readonly canvas: HTMLCanvasElement, readonly maxTextureBytes = 96 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxTextureBytes) || maxTextureBytes < 4) throw new RangeError('Orçamento GPU inválido.')
    const gl = canvas.getContext('webgl2', { alpha: false, premultipliedAlpha: true, antialias: false })
    if (!gl) throw new Error('WebGL2 indisponível no Windows; o motor GPU não iniciou.')
    this.gl = gl
    const shader = (type: number, source: string) => {
      const sh = gl.createShader(type)
      if (!sh) throw new Error('Shader GPU indisponível.')
      gl.shaderSource(sh, source); gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'Shader inválido.')
      return sh
    }
    const vertex = shader(gl.VERTEX_SHADER, [
      '#version 300 es', 'in vec2 a_pos; out vec2 v_uv;',
      'uniform vec2 u_center; uniform vec2 u_size; uniform float u_angle; uniform float u_flip;',
      'void main() {',
      'float c=cos(u_angle),s=sin(u_angle); vec2 xy=a_pos*u_size;',
      'vec2 pixel=u_center+vec2(c*xy.x-s*xy.y,s*xy.x+c*xy.y);',
      'gl_Position=vec4(pixel.x*2.0/1920.0-1.0,1.0-pixel.y*2.0/1080.0,0.0,1.0);',
      'v_uv=vec2((a_pos.x+.5)*u_flip+(u_flip<0.0?1.0:0.0),.5-a_pos.y);',
      '}'
    ].join('\n'))
    const fragment = shader(gl.FRAGMENT_SHADER, [
      '#version 300 es','precision mediump float; in vec2 v_uv; out vec4 outColor;',
      'uniform sampler2D u_tex; uniform float u_opacity;',
      'void main(){outColor=texture(u_tex,v_uv)*u_opacity;}'
    ].join('\n'))
    const program=gl.createProgram()
    if (!program) throw new Error('Programa GPU indisponível.')
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program)
    gl.deleteShader(vertex);gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Programa inválido.')
    this.program=program
    const vertices=gl.createBuffer()
    if (!vertices) throw new Error('Buffer GPU indisponível.')
    this.vertices=vertices
    gl.bindBuffer(gl.ARRAY_BUFFER,vertices)
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,.5,.5]),gl.STATIC_DRAW)
    canvas.addEventListener('webglcontextlost',this.onLost)
    canvas.addEventListener('webglcontextrestored',this.onRestored)
  }

  private clearTextures(): void {
    if (!this.lost) for (const entry of this.textures.values()) this.gl.deleteTexture(entry.texture)
    this.textures.clear();this.bytes=0
  }

  private texture(id: string, source: TexImageSource): WebGLTexture {
    const cached=this.textures.get(id)
    if (cached) {
      cached.lastUsed=++this.tick
      return cached.texture
    }
    const dim=source as {videoWidth?:number;naturalWidth?:number;width?:number;videoHeight?:number;naturalHeight?:number;height?:number}
    const bytes=Number(dim.videoWidth||dim.naturalWidth||dim.width)*Number(dim.videoHeight||dim.naturalHeight||dim.height)*4
    if (!Number.isSafeInteger(bytes)||bytes<4||bytes>this.maxTextureBytes) throw new Error('Textura Gacha acima do orçamento.')
    const gl=this.gl
    while (this.bytes+bytes>this.maxTextureBytes && this.textures.size) {
      const [key,entry]=[...this.textures.entries()].sort((a,b)=>a[1].lastUsed-b[1].lastUsed)[0]
      gl.deleteTexture(entry.texture);this.textures.delete(key);this.bytes-=entry.bytes
    }
    const texture=gl.createTexture()
    if (!texture) throw new Error('Alocação de textura GPU falhou.')
    gl.bindTexture(gl.TEXTURE_2D,texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    try {gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source)}
    catch(error){gl.deleteTexture(texture);throw error}
    this.textures.set(id,{texture,bytes,lastUsed:++this.tick});this.bytes+=bytes
    return texture
  }

  draw(layers:readonly GachaGpuLayer[],backgroundColor='#000000'):void {
    if (this.closed||this.lost) return
    const gl=this.gl
    gl.viewport(0,0,this.canvas.width,this.canvas.height)
    const hex=/^#([0-9a-f]{6})$/i.exec(backgroundColor)?.[1]??'000000'
    gl.clearColor(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255,1)
    gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices)
    const attr=gl.getAttribLocation(this.program,'a_pos')
    gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0)
    gl.uniform1i(gl.getUniformLocation(this.program,'u_tex'),0)
    for (const layer of layers) {
      const e=layer.element
      const rect=videoStageRect(e.x,e.y,e.width,e.height)
      gl.activeTexture(gl.TEXTURE0)
      const texture=this.texture(layer.textureId,layer.source)
      gl.bindTexture(gl.TEXTURE_2D,texture)
      if(layer.dynamic) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,layer.source)
      gl.uniform2f(gl.getUniformLocation(this.program,'u_center'),rect.centerX,rect.centerY)
      gl.uniform2f(gl.getUniformLocation(this.program,'u_size'),rect.width,rect.height)
      gl.uniform1f(gl.getUniformLocation(this.program,'u_angle'),e.rotation*Math.PI/180)
      gl.uniform1f(gl.getUniformLocation(this.program,'u_flip'),e.flipX?-1:1)
      gl.uniform1f(gl.getUniformLocation(this.program,'u_opacity'),layer.opacity??1)
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
    }
  }

  stats(){return {backend:'webgl2' as const,textureCount:this.textures.size,retainedEstimatedBytes:this.bytes,capBytes:this.maxTextureBytes}}

  dispose():void {
    if(this.closed)return
    this.closed=true
    this.canvas.removeEventListener('webglcontextlost',this.onLost)
    this.canvas.removeEventListener('webglcontextrestored',this.onRestored)
    this.clearTextures();this.gl.deleteBuffer(this.vertices);this.gl.deleteProgram(this.program)
  }
}
