'use strict'

const { createHash } = require('node:crypto')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Compare straight-alpha RGBA buffers without hiding differences behind a tolerance. */
function compareRgba(reference, candidate, width, height) {
  if (!Buffer.isBuffer(reference) || !Buffer.isBuffer(candidate)
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || reference.length !== width * height * 4 || candidate.length !== reference.length) {
    throw Error('Buffers ou dimensões incompatíveis para comparação RGBA.')
  }
  const count = width * height
  const differenceMap = Buffer.alloc(count * 4)
  const channelNames = ['red', 'green', 'blue', 'alpha']
  const channelErrorTotals = [0, 0, 0, 0]
  const channelErrorCounts = [0, 0, 0, 0]
  const channelMaximums = [0, 0, 0, 0]
  const result = {
    width, height, pixels: count, differingPixels: 0, differingPixelPercent: 0,
    differingChannels: 0, meanAbsoluteChannelError: 0, maxAbsoluteChannelError: 0,
    channels: null,
    alpha: { differingPixels: 0, meanAbsoluteError: 0, maxAbsoluteError: 0 },
    edge: { differingPixels: 0, differingChannels: 0 },
    interior: { differingPixels: 0, differingChannels: 0 },
    boundingBox: null,
    referenceSha256: sha256(reference), candidateSha256: sha256(candidate)
  }
  let channelError = 0, alphaError = 0
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    let pixelDiff = false, pixelChannels = 0, edge = false
    for (let channel = 0; channel < 4; channel++) {
      const error = Math.abs(reference[offset + channel] - candidate[offset + channel])
      channelError += error
      channelErrorTotals[channel] += error
      if (error) channelErrorCounts[channel]++
      channelMaximums[channel] = Math.max(channelMaximums[channel], error)
      result.maxAbsoluteChannelError = Math.max(result.maxAbsoluteChannelError, error)
      if (error) { pixelDiff = true; pixelChannels++; result.differingChannels++ }
      if (channel === 3 && error) {
        result.alpha.differingPixels++
        alphaError += error
        result.alpha.maxAbsoluteError = Math.max(result.alpha.maxAbsoluteError, error)
      }
    }
    // Mark a reference edge when any RGBA channel changes across a four-neighbour.
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const neighbor = (ny * width + nx) * 4
      if (reference[offset] !== reference[neighbor] || reference[offset + 1] !== reference[neighbor + 1]
        || reference[offset + 2] !== reference[neighbor + 2] || reference[offset + 3] !== reference[neighbor + 3]) edge = true
    }
    const mapOffset = (y * width + x) * 4
    const magnitude = Math.max(...[0, 1, 2, 3].map(c => Math.abs(reference[offset + c] - candidate[offset + c])))
    differenceMap[mapOffset] = magnitude
    differenceMap[mapOffset + 1] = 0
    differenceMap[mapOffset + 2] = pixelDiff ? 255 : 0
    differenceMap[mapOffset + 3] = 255
    if (!pixelDiff) continue
    result.differingPixels++
    if (edge) {
      result.edge.differingPixels++
      result.edge.differingChannels += pixelChannels
    } else {
      result.interior.differingPixels++
      result.interior.differingChannels += pixelChannels
    }
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  result.differingPixelPercent = result.differingPixels * 100 / count
  result.meanAbsoluteChannelError = channelError / (count * 4)
  result.alpha.meanAbsoluteError = alphaError / count
  result.channels = Object.fromEntries(channelNames.map((name, channel) => [name, {
    differingPixels: channelErrorCounts[channel],
    meanAbsoluteError: channelErrorTotals[channel] / count,
    maxAbsoluteError: channelMaximums[channel]
  }]))
  if (result.differingPixels) result.boundingBox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  return { ...result, differenceMap, differenceMapSha256: sha256(differenceMap) }
}

module.exports = { compareRgba, sha256 }
