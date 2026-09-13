import { useEffect, useState } from 'react'
import type { Character, CharacterRelationship } from '@shared/types'
import { useConfirm } from './ConfirmDialog'
import { friendlyError } from '../friendlyError'

function RelationshipRow({
  character,
  otherCharacter,
  existing,
  onSaved,
  onDeleted
}: {
  character: Character
  otherCharacter: Character
  existing: CharacterRelationship | undefined
  onSaved: (r: CharacterRelationship) => void
  onDeleted: (id: number) => void
}): JSX.Element {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    setLabel(existing?.label ?? '')
    setDescription(existing?.description ?? '')
  }, [existing])

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const relationship = await window.api.relationships.upsert({
        characterAId: character.id,
        characterBId: otherCharacter.id,
        label,
        description
      })
      onSaved(relationship)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  async function clear(): Promise<void> {
    if (!existing) return
    if (!(await confirm('This relationship will be gone for good.', { title: 'Clear this relationship?' })))
      return
    await window.api.relationships.delete(existing.id)
    setLabel('')
    setDescription('')
    onDeleted(existing.id)
  }

  const dirty = label !== (existing?.label ?? '') || description !== (existing?.description ?? '')

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{otherCharacter.name}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Childhood friends, Rivals, Siblings"
          style={{ flex: 1 }}
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={`How ${character.name} and ${otherCharacter.name} know each other and feel about one another`}
        rows={2}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className="btn btn-sm" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {existing && (
          <button className="btn btn-danger btn-sm" onClick={clear}>
            Clear
          </button>
        )}
      </div>
      {error && <p className="hint" style={{ color: 'var(--danger)', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

export default function RelationshipPanel({
  character,
  otherCharacters
}: {
  character: Character
  otherCharacters: Character[]
}): JSX.Element {
  const [relationships, setRelationships] = useState<CharacterRelationship[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showAllUniverses, setShowAllUniverses] = useState(false)

  async function refresh(): Promise<void> {
    try {
      setRelationships(await window.api.relationships.listForCharacter(character.id))
      setLoadError(null)
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }

  useEffect(() => {
    refresh()
  }, [character.id])

  function findExisting(otherId: number): CharacterRelationship | undefined {
    return relationships.find(
      (r) =>
        (r.characterAId === character.id && r.characterBId === otherId) ||
        (r.characterBId === character.id && r.characterAId === otherId)
    )
  }

  const crossUniverseCount = otherCharacters.filter(
    (c) => c.universeId !== character.universeId && !findExisting(c.id)
  ).length
  const visibleOthers = showAllUniverses
    ? otherCharacters
    : otherCharacters.filter((c) => c.universeId === character.universeId || findExisting(c.id))

  return (
    <div>
      {loadError && <p className="hint" style={{ color: 'var(--danger)', marginBottom: 8 }}>{loadError}</p>}
      {crossUniverseCount > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5 }}>
          <input
            type="checkbox"
            checked={showAllUniverses}
            onChange={(e) => setShowAllUniverses(e.target.checked)}
          />
          <span className="hint">
            Show {crossUniverseCount} character{crossUniverseCount === 1 ? '' : 's'} from other universes
          </span>
        </label>
      )}
      {otherCharacters.length === 0 ? (
        <p className="hint">Create another character to define a relationship with this one.</p>
      ) : visibleOthers.length === 0 ? (
        <p className="hint">No other characters in this universe yet.</p>
      ) : (
        visibleOthers.map((other) => (
          <RelationshipRow
            key={other.id}
            character={character}
            otherCharacter={other}
            existing={findExisting(other.id)}
            onSaved={(r) => setRelationships((prev) => [...prev.filter((x) => x.id !== r.id), r])}
            onDeleted={(id) => setRelationships((prev) => prev.filter((x) => x.id !== id))}
          />
        ))
      )}
    </div>
  )
}
