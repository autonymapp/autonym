import { useEffect, useState } from 'react'
import type { Character, CharacterInput, JournalEntry, Lorebook, Universe } from '@shared/types'
import AutonymMark from '../components/AutonymMark'
import CharacterForm from '../components/CharacterForm'
import Avatar from '../components/Avatar'
import RelationshipPanel from '../components/RelationshipPanel'
import { useConfirm } from '../components/ConfirmDialog'
import ContextMenu from '../components/ContextMenu'
import { ArrowLeft, ChevronRight, Download, MessageCircle, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { friendlyError } from '../friendlyError'
import { useAppStore } from '../store/appStore'
import { formatCharacterAsSheet } from '@shared/exportCharacter'

export default function CharactersPage(): JSX.Element {
  const [characters, setCharacters] = useState<Character[]>([])
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [universes, setUniverses] = useState<Universe[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Character | 'new' | null>(null)
  const [linkedLorebookIds, setLinkedLorebookIds] = useState<number[]>([])
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [newDraft, setNewDraft] = useState<Partial<CharacterInput> | undefined>(undefined)
  const [draftedFromChat, setDraftedFromChat] = useState(false)
  const [cardContextMenu, setCardContextMenu] = useState<{ characterId: number; x: number; y: number } | null>(null)
  const [journalContextMenu, setJournalContextMenu] = useState<{ entryId: number; x: number; y: number } | null>(null)
  const [showAllLorebookUniverses, setShowAllLorebookUniverses] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [universeFilter, setUniverseFilter] = useState<number | 'none' | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trashedCharacters, setTrashedCharacters] = useState<Character[]>([])
  const {
    setPage,
    setActiveCharacterId,
    pendingCharacterDraft,
    setPendingCharacterDraft,
    pendingEditCharacterId,
    setPendingEditCharacterId,
    pushEscapeHandler,
    popEscapeHandler
  } = useAppStore()
  const confirm = useConfirm()

  useEffect(() => {
    if (!showTrash) return
    const close = (): void => setShowTrash(false)
    pushEscapeHandler(close)
    return () => popEscapeHandler(close)
  }, [showTrash])

  async function refresh(): Promise<void> {
    try {
      setCharacters(await window.api.characters.list())
      setLorebooks(await window.api.lorebooks.list())
      setUniverses(await window.api.universes.list())
      setLoadError(null)
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  async function refreshTrash(): Promise<void> {
    try {
      setTrashedCharacters(await window.api.characters.listTrashed())
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  async function restoreCharacter(c: Character): Promise<void> {
    await window.api.characters.restore(c.id)
    refreshTrash()
    refresh()
  }

  async function permanentlyDeleteCharacter(c: Character): Promise<void> {
    if (
      !(await confirm(`"${c.name}" and everything tied to them will be gone for good — this cannot be undone.`, {
        title: 'Delete forever?'
      }))
    )
      return
    await window.api.characters.permanentlyDelete(c.id)
    refreshTrash()
  }

  useEffect(() => {
    if (showTrash) refreshTrash()
  }, [showTrash])

  useEffect(() => {
    refresh().then(() => {
      if (pendingEditCharacterId !== null) {
        window.api.characters.get(pendingEditCharacterId).then((c) => {
          if (c) setEditing(c)
          setPendingEditCharacterId(null)
        })
      }
    })
    if (pendingCharacterDraft) {
      setNewDraft(pendingCharacterDraft)
      setDraftedFromChat(true)
      setEditing('new')
      setPendingCharacterDraft(null)
    }
    // Only meant to run once, on mount — consuming the draft shouldn't re-trigger on later state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editing && editing !== 'new') {
      window.api.characters.getLorebookIds(editing.id).then(setLinkedLorebookIds).catch((err) => setLoadError(friendlyError(err)))
      window.api.journal.listForCharacter(editing.id).then(setJournalEntries).catch((err) => setLoadError(friendlyError(err)))
    } else {
      setLinkedLorebookIds([])
      setJournalEntries([])
    }
    setShowAllLorebookUniverses(false)
  }, [editing])

  async function deleteJournalEntry(id: number): Promise<void> {
    if (!(await confirm('This journal entry will be gone for good.', { title: 'Delete this entry?' }))) return
    await window.api.journal.delete(id)
    setJournalEntries((prev) => prev.filter((e) => e.id !== id))
  }

  async function handleSave(input: CharacterInput): Promise<void> {
    if (editing === 'new') {
      await window.api.characters.create(input)
    } else if (editing) {
      await window.api.characters.update(editing.id, input)
    }
    setEditing(null)
    refresh()
  }

  async function handleDelete(c: Character): Promise<void> {
    if (
      !(await confirm(`${c.name} and every act, journal entry, and storyline of theirs will be gone for good.`, {
        title: `Delete ${c.name}?`
      }))
    )
      return
    await window.api.characters.delete(c.id)
    refresh()
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    setImportStatus(null)
    try {
      const result = await window.api.import.characters()
      if (result.imported.length === 0 && result.failed.length === 0) {
        setImportStatus(null) // user canceled the file picker
      } else {
        const parts: string[] = []
        if (result.imported.length > 0) {
          parts.push(`Imported ${result.imported.length} character(s): ${result.imported.map((c) => c.name).join(', ')}.`)
        }
        if (result.failed.length > 0) {
          parts.push(
            `Failed: ${result.failed.map((f) => `${f.file.split(/[\\/]/).pop()} (${f.error})`).join('; ')}`
          )
        }
        setImportStatus(parts.join(' '))
        refresh()
      }
    } catch (err: any) {
      setImportStatus(`Import failed: ${friendlyError(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function exportCharacter(c: Character): Promise<void> {
    const content = formatCharacterAsSheet(c)
    await window.api.chat.saveStoryFile(`${c.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'character'}.md`, content)
  }

  async function toggleLorebook(lorebookId: number): Promise<void> {
    if (editing === 'new' || !editing) return
    if (linkedLorebookIds.includes(lorebookId)) {
      await window.api.characters.unlinkLorebook(editing.id, lorebookId)
      setLinkedLorebookIds((ids) => ids.filter((id) => id !== lorebookId))
    } else {
      await window.api.characters.linkLorebook(editing.id, lorebookId)
      setLinkedLorebookIds((ids) => [...ids, lorebookId])
    }
  }

  function openChat(c: Character): void {
    setActiveCharacterId(c.id)
    setPage('chat')
  }

  const allTags = Array.from(new Set(characters.flatMap((c) => c.tags))).sort()
  const visibleCharacters = characters
    .filter((c) => !tagFilter || c.tags.includes(tagFilter))
    .filter((c) => {
      if (universeFilter === null) return true
      if (universeFilter === 'none') return c.universeId === null
      return c.universeId === universeFilter
    })

  function linkedVariantsOf(c: Character): Character[] {
    if (c.baseCharacterId) {
      const base = characters.find((ch) => ch.id === c.baseCharacterId)
      const siblings = characters.filter((ch) => ch.baseCharacterId === c.baseCharacterId && ch.id !== c.id)
      return base ? [base, ...siblings] : siblings
    }
    return characters.filter((ch) => ch.baseCharacterId === c.id)
  }

  if (editing) {
    return (
      <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(null)}
          style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h2
          style={{
            marginBottom: editing === 'new' && draftedFromChat ? 4 : 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <AutonymMark size={22} />
          {editing === 'new' ? 'New Character' : `Edit ${editing.name}`}
        </h2>
        {editing === 'new' && draftedFromChat && (
          <p className="hint" style={{ marginBottom: 18, color: 'var(--accent)' }}>
            ✨ Drafted from a collaborative act — review everything before saving.
          </p>
        )}
        <CharacterForm
          initial={editing === 'new' ? newDraft : editing}
          universes={universes}
          rootCharacters={characters.filter((c) => !c.baseCharacterId && c.id !== (editing === 'new' ? -1 : editing.id))}
          onCreateUniverse={async (name) => {
            const universe = await window.api.universes.create({ name, description: '' })
            setUniverses((prev) => [...prev, universe].sort((a, b) => a.name.localeCompare(b.name)))
            return universe
          }}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
        {editing !== 'new' && (() => {
          const crossUniverseLorebookCount = lorebooks.filter(
            (lb) => lb.universeId !== editing.universeId && !linkedLorebookIds.includes(lb.id)
          ).length
          const visibleLorebooks = showAllLorebookUniverses
            ? lorebooks
            : lorebooks.filter((lb) => lb.universeId === editing.universeId || linkedLorebookIds.includes(lb.id))
          return (
            <div className="panel" style={{ marginTop: 24, maxWidth: 840, padding: 16 }}>
              <h3 style={{ marginBottom: 4 }}>Linked Lorebooks</h3>
              <p className="hint" style={{ marginBottom: 10 }}>
                World-info entries from these lorebooks can be auto-injected into this character's acts.
              </p>
              {lorebooks.length === 0 && (
                <p className="hint">No lorebooks yet — create one on the Lorebooks page.</p>
              )}
              {crossUniverseLorebookCount > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={showAllLorebookUniverses}
                    onChange={(e) => setShowAllLorebookUniverses(e.target.checked)}
                  />
                  <span className="hint">
                    Show {crossUniverseLorebookCount} lorebook{crossUniverseLorebookCount === 1 ? '' : 's'} from
                    other universes
                  </span>
                </label>
              )}
              {lorebooks.length > 0 && visibleLorebooks.length === 0 && (
                <p className="hint">No lorebooks in this Universe yet.</p>
              )}
              {visibleLorebooks.map((lb) => (
                <label key={lb.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={linkedLorebookIds.includes(lb.id)}
                    onChange={() => toggleLorebook(lb.id)}
                  />
                  <span style={{ fontSize: 13 }}>{lb.name}</span>
                </label>
              ))}
            </div>
          )
        })()}
        {editing !== 'new' && (
          <div className="panel" style={{ marginTop: 24, maxWidth: 840, padding: 16 }}>
            <details open>
              <summary className="section-title" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChevronRight size={14} className="details-chevron" /> 🔗 Relationship Map
              </summary>
              <p className="hint" style={{ marginTop: 4, marginBottom: 4 }}>
                How {editing.name} relates to your other characters. Whenever they're both in the same
                act (one played by you, one by the AI), this gets folded into the prompt automatically.
              </p>
              <RelationshipPanel
                character={editing}
                otherCharacters={characters.filter((c) => c.id !== editing.id)}
              />
            </details>
          </div>
        )}
        {editing !== 'new' && (
          <div className="panel" style={{ marginTop: 24, maxWidth: 840, padding: 16 }}>
            <details open>
              <summary className="section-title" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChevronRight size={14} className="details-chevron" /> 📔 Journal
              </summary>
              <p className="hint" style={{ marginTop: 4, marginBottom: 10 }}>
                A running log of what's happened to {editing.name} across every act they've appeared
                in. Generate an entry for an act from that act's top bar.
              </p>
              {journalEntries.length === 0 ? (
              <p className="hint">No journal entries yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {journalEntries
                  .slice()
                  .sort((a, b) => b.id - a.id)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="panel"
                      style={{ padding: 12, background: 'var(--bg-sunken)' }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setJournalContextMenu({ entryId: entry.id, x: e.clientX, y: e.clientY })
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.chatTitle}</div>
                          <div className="hint">{new Date(entry.createdAt).toLocaleString()}</div>
                        </div>
                        <button
                          className="msg-action-btn"
                          title="Delete this entry"
                          onClick={() => deleteJournalEntry(entry.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap' }}>{entry.summary}</p>
                    </div>
                  ))}
              </div>
            )}
            </details>
          </div>
        )}
        {journalContextMenu && (
          <ContextMenu
            x={journalContextMenu.x}
            y={journalContextMenu.y}
            onClose={() => setJournalContextMenu(null)}
            items={[
              {
                label: 'Delete',
                icon: Trash2,
                onClick: () => deleteJournalEntry(journalContextMenu.entryId),
                danger: true
              }
            ]}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Cast</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => setShowTrash((s) => !s)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={14} /> {showTrash ? 'Back to Cast' : 'Trash'}
          </button>
          {!showTrash && (
            <>
              <button
                className="btn"
                onClick={handleImport}
                disabled={importing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {importing ? 'Importing…' : (
                  <>
                    <Download size={14} /> Import Character File
                  </>
                )}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setNewDraft(undefined)
                  setDraftedFromChat(false)
                  setEditing('new')
                }}
              >
                + New Character
              </button>
            </>
          )}
        </div>
      </div>
      {importStatus && <p className="hint" style={{ marginTop: 10 }}>{importStatus}</p>}
      {loadError && <p className="hint" style={{ color: 'var(--danger)', marginTop: 10 }}>{loadError}</p>}

      {showTrash ? (
        trashedCharacters.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            Trash is empty.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, maxWidth: 640 }}>
            {trashedCharacters.map((c) => (
              <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar avatarType={c.avatarType} src={c.avatarPath} emoji={c.avatarEmoji} name={c.name} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                  <div className="hint">Deleted {new Date(c.deletedAt as string).toLocaleString()}</div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => restoreCharacter(c)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <RotateCcw size={13} /> Restore
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => permanentlyDeleteCharacter(c)}>
                  Delete Forever
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {universes.length > 0 && (
            <div className="segmented" style={{ maxWidth: 560, marginTop: 16 }}>
              <button className={universeFilter === null ? 'active' : ''} onClick={() => setUniverseFilter(null)}>
                All
              </button>
              {universes.map((u) => (
                <button
                  key={u.id}
                  className={universeFilter === u.id ? 'active' : ''}
                  onClick={() => setUniverseFilter(u.id)}
                >
                  {u.name}
                </button>
              ))}
              <button className={universeFilter === 'none' ? 'active' : ''} onClick={() => setUniverseFilter('none')}>
                No Universe
              </button>
            </div>
          )}
          {allTags.length > 0 && (
            <div className="segmented" style={{ maxWidth: 480, marginTop: 8 }}>
              <button className={tagFilter === null ? 'active' : ''} onClick={() => setTagFilter(null)}>
                All Tags
              </button>
              {allTags.map((tag) => (
                <button key={tag} className={tagFilter === tag ? 'active' : ''} onClick={() => setTagFilter(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          )}
          {characters.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          No cast members yet. Create one, or import a character file to get started.
        </div>
      ) : visibleCharacters.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          No characters match this filter.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: 14,
            marginTop: 20
          }}
        >
          {visibleCharacters.map((c) => (
            <div
              key={c.id}
              className="card interactive"
              onContextMenu={(e) => {
                e.preventDefault()
                setCardContextMenu({ characterId: c.id, x: e.clientX, y: e.clientY })
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Avatar avatarType={c.avatarType} src={c.avatarPath} emoji={c.avatarEmoji} name={c.name} size={42} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{c.name}</div>
                  {c.universeId && (
                    <span className="pill" style={{ marginTop: 2, background: 'var(--accent-2)', color: 'var(--bg)' }}>
                      {universes.find((u) => u.id === c.universeId)?.name}
                    </span>
                  )}
                </div>
              </div>
              <p
                className="hint"
                style={{
                  minHeight: 32,
                  marginTop: 10,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}
              >
                {c.personality || 'No personality set yet'}
              </p>
              {c.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {c.tags.map((tag) => (
                    <span key={tag} className="pill" style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {linkedVariantsOf(c).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {linkedVariantsOf(c).map((variant) => (
                    <button
                      key={variant.id}
                      className="pill"
                      title={`Jump to linked variant: ${variant.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditing(variant)
                      }}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      ↔ {variant.name}
                      {variant.universeId && ` (${universes.find((u) => u.id === variant.universeId)?.name})`}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={() => openChat(c)}>
                  Act
                </button>
                <button className="btn btn-sm" onClick={() => setEditing(c)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
          )}
        </>
      )}

      {cardContextMenu &&
        (() => {
          const menuCharacter = characters.find((c) => c.id === cardContextMenu.characterId)
          if (!menuCharacter) return null
          return (
            <ContextMenu
              x={cardContextMenu.x}
              y={cardContextMenu.y}
              onClose={() => setCardContextMenu(null)}
              items={[
                { label: 'Act', icon: MessageCircle, onClick: () => openChat(menuCharacter) },
                { label: 'Edit', icon: Pencil, onClick: () => setEditing(menuCharacter) },
                { label: 'Export', icon: Download, onClick: () => exportCharacter(menuCharacter) },
                { label: 'Delete', icon: Trash2, onClick: () => handleDelete(menuCharacter), danger: true }
              ]}
            />
          )
        })()}
    </div>
  )
}
