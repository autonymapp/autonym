import type { Store } from './webDb'

/** Every record list in the store that sync merges item by item. */
export const SYNCED_COLLECTIONS = [
  'characters',
  'personas',
  'lorebooks',
  'loreEntries',
  'characterLorebooks',
  'characterRelationships',
  'chats',
  'messages',
  'customPresets',
  'scenarios',
  'storylines',
  'journalEntries',
  'universes'
] as const

export type SyncedCollection = (typeof SYNCED_COLLECTIONS)[number]

type StampMap = Partial<Record<SyncedCollection, Record<string, string>>>

/**
 * When each record was last changed or deleted, as ISO timestamps keyed by collection and record
 * key. Records with no stamp are older than any stamped change. Stored inside the store, so it
 * travels with it to IndexedDB and Supabase.
 */
export interface SyncMeta {
  stamps: StampMap
  tombstones: StampMap
  /** True while this device has changes the cloud hasn't accepted yet. */
  pending?: boolean
}

/** Tombstones older than this are dropped; a device offline longer than this may resurrect a delete. */
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000

/** Records are keyed by id; link rows that have no id are keyed by the pair they link. */
export function recordKey(collection: SyncedCollection, record: any): string {
  if (collection === 'characterLorebooks') return `${record.characterId}:${record.lorebookId}`
  return String(record.id)
}

export function emptySyncMeta(): SyncMeta {
  return { stamps: {}, tombstones: {} }
}

/** A snapshot of every record's serialized form, used to spot which records changed since. */
export type Baseline = Map<string, string>

export function buildBaseline(store: Store): Baseline {
  const baseline: Baseline = new Map()
  for (const col of SYNCED_COLLECTIONS) {
    for (const rec of store[col] as any[]) {
      baseline.set(`${col}|${recordKey(col, rec)}`, JSON.stringify(rec))
    }
  }
  return baseline
}

/**
 * Stamps every record that was added, changed or removed since `baseline` with `now`, and
 * returns a fresh baseline for the store as it stands. Mutates `store.syncMeta`.
 */
export function stampChanges(store: Store, baseline: Baseline, now = new Date().toISOString()): Baseline {
  const meta = (store.syncMeta ??= emptySyncMeta())
  const next = buildBaseline(store)
  let changed = false
  for (const [k, json] of next) {
    if (baseline.get(k) !== json) {
      const [col, key] = splitKey(k)
      ;(meta.stamps[col] ??= {})[key] = now
      if (meta.tombstones[col]) delete meta.tombstones[col]![key]
      changed = true
    }
  }
  for (const k of baseline.keys()) {
    if (!next.has(k)) {
      const [col, key] = splitKey(k)
      ;(meta.tombstones[col] ??= {})[key] = now
      if (meta.stamps[col]) delete meta.stamps[col]![key]
      changed = true
    }
  }
  if (changed) meta.pending = true
  return next
}

function splitKey(k: string): [SyncedCollection, string] {
  const i = k.indexOf('|')
  return [k.slice(0, i) as SyncedCollection, k.slice(i + 1)]
}

/**
 * Merges two copies of the store record by record: for each record the most recent change wins,
 * and a delete wins over any change made before it. Neither input is mutated.
 */
export function mergeStores(local: Store, remote: Store, now = Date.now()): Store {
  const lm = local.syncMeta ?? emptySyncMeta()
  const rm = remote.syncMeta ?? emptySyncMeta()
  const merged: any = { ...remote, ...local }
  const meta: SyncMeta = { stamps: {}, tombstones: {}, pending: lm.pending }
  const cutoff = new Date(now - TOMBSTONE_TTL_MS).toISOString()
  let maxId = 0

  for (const col of SYNCED_COLLECTIONS) {
    const byKey = new Map<string, { l?: any; r?: any }>()
    for (const rec of (remote[col] as any[]) ?? []) byKey.set(recordKey(col, rec), { r: rec })
    for (const rec of (local[col] as any[]) ?? []) {
      const key = recordKey(col, rec)
      byKey.set(key, { ...byKey.get(key), l: rec })
    }
    for (const key of Object.keys({ ...lm.tombstones[col], ...rm.tombstones[col] })) {
      if (!byKey.has(key)) byKey.set(key, {})
    }

    const stamps: Record<string, string> = {}
    const tombstones: Record<string, string> = {}
    const out: any[] = []
    for (const [key, { l, r }] of byKey) {
      const ls = lm.stamps[col]?.[key] ?? ''
      const rs = rm.stamps[col]?.[key] ?? ''
      // On a tie the local copy wins, so a device never discards its own unsynced edit.
      const useLocal = l !== undefined && (r === undefined || ls >= rs)
      const rec = useLocal ? l : r
      const stamp = useLocal ? ls : rs
      const tomb = maxStamp(lm.tombstones[col]?.[key], rm.tombstones[col]?.[key])

      if (tomb && (rec === undefined || tomb >= stamp)) {
        if (tomb >= cutoff) tombstones[key] = tomb
        continue
      }
      if (rec === undefined) continue
      out.push(rec)
      if (stamp) stamps[key] = stamp
      if (typeof rec.id === 'number') maxId = Math.max(maxId, rec.id)
    }
    out.sort((a, b) => (typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : 0))
    merged[col] = out
    if (Object.keys(stamps).length) meta.stamps[col] = stamps
    if (Object.keys(tombstones).length) meta.tombstones[col] = tombstones
  }

  merged.nextId = Math.max(local.nextId ?? 1, remote.nextId ?? 1, maxId + 1)
  merged.seedCleanupDone = Boolean(local.seedCleanupDone || remote.seedCleanupDone)
  merged.syncMeta = meta
  return merged as Store
}

function maxStamp(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}
