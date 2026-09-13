import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { BookOpen, ChevronLeft, ChevronRight, Globe, Home, MessageCircle, Settings as SettingsIcon, Map, Users } from 'lucide-react'
import { useAppStore } from './store/appStore'
import type { Page } from './store/appStore'
import AutonymMark from './components/AutonymMark'
import HomePage from './pages/Home'
import CharactersPage from './pages/Characters'
import LorebooksPage from './pages/Lorebooks'
import UniversesPage from './pages/Universes'
import ScenarioMakerPage from './pages/ScenarioMaker'
import ChatPage from './pages/Chat'
import SettingsPage from './pages/Settings'

const NAV_ITEMS: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'chat', label: 'Acts', icon: MessageCircle },
  { page: 'characters', label: 'Cast', icon: Users },
  { page: 'universes', label: 'Universes', icon: Globe },
  { page: 'lorebooks', label: 'Lorebooks', icon: BookOpen },
  { page: 'scenarios', label: 'Scenario Maker', icon: Map },
  { page: 'settings', label: 'Settings', icon: SettingsIcon }
]

const NAV_COLLAPSED_KEY = 'autonym:navCollapsed'

function NavButton({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick
}: {
  label: string
  icon: LucideIcon
  active: boolean
  collapsed: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      className={`nav-link${active ? ' active' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={collapsed ? { justifyContent: 'center', paddingLeft: 0, paddingRight: 0 } : undefined}
    >
      <span className="nav-icon">
        <Icon size={16} />
      </span>
      {!collapsed && label}
    </button>
  )
}

export default function App(): JSX.Element {
  const { page, setPage, escapeHandlers, popEscapeHandler } = useAppStore()
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem(NAV_COLLAPSED_KEY) === '1')

  function toggleNav(): void {
    setNavCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPage('characters')
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setPage('chat')
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setPage('settings')
      } else if (e.key === 'Escape' && escapeHandlers.length > 0) {
        const top = escapeHandlers[escapeHandlers.length - 1]
        popEscapeHandler(top)
        top()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [escapeHandlers, popEscapeHandler, setPage])

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <nav
        style={{
          width: navCollapsed ? 56 : 190,
          borderRight: '1px solid var(--border)',
          padding: navCollapsed ? '16px 8px' : '16px 12px',
          flexShrink: 0,
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 150ms ease, padding 150ms ease'
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 16,
            padding: navCollapsed ? '2px 0 20px' : '2px 12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: navCollapsed ? 'center' : 'flex-start',
            gap: 8,
            letterSpacing: '-0.02em'
          }}
        >
          <AutonymMark size={26} />
          {!navCollapsed && 'Autonym'}
        </div>
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.page}
            label={item.label}
            icon={item.icon}
            active={page === item.page}
            collapsed={navCollapsed}
            onClick={() => setPage(item.page)}
          />
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="nav-link"
          onClick={toggleNav}
          title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={navCollapsed ? { justifyContent: 'center', paddingLeft: 0, paddingRight: 0 } : undefined}
        >
          <span className="nav-icon">
            {navCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </span>
          {!navCollapsed && 'Collapse'}
        </button>
      </nav>
      <main style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {page === 'home' && <HomePage />}
        {page === 'chat' && <ChatPage />}
        {page === 'characters' && <CharactersPage />}
        {page === 'lorebooks' && <LorebooksPage />}
        {page === 'universes' && <UniversesPage />}
        {page === 'scenarios' && <ScenarioMakerPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
