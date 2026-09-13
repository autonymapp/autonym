import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'

interface ConfirmOptions {
  title?: string
  /** Styles the dialog as a destructive/irreversible action (red accent). Defaults to true. */
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Drop-in replacement for the browser's confirm(), styled to match the app instead of
 *  popping a jarring native OS dialog — used for every irreversible/destructive action. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}

interface PendingConfirm extends ConfirmOptions {
  message: string
  resolve: (result: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const resolveRef = useRef<((result: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((message, options) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setPending({ message, resolve, ...options })
    })
  }, [])

  function settle(result: boolean): void {
    resolveRef.current?.(result)
    resolveRef.current = null
    setPending(null)
  }

  const danger = pending?.danger ?? true

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => settle(false)}
        >
          <div
            className="panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 380,
              maxWidth: '90vw',
              padding: 20,
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)'
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
              <span
                style={{
                  flexShrink: 0,
                  color: danger ? 'var(--danger)' : 'var(--text-dim)',
                  display: 'inline-flex',
                  marginTop: 1
                }}
              >
                {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {pending.title ?? (danger ? 'Are you sure?' : 'Confirm')}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{pending.message}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => settle(true)}
                autoFocus
              >
                {pending.confirmLabel ?? (danger ? 'Delete' : 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
