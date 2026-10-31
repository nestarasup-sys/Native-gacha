import { useEffect, useState } from 'react'
import { hasStandardCharacterColorRoles } from '../../../../shared/customizer'
import type { CharacterColorOverrides, HairColorOverrides } from '../../../../shared/customizer'
import { loadCachedImage, loadCharacterTintedImage, loadHairTintedImage, loadSkinTintedImage, inspectCharacterPalette } from '../../characters/characterRenderer'
import type { HairTintOptions } from '../../characters/characterRenderer'
import { renderWardrobeThumbnail } from './wardrobePanelThumbnail'
import type { WardrobePanelCandidate } from './wardrobePanelModel'
import { createCustomizerHairPreviewCache } from './customizerHairPreviewCache'

async function trimHairPreviewImage(source: string): Promise<string> {
  const image = await loadCachedImage(source)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return source
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return source
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top || (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) return source
  const contentWidth = right - left + 1
  const contentHeight = bottom - top + 1
  const padding = Math.max(2, Math.ceil(Math.max(contentWidth, contentHeight) * 0.045))
  const output = document.createElement('canvas')
  output.width = contentWidth + padding * 2
  output.height = contentHeight + padding * 2
  const outputContext = output.getContext('2d')
  if (!outputContext) return source
  outputContext.drawImage(image, left, top, contentWidth, contentHeight, padding, padding, contentWidth, contentHeight)
  return output.toDataURL('image/png')
}

const hairPreviewImageCache = createCustomizerHairPreviewCache(trimHairPreviewImage)

function loadHairPreviewImage(source: string): Promise<string> {
  return hairPreviewImageCache.load(source)
}

export function HairAssetPreview({ source, alt, colors, tintOptions, skinTone, opacity = 1, flipX = false, fixedPalette = false, paletteValidationColors, paletteCheckSources }: { source: string; alt: string; colors?: CharacterColorOverrides; tintOptions?: HairTintOptions; skinTone?: string; opacity?: number; flipX?: boolean; fixedPalette?: boolean; paletteValidationColors?: CharacterColorOverrides; paletteCheckSources?: string[] }) {
  const [previewSource, setPreviewSource] = useState(source)
  const [unsupportedPalette, setUnsupportedPalette] = useState(false)
  const colorKey = JSON.stringify([colors, tintOptions, paletteValidationColors, paletteCheckSources])
  useEffect(() => {
    let cancelled = false
    setPreviewSource(source)
    setUnsupportedPalette(false)
    const palette = paletteValidationColors ?? colors
    const checkSources = fixedPalette && !skinTone && hasStandardCharacterColorRoles(palette) ? paletteCheckSources ?? [source] : []
    if (checkSources.length) {
      void Promise.all(checkSources.map((item) => inspectCharacterPalette(item))).then((results) => {
        if (!cancelled) setUnsupportedPalette(results.some((supported) => !supported))
      }).catch(() => undefined)
    }
    const tintedImage = skinTone ? loadSkinTintedImage(source, skinTone)
      : fixedPalette ? loadCharacterTintedImage(source, colors, tintOptions)
        : loadHairTintedImage(source, colors as HairColorOverrides | undefined, tintOptions)
    void tintedImage.then((image) => loadHairPreviewImage(image.src)).then((trimmed) => {
      if (!cancelled) setPreviewSource(trimmed)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [source, colorKey, skinTone, fixedPalette])
  return <span className="customizer-character-asset-preview"><img src={previewSource} alt={alt} style={{ opacity: Math.min(1, Math.max(0, opacity)), transform: flipX ? 'scaleX(-1)' : undefined }} />{unsupportedPalette && <small className="customizer-palette-compatibility-notice" role="status">Paleta não reconhecida; cores originais preservadas</small>}</span>
}

export function WardrobePanelCandidatePreview({ candidate, colors }: { candidate: WardrobePanelCandidate; colors?: CharacterColorOverrides }) {
  const [source, setSource] = useState<string | null>(null)
  const componentIds = candidate.components.map((component) => component.id)
  useEffect(() => {
    let active = true
    void renderWardrobeThumbnail(candidate.set, candidate.components.map((component) => component.category), componentIds, 512, colors)
      .then((thumbnail) => { if (active) setSource(thumbnail) })
    return () => { active = false }
  }, [candidate.set, componentIds.join(':'), JSON.stringify(colors)])
  return <HairAssetPreview source={source ?? candidate.component.dataUrl} alt={candidate.component.name} fixedPalette paletteValidationColors={colors} paletteCheckSources={candidate.components.map((component) => component.dataUrl)} />
}
