/** Contrato único dos canais IPC do Studio Principal.
 * Manter as strings legadas: o mapa apenas tipa a passagem main ↔ preload.
 */
import type { StudioDesktopApi } from './studio'

export const studioIpcChannels = {
  flushPendingWrites: 'app:flush-pending-writes',
  listStudios: 'studio:list',
  saveStudio: 'studio:save',
  deleteStudio: 'studio:delete',
  getStudioFolder: 'studio:folder',
  importStudioImage: 'studio:import-image',
  saveStudioPrint: 'studio:save-print',
  openStudioPrints: 'studio:open-prints'
} as const satisfies Record<keyof StudioDesktopApi, string>

export type StudioIpcMethod = keyof typeof studioIpcChannels
export type StudioIpcArguments<K extends StudioIpcMethod> = Parameters<StudioDesktopApi[K]>
export type StudioIpcResult<K extends StudioIpcMethod> = Awaited<ReturnType<StudioDesktopApi[K]>>

export type StudioInvokeTransport = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** Nenhum cast é exposto aos consumidores, apenas à borda de transporte. */
export function createStudioInvoker(transport: StudioInvokeTransport) {
  return function invoke<K extends StudioIpcMethod>(
    method: K, ...args: StudioIpcArguments<K>
  ): Promise<StudioIpcResult<K>> {
    return transport.invoke(studioIpcChannels[method], ...args) as Promise<StudioIpcResult<K>>
  }
}
