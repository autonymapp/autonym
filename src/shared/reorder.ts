/** Moves the item at `fromIndex` to `toIndex`, shifting everything in between — the core of a
 *  Trello-style drag-to-reorder list. Pure and side-effect-free so it's usable from any
 *  drag-and-drop implementation and testable without simulating real drag events. */
export function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...list]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}
