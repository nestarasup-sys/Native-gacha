import type { StudioDocument } from '../studio'

/**
 * Bounded, project-scoped undo/redo of immutable StudioDocument v1 snapshots.
 * Artwork and media stay shared by reference; no serialization or disk IO.
 */
export class RebuildDocumentHistory {
  private current: StudioDocument | null = null
  private past: StudioDocument[] = []
  private future: StudioDocument[] = []

  constructor(private readonly limit = 64) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256)
      throw new RangeError('Limite de histórico inválido.')
  }

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  reset(document: StudioDocument | null): void {
    this.current = document
    this.past = []
    this.future = []
  }

  private follow(document: StudioDocument): void {
    // Never apply checkpoints to a newly loaded or externally replaced file.
    if (this.current !== document) this.reset(document)
  }

  record(previous: StudioDocument, next: StudioDocument): boolean {
    if (next === previous) return false
    if (previous.schemaVersion !== 1 || next.schemaVersion !== 1
      || previous.id !== next.id || !previous.videoTimeline || !next.videoTimeline
      || previous.videoTimeline.schemaVersion !== 1 || next.videoTimeline.schemaVersion !== 1) {
      throw new Error('Histórico não pode atravessar projetos ou versões de documento.')
    }
    this.follow(previous)
    this.past.push(previous)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    this.current = next
    return true
  }

  undo(document: StudioDocument): StudioDocument | null {
    this.follow(document)
    const previous = this.past.pop()
    if (!previous) return null
    this.future.push(document)
    this.current = previous
    return previous
  }

  redo(document: StudioDocument): StudioDocument | null {
    this.follow(document)
    const next = this.future.pop()
    if (!next) return null
    this.past.push(document)
    this.current = next
    return next
  }
}
