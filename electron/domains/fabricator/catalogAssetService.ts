/** Serviço de domínio para PNGs dos catálogos do Fabricador.
 * Sem Electron nem mutação de manifestos. Leitura via DomainFileSystem injetado.
 */
import { VersionedAssetResolver, type AssetNamespace } from './versionedAssetResolver.ts'

export type CatalogAssetStatistics = {
  reads: number
  hits: number
  misses: number
  invalidations: number
  bytes: number
  entries: number
}
export class FabricatorCatalogAssetService {
  private readonly resolver: VersionedAssetResolver
  private reads = 0
  private hits = 0
  private misses = 0
  private invalidations = 0
  private readonly readAssetImage: (path: string) => Promise<Uint8Array>
  constructor(readAssetImage: (path: string) => Promise<Uint8Array>, capacity = 32 * 1024 * 1024) {
    this.readAssetImage = readAssetImage
    this.resolver = new VersionedAssetResolver(capacity)
  }

  async read(namespace: AssetNamespace, identity: string, version: string, path: string): Promise<Buffer> {
    this.reads++
    // hit count is an indicator of already-cached payload; pending reads remain deduplicated.
    const before = this.resolver.has(namespace, identity, version, path)
    if (before) this.hits++
    else this.misses++
    const bytes = await this.resolver.resolve(namespace, identity, version, () => this.readAssetImage(path), path)
    return Buffer.from(bytes)
  }
  invalidate(namespace: AssetNamespace, identity: string): void {
    this.invalidations++
    this.resolver.invalidate(namespace, identity)
  }
  stats(): CatalogAssetStatistics {
    return Object.freeze({
      reads: this.reads, hits: this.hits, misses: this.misses,
      invalidations: this.invalidations,
      bytes: this.resolver.byteSize, entries: this.resolver.entries
    })
  }
}
