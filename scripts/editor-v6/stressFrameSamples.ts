/** Decode selected stress-export frames in small batches to bound FFmpeg filters and buffers. */
export function decodeSelectedFrames(
  sampleFrames: readonly number[],
  frameBytes: number,
  decodeBatch: (frames: readonly number[]) => Uint8Array,
  maxFramesPerBatch = 16
): Map<number, Uint8Array> {
  if (!Number.isInteger(frameBytes) || frameBytes < 1) throw new Error('O tamanho do quadro de stress precisa ser positivo.')
  if (!Number.isInteger(maxFramesPerBatch) || maxFramesPerBatch < 1) throw new Error('O lote de quadros de stress precisa ser positivo.')

  const decodedFrames = new Map<number, Uint8Array>()
  for (let offset = 0; offset < sampleFrames.length; offset += maxFramesPerBatch) {
    const batch = sampleFrames.slice(offset, offset + maxFramesPerBatch)
    const decoded = decodeBatch(batch)
    const expectedBytes = batch.length * frameBytes
    if (decoded.byteLength !== expectedBytes) {
      throw new Error(`O FFmpeg retornou ${decoded.byteLength} bytes; esperava ${expectedBytes} para ${batch.length} quadros de amostra.`)
    }
    batch.forEach((frame, index) => {
      const start = index * frameBytes
      decodedFrames.set(frame, decoded.slice(start, start + frameBytes))
    })
  }
  return decodedFrames
}
