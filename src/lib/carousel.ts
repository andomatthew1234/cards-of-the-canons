export function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

export function circularWindow<T>(items: readonly T[], start: number, count: number) {
  if (items.length === 0 || count <= 0) return []
  const visibleCount = Math.min(count, items.length)
  return Array.from({ length: visibleCount }, (_, offset) => items[wrapIndex(start + offset, items.length)])
}
