import { useEffect, useMemo, useState } from 'react'
import type { OpenRouterModel } from '@shared/types'
import { friendlyError } from '../friendlyError'

export default function ModelPicker({
  value,
  onChange
}: {
  value: string
  onChange: (modelId: string) => void
}): JSX.Element {
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)

  function load(forceRefresh = false): void {
    setLoading(true)
    setError(null)
    window.api.settings
      .fetchModels(forceRefresh)
      .then((list) => {
        setModels(list)
        setError(null)
      })
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Only meant to run once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
  }, [models, search])

  const exactIdMatch = models.some((m) => m.id === search.trim())

  if (manualEntry) {
    return (
      <div>
        <input
          placeholder="Exact OpenRouter model ID, e.g. some-provider/some-model"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', marginBottom: 6 }}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => setManualEntry(false)}>
          Back to Browse List
        </button>
      </div>
    )
  }

  return (
    <div>
      <input
        placeholder="Search models..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', marginBottom: 6 }}
      />
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <p className="hint" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}
      {loading && !error && models.length === 0 && <p className="hint">Loading models…</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={6}
        style={{ width: '100%' }}
      >
        {filtered.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <span className="hint">
          A few rarely-useful categories (batch pricing, moderation tools) are hidden here.
        </span>
        {search.trim() && !exactIdMatch ? (
          <button className="btn btn-ghost btn-sm" onClick={() => onChange(search.trim())}>
            Use "{search.trim()}" directly
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setManualEntry(true)}>
            Enter model ID manually
          </button>
        )}
      </div>
    </div>
  )
}
