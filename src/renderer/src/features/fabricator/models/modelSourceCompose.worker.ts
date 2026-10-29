import type { ModelSourceComposeMessage, ModelSourceComposeWorkerRequest } from './modelSourceComposeProtocol'
import { composeModelSourceImages } from './modelSourceComposer'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ModelSourceComposeWorkerRequest>) => void) | null
  postMessage: (message: ModelSourceComposeMessage) => void
}

workerScope.onmessage = async (event: MessageEvent<ModelSourceComposeWorkerRequest>) => {
  const request = event.data
  try {
    workerScope.postMessage({
      type: 'complete',
      id: request.id,
      output: await composeModelSourceImages(request)
    })
  } catch (reason) {
    workerScope.postMessage({
      type: 'error',
      id: request.id,
      message: reason instanceof Error ? reason.message : 'Não foi possível compor o Model Source.'
    })
  }
}
