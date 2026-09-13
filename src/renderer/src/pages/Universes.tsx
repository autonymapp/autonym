import { useEffect, useState } from 'react'
import type { Character, Universe, UniverseInput } from '@shared/types'
import Avatar from '../components/Avatar'
import { useConfirm } from '../components/ConfirmDialog'
import { friendlyError } from '../friendlyError'
import { useAppStore } from '../store/appStore'
import { ChevronLeft, ChevronRight, Globe, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'

export default function UniversesPage(): JSX.Element {
  const confirm = useConfirm()
  const {
    pushEscapeHandler,
    popEscapeHandler,
    setPage,
    setActiveCharacterId,
    setActiveChatId,
    setPendingEditCharacterId
  } = useAppStore()
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Universe | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [startingSession, setStartingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trashed, setTrashed] = useState<Universe[]>([])
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    () => localStorage.getItem('autonym:universeSidebarCollapsed') === '1'
  )
  function setSidebarCollapsed(value: boolean): void {
    localStorage.setItem('autonym:universeSidebarCollapsed', value ? '1' : '0')
    setSidebarCollapsedState(value)
  }

  async function refresh(): Promise<void> {
    try {
      const [universeList, characterList] = await Promise.all([
        window.api.universes.list(),
        window.api.characters.list()
      ])
      setUniverses(universeList)
      setCharacters(characterList)
      setLoadError(null)
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (showTrash) refreshTrash()
  }, [showTrash])

  useEffect(() => {
    if (!showTrash) return
    const close = (): void => setShowTrash(false)
    pushEscapeHandler(close)
    return () => popEscapeHandler(close)
  }, [showTrash])

  async function refreshTrash(): Promise<void> {
    try {
      setTrashed(await window.api.universes.listTrashed())
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  useEffect(() => {
    if (selected) {
      setDescriptionDraft(selected.description)
      setSessionError(null)
    }
  }, [selected])

  async function createUniverse(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    const input: UniverseInput = { name, description: '' }
    const universe = await window.api.universes.create(input)
    setNewName('')
    setCreating(false)
    await refresh()
    setSelected(universe)
  }

  async function saveDescription(): Promise<void> {
    if (!selected) return
    const updated = await window.api.universes.update(selected.id, {
      name: selected.name,
      description: descriptionDraft
    })
    setSelected(updated)
    refresh()
  }

  async function deleteUniverse(universe: Universe): Promise<void> {
    if (
      !(await confirm(`"${universe.name}" moves to Trash. Its characters stay put, just unassigned until you restore it.`, {
        title: 'Delete this universe?'
      }))
    )
      return
    await window.api.universes.delete(universe.id)
    if (selected?.id === universe.id) setSelected(null)
    refresh()
  }

  async function restoreUniverse(universe: Universe): Promise<void> {
    await window.api.universes.restore(universe.id)
    refreshTrash()
    refresh()
  }

  async function permanentlyDeleteUniverse(universe: Universe): Promise<void> {
    if (
      !(await confirm(`"${universe.name}" will be gone for good — its characters stay, just unassigned.`, {
        title: 'Delete forever?'
      }))
    )
      return
    await window.api.universes.permanentlyDelete(universe.id)
    refreshTrash()
  }

  async function startWorldbuildingSession(): Promise<void> {
    if (!selected) return
    setStartingSession(true)
    setSessionError(null)
    try {
      const chat = await window.api.universes.startWorldbuildingSession(selected.id)
      setActiveCharacterId(chat.characterId)
      setActiveChatId(chat.id)
      setPage('chat')
    } catch (err) {
      setSessionError(friendlyError(err))
    } finally {
      setStartingSession(false)
    }
  }

  const selectedCharacters = selected ? characters.filter((c) => c.universeId === selected.id) : []

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {sidebarCollapsed ? (
        <div
          style={{
            width: 32,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 12
          }}
        >
          <button className="msg-action-btn" onClick={() => setSidebarCollapsed(false)} title="Show universes">
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div
          style={{
            width: 230,
            borderRight: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
            background: 'var(--bg-elevated)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Universes</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-icon btn-sm" onClick={() => setCreating(true)}>
                +
              </button>
              <button className="msg-action-btn" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar">
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>
          {loadError && <p className="hint" style={{ color: 'var(--danger)', marginTop: 8 }}>{loadError}</p>}
          {creating && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                autoFocus
                placeholder="Universe name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createUniverse()}
              />
              <button className="btn btn-primary btn-sm" onClick={createUniverse} disabled={!newName.trim()}>
                Create
              </button>
            </div>
          )}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {universes.map((u) => {
              const count = characters.filter((c) => c.universeId === u.id).length
              return (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(u)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(u)
                    }
                  }}
                  className={`sidebar-item${selected?.id === u.id ? ' active' : ''}`}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={13} style={{ flexShrink: 0 }} />
                    {u.name} <span className="hint">({count})</span>
                  </span>
                  <button
                    className="row-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteUniverse(u)
                    }}
                    style={{
                      fontSize: 12,
                      color: 'var(--danger)',
                      background: 'transparent',
                      border: 'none',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )
            })}
            {universes.length === 0 && !creating && (
              <p className="hint" style={{ marginTop: 4 }}>No universes yet — create one to start grouping cast.</p>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm btn-block"
            onClick={() => {
              setShowTrash((s) => !s)
              setSelected(null)
            }}
            style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Trash2 size={13} /> {showTrash ? 'Back to Universes' : 'Trash'}
          </button>
        </div>
      )}

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {showTrash ? (
          trashed.length === 0 ? (
            <div className="empty-state">Trash is empty.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
              {trashed.map((u) => (
                <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                    <div className="hint">Deleted {new Date(u.deletedAt as string).toLocaleString()}</div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => restoreUniverse(u)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => permanentlyDeleteUniverse(u)}>
                    Delete Forever
                  </button>
                </div>
              ))}
            </div>
          )
        ) : !selected ? (
          <div className="empty-state">Select or create a universe.</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Globe size={20} style={{ color: 'var(--accent)' }} /> {selected.name}
              </h2>
              <button
                className="btn btn-primary"
                onClick={startWorldbuildingSession}
                disabled={startingSession}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {startingSession ? (
                  'Opening…'
                ) : (
                  <>
                    <Sparkles size={14} /> Start Worldbuilding Session
                  </>
                )}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 4, marginBottom: 14 }}>
              Brainstorm original characters and NPCs for this world in a Collaborative Mode Act, then save
              what you like as real, {selected.name}-linked cast members.
            </p>
            {sessionError && <p className="hint" style={{ color: 'var(--danger)' }}>{sessionError}</p>}

            <label className="field" style={{ maxWidth: 560 }}>
              <span className="label">Description</span>
              <textarea
                rows={3}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={saveDescription}
                placeholder="What this world is — tone, setting, the shape of it"
              />
            </label>

            <div className="section-title" style={{ marginTop: 22 }}>Cast in this Universe</div>
            {selectedCharacters.length === 0 ? (
              <div className="empty-state">
                No characters yet — assign one from the Cast page, or brainstorm one here.
              </div>
            ) : (
              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 12
                }}
              >
                {selectedCharacters.map((c) => (
                  <button
                    key={c.id}
                    className="card interactive"
                    onClick={() => {
                      setPendingEditCharacterId(c.id)
                      setPage('characters')
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
                  >
                    <Avatar avatarType={c.avatarType} src={c.avatarPath} emoji={c.avatarEmoji} name={c.name} size={34} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
