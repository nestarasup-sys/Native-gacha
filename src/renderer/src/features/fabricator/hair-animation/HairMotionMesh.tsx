import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createHairMotionState, stepHairMotion, type HairMotionSettings } from './hairMotionPhysics'
import { createHairMotionMeshPositions, HAIR_MOTION_MESH_COLUMNS, HAIR_MOTION_MESH_HEIGHT, HAIR_MOTION_MESH_ROWS, HAIR_MOTION_MESH_WIDTH } from '../../../characters/hairMotionMeshGeometry'

type Props = { source: string; name: string; settings: HairMotionSettings; intensity: number; playing: boolean; headX: MutableRefObject<number>; impulse: number; resetToken: number; phase: number; flipped: boolean }

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const result = gl.createShader(type)
  if (!result) throw new Error('Não foi possível preparar a malha do cabelo.')
  gl.shaderSource(result, source); gl.compileShader(result)
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { gl.deleteShader(result); throw new Error('Não foi possível compilar a prévia da malha.') }
  return result
}

/** A continuous textured GPU mesh avoids visible triangle seams on transparent hair. */
export function HairMotionMesh({ source, name, settings, intensity, playing, headX, impulse, resetToken, phase, flipped }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useRef({ settings, intensity, playing, impulse, resetToken, phase, flipped })
  props.current = { settings, intensity, playing, impulse, resetToken, phase, flipped }
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false, animation = 0, gl: WebGLRenderingContext | null = null
    let texture: WebGLTexture | null = null, positionBuffer: WebGLBuffer | null = null, uvBuffer: WebGLBuffer | null = null, indexBuffer: WebGLBuffer | null = null, program: WebGLProgram | null = null
    const image = new Image()
    const contextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(animation); if (!cancelled) setError('A aceleração gráfica foi interrompida. Reabra a área para tentar novamente.') }
    canvas.addEventListener('webglcontextlost', contextLost)
    setError('')
    image.onerror = () => { if (!cancelled) setError('Não foi possível carregar esta camada.') }
    image.onload = () => {
      if (cancelled) return
      try {
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })
        if (!gl) throw new Error('A prévia de malha precisa de aceleração gráfica.')
        const context = gl
        const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
        canvas.width = Math.max(1, Math.ceil(image.naturalWidth * scale * HAIR_MOTION_MESH_WIDTH)); canvas.height = Math.max(1, Math.ceil(image.naturalHeight * scale * HAIR_MOTION_MESH_HEIGHT))
        const vertex = shader(context, context.VERTEX_SHADER, 'attribute vec2 position; attribute vec2 uv; varying vec2 tex; void main(){ gl_Position=vec4(position,0.0,1.0); tex=uv; }')
        const fragment = shader(context, context.FRAGMENT_SHADER, 'precision mediump float; varying vec2 tex; uniform sampler2D image; void main(){ gl_FragColor=texture2D(image,tex); }')
        program = context.createProgram()
        if (!program) throw new Error('Não foi possível criar a prévia da malha.')
        context.attachShader(program, vertex); context.attachShader(program, fragment); context.linkProgram(program)
        context.deleteShader(vertex); context.deleteShader(fragment)
        if (!context.getProgramParameter(program, context.LINK_STATUS)) throw new Error('Não foi possível montar a prévia da malha.')
        context.useProgram(program)
        const columns = HAIR_MOTION_MESH_COLUMNS, rows = HAIR_MOTION_MESH_ROWS, count = (columns + 1) * (rows + 1)
        const positions = new Float32Array(count * 2), uvs = new Float32Array(count * 2), indices: number[] = []
        for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
          const index = row * (columns + 1) + col
          uvs[index * 2] = col / columns; uvs[index * 2 + 1] = 1 - row / rows
          if (row < rows && col < columns) { const next = index + columns + 1; indices.push(index, next, index + 1, index + 1, next, next + 1) }
        }
        positionBuffer = context.createBuffer(); uvBuffer = context.createBuffer(); indexBuffer = context.createBuffer(); texture = context.createTexture()
        if (!positionBuffer || !uvBuffer || !indexBuffer || !texture) throw new Error('Não foi possível preparar os recursos gráficos do cabelo.')
        context.bindBuffer(context.ARRAY_BUFFER, uvBuffer); context.bufferData(context.ARRAY_BUFFER, uvs, context.STATIC_DRAW)
        const uvLocation = context.getAttribLocation(program, 'uv'); context.enableVertexAttribArray(uvLocation); context.vertexAttribPointer(uvLocation, 2, context.FLOAT, false, 0, 0)
        context.bindBuffer(context.ARRAY_BUFFER, positionBuffer); context.bufferData(context.ARRAY_BUFFER, positions.byteLength, context.DYNAMIC_DRAW)
        const positionLocation = context.getAttribLocation(program, 'position'); context.enableVertexAttribArray(positionLocation); context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0)
        context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer); context.bufferData(context.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), context.STATIC_DRAW)
        context.bindTexture(context.TEXTURE_2D, texture); context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, 1); context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
        const maxTexture = Math.min(2048, context.getParameter(context.MAX_TEXTURE_SIZE) as number)
        let textureSource: HTMLImageElement | HTMLCanvasElement = image
        if (Math.max(image.naturalWidth, image.naturalHeight) > maxTexture) {
          const reduced = document.createElement('canvas'), ratio = maxTexture / Math.max(image.naturalWidth, image.naturalHeight)
          reduced.width = Math.max(1, Math.round(image.naturalWidth * ratio)); reduced.height = Math.max(1, Math.round(image.naturalHeight * ratio))
          const reducedContext = reduced.getContext('2d')
          if (!reducedContext) throw new Error('Não foi possível preparar a imagem do cabelo.')
          reducedContext.imageSmoothingQuality = 'high'; reducedContext.drawImage(image, 0, 0, reduced.width, reduced.height)
          textureSource = reduced
        }
        context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, textureSource)
        if (context.getError() !== context.NO_ERROR) throw new Error('Não foi possível carregar a imagem na malha gráfica.')
        context.viewport(0, 0, canvas.width, canvas.height); context.clearColor(0, 0, 0, 0)
        const motion = createHairMotionState(); let previous = 0, accumulator = 0, lastImpulse = props.current.impulse, lastReset = props.current.resetToken, lastPausedSettings = ''
        const frame = (now: number) => {
          if (cancelled) return
          const current = props.current
          const elapsed = previous ? Math.min(.05, (now - previous) / 1000) : 0
          previous = now
          if (document.visibilityState !== 'visible') { accumulator = 0; motion.previousHead = headX.current * (current.flipped ? -1 : 1); animation = requestAnimationFrame(frame); return }
          if (current.resetToken !== lastReset) { motion.offsets.fill(0); motion.velocities.fill(0); motion.previousHead = headX.current * (current.flipped ? -1 : 1); motion.time = 0; accumulator = 0; lastReset = current.resetToken; lastPausedSettings = '' }
          if (current.playing) {
            accumulator = Math.min(.05, accumulator + elapsed)
            if (current.impulse !== lastImpulse) { for (let i = 1; i < motion.velocities.length; i++) motion.velocities[i] += (i / (motion.velocities.length - 1)) * .8; lastImpulse = current.impulse }
            while (accumulator >= 1 / 120) { stepHairMotion(motion, current.settings, 1 / 120, headX.current * (current.flipped ? -1 : 1), current.phase); accumulator -= 1 / 120 }
          } else { accumulator = 0; motion.previousHead = headX.current * (current.flipped ? -1 : 1) }
          const pausedSettings = JSON.stringify([current.settings, current.intensity])
          if (!current.playing && pausedSettings === lastPausedSettings) { animation = requestAnimationFrame(frame); return }
          lastPausedSettings = current.playing ? '' : pausedSettings
          positions.set(createHairMotionMeshPositions(motion, current.settings, current.intensity, current.phase, columns, rows))
          context.clear(context.COLOR_BUFFER_BIT); context.bindBuffer(context.ARRAY_BUFFER, positionBuffer); context.bufferSubData(context.ARRAY_BUFFER, 0, positions); context.drawElements(context.TRIANGLES, indices.length, context.UNSIGNED_SHORT, 0)
          animation = requestAnimationFrame(frame)
        }
        animation = requestAnimationFrame(frame)
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Falha na prévia do cabelo.') }
    }
    image.src = source
    return () => {
      cancelled = true; cancelAnimationFrame(animation); image.onload = null; image.onerror = null; canvas.removeEventListener('webglcontextlost', contextLost)
      if (gl) { if (texture) gl.deleteTexture(texture); if (positionBuffer) gl.deleteBuffer(positionBuffer); if (uvBuffer) gl.deleteBuffer(uvBuffer); if (indexBuffer) gl.deleteBuffer(indexBuffer); if (program) gl.deleteProgram(program) }
    }
  }, [source, headX])

  return <><canvas ref={canvasRef} className="hair-motion-mesh" aria-label={`Prévia animada de ${name}`} />{error && <><img className="hair-motion-fallback" src={source} alt={name} /><span className="hair-motion-error" role="status">{error}</span></>}</>
}
