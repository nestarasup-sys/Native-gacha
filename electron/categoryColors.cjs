function categoryHslColor(hue) {
  const saturation = 0.62
  const lightness = 0.52
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1))
  const rgb = segment < 1 ? [chroma, secondary, 0] : segment < 2 ? [secondary, chroma, 0] : segment < 3 ? [0, chroma, secondary] : segment < 4 ? [0, secondary, chroma] : segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary]
  const offset = lightness - chroma / 2
  return `#${rgb.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`
}

/** Preserves the existing category palette and deterministic fallback sequence. */
function nextCategoryColor(usedColors) {
  const palette = ['#dc5368', '#e58b3a', '#b39a32', '#4d9b68', '#279e9b', '#3988c7', '#5262bd', '#8559c5', '#c14d9d', '#8a684f', '#536f8b', '#698b42', '#d36b48', '#3c9ab8', '#a84e69', '#7663c2']
  for (const color of palette) if (!usedColors.has(color)) return color
  for (let index = 0; index < 10000; index += 1) {
    const color = categoryHslColor((index * 137.508) % 360)
    if (!usedColors.has(color)) return color
  }
  throw new Error('Não foi possível gerar uma cor exclusiva para a categoria.')
}

module.exports = { nextCategoryColor }
