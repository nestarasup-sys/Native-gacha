/** Casos de uso independentes de Electron. Todas as gravações compartilham uma fila. */
import type { CustomizerCharacter, CustomizerWardrobeGroup } from '../../../src/shared/customizer.ts'
import type { CustomizerCharacterRepository } from './repository.ts'
import { isCustomizerCharacter } from './validation.ts'

export type AssertWardrobeGroupsAvailable = (groups: readonly CustomizerWardrobeGroup[]) => Promise<void>

export class CustomizerCharacterService {
  private saveQueue: Promise<void> = Promise.resolve()
  private readonly repository: Pick<CustomizerCharacterRepository, 'list' | 'save'>
  private readonly newId: () => string
  private readonly now: () => string
  private readonly assertWardrobeGroupsAvailable: AssertWardrobeGroupsAvailable

  constructor(
    repository: Pick<CustomizerCharacterRepository, 'list' | 'save'>,
    newId: () => string,
    now: () => string,
    assertWardrobeGroupsAvailable: AssertWardrobeGroupsAvailable = async () => undefined
  ) {
    this.repository = repository
    this.newId = newId
    this.now = now
    this.assertWardrobeGroupsAvailable = assertWardrobeGroupsAvailable
  }

  /** Backup externo deve aguardar a mesma fila usada pelos handlers. */
  get pendingWrites(): Promise<void> { return this.saveQueue }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.saveQueue.catch(() => undefined).then(operation)
    this.saveQueue = next.then(() => undefined, () => undefined)
    return next
  }

  async list(): Promise<CustomizerCharacter[]> {
    await this.saveQueue
    return this.repository.list()
  }

  /** Serializa verificações de referências com toda gravação de personagens. */
  withCharactersLocked<T>(operation: (characters: readonly CustomizerCharacter[]) => Promise<T>): Promise<T> {
    return this.enqueue(async () => operation(await this.repository.list()))
  }

  save(character: unknown): Promise<void> {
    if (!isCustomizerCharacter(character)) throw new Error('Dados de personagem inválidos.')
    return this.enqueue(async () => {
      const characters = await this.repository.list()
      const index = characters.findIndex((item) => item.id === character.id)
      if (index < 0) throw new Error('Personagem não encontrado.')
      const previous = characters[index]
      const existingReferences = new Set((previous.customization.wardrobeGroups ?? []).map((group) => `${group.modelSlot}:${group.setId}:${group.componentId ?? ''}`))
      const addedReferences = (character.customization.wardrobeGroups ?? []).filter((group) => !existingReferences.has(`${group.modelSlot}:${group.setId}:${group.componentId ?? ''}`))
      await this.assertWardrobeGroupsAvailable(addedReferences)
      characters[index] = { ...character, name: character.name.trim(), updatedAt: this.now() }
      await this.repository.save(characters)
    })
  }

  async create(requestedName: unknown): Promise<CustomizerCharacter> {
    const name = typeof requestedName === 'string' ? requestedName.trim().slice(0, 80) : ''
    if (!name) throw new Error('Digite um nome para o personagem.')
    let created!: CustomizerCharacter
    await this.enqueue(async () => {
      const characters = await this.repository.list()
      const now = this.now()
      created = {
        id: this.newId(), name,
        hair: '#47354b', outfit: '#df9ab6', skin: '#f2d9c9',
        customization: { modelSlot: 1, poseSlot: 1, partOverrides: {}, layerOrder: [] },
        createdAt: now, updatedAt: now
      }
      characters.push(created)
      await this.repository.save(characters)
    })
    return created
  }

  delete(id: unknown): Promise<void> {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Identificador de personagem inválido.')
    return this.enqueue(async () => {
      const characters = await this.repository.list()
      if (!characters.some((character) => character.id === id)) throw new Error('Personagem não encontrado.')
      await this.repository.save(characters.filter((character) => character.id !== id))
    })
  }
}
