/** Contrato tipado dos canais legados da Base de Vídeos entre preload e Main. */
import type { BaseVideosDesktopApi } from './baseVideos'

export const baseVideosIpcChannels = {
  listDetails: 'base-videos:list-details',
  saveDetails: 'base-videos:save-details',
  listCategories: 'base-videos:categories:list',
  createCategory: 'base-videos:categories:create',
  renameCategory: 'base-videos:categories:rename',
  deleteCategory: 'base-videos:categories:delete',
  deleteDetails: 'base-videos:delete-details',
  deleteVideo: 'base-videos:delete',
  publish: 'base-videos:publish'
} as const satisfies Record<keyof BaseVideosDesktopApi, string>

export type BaseVideosIpcMethod = keyof typeof baseVideosIpcChannels
export type BaseVideosIpcArguments<K extends BaseVideosIpcMethod> = Parameters<BaseVideosDesktopApi[K]>
export type BaseVideosIpcResult<K extends BaseVideosIpcMethod> = Awaited<ReturnType<BaseVideosDesktopApi[K]>>
export type BaseVideosInvokeTransport = { invoke(channel: string, ...args: unknown[]): Promise<unknown> }

/** Mantém a conversão de tipos confinada ao transporte do preload. */
export function createBaseVideosInvoker(transport: BaseVideosInvokeTransport) {
  return function invoke<K extends BaseVideosIpcMethod>(
    method: K, ...args: BaseVideosIpcArguments<K>
  ): Promise<BaseVideosIpcResult<K>> {
    return transport.invoke(baseVideosIpcChannels[method], ...args) as Promise<BaseVideosIpcResult<K>>
  }
}
