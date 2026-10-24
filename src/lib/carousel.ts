export function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

export function circularWindow<T>(items: readonly T[], start: number, count: number) {
  if (items.length === 0 || count <= 0) return []
  const visibleCount = Math.min(count, items.length)
  return Array.from({ length: visibleCount }, (_, offset) => items[wrapIndex(start + offset, items.length)])
}

/**
 * Returns the resting carousel window, or the extra slide needed to animate a
 * one-item move without replacing the whole visible grid. Previous moves put
 * the incoming item at the beginning; next moves put it at the end.
 */
export function carouselTrackWindow<T>(
  items: readonly T[],
  start: number,
  count: number,
  direction: -1 | 1 | null,
) {
  if (items.length === 0 || count <= 0) return []
  const visibleCount = Math.min(count, items.length)
  const trackStart = direction === -1 ? start - 1 : start
  const trackCount = direction === null ? visibleCount : visibleCount + 1
  return Array.from(
    { length: trackCount },
    (_, offset) => items[wrapIndex(trackStart + offset, items.length)],
  )
}
