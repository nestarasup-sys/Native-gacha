import type { IpcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { editorV6WorkerChannels, type EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { createEditorV6WorkerRegistry } from '../../electron/domains/editorV6/exportWorkerRegistry'

function fixture() {
  const handlers = new Map<string, (...args: any[]) => any>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel))
  } as unknown as IpcMain
  return { handlers, ipcMain, registry: createEditorV6WorkerRegistry(ipcMain) }
}

describe('export worker IPC registry', () => {
  it('serves only the registered payload to the worker main frame and resolves readiness', async () => {
    const { handlers, registry } = fixture()
    const payload = { width: 320 } as EditorV6WorkerPayload
    const mainFrame = {}
    const event = { sender: { id: 12, mainFrame }, senderFrame: mainFrame }
    const registration = registry.register(12, payload)

    expect(handlers.get(editorV6WorkerChannels.payload)!(event)).toBe(payload)
    expect(() => handlers.get(editorV6WorkerChannels.payload)!({ ...event, senderFrame: {} })).toThrow('não autorizado')
    handlers.get(editorV6WorkerChannels.ready)!(event)
    await expect(registration.ready).resolves.toBeUndefined()

    registration.retire()
    expect(() => handlers.get(editorV6WorkerChannels.payload)!(event)).toThrow('não autorizado')
    expect(() => handlers.get(editorV6WorkerChannels.ready)!(event)).not.toThrow()
    registry.dispose()
  })

  it('rejects renderer-reported initialization errors and removes handlers on disposal', async () => {
    const { handlers, ipcMain, registry } = fixture()
    const mainFrame = {}
    const event = { sender: { id: 20, mainFrame }, senderFrame: mainFrame }
    const registration = registry.register(20, {} as EditorV6WorkerPayload)

    handlers.get(editorV6WorkerChannels.ready)!(event, 'Falha ao iniciar')
    await expect(registration.ready).rejects.toThrow('Falha ao iniciar')
    registry.dispose()

    expect(handlers.size).toBe(0)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(editorV6WorkerChannels.payload)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(editorV6WorkerChannels.ready)
  })
})
