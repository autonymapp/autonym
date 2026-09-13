import { useState } from 'react'
import { X } from 'lucide-react'

/** A small free-form tag editor: type a tag, press Enter or comma to add it, click the
 *  x to remove one. */
export default function TagInput({
  tags,
  onChange
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')

  function addTag(): void {
    const value = draft.trim()
    if (!value || tags.includes(value)) {
      setDraft('')
      return
    }
    onChange([...tags, value])
    setDraft('')
  }

  function removeTag(tag: string): void {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: tags.length > 0 ? 8 : 0 }}>
        {tags.map((tag) => (
          <span
            key={tag}
            className="pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              title={`Remove "${tag}"`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                opacity: 0.7,
                padding: 0
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) {
            setDraft(e.target.value.slice(0, -1))
            addTag()
          } else {
            setDraft(e.target.value)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTag()
          }
        }}
        onBlur={addTag}
        placeholder="Add a tag and press Enter…"
        style={{ fontSize: 13 }}
      />
    </div>
  )
}
