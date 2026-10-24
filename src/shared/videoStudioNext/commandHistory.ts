/**
 * Independent, platform-neutral history owner for the rebuilt EditorCore.
 * Old snapshots are immutable and share media branches by reference.
 * The optional weighing callback is intentionally caller-supplied: counting
 * compressed data URLs as decoded VRAM would be a misleading budget.
 */
export class VideoStudioCommandHistory<T> {
  private owner: string | null = null
  private past: T[] = []
  private future: T[] = []
  private pending: T | null = null

  constructor(
    private readonly equal: (left: T, right: T) => boolean,
    private readonly limit = 1000
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Invalid history limit')
  }

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  reset(owner: string | null): void {
    this.owner = owner
    this.past = []
    this.future = []
    this.pending = null
  }

  begin(owner: string, current: T): void {
    if (this.owner !== owner) this.reset(owner)
    this.observe(owner, current)
    this.pending = current
  }

  observe(owner: string, current: T): boolean {
    if (this.owner !== owner || this.pending === null || this.equal(this.pending, current)) return false
    this.push(this.past, this.pending)
    this.pending = null
    this.future = []
    return true
  }

  cancelPending(): void { this.pending = null }

  undo(owner: string, current: T): T | undefined {
    if (this.owner !== owner) return undefined
    this.observe(owner, current)
    this.cancelPending()
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.push(this.future, current)
    return previous
  }

  redo(owner: string, current: T): T | undefined {
    if (this.owner !== owner) return undefined
    this.observe(owner, current)
    this.cancelPending()
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.push(this.past, current)
    return next
  }

  private push(stack: T[], snapshot: T): void {
    stack.push(snapshot)
    if (stack.length > this.limit) stack.splice(0, stack.length - this.limit)
  }
}

/** Respect structural sharing: no JSON stringify/copy of media in equality. */
export function equalVideoStudioHistoryValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.hasOwn(b, key) && equalVideoStudioHistoryValue(a[key], b[key]))
}
