/** Draw a layer, optionally adding the Customizer's selection halo. */
export function drawPreviewImageWithHalo(context: CanvasRenderingContext2D, image: CanvasImageSource, dx: number, dy: number, highlighted: boolean, width?: number, height?: number) {
  const draw = () => width === undefined || height === undefined ? context.drawImage(image, dx, dy) : context.drawImage(image, dx, dy, width, height)
  if (highlighted) {
    // Render the pink canvas shadow behind the exact piece, then redraw it cleanly.
    context.save()
    context.shadowColor = 'rgba(255, 71, 163, .98)'
    context.shadowBlur = 9
    draw()
    context.restore()
  }
  draw()
}
