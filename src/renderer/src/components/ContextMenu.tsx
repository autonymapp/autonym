import type { LucideIcon } from 'lucide-react'

export interface ContextMenuItem {
  label: string
  icon: LucideIcon
  onClick: () => void
  danger?: boolean
}

/** A right-click menu positioned at a fixed screen point. Render conditionally
 *  (only when open) and pass onClose to dismiss on an outside click. */
export default function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}): JSX.Element {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="panel"
        style={{
          position: 'fixed',
          top: y,
          left: x,
          zIndex: 1000,
          width: 180,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            className="btn btn-ghost btn-sm"
            style={{
              justifyContent: 'flex-start',
              gap: 8,
              color: item.danger ? 'var(--danger)' : undefined
            }}
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            <item.icon size={14} strokeWidth={2} />
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
