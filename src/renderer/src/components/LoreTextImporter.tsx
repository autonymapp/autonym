import { useState } from 'react'
import type { LoreEntryType } from '@shared/types'
import { friendlyError } from '../friendlyError'

type Source = 'text' | 'url'

export default function LoreTextImporter({
  entryType,
  onApply
}: {
  entryType: LoreEntryType
  onApply: (result: { title: string; description: string; keywords: string[]; fields: Record<string, string> }) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<Source>('text')
  const [url, setUrl] = useState('')
  const [rawText, setRawText] = useState('')
  const [fetching, setFetching] = useState(false)
  const [structuring, setStructuring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchUrl(): Promise<void> {
    if (!url.trim()) return
    setFetching(true)
    setError(null)
    try {
      const text = await window.api.lore.fetchUrlText(url.trim())
      setRawText(text)
    } catch (err: any) {
      setError(friendlyError(err))
    } finally {
      setFetching(false)
    }
  }

  async function structure(): Promise<void> {
    if (!rawText.trim()) {
      setError('Paste some text (or fetch a URL) first.')
      return
    }
    setStructuring(true)
    setError(null)
    try {
      const result = await window.api.lore.structureText(entryType, rawText)
      onApply(result)
      setOpen(false)
    } catch (err: any) {
      setError(friendlyError(err))
    } finally {
      setStructuring(false)
    }
  }

  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        ✨ Fill from Wiki/Text
      </button>
    )
  }

  return (
    <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>✨ Fill From Wiki/Text</h4>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Paste reference text (from a wiki, your own notes, anything) — the AI organizes it into this
        entry's fields for you to review. Works for any topic, not just an existing franchise.
      </p>

      <div className="segmented">
        <button className={source === 'text' ? 'active' : ''} onClick={() => setSource('text')}>
          Paste Text
        </button>
        <button className={source === 'url' ? 'active' : ''} onClick={() => setSource('url')}>
          Paste URL
        </button>
      </div>

      {source === 'url' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm" onClick={fetchUrl} disabled={fetching}>
            {fetching ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      )}

      <label className="field">
        <span className="label">{source === 'url' ? 'Fetched Text (Editable)' : 'Reference Text'}</span>
        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste text here..."
        />
      </label>

      {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}

      <button className="btn btn-primary btn-sm" onClick={structure} disabled={structuring}>
        {structuring ? 'Organizing…' : '✨ Organize Into Fields'}
      </button>
    </div>
  )
}
