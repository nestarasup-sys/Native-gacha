import { createKeyedOperationQueue } from '../storage/keyedOperationQueue.ts'

const ROTEIROS_WRITE_KEY = 'roteiros'

/** Serializes Roteiros writes and keeps failed writes visible to backup/shutdown. */
export function createRoteirosWriteQueue() {
  const operations = createKeyedOperationQueue({ retainFailures: true })

  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    return operations.run(ROTEIROS_WRITE_KEY, () => Promise.resolve(operation()))
  }

  async function waitForPendingWrites(): Promise<void> {
    await Promise.allSettled(operations.getPendingWrites())
  }

  return {
    enqueue,
    waitForPendingWrites,
    getPendingWrites: operations.getPendingWrites
  }
}
