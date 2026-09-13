import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches a render-time exception on any one page so it can't white-screen the whole app.
 *  Without this, an unhandled error anywhere in the component tree blanks the entire UI with
 *  no recovery short of a full restart, potentially losing an in-progress unsent message. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: 14,
            padding: 24,
            textAlign: 'center'
          }}
        >
          <h2 style={{ margin: 0 }}>Something went wrong on this screen</h2>
          <p className="hint" style={{ maxWidth: 420 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
