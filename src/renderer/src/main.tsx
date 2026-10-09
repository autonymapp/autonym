import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import {
  applyAccent,
  applyBoldFormatting,
  applyChatTextSize,
  applyFontFamily,
  applyHighContrast,
  applyLineSpacing,
  applyReduceMotion,
  applyTheme,
  getStoredAccent,
  getStoredBoldFormatting,
  getStoredChatTextSize,
  getStoredFontFamily,
  getStoredHighContrast,
  getStoredLineSpacing,
  getStoredReduceMotion,
  getStoredTheme
} from './theme'
import { ConfirmProvider } from './components/ConfirmDialog'
import ErrorBoundary from './components/ErrorBoundary'
import { initWebApi } from '../../web/initWebApi'

async function bootstrap(): Promise<void> {
  if (typeof window !== 'undefined' && !(window as any).api) {
    await initWebApi()
  }

  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    window.location.protocol.startsWith('http')
  ) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err)
      })
    })
  }

  applyTheme(getStoredTheme())
  applyAccent(getStoredAccent())
  applyFontFamily(getStoredFontFamily())
  applyChatTextSize(getStoredChatTextSize())
  applyLineSpacing(getStoredLineSpacing())
  applyHighContrast(getStoredHighContrast())
  applyReduceMotion(getStoredReduceMotion())
  applyBoldFormatting(getStoredBoldFormatting())

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
}

bootstrap()
