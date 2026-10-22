/** Fila serial para não permitir que uma gravação antiga termine DEPOIS da nova.
 * Independente do React e da API IPC; falhas não bloqueiam escritas seguintes.
 */
export class SerializedDocumentSaveQueue {
  private tail: Promise<void> = Promise.resolve()
  private outstanding = 0
  get pending(): number { return this.outstanding }

  run<T>(write: () => Promise<T>): Promise<T> {
    this.outstanding += 1
    const task = this.tail.catch(() => undefined).then(write)
    this.tail = task.then(() => undefined, () => undefined)
    void task.then(() => { this.outstanding -= 1 }, () => { this.outstanding -= 1 })
    return task
  }
  async idle(): Promise<void> { await this.tail }
}
