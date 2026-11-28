/** Returns the first index whose selected value is greater than the target. */
export function editorV6UpperBound<T>(items: readonly T[], target: number, select: (item: T) => number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (select(items[middle]) <= target) low = middle + 1
    else high = middle
  }
  return low
}

/** Returns the first index whose selected value is greater than or equal to the target. */
export function editorV6LowerBound<T>(items: readonly T[], target: number, select: (item: T) => number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (select(items[middle]) < target) low = middle + 1
    else high = middle
  }
  return low
}
