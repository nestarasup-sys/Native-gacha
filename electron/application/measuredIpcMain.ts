import type { IpcMain } from 'electron'

type IpcMeasurement = <T>(channel: string, action: () => Promise<T> | T) => Promise<T> | T
type IpcMainRegistration = Pick<IpcMain, 'handle' | 'removeHandler'>
type IpcMainMeasurements = IpcMainRegistration & { drain(): Promise<void> }

/** Adds opt-in, payload-free timing around handlers while preserving channel names and results. */
export function createMeasuredIpcMain(
  ipcMain: IpcMainRegistration,
  measure: IpcMeasurement,
  shouldMeasure: (channel: string) => boolean = () => true
): IpcMainMeasurements {
  const pendingHandlers = new Set<Promise<unknown>>()

  function track<T>(result: Promise<T> | T): Promise<T> | T {
    if (!result || typeof (result as Promise<T>).then !== 'function') return result
    const pending = Promise.resolve(result)
    pendingHandlers.add(pending)
    void pending.then(
      () => pendingHandlers.delete(pending),
      () => pendingHandlers.delete(pending)
    )
    return pending
  }

  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => track(
        shouldMeasure(channel)
          ? measure(channel, () => handler(event, ...args))
          : handler(event, ...args)
      ))
    },
    removeHandler(channel) {
      ipcMain.removeHandler(channel)
    },
    async drain() {
      while (pendingHandlers.size > 0) {
        await Promise.allSettled([...pendingHandlers])
      }
    }
  }
}
