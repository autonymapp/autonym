import { describe, it, expect } from 'vitest'
import { buildBaseline, mergeStores, stampChanges } from './syncMerge'

function store(characters: any[], extra: Record<string, unknown> = {}): any {
  return {
    nextId: 1 + Math.max(0, ...characters.map((c) => c.id)),
    characters,
    personas: [],
    lorebooks: [],
    loreEntries: [],
    characterLorebooks: [],
    characterRelationships: [],
    chats: [],
    messages: [],
    customPresets: [],
    scenarios: [],
    storylines: [],
    journalEntries: [],
    universes: [],
    ...extra
  }
}

const T1 = '2026-10-15T10:00:00.000Z'
const T2 = '2026-10-15T10:05:00.000Z'
const NOW = Date.parse('2026-10-15T11:00:00.000Z')

describe('stampChanges', () => {
  it('dates added, edited and removed records and marks the store pending', () => {
    const s = store([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    const base = buildBaseline(s)
    s.characters = [{ id: 1, name: 'A2' }, { id: 3, name: 'C' }]

    stampChanges(s, base, T1)

    expect(s.syncMeta.stamps.characters).toEqual({ '1': T1, '3': T1 })
    expect(s.syncMeta.tombstones.characters).toEqual({ '2': T1 })
    expect(s.syncMeta.pending).toBe(true)
  })

  it('leaves an unchanged store alone', () => {
    const s = store([{ id: 1, name: 'A' }])
    stampChanges(s, buildBaseline(s), T1)
    expect(s.syncMeta.pending).toBeUndefined()
  })
})

describe('mergeStores', () => {
  it('keeps edits from both devices when they touch different records', () => {
    const pc = store([{ id: 1, name: 'PC edit' }, { id: 2, name: 'B' }], {
      syncMeta: { stamps: { characters: { '1': T2 } }, tombstones: {} }
    })
    const phone = store([{ id: 1, name: 'A' }, { id: 2, name: 'Phone edit' }], {
      syncMeta: { stamps: { characters: { '2': T2 } }, tombstones: {} }
    })

    const merged = mergeStores(pc, phone, NOW)

    expect(merged.characters.map((c: any) => c.name)).toEqual(['PC edit', 'Phone edit'])
  })

  it('takes the newer edit when both devices changed the same record', () => {
    const older = store([{ id: 1, name: 'Old' }], { syncMeta: { stamps: { characters: { '1': T1 } }, tombstones: {} } })
    const newer = store([{ id: 1, name: 'New' }], { syncMeta: { stamps: { characters: { '1': T2 } }, tombstones: {} } })

    expect(mergeStores(older, newer, NOW).characters[0].name).toBe('New')
    expect(mergeStores(newer, older, NOW).characters[0].name).toBe('New')
  })

  it('keeps a record created on one device and drops one deleted on the other', () => {
    const pc = store([{ id: 1, name: 'A' }, { id: 5, name: 'New on PC' }], {
      syncMeta: { stamps: { characters: { '5': T2 } }, tombstones: {} }
    })
    const phone = store([], { syncMeta: { stamps: {}, tombstones: { characters: { '1': T2 } } } })

    const merged = mergeStores(pc, phone, NOW)

    expect(merged.characters.map((c: any) => c.id)).toEqual([5])
    expect(merged.syncMeta!.tombstones.characters).toEqual({ '1': T2 })
    expect(merged.nextId).toBe(6)
  })

  it('lets an edit made after a delete bring the record back', () => {
    const pc = store([{ id: 1, name: 'Edited later' }], {
      syncMeta: { stamps: { characters: { '1': T2 } }, tombstones: {} }
    })
    const phone = store([], { syncMeta: { stamps: {}, tombstones: { characters: { '1': T1 } } } })

    expect(mergeStores(pc, phone, NOW).characters.map((c: any) => c.name)).toEqual(['Edited later'])
  })

  it('merges link rows that have no id by the pair they link', () => {
    const pc = store([], {
      characterLorebooks: [{ characterId: 1, lorebookId: 2 }],
      syncMeta: { stamps: { characterLorebooks: { '1:2': T2 } }, tombstones: {} }
    })
    const phone = store([], { characterLorebooks: [{ characterId: 1, lorebookId: 3 }] })

    expect(mergeStores(pc, phone, NOW).characterLorebooks).toHaveLength(2)
  })
})
