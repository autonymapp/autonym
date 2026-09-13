/** Throws a clear error instead of silently writing a dangling reference when a renderer-supplied
 *  ID doesn't correspond to a real record — used at the top of IPC handlers that take an ID for
 *  something other than the primary record they're creating/updating. */
export function assertExists<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} not found`)
  return value
}
