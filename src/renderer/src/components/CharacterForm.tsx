import { useState } from 'react'
import type { AvatarType, Character, CharacterInput, Universe } from '@shared/types'
import { CHARACTER_FIELDS as FIELDS } from '@shared/characterFields'
import Avatar from './Avatar'
import TagInput from './TagInput'
import CharacterTextImporter from './CharacterTextImporter'

const AVATAR_TYPE_LABELS: Record<AvatarType, string> = {
  monogram: 'Monogram',
  emoji: 'Emoji',
  image: 'Image'
}

const INHERITABLE_FIELDS = new Set(['personality', 'speechStyle', 'relationships'])

const EMPTY: CharacterInput = {
  name: '',
  avatarType: 'monogram',
  avatarPath: null,
  avatarEmoji: null,
  universeId: null,
  baseCharacterId: null,
  isWorldbuildingAssistant: false,
  tags: [],
  appearance: '',
  personality: '',
  speechStyle: '',
  background: '',
  relationships: '',
  scenario: '',
  firstMessage: '',
  notes: ''
}

export default function CharacterForm({
  initial,
  universes,
  rootCharacters,
  onCreateUniverse,
  onSave,
  onCancel
}: {
  initial?: Character | Partial<CharacterInput>
  universes: Universe[]
  /** Candidates for "Variant of" — root characters only (no baseCharacterId), self excluded. */
  rootCharacters: Character[]
  onCreateUniverse: (name: string) => Promise<Universe>
  onSave: (input: CharacterInput) => void
  onCancel: () => void
}): JSX.Element {
  const [form, setForm] = useState<CharacterInput>(initial ? { ...EMPTY, ...initial } : EMPTY)
  const [creatingUniverse, setCreatingUniverse] = useState(false)
  const [newUniverseName, setNewUniverseName] = useState('')

  async function pickAvatar(): Promise<void> {
    const path = await window.api.characters.pickAvatar()
    if (path) setForm((f) => ({ ...f, avatarPath: path }))
  }

  async function createUniverse(): Promise<void> {
    const name = newUniverseName.trim()
    if (!name) return
    const universe = await onCreateUniverse(name)
    setForm((f) => ({ ...f, universeId: universe.id }))
    setNewUniverseName('')
    setCreatingUniverse(false)
  }

  const baseCharacter = rootCharacters.find((c) => c.id === form.baseCharacterId)

  return (
    <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar
            avatarType={form.avatarType}
            src={form.avatarPath}
            emoji={form.avatarEmoji}
            name={form.name || '?'}
            size={60}
          />
          <div className="segmented" style={{ maxWidth: 300 }}>
            {(Object.keys(AVATAR_TYPE_LABELS) as AvatarType[]).map((type) => (
              <button
                key={type}
                className={form.avatarType === type ? 'active' : ''}
                onClick={() => setForm((f) => ({ ...f, avatarType: type }))}
              >
                {AVATAR_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {form.avatarType === 'image' && (
          <div>
            <button className="btn btn-sm" onClick={pickAvatar}>
              Choose Image
            </button>
            <p className="hint" style={{ marginTop: 6 }}>PNG, JPG, WEBP, or GIF</p>
          </div>
        )}
        {form.avatarType === 'emoji' && (
          <div className="field" style={{ maxWidth: 200 }}>
            <input
              value={form.avatarEmoji ?? ''}
              maxLength={8}
              placeholder="🦊"
              onChange={(e) => setForm((f) => ({ ...f, avatarEmoji: e.target.value }))}
            />
            <span className="hint">Tip: press Win + . (period) to open the emoji picker</span>
          </div>
        )}
        {form.avatarType === 'monogram' && (
          <p className="hint">Auto-generated from the character's name.</p>
        )}
      </div>

      <label className="field">
        <span className="label">Universe (Optional)</span>
        <span className="hint">
          Which world this character belongs to (e.g. "Final Fantasy XIV" or "Sengoku"). Leave
          unassigned for a general character.
        </span>
        {creatingUniverse ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={newUniverseName}
              onChange={(e) => setNewUniverseName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createUniverse()}
              placeholder="New universe name"
              style={{ flex: 1 }}
            />
            <button className="btn btn-sm" onClick={createUniverse} disabled={!newUniverseName.trim()}>
              Create
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreatingUniverse(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <select
            value={form.universeId ?? ''}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setCreatingUniverse(true)
                return
              }
              setForm((f) => ({ ...f, universeId: e.target.value ? Number(e.target.value) : null }))
            }}
          >
            <option value="">No Universe</option>
            {universes.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            <option value="__new__">+ New Universe…</option>
          </select>
        )}
      </label>

      <label className="field">
        <span className="label">Variant of (Optional)</span>
        <span className="hint">
          Link this character as another version of an existing one — a canon or AU take with the
          same core personality. Leave Personality, Speech Style, and Relationships blank below to
          inherit them automatically.
        </span>
        <select
          value={form.baseCharacterId ?? ''}
          onChange={(e) =>
            setForm((f) => ({ ...f, baseCharacterId: e.target.value ? Number(e.target.value) : null }))
          }
        >
          <option value="">Not a variant</option>
          {rootCharacters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="label">Tags (Optional)</span>
        <span className="hint">
          Whatever labels help you organize your own roster — "villain," "wip," "main cast."
        </span>
        <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
      </label>

      <CharacterTextImporter onApply={(fields) => setForm((f) => ({ ...f, ...fields }))} />

      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {FIELDS.map((field) => {
          const inheritsFrom =
            baseCharacter && INHERITABLE_FIELDS.has(field.key as string) ? baseCharacter : null
          return (
            <label key={field.key as string} className="field">
              <span className="label">{field.label}</span>
              <span className="hint">
                {field.hint}
                {inheritsFrom && ` (blank inherits from ${inheritsFrom.name})`}
              </span>
              {field.multiline ? (
                <textarea
                  rows={field.key === 'notes' ? 3 : 4}
                  value={(form[field.key] as string) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={inheritsFrom ? (inheritsFrom[field.key as keyof Character] as string) : undefined}
                />
              ) : (
                <input
                  value={(form[field.key] as string) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={inheritsFrom ? (inheritsFrom[field.key as keyof Character] as string) : undefined}
                />
              )}
            </label>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={!form.name.trim()}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
