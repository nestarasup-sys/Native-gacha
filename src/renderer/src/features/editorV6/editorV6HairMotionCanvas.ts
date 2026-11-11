/** Encodes an export-owned motion canvas before its producer releases it. */
export function editorV6HairMotionCanvasDataUrl(canvas: HTMLCanvasElement): string {
  if (!canvas.width || !canvas.height) throw Error('Uma camada do personagem ficou vazia ao preparar a animação de cabelo.')
  return canvas.toDataURL('image/png')
}
