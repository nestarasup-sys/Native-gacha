/** Repositório de personagens do Customizador.
 * Mantém os caminhos e o protocolo de publicação .tmp/.backup do G-V5.
 * Recebe o filesystem de domínio para continuar protegido pelo sandbox de dados.
 */
import { dirname } from 'node:path'
import type { CustomizerCharacter } from '../../../src/shared/customizer.ts'
import { isCustomizerCharacter } from './validation.ts'
import { normalizeCustomizerCharacter } from './compatibility.ts'

export interface CharacterFiles {
  access(path: string): Promise<void>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  rename(source: string, target: string): Promise<void>
  unlink(path: string): Promise<void>
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
}

export type CharacterSeed = Pick<CustomizerCharacter, 'name' | 'hair' | 'outfit' | 'skin'>

export class CustomizerCharacterRepository {
  private readonly manifestPath: () => string
  private readonly files: CharacterFiles
  private readonly starterCharacters: ReadonlyArray<CharacterSeed>
  private readonly newId: () => string
  private readonly now: () => string

  constructor(manifestPath: () => string, files: CharacterFiles, starterCharacters: ReadonlyArray<CharacterSeed>, newId: () => string, now: () => string) {
    this.manifestPath = manifestPath
    this.files = files
    this.starterCharacters = starterCharacters
    this.newId = newId
    this.now = now
  }

  async list(): Promise<CustomizerCharacter[]> {
    const target = this.manifestPath()
    try { await this.files.access(target) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      try { await this.files.rename(`${target}.backup`, target) } catch (restoreReason) {
        if ((restoreReason as NodeJS.ErrnoException).code !== 'ENOENT') throw restoreReason
      }
    }
    try {
      const parsed = JSON.parse(await this.files.readFile(target, 'utf8')) as unknown
      if (!Array.isArray(parsed) || !parsed.every(isCustomizerCharacter)) throw new Error('A biblioteca de personagens está inválida.')
      return parsed.map(normalizeCustomizerCharacter)
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      const now = this.now()
      const seeded: CustomizerCharacter[] = this.starterCharacters.map((character) => ({
        ...character,
        id: this.newId(),
        customization: { modelSlot: 1, poseSlot: 1, partOverrides: {}, layerOrder: [] },
        createdAt: now,
        updatedAt: now
      }))
      await this.save(seeded)
      return seeded
    }
  }

  async save(characters: CustomizerCharacter[]): Promise<void> {
    if (!Array.isArray(characters) || characters.length > 500 || !characters.every(isCustomizerCharacter)) throw new Error('Dados de personagem inválidos.')
    if (new Set(characters.map((character) => character.id)).size !== characters.length) throw new Error('Há personagens com identificadores repetidos.')
    const target = this.manifestPath()
    await this.files.mkdir(dirname(target), { recursive: true })
    const temporary = `${target}.tmp`
    await this.files.writeFile(temporary, JSON.stringify(characters), 'utf8')
    await this.publishRecoverableManifest(target, temporary)
  }

  private async publishRecoverableManifest(target: string, temporary: string): Promise<void> {
    const backup = `${target}.backup`
    try { await this.files.access(target) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      try { await this.files.rename(backup, target) } catch (restoreReason) {
        if ((restoreReason as NodeJS.ErrnoException).code !== 'ENOENT') throw restoreReason
      }
    }
    try { await this.files.access(target); await this.files.unlink(backup).catch((reason) => {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    }) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    }
    let previousManifest = false
    try { await this.files.rename(target, backup); previousManifest = true } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    }
    try { await this.files.rename(temporary, target) } catch (reason) {
      if (previousManifest) await this.files.rename(backup, target).catch(() => undefined)
      throw reason
    }
    if (previousManifest) await this.files.unlink(backup)
  }
}
