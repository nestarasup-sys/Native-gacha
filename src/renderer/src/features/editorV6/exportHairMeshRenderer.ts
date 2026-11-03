import { createHairMotionMeshPositions, HAIR_MOTION_MESH_COLUMNS, HAIR_MOTION_MESH_HEIGHT, HAIR_MOTION_MESH_ROWS, HAIR_MOTION_MESH_WIDTH } from '../../characters/hairMotionMeshGeometry'
import type { HairMotionSettings, HairMotionState } from '../../../../shared/hairMotionEngine'

type Resources = {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  program: WebGLProgram
  positionBuffer: WebGLBuffer
  uvBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  positions: Float32Array
  indices: number
  textures: WeakMap<HTMLImageElement, WebGLTexture>
  allocatedTextures: WebGLTexture[]
  lost: boolean
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw Error('Não foi possível criar a malha de cabelo para exportação.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const details = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw Error(`Não foi possível compilar a malha de cabelo para exportação${details ? `: ${details}` : '.'}`)
  }
  return shader
}

function createResources(): Resources {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true })
  if (!gl) throw Error('A animação de cabelo precisa de WebGL no renderizador de exportação.')
  const vertex = compileShader(gl, gl.VERTEX_SHADER, 'attribute vec2 position; attribute vec2 uv; varying vec2 tex; void main(){ gl_Position=vec4(position,0.0,1.0); tex=uv; }')
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 tex; uniform sampler2D image; void main(){ gl_FragColor=texture2D(image,tex); }')
  const program = gl.createProgram()
  if (!program) throw Error('Não foi possível criar o programa da malha de cabelo para exportação.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Não foi possível vincular o programa da malha de cabelo para exportação.')
  gl.useProgram(program)

  const columns = HAIR_MOTION_MESH_COLUMNS, rows = HAIR_MOTION_MESH_ROWS, vertexCount = (columns + 1) * (rows + 1)
  const uvs = new Float32Array(vertexCount * 2), indices: number[] = []
  for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
    const index = row * (columns + 1) + column
    uvs[index * 2] = column / columns
    uvs[index * 2 + 1] = 1 - row / rows
    if (row < rows && column < columns) {
      const next = index + columns + 1
      indices.push(index, next, index + 1, index + 1, next, next + 1)
    }
  }
  const positionBuffer = gl.createBuffer(), uvBuffer = gl.createBuffer(), indexBuffer = gl.createBuffer()
  if (!positionBuffer || !uvBuffer || !indexBuffer) throw Error('Não foi possível alocar os recursos da malha de cabelo para exportação.')
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)
  const uvLocation = gl.getAttribLocation(program, 'uv')
  gl.enableVertexAttribArray(uvLocation)
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  const positions = new Float32Array(vertexCount * 2)
  gl.bufferData(gl.ARRAY_BUFFER, positions.byteLength, gl.DYNAMIC_DRAW)
  const positionLocation = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
  gl.disable(gl.BLEND)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.CULL_FACE)
  gl.clearColor(0, 0, 0, 0)
  let lost = false
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true })
  return { canvas, gl, program, positionBuffer, uvBuffer, indexBuffer, positions, indices: indices.length, textures: new WeakMap(), allocatedTextures: [], get lost() { return lost }, set lost(value: boolean) { lost = value } }
}

/** One reusable WebGL context per export worker eliminates seams between raster strips. */
export function createExportHairMeshRenderer() {
  let resources: Resources | undefined

  const render = (image: HTMLImageElement, state: HairMotionState, settings: HairMotionSettings, intensity: number, phase: number): HTMLCanvasElement => {
    resources ??= createResources()
    const { canvas, gl } = resources
    if (resources.lost || gl.isContextLost()) throw Error('A aceleração gráfica foi interrompida durante a animação de cabelo; a exportação não foi publicada.')
    const width = image.naturalWidth, height = image.naturalHeight
    const outputWidth = Math.max(1, Math.ceil(width * HAIR_MOTION_MESH_WIDTH)), outputHeight = Math.max(1, Math.ceil(height * HAIR_MOTION_MESH_HEIGHT))
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array
    if (width > maxTexture || height > maxTexture || outputWidth > maxViewport[0] || outputHeight > maxViewport[1]) {
      throw Error(`A camada de cabelo (${width} × ${height}px) excede a capacidade gráfica disponível para manter a resolução original.`)
    }
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      canvas.width = outputWidth
      canvas.height = outputHeight
    }
    gl.viewport(0, 0, outputWidth, outputHeight)
    gl.useProgram(resources.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer)
    resources.positions.set(createHairMotionMeshPositions(state, settings, intensity, phase))
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, resources.positions)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.indexBuffer)
    let texture = resources.textures.get(image)
    if (!texture) {
      texture = gl.createTexture() ?? undefined
      if (!texture) throw Error('Não foi possível alocar a textura de cabelo para exportação.')
      resources.textures.set(image, texture)
      resources.allocatedTextures.push(texture)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      if (gl.getError() !== gl.NO_ERROR) throw Error('Não foi possível enviar a camada original de cabelo à GPU.')
    } else gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawElements(gl.TRIANGLES, resources.indices, gl.UNSIGNED_SHORT, 0)
    if (gl.isContextLost()) throw Error('A aceleração gráfica foi interrompida durante a animação de cabelo; a exportação não foi publicada.')
    return canvas
  }

  const dispose = () => {
    if (!resources) return
    const { gl } = resources
    if (!gl.isContextLost()) {
      for (const texture of resources.allocatedTextures) gl.deleteTexture(texture)
      gl.deleteBuffer(resources.positionBuffer)
      gl.deleteBuffer(resources.uvBuffer)
      gl.deleteBuffer(resources.indexBuffer)
      gl.deleteProgram(resources.program)
    }
    resources.canvas.width = resources.canvas.height = 1
    resources = undefined
  }

  return { render, dispose }
}
