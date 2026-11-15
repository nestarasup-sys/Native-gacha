import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { EditorV6NativeFramePlan } from '../../../src/shared/editorV6Export'

const MAX_PACKET_BYTES = 256 * 1024 * 1024
const MAX_FRAME_BYTES = 4096 * 2160 * 4

export type EditorV6NativeRendererProcess = {
  render: (plan: EditorV6NativeFramePlan, signal: AbortSignal) => Promise<{ bitmap: Buffer; processMilliseconds: number }>
  close: () => Promise<void>
}

function colorToBgra(color: string): number {
  if (color === 'transparent') return 0
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color)
  if (!match) throw Error(`A cor “${color}” não é compatível com o renderizador nativo.`)
  const hex = match[1].length === 3
    ? [...match[1]].map(channel => channel + channel).join('') + 'ff'
    : match[1].length === 6 ? `${match[1]}ff` : match[1]
  const red = Number.parseInt(hex.slice(0, 2), 16), green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16), alpha = Number.parseInt(hex.slice(6, 8), 16)
  return (blue | (green << 8) | (red << 16) | (alpha << 24)) >>> 0
}

function imageDataFromUrl(value: string): Buffer {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value)
  if (!match) throw Error('O renderizador nativo recebeu um asset que não é uma imagem base64 válida.')
  return Buffer.from(match[1], 'base64')
}

function writeString16(buffer: Buffer, value: string, offset: number): number {
  const data = Buffer.from(value, 'utf8')
  if (!data.length || data.length > 65535) throw Error('Identificador de asset nativo fora dos limites.')
  buffer.writeUInt16LE(data.length, offset); data.copy(buffer, offset + 2)
  return offset + 2 + data.length
}

function writeImageCommand(buffer: Buffer, command: Extract<EditorV6NativeFramePlan['commands'][number], { kind: 'image' }>, offset: number): number {
  buffer.writeUInt8(1, offset)
  const flags = (command.flipX ? 1 : 0) | (command.contain ? 2 : 0) | (command.source ? 4 : 0) | (command.cutout ? 8 : 0)
  buffer.writeUInt8(flags, offset + 1); buffer.writeUInt16LE(0, offset + 2)
  offset += 4
  for (const value of [command.x, command.y, command.width, command.height, command.rotation, command.opacity,
    command.source?.x ?? 0, command.source?.y ?? 0, command.source?.width ?? 0, command.source?.height ?? 0,
    command.cutout?.x ?? 0, command.cutout?.y ?? 0, command.cutout?.width ?? 0, command.cutout?.height ?? 0]) {
    if (!Number.isFinite(value)) throw Error('Transformação inválida no plano de quadro nativo.')
    buffer.writeFloatLE(value, offset); offset += 4
  }
  return writeString16(buffer, command.assetId, offset)
}

function buildPacket(plan: EditorV6NativeFramePlan, assetsToSend: Array<{ id: string; bytes: Buffer }>): Buffer {
  if (![plan.width, plan.height, plan.logicalHeight].every(Number.isSafeInteger) || plan.width < 1 || plan.height < 1 || plan.width > 4096 || plan.height > 2160 || plan.logicalHeight < 1 || plan.logicalHeight > 2160) throw Error('Dimensões inválidas no plano de quadro nativo.')
  if (plan.width * plan.height * 4 > MAX_FRAME_BYTES) throw Error('O quadro excede o limite de memória do renderizador nativo.')
  const assets = assetsToSend.map(asset => ({ ...asset, id: Buffer.from(asset.id, 'utf8') }))
  let size = 32
  for (const asset of assets) size += 2 + asset.id.length + 4 + asset.bytes.length
  for (const command of plan.commands) size += command.kind === 'solid' ? 24 : 4 + 14 * 4 + 2 + Buffer.byteLength(command.assetId, 'utf8')
  if (size > MAX_PACKET_BYTES) throw Error('O plano de quadro excedeu o limite de transferência do renderizador nativo.')
  const packet = Buffer.allocUnsafe(size)
  packet.write('V6NR', 0, 'ascii'); packet.writeUInt32LE(2, 4)
  packet.writeUInt32LE(plan.width, 8); packet.writeUInt32LE(plan.height, 12); packet.writeUInt32LE(plan.logicalHeight, 16)
  packet.writeUInt32LE(colorToBgra(plan.backgroundColor), 20); packet.writeUInt32LE(assets.length, 24); packet.writeUInt32LE(plan.commands.length, 28)
  let offset = 32
  for (const asset of assets) {
    packet.writeUInt16LE(asset.id.length, offset); asset.id.copy(packet, offset + 2); offset += 2 + asset.id.length
    packet.writeUInt32LE(asset.bytes.length, offset); asset.bytes.copy(packet, offset + 4); offset += 4 + asset.bytes.length
  }
  for (const command of plan.commands) {
    if (command.kind === 'image') offset = writeImageCommand(packet, command, offset)
    else {
      packet.writeUInt8(2, offset); packet.writeUInt8(0, offset + 1); packet.writeUInt16LE(0, offset + 2); offset += 4
      for (const value of [command.x, command.y, command.width, command.height]) {
        if (!Number.isFinite(value)) throw Error('Retângulo inválido no plano nativo.')
        packet.writeFloatLE(value, offset); offset += 4
      }
      packet.writeUInt32LE(colorToBgra(command.color), offset); offset += 4
    }
  }
  if (offset !== size) throw Error('Tamanho interno do pacote do renderizador nativo divergente.')
  const framed = Buffer.allocUnsafe(size + 4); framed.writeUInt32LE(size, 0); packet.copy(framed, 4)
  return framed
}

async function writeToChild(child: ChildProcessWithoutNullStreams, packet: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.stdin.write(packet, error => error ? reject(error) : resolve())
  })
}

export function createEditorV6NativeRendererProcess(executablePath: string): EditorV6NativeRendererProcess {
  const child = spawn(executablePath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const iterator = child.stdout[Symbol.asyncIterator]()
  let buffered = Buffer.alloc(0), closed = false, stderr = '', processExit: { code: number | null; signal: NodeJS.Signals | null } | undefined
  const sentAssets = new Set<string>()
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-8000) })
  child.on('error', error => { stderr = `${stderr}\n${error.message}`.slice(-8000); closed = true })
  child.on('exit', (code, signal) => { processExit = { code, signal }; closed = true })

  const processFailure = () => {
    const exit = processExit ? ` (código ${processExit.code ?? 'n/a'}, sinal ${processExit.signal ?? 'nenhum'})` : ''
    return `O processo do renderizador nativo não está ativo${exit}.${stderr.trim() ? ` ${stderr.trim()}` : ''}`
  }

  const readExactly = async (count: number): Promise<Buffer> => {
    while (buffered.length < count) {
      const next = await iterator.next()
      if (next.done) throw Error(stderr.trim() || `O renderizador nativo encerrou antes de responder ao quadro${processExit ? ` (código ${processExit.code ?? 'n/a'}, sinal ${processExit.signal ?? 'nenhum'})` : ''}.`)
      buffered = buffered.length ? Buffer.concat([buffered, Buffer.from(next.value)]) : Buffer.from(next.value)
    }
    const result = buffered.subarray(0, count)
    buffered = buffered.subarray(count)
    return result
  }

  return {
    async render(plan, signal) {
      signal.throwIfAborted()
      if (closed || child.killed) throw Error(processFailure())
      const planAssets = new Map(plan.assets.map(asset => [asset.id, asset]))
      const requiredIds = new Set(plan.commands.filter(command => command.kind === 'image').map(command => command.assetId))
      const assetsToSend = [...requiredIds].filter(id => !sentAssets.has(id)).map(id => {
        const asset = planAssets.get(id)
        if (!asset) throw Error(`O plano nativo não forneceu os dados do asset “${id}”.`)
        return { id, bytes: imageDataFromUrl(asset.dataUrl) }
      })
      const framed = buildPacket(plan, assetsToSend)
      await writeToChild(child, framed)
      for (const asset of assetsToSend) sentAssets.add(asset.id)
      const header = await readExactly(16)
      const status = header.readUInt32LE(0), length = header.readUInt32LE(4)
      const processMilliseconds = header.readDoubleLE(8)
      if (status !== 0) {
        if (length > 8192) throw Error('O renderizador nativo retornou uma falha sem mensagem válida.')
        const message = (await readExactly(length)).toString('utf8')
        throw Error(`Renderização nativa falhou: ${message}`)
      }
      const expectedLength = plan.width * plan.height * 4
      if (length !== expectedLength || length > MAX_FRAME_BYTES) throw Error('O renderizador nativo retornou um quadro com dimensões inesperadas.')
      if (!Number.isFinite(processMilliseconds) || processMilliseconds < 0) throw Error('O renderizador nativo retornou uma duração inválida.')
      return { bitmap: await readExactly(length), processMilliseconds }
    },
    async close() {
      if (closed) return
      closed = true
      child.stdin.end()
      await new Promise<void>(resolve => {
        if (child.exitCode !== null) { resolve(); return }
        const timer = setTimeout(() => { child.kill(); resolve() }, 2000)
        child.once('exit', () => { clearTimeout(timer); resolve() })
      })
      sentAssets.clear(); buffered = Buffer.alloc(0)
    }
  }
}
