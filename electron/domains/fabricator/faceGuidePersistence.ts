/** Persistência independente das guias de olhos, rosto e cabeça extra. */
import { join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import type { FaceGuideProfile, FaceGuideSettings } from '../../../src/shared/fabricator'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readFile' | 'writeFile' | 'rename'>
export type FaceGuideValues = Partial<Record<number, FaceGuideSettings>>

const isMissing = (reason: unknown): boolean => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'

export function isFaceGuideProfile(value: unknown): value is FaceGuideProfile {
  return value === 'eyes' || value === 'face' || value === 'head-extras'
}

export function isFaceGuideValues(value: unknown): value is FaceGuideValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([slot, guide]) => {
    if (!/^([1-9]|10)$/.test(slot) || !guide || typeof guide !== 'object' || Array.isArray(guide)) return false
    const item = guide as Record<string, unknown>
    return typeof item.visible === 'boolean'
      && typeof item.verticalX === 'number' && Number.isFinite(item.verticalX) && item.verticalX >= 20 && item.verticalX <= 80
      && typeof item.horizontalY === 'number' && Number.isFinite(item.horizontalY) && item.horizontalY >= 10 && item.horizontalY <= 90
      && typeof item.lowerHorizontalY === 'number' && Number.isFinite(item.lowerHorizontalY)
      && item.lowerHorizontalY > item.horizontalY && item.lowerHorizontalY <= 99
      && typeof item.angle === 'number' && Number.isFinite(item.angle) && item.angle >= -30 && item.angle <= 30
  })
}

export function createFaceGuidePersistence(files: Files, userDataPath: () => string) {
  const pathFor = (profile: FaceGuideProfile) => join(userDataPath(), 'fabricator', `guides-${profile}.json`)

  async function read(profile: FaceGuideProfile): Promise<FaceGuideValues | null> {
    if (!isFaceGuideProfile(profile)) throw new Error('Perfil de guias inválido.')
    try {
      const value = JSON.parse(await files.readFile(pathFor(profile), 'utf8')) as unknown
      return isFaceGuideValues(value) ? value : null
    } catch (reason) {
      if (isMissing(reason)) return null
      throw reason
    }
  }

  async function write(profile: FaceGuideProfile, value: unknown): Promise<void> {
    if (!isFaceGuideProfile(profile)) throw new Error('Perfil de guias inválido.')
    if (!isFaceGuideValues(value)) throw new Error('Guias de desenho inválidas.')
    const target = pathFor(profile)
    await files.mkdir(join(userDataPath(), 'fabricator'), { recursive: true })
    const temporary = `${target}.tmp`
    await files.writeFile(temporary, JSON.stringify(value), 'utf8')
    await files.rename(temporary, target)
  }

  return { read, write }
}
