import { join } from 'node:path'
import type { DataPlatform } from '../../dataPlatform.cjs'

type DesignSettingsServiceDependencies = {
  userDataRoot: string
  catalog: Pick<DataPlatform, 'getDomainState' | 'setDomainState'>
  files: {
    readLegacy: (path: string) => Promise<Buffer>
    writeLegacyCopy: (path: string, bytes: Buffer) => Promise<unknown>
    readText: (path: string) => Promise<string>
    mkdir: (path: string, options: { recursive: true }) => Promise<unknown>
    writeText: (path: string, text: string) => Promise<unknown>
  }
}

export type FabricatorDesignSettingsService = {
  load: () => Promise<unknown | null>
  save: (settings: unknown) => Promise<void>
}

export function createFabricatorDesignSettingsService(deps: DesignSettingsServiceDependencies): FabricatorDesignSettingsService {
  const folder = join(deps.userDataRoot, 'fabricator', 'design-settings')
  const settingsPath = join(folder, 'settings.json')
  let activation: Promise<void> | null = null

  async function activateDomain(): Promise<void> {
    if (activation) return activation
    activation = (async () => {
      const domainId = 'fabricator.design-settings'
      const current = deps.catalog.getDomainState(domainId).state
      if (current === 'active' || current === 'verified') return
      if (current !== 'legacy') throw new Error(`O armazenamento de Design Dev está em estado ${current}; a gravação foi interrompida.`)

      // Keep the source intact until the catalog path has its legacy copy.
      let legacy: Buffer | null = null
      try { legacy = await deps.files.readLegacy(settingsPath) }
      catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
      deps.catalog.setDomainState(domainId, 'active', { activatedAt: new Date().toISOString(), legacySourcePreserved: Boolean(legacy) })
      try {
        if (legacy) await deps.files.writeLegacyCopy(settingsPath, legacy)
      } catch (reason) {
        deps.catalog.setDomainState(domainId, 'legacy', { activationFailed: true, sourcePreserved: true })
        throw reason
      }
    })()
    try { await activation }
    catch (reason) { activation = null; throw reason }
  }

  async function load(): Promise<unknown | null> {
    await activateDomain()
    try { return JSON.parse(await deps.files.readText(settingsPath)) as unknown }
    catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null; throw reason }
  }

  async function save(settings: unknown): Promise<void> {
    await activateDomain()
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Configuração de Design Dev inválida.')
    const value = settings as { bannerSlides?: unknown[] }
    if (!Array.isArray(value.bannerSlides) || value.bannerSlides.length < 1 || value.bannerSlides.length > 8) throw new Error('O Design Dev deve ter entre 1 e 8 slides.')
    const serialized = JSON.stringify(settings)
    if (serialized.length > 70_000_000) throw new Error('As imagens do Design Dev excedem o limite de armazenamento.')
    for (const raw of value.bannerSlides) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Slide do Design Dev inválido.')
      const slide = raw as { id?: unknown; title?: unknown; subtitle?: unknown; imageDataUrl?: unknown }
      if (typeof slide.id !== 'string' || slide.id.length > 160 || typeof slide.title !== 'string' || slide.title.length > 80
        || typeof slide.subtitle !== 'string' || slide.subtitle.length > 120
        || (slide.imageDataUrl !== null && (typeof slide.imageDataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(slide.imageDataUrl)))) {
        throw new Error('Dados ou imagem inválidos em um slide do Design Dev.')
      }
    }
    await deps.files.mkdir(folder, { recursive: true })
    await deps.files.writeText(settingsPath, JSON.stringify(settings, null, 2))
  }

  return { load, save }
}
