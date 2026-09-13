import { useEffect, useState } from 'react'
import type { LoreEntry, LoreEntryInput, Lorebook, LorebookInput, Universe } from '@shared/types'
import { LORE_ENTRY_TYPES } from '@shared/loreEntryTypes'
import { STARTER_PACKS } from '@shared/starterPacks'
import LoreEntryForm from '../components/LoreEntryForm'
import AutoGrowTextarea from '../components/AutoGrowTextarea'
import AutonymMark from '../components/AutonymMark'
import { useConfirm } from '../components/ConfirmDialog'
import ContextMenu from '../components/ContextMenu'
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Pencil,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  X
} from 'lucide-react'
import { friendlyError } from '../friendlyError'
import { useAppStore } from '../store/appStore'

export default function LorebooksPage(): JSX.Element {
  const confirm = useConfirm()
  const { pushEscapeHandler, popEscapeHandler } = useAppStore()
  const [lorebookContextMenu, setLorebookContextMenu] = useState<{ lorebookId: number; x: number; y: number } | null>(
    null
  )
  const [entryContextMenu, setEntryContextMenu] = useState<{ entryId: number; x: number; y: number } | null>(null)
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Lorebook | null>(null)
  const [entries, setEntries] = useState<LoreEntry[]>([])
  const [creatingLorebook, setCreatingLorebook] = useState(false)
  const [newLorebookName, setNewLorebookName] = useState('')
  const [newLorebookCanon, setNewLorebookCanon] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LoreEntry | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [editingLorebookMeta, setEditingLorebookMeta] = useState(false)
  const [metaDescription, setMetaDescription] = useState('')
  const [metaCanon, setMetaCanon] = useState(false)
  const [metaUniverseId, setMetaUniverseId] = useState<number | null>(null)
  const [universes, setUniverses] = useState<Universe[]>([])
  const [showStarterPacks, setShowStarterPacks] = useState(false)
  const [importingPackId, setImportingPackId] = useState<string | null>(null)
  const [importingPackFile, setImportingPackFile] = useState(false)
  const [exportingPack, setExportingPack] = useState(false)
  const [packStatus, setPackStatus] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trashedLorebooks, setTrashedLorebooks] = useState<Lorebook[]>([])
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    () => localStorage.getItem('autonym:lorebookSidebarCollapsed') === '1'
  )
  function setSidebarCollapsed(value: boolean): void {
    localStorage.setItem('autonym:lorebookSidebarCollapsed', value ? '1' : '0')
    setSidebarCollapsedState(value)
  }

  async function refreshLorebooks(): Promise<void> {
    try {
      const list = await window.api.lorebooks.list()
      setLorebooks(list)
      setLoadError(null)
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  async function refreshEntries(lorebookId: number): Promise<void> {
    try {
      setEntries(await window.api.loreEntries.listByLorebook(lorebookId))
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  useEffect(() => {
    refreshLorebooks()
    window.api.universes.list().then(setUniverses).catch((err) => setLoadError(friendlyError(err)))
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
      setTrashedLorebooks(await window.api.lorebooks.listTrashed())
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  async function restoreLorebook(lb: Lorebook): Promise<void> {
    await window.api.lorebooks.restore(lb.id)
    refreshTrash()
    refreshLorebooks()
  }

  async function permanentlyDeleteLorebook(lb: Lorebook): Promise<void> {
    if (
      !(await confirm(`"${lb.name}" and all its entries will be gone for good — this cannot be undone.`, {
        title: 'Delete forever?'
      }))
    )
      return
    await window.api.lorebooks.permanentlyDelete(lb.id)
    refreshTrash()
  }

  useEffect(() => {
    if (selected) {
      refreshEntries(selected.id)
      setMetaDescription(selected.description)
      setMetaCanon(selected.isCanonSetting)
      setMetaUniverseId(selected.universeId)
      setEditingLorebookMeta(false)
    }
  }, [selected])

  async function createLorebook(): Promise<void> {
    const input: LorebookInput = {
      name: newLorebookName,
      description: '',
      isCanonSetting: newLorebookCanon,
      universeId: null
    }
    const lb = await window.api.lorebooks.create(input)
    setNewLorebookName('')
    setNewLorebookCanon(false)
    setCreatingLorebook(false)
    await refreshLorebooks()
    setSelected(lb)
  }

  async function saveLorebookMeta(): Promise<void> {
    if (!selected) return
    const updated = await window.api.lorebooks.update(selected.id, {
      name: selected.name,
      description: metaDescription,
      isCanonSetting: metaCanon,
      universeId: metaUniverseId
    })
    setSelected(updated)
    setEditingLorebookMeta(false)
    refreshLorebooks()
  }

  async function deleteLorebook(lb: Lorebook): Promise<void> {
    if (!(await confirm(`"${lb.name}" and all its entries will be gone for good.`, { title: 'Delete this lorebook?' })))
      return
    await window.api.lorebooks.delete(lb.id)
    if (selected?.id === lb.id) setSelected(null)
    refreshLorebooks()
  }

  async function importStarterPack(packId: string): Promise<void> {
    const pack = STARTER_PACKS.find((p) => p.id === packId)
    if (!pack) return
    setImportingPackId(packId)
    try {
      const lb = await window.api.lorebooks.create(pack.lorebook)
      for (const entry of pack.entries) {
        await window.api.loreEntries.create({ ...entry, lorebookId: lb.id })
      }
      await refreshLorebooks()
      setSelected(lb)
      setShowStarterPacks(false)
    } finally {
      setImportingPackId(null)
    }
  }

  async function importPackFromFile(): Promise<void> {
    setImportingPackFile(true)
    setPackStatus(null)
    try {
      const result = await window.api.starterPacks.importFile()
      if (!result) return // canceled
      const lb = await window.api.lorebooks.create(result.lorebook)
      for (const entry of result.entries) {
        await window.api.loreEntries.create({ ...entry, lorebookId: lb.id })
      }
      await refreshLorebooks()
      setSelected(lb)
      setShowStarterPacks(false)
      setPackStatus(`Imported "${lb.name}".`)
    } catch (err: any) {
      setPackStatus(`Import failed: ${friendlyError(err)}`)
    } finally {
      setImportingPackFile(false)
    }
  }

  async function exportSelectedAsPack(): Promise<void> {
    if (!selected) return
    setExportingPack(true)
    setPackStatus(null)
    try {
      const saved = await window.api.starterPacks.export(selected.id)
      if (saved) setPackStatus('Saved.')
    } catch (err: any) {
      setPackStatus(`Export failed: ${friendlyError(err)}`)
    } finally {
      setExportingPack(false)
    }
  }

  async function handleImportLorebook(): Promise<void> {
    setImporting(true)
    setImportError(null)
    try {
      const lb = await window.api.import.lorebook()
      if (lb) {
        await refreshLorebooks()
        setSelected(lb)
      }
    } catch (err: any) {
      setImportError(friendlyError(err))
    } finally {
      setImporting(false)
    }
  }

  async function saveEntry(input: LoreEntryInput): Promise<void> {
    if (editingEntry === 'new') {
      await window.api.loreEntries.create(input)
    } else if (editingEntry) {
      await window.api.loreEntries.update(editingEntry.id, input)
    }
    setEditingEntry(null)
    if (selected) refreshEntries(selected.id)
  }

  async function deleteEntry(entry: LoreEntry): Promise<void> {
    if (!(await confirm(`"${entry.title}" will be gone for good.`, { title: 'Delete this entry?' }))) return
    await window.api.loreEntries.delete(entry.id)
    if (selected) refreshEntries(selected.id)
  }

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
          <button className="msg-action-btn" onClick={() => setSidebarCollapsed(false)} title="Show lorebooks">
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
          <h3>Lorebooks</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-icon btn-sm" onClick={() => setCreatingLorebook(true)}>
              +
            </button>
            <button className="msg-action-btn" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar">
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
        {loadError && <p className="hint" style={{ color: 'var(--danger)', marginTop: 8 }}>{loadError}</p>}
        {creatingLorebook && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              autoFocus
              placeholder="Lorebook name"
              value={newLorebookName}
              onChange={(e) => setNewLorebookName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createLorebook()}
            />
            <div className="segmented">
              <button className={!newLorebookCanon ? 'active' : ''} onClick={() => setNewLorebookCanon(false)}>
                Original Setting
              </button>
              <button className={newLorebookCanon ? 'active' : ''} onClick={() => setNewLorebookCanon(true)}>
                Existing Franchise
              </button>
            </div>
            <span className="hint">
              {newLorebookCanon
                ? "For an existing game/show/book world — the AI will be told to stick to the facts here rather than invent lore."
                : 'For a setting you\'re creating yourself.'}
            </span>
            <button className="btn btn-primary btn-sm" onClick={createLorebook} disabled={!newLorebookName.trim()}>
              Create
            </button>
          </div>
        )}
        <button
          className="btn btn-block btn-sm"
          onClick={handleImportLorebook}
          disabled={importing}
          style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          {importing ? 'Importing…' : (
            <>
              <Download size={14} /> Import Lorebook
            </>
          )}
        </button>
        <button
          className="btn btn-block btn-sm"
          onClick={() => setShowStarterPacks((s) => !s)}
          style={{ marginTop: 6 }}
        >
          🚀 Starter Packs
        </button>
        {showStarterPacks && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STARTER_PACKS.map((pack) => (
              <button
                key={pack.id}
                className="card interactive"
                onClick={() => importStarterPack(pack.id)}
                disabled={importingPackId !== null || importingPackFile}
                style={{ padding: 10, textAlign: 'left' }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  {importingPackId === pack.id ? 'Importing…' : pack.label}
                </div>
                <div className="hint" style={{ marginTop: 2 }}>{pack.description}</div>
              </button>
            ))}
            <button
              className="btn btn-block btn-sm"
              onClick={importPackFromFile}
              disabled={importingPackFile || importingPackId !== null}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {importingPackFile ? 'Importing…' : (
                <>
                  <FolderOpen size={14} /> Import Starter Pack File
                </>
              )}
            </button>
            <span className="hint">
              Import a starter pack .json — your own export, or one someone shared with you.
            </span>
          </div>
        )}
        {importError && <p className="hint" style={{ color: 'var(--danger)', marginTop: 6 }}>{importError}</p>}
        {packStatus && <p className="hint" style={{ marginTop: 6 }}>{packStatus}</p>}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lorebooks.map((lb) => (
            <div
              key={lb.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(lb)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelected(lb)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setLorebookContextMenu({ lorebookId: lb.id, x: e.clientX, y: e.clientY })
              }}
              className={`sidebar-item${selected?.id === lb.id ? ' active' : ''}`}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={13} style={{ flexShrink: 0 }} />
                {lb.name} {lb.isCanonSetting && <span title="Existing franchise/canon setting">🌐</span>}
              </span>
              <button
                className="row-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteLorebook(lb)
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
          ))}
        </div>
        <button
          className="btn btn-ghost btn-sm btn-block"
          onClick={() => {
            setShowTrash((s) => !s)
            setSelected(null)
          }}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Trash2 size={13} /> {showTrash ? 'Back to Lorebooks' : 'Trash'}
        </button>
      </div>
      )}

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {showTrash ? (
          trashedLorebooks.length === 0 ? (
            <div className="empty-state">Trash is empty.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
              {trashedLorebooks.map((lb) => (
                <div key={lb.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{lb.name}</div>
                    <div className="hint">Deleted {new Date(lb.deletedAt as string).toLocaleString()}</div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => restoreLorebook(lb)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => permanentlyDeleteLorebook(lb)}>
                    Delete Forever
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
        {!selected && <div className="empty-state">Select or create a lorebook.</div>}
        {selected && editingEntry && (
          <div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditingEntry(null)}
              style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AutonymMark size={22} />
              {editingEntry === 'new' ? 'New Entry' : `Edit ${editingEntry.title}`}
            </h2>
            <LoreEntryForm
              lorebookId={selected.id}
              initial={editingEntry === 'new' ? undefined : editingEntry}
              onSave={saveEntry}
              onCancel={() => setEditingEntry(null)}
            />
          </div>
        )}
        {selected && !editingEntry && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>
                {selected.name}{' '}
                {selected.isCanonSetting && (
                  <span className="pill" title="Existing franchise/canon setting">
                    🌐 Canon Setting
                  </span>
                )}
                {selected.universeId && (
                  <span className="pill" title="Only shows as a linking option within this Universe">
                    {universes.find((u) => u.id === selected.universeId)?.name ?? 'Universe'}
                  </span>
                )}
              </h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-sm"
                  onClick={exportSelectedAsPack}
                  disabled={exportingPack}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {exportingPack ? 'Saving…' : (
                    <>
                      <Save size={14} /> Export as Starter Pack
                    </>
                  )}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setEditingLorebookMeta((s) => !s)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {editingLorebookMeta ? 'Close' : (
                    <>
                      <SettingsIcon size={14} /> Settings
                    </>
                  )}
                </button>
                <button className="btn btn-primary" onClick={() => setEditingEntry('new')}>
                  + New Entry
                </button>
              </div>
            </div>
            {packStatus && <p className="hint" style={{ marginTop: 6 }}>{packStatus}</p>}

            {editingLorebookMeta && (
              <div className="panel" style={{ padding: 16, marginTop: 14, maxWidth: 560 }}>
                <label className="field">
                  <span className="label">Description</span>
                  <AutoGrowTextarea
                    rows={2}
                    value={metaDescription}
                    onChange={setMetaDescription}
                    placeholder="What this lorebook covers"
                  />
                </label>
                <div style={{ marginTop: 12 }}>
                  <span className="label">Setting Type</span>
                  <div className="segmented" style={{ marginTop: 6 }}>
                    <button className={!metaCanon ? 'active' : ''} onClick={() => setMetaCanon(false)}>
                      Original Setting
                    </button>
                    <button className={metaCanon ? 'active' : ''} onClick={() => setMetaCanon(true)}>
                      Existing Franchise
                    </button>
                  </div>
                  <p className="hint" style={{ marginTop: 6 }}>
                    {metaCanon
                      ? "The AI will be told to treat this lorebook's facts as strict canon and avoid inventing additional lore."
                      : "For a setting you're creating yourself — no extra accuracy instruction is added."}
                  </p>
                </div>
                <label className="field" style={{ marginTop: 12 }}>
                  <span className="label">Universe (Optional)</span>
                  <span className="hint">
                    Scopes this lorebook to one world, so it only shows as a linking option for
                    characters in the same Universe. Leave unassigned to keep it available to everyone.
                  </span>
                  <select
                    value={metaUniverseId ?? ''}
                    onChange={(e) => setMetaUniverseId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">No Universe</option>
                    {universes.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary btn-sm" onClick={saveLorebookMeta} style={{ marginTop: 12 }}>
                  Save
                </button>
              </div>
            )}

            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="card"
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setEntryContextMenu({ entryId: entry.id, x: e.clientX, y: e.clientY })
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="pill">
                        {LORE_ENTRY_TYPES[entry.entryType].icon} {LORE_ENTRY_TYPES[entry.entryType].label}
                      </span>
                      {entry.title}
                      {!entry.enabled && (
                        <span className="pill" style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}>
                          disabled
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => setEditingEntry(entry)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteEntry(entry)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {entry.keywords.length > 0 ? (
                      entry.keywords.map((kw) => (
                        <span key={kw} className="pill">
                          {kw}
                        </span>
                      ))
                    ) : (
                      <span className="hint">No cue words</span>
                    )}
                  </div>
                </div>
              ))}
              {entries.length === 0 && <div className="empty-state">No entries yet.</div>}
            </div>
          </>
        )}
          </>
        )}
      </div>

      {lorebookContextMenu &&
        (() => {
          const menuLb = lorebooks.find((l) => l.id === lorebookContextMenu.lorebookId)
          if (!menuLb) return null
          return (
            <ContextMenu
              x={lorebookContextMenu.x}
              y={lorebookContextMenu.y}
              onClose={() => setLorebookContextMenu(null)}
              items={[
                { label: 'Open', icon: BookOpen, onClick: () => setSelected(menuLb) },
                { label: 'Delete', icon: Trash2, onClick: () => deleteLorebook(menuLb), danger: true }
              ]}
            />
          )
        })()}

      {entryContextMenu &&
        (() => {
          const menuEntry = entries.find((e) => e.id === entryContextMenu.entryId)
          if (!menuEntry) return null
          return (
            <ContextMenu
              x={entryContextMenu.x}
              y={entryContextMenu.y}
              onClose={() => setEntryContextMenu(null)}
              items={[
                { label: 'Edit', icon: Pencil, onClick: () => setEditingEntry(menuEntry) },
                { label: 'Delete', icon: Trash2, onClick: () => deleteEntry(menuEntry), danger: true }
              ]}
            />
          )
        })()}
    </div>
  )
}
