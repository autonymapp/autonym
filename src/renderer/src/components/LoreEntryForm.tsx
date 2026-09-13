import { useState } from 'react'
import type { LoreEntry, LoreEntryInput, LoreEntryType } from '@shared/types'
import { COMMON_MISTAKES_FIELD_KEY, LORE_ENTRY_TYPES } from '@shared/loreEntryTypes'
import LoreTextImporter from './LoreTextImporter'

const TYPE_ORDER: LoreEntryType[] = [
  'location',
  'character',
  'species',
  'item',
  'organization',
  'event',
  'concept',
  'other'
]

export default function LoreEntryForm({
  lorebookId,
  initial,
  onSave,
  onCancel
}: {
  lorebookId: number
  initial?: LoreEntry
  onSave: (input: LoreEntryInput) => void
  onCancel: () => void
}): JSX.Element {
  const [entryType, setEntryType] = useState<LoreEntryType>(initial?.entryType ?? 'other')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [keywordsText, setKeywordsText] = useState(initial?.keywords.join(', ') ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [fields, setFields] = useState<Record<string, string>>(initial?.fields ?? {})
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  const spec = LORE_ENTRY_TYPES[entryType]

  function setField(key: string, value: string): void {
    setFields((f) => ({ ...f, [key]: value }))
  }

  function applyStructured(result: {
    title: string
    description: string
    keywords: string[]
    fields: Record<string, string>
  }): void {
    if (result.title) setTitle(result.title)
    if (result.description) setDescription(result.description)
    if (result.keywords.length > 0) setKeywordsText(result.keywords.join(', '))
    setFields((f) => ({ ...f, ...result.fields }))
  }

  function save(): void {
    onSave({
      lorebookId,
      title,
      entryType,
      keywords: keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      description,
      fields,
      enabled
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      <div className="field">
        <span className="label">Entry Type</span>
        <span className="hint">Choose what kind of thing this is — you'll get tailored questions for it.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 4 }}>
          {TYPE_ORDER.map((type) => (
            <button
              key={type}
              className={`card${entryType === type ? ' active' : ''}`}
              onClick={() => setEntryType(type)}
              style={{ padding: 10, textAlign: 'left', fontSize: 12, fontWeight: 600 }}
            >
              {LORE_ENTRY_TYPES[type].icon} {LORE_ENTRY_TYPES[type].label}
            </button>
          ))}
        </div>
      </div>

      <LoreTextImporter entryType={entryType} onApply={applyStructured} />

      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label className="field">
          <span className="label">Entry Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Cue Words</span>
          <span className="hint">
            Comma-separated. When any of these come up in recent messages, this lore gets pulled into the scene.
          </span>
          <input
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder="e.g. castle, king, throne room"
          />
        </label>
        <label className="field">
          <span className="label">Summary</span>
          <span className="hint">A short general description — always shown regardless of type.</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {spec.fields.map((field) => (
          <label key={field.key} className="field">
            <span className="label">{field.label}</span>
            {field.hint && <span className="hint">{field.hint}</span>}
            <textarea
              rows={2}
              value={fields[field.key] ?? ''}
              onChange={(e) => setField(field.key, e.target.value)}
            />
          </label>
        ))}

        <label className="field">
          <span className="label">⚠️ Common Mistakes to Avoid (Optional)</span>
          <span className="hint">
            Things AI models tend to get wrong about this — stated explicitly so it doesn't invent
            them (e.g. "their ears are small and human-shaped, not pointed like a cat's" for a race
            entry). Be precise here — a vague or oversimplified correction can introduce a new wrong
            assumption just as easily as no correction at all.
          </span>
          <textarea
            rows={2}
            value={fields[COMMON_MISTAKES_FIELD_KEY] ?? ''}
            onChange={(e) => setField(COMMON_MISTAKES_FIELD_KEY, e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Enabled</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
