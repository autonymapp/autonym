import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react'
import { reorder } from '@shared/reorder'

export default function MilestoneEditor({
  milestones,
  onChange
}: {
  milestones: string[]
  onChange: (milestones: string[]) => void
}): JSX.Element {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  function update(index: number, value: string): void {
    const next = [...milestones]
    next[index] = value
    onChange(next)
  }

  function remove(index: number): void {
    onChange(milestones.filter((_, i) => i !== index))
  }

  function add(): void {
    onChange([...milestones, ''])
  }

  function move(index: number, dir: -1 | 1): void {
    const target = index + dir
    if (target < 0 || target >= milestones.length) return
    const next = [...milestones]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function handleDragOver(e: React.DragEvent, index: number): void {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const next = reorder(milestones, draggedIndex, index)
    setDraggedIndex(index)
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {milestones.map((m, i) => (
        <div
          key={i}
          className="card"
          draggable
          onDragStart={() => setDraggedIndex(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDragEnd={() => setDraggedIndex(null)}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: 8,
            opacity: draggedIndex === i ? 0.4 : 1,
            cursor: 'grab'
          }}
        >
          <GripVertical size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0
            }}
          >
            {i + 1}
          </span>
          <input
            value={m}
            onChange={(e) => update(i, e.target.value)}
            placeholder="e.g. They meet again 2 weeks later"
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-icon btn-sm"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            className="btn btn-icon btn-sm"
            onClick={() => move(i, 1)}
            disabled={i === milestones.length - 1}
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button className="btn btn-icon btn-sm btn-danger" onClick={() => remove(i)} title="Remove">
            <X size={14} />
          </button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={add} style={{ alignSelf: 'flex-start' }}>
        + Add Beat
      </button>
      {milestones.length > 1 && (
        <p className="hint">Drag the handle to reorder, or use the arrow buttons.</p>
      )}
    </div>
  )
}
