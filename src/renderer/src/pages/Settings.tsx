import { useEffect, useRef, useState } from 'react'
import { Check, Code2, Download, ExternalLink, RefreshCw, Upload } from 'lucide-react'
import { useConfirm } from '../components/ConfirmDialog'
import {
  applyAccent,
  applyBoldFormatting,
  applyChatTextSize,
  applyFontFamily,
  applyHighContrast,
  applyLineSpacing,
  applyReduceMotion,
  applyTheme,
  CHAT_TEXT_SIZES,
  defaultAccentFor,
  FONT_FAMILIES,
  getStoredAccent,
  getStoredBoldFormatting,
  getStoredChatTextSize,
  getStoredFontFamily,
  getStoredHighContrast,
  getStoredLineSpacing,
  getStoredReduceMotion,
  getStoredTheme,
  LINE_SPACINGS,
  THEMES,
  type ChatTextSizeId,
  type FontFamilyId,
  type LineSpacingId,
  type ThemeId
} from '../theme'
import { getStoredProfileName, setProfileName } from '../profile'
import { friendlyError } from '../friendlyError'

interface StatsOverview {
  totalMessages: number
  totalWords: number
  perCharacter: { characterId: number; characterName: string; messageCount: number; wordCount: number }[]
  streakDays: number
}

/** Jump-to links for the section nav — order matches the sections as they appear on the page. */
const SECTIONS: { id: string; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts' },
  { id: 'theme', label: 'Theme' },
  { id: 'accent', label: 'Accent Color' },
  { id: 'typography', label: 'Typography' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'api-key', label: 'API Key' },
  { id: 'backup', label: 'Backup & Restore' },
  { id: 'stats', label: 'Writing Stats' },
  { id: 'about', label: 'About' }
]

export default function SettingsPage(): JSX.Element {
  const [profileName, setProfileNameState] = useState(getStoredProfileName())
  const [hasKey, setHasKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme())
  const [customAccent, setCustomAccent] = useState<string | null>(getStoredAccent())
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(getStoredFontFamily())
  const [chatTextSize, setChatTextSize] = useState<ChatTextSizeId>(getStoredChatTextSize())
  const [lineSpacing, setLineSpacing] = useState<LineSpacingId>(getStoredLineSpacing())
  const [highContrast, setHighContrast] = useState(getStoredHighContrast())
  const [reduceMotion, setReduceMotion] = useState(getStoredReduceMotion())
  const [boldFormatting, setBoldFormatting] = useState(getStoredBoldFormatting())
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id)
  const contentRef = useRef<HTMLDivElement>(null)
  const confirm = useConfirm()

  function handleContentScroll(): void {
    const container = contentRef.current
    if (!container) return
    const containerTop = container.getBoundingClientRect().top
    let current = SECTIONS[0].id
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id)
      if (el && el.getBoundingClientRect().top - containerTop <= 80) current = section.id
    }
    setActiveSection(current)
  }

  function scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function checkForUpdates(): Promise<void> {
    setCheckingUpdate(true)
    setUpdateStatus(null)
    try {
      setUpdateStatus(await window.api.app.checkForUpdates())
    } catch (err: any) {
      setUpdateStatus(friendlyError(err))
    } finally {
      setCheckingUpdate(false)
    }
  }

  function updateProfileName(name: string): void {
    setProfileName(name)
    setProfileNameState(name)
  }

  function selectTheme(id: ThemeId): void {
    applyTheme(id)
    setTheme(id)
  }

  function selectFontFamily(id: FontFamilyId): void {
    applyFontFamily(id)
    setFontFamily(id)
  }

  function selectChatTextSize(id: ChatTextSizeId): void {
    applyChatTextSize(id)
    setChatTextSize(id)
  }

  function selectLineSpacing(id: LineSpacingId): void {
    applyLineSpacing(id)
    setLineSpacing(id)
  }

  function toggleHighContrast(): void {
    const next = !highContrast
    applyHighContrast(next)
    setHighContrast(next)
  }

  function toggleReduceMotion(): void {
    const next = !reduceMotion
    applyReduceMotion(next)
    setReduceMotion(next)
  }

  function toggleBoldFormatting(): void {
    const next = !boldFormatting
    applyBoldFormatting(next)
    setBoldFormatting(next)
  }

  function selectAccent(hex: string): void {
    applyAccent(hex)
    setCustomAccent(hex)
  }

  function resetAccent(): void {
    applyAccent(null)
    setCustomAccent(null)
  }

  async function refresh(): Promise<void> {
    setHasKey(await window.api.settings.hasApiKey())
  }

  useEffect(() => {
    refresh()
    window.api.stats.overview().then(setStats)
    window.api.app.getVersion().then(setAppVersion)
  }, [])

  async function saveKey(): Promise<void> {
    if (!keyInput.trim()) return
    try {
      await window.api.settings.saveApiKey(keyInput.trim())
      setKeyInput('')
      setStatus('API key saved and encrypted.')
      refresh()
    } catch (err: any) {
      setStatus(friendlyError(err))
    }
  }

  async function clearKey(): Promise<void> {
    if (!(await confirm("You'll need to re-enter it to keep chatting.", { title: 'Remove your OpenRouter key?' })))
      return
    await window.api.settings.clearApiKey()
    setStatus('API key removed.')
    refresh()
  }

  async function exportBackup(): Promise<void> {
    setBackingUp(true)
    setBackupStatus(null)
    try {
      const saved = await window.api.backup.export()
      if (saved) setBackupStatus('Backup saved.')
    } catch (err: any) {
      setBackupStatus(friendlyError(err))
    } finally {
      setBackingUp(false)
    }
  }

  async function importBackup(): Promise<void> {
    if (
      !(await confirm(
        'This replaces your characters, acts, and lorebooks with what\'s in the backup file. Your current data isn\'t merged — it\'s overwritten. The app will restart when it\'s done.',
        { title: 'Restore from backup?' }
      ))
    )
      return
    setRestoring(true)
    setBackupStatus(null)
    try {
      const restored = await window.api.backup.import()
      if (!restored) setRestoring(false)
      // On success the main process relaunches the app — no need to reset state here.
    } catch (err: any) {
      setBackupStatus(friendlyError(err))
      setRestoring(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <nav
        style={{
          width: 230,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: 16,
          overflowY: 'auto',
          background: 'var(--bg-elevated)'
        }}
      >
        {SECTIONS.map((section) => (
          <div
            key={section.id}
            className={`sidebar-item${activeSection === section.id ? ' active' : ''}`}
            onClick={() => scrollToSection(section.id)}
          >
            {section.label}
          </div>
        ))}
      </nav>

      <div
        ref={contentRef}
        onScroll={handleContentScroll}
        style={{ flex: 1, padding: '24px 28px', maxWidth: 820, height: '100%', overflowY: 'auto' }}
      >
        <h2 style={{ marginBottom: 18 }}>Settings</h2>

        <div id="profile" className="panel" style={{ padding: 18, marginBottom: 18, scrollMarginTop: 12 }}>
          <h3 style={{ marginBottom: 4 }}>👤 Your Profile</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Just for personalizing the app — not shared with the AI or used in any prompt.
        </p>
        <label className="field">
          <span className="label">Your Name</span>
          <input
            value={profileName}
            onChange={(e) => updateProfileName(e.target.value)}
            placeholder="e.g. Alex"
            style={{ maxWidth: 280 }}
          />
        </label>
      </div>

      <div id="shortcuts" className="panel" style={{ padding: 18, marginBottom: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>⌨️ Keyboard Shortcuts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div>
            <kbd className="pill">Ctrl</kbd> + <kbd className="pill">K</kbd> — Jump to Cast
          </div>
          <div>
            <kbd className="pill">Ctrl</kbd> + <kbd className="pill">N</kbd> — Jump to Acts
          </div>
          <div>
            <kbd className="pill">Ctrl</kbd> + <kbd className="pill">,</kbd> — Open Settings
          </div>
          <div>
            <kbd className="pill">Esc</kbd> — Close the current Trash view
          </div>
        </div>
      </div>

      <div id="theme" className="panel" style={{ padding: 18, marginBottom: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>Theme</h3>
        <p className="hint" style={{ marginBottom: 12 }}>Pick a dark palette. Applies immediately.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTheme(t.id)}
              className={`card interactive${theme === t.id ? ' active' : ''}`}
              style={{ padding: 10, textAlign: 'left' }}
            >
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {t.swatch.map((color, i) => (
                  <span
                    key={i}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: color,
                      border: '1px solid var(--border)'
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                {t.label} {theme === t.id && <Check size={13} style={{ color: 'var(--accent)' }} />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div id="accent" className="panel" style={{ padding: 18, marginBottom: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>Accent Color</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Override the theme's accent with your own color — the rest of the palette (backgrounds,
          grays) stays as picked above.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color"
            value={customAccent ?? defaultAccentFor(theme)}
            onChange={(e) => selectAccent(e.target.value)}
            style={{ width: 44, height: 34, padding: 2, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, fontFamily: 'monospace' }}>
            {customAccent ?? defaultAccentFor(theme)}
          </span>
          {customAccent && (
            <button className="btn btn-sm" onClick={resetAccent}>
              Reset to Theme Default
            </button>
          )}
        </div>
      </div>

      <div id="typography" className="panel" style={{ padding: 18, marginBottom: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>Typography</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Controls how message text renders inside an act — the rest of the app's UI is unaffected.
        </p>

        <div className="section-title" style={{ marginTop: 0 }}>Font Family</div>
        <div className="segmented" style={{ marginBottom: 14 }}>
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.id}
              className={fontFamily === f.id ? 'active' : ''}
              onClick={() => selectFontFamily(f.id)}
              style={{ fontFamily: f.stack }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="section-title">Act Text Size</div>
        <div className="segmented" style={{ marginBottom: 14 }}>
          {CHAT_TEXT_SIZES.map((s) => (
            <button
              key={s.id}
              className={chatTextSize === s.id ? 'active' : ''}
              onClick={() => selectChatTextSize(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="section-title">Line Spacing</div>
        <div className="segmented">
          {LINE_SPACINGS.map((s) => (
            <button
              key={s.id}
              className={lineSpacing === s.id ? 'active' : ''}
              onClick={() => selectLineSpacing(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div id="accessibility" className="panel" style={{ padding: 18, marginBottom: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>Accessibility</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Adjustments for readability and motion sensitivity.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            className="panel"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, background: 'var(--bg-sunken)', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={highContrast} onChange={toggleHighContrast} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>High Contrast Mode</div>
              <p className="hint" style={{ marginTop: 2 }}>
                Pushes dim text, borders, and OOC/action/thought formatting further for maximum
                readability.
              </p>
            </div>
          </label>
          <label
            className="panel"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, background: 'var(--bg-sunken)', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={reduceMotion} onChange={toggleReduceMotion} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Reduce Motion</div>
              <p className="hint" style={{ marginTop: 2 }}>
                Turns off the message pop-in animation and busy-action spinner.
              </p>
            </div>
          </label>
          <label
            className="panel"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, background: 'var(--bg-sunken)', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={boldFormatting} onChange={toggleBoldFormatting} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Bold Formatting Markers</div>
              <p className="hint" style={{ marginTop: 2 }}>
                Makes action/thought/OOC text bold in addition to italics/color, so the formatting
                doesn't rely on color alone.
              </p>
            </div>
          </label>
        </div>
      </div>

      <div id="api-key" className="panel" style={{ padding: 18, scrollMarginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>OpenRouter API Key</h3>
          <span
            className="pill"
            style={
              hasKey
                ? { background: 'rgba(79, 209, 165, 0.14)', color: 'var(--success)' }
                : { background: 'var(--bg-hover)', color: 'var(--text-dim)' }
            }
          >
            {hasKey ? '● Configured' : '○ Not set'}
          </span>
        </div>
        <p className="hint" style={{ marginTop: 6, marginBottom: 14 }}>
          Stored encrypted on this machine using Windows' built-in credential encryption. Get a key
          at openrouter.ai/keys.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            placeholder="sk-or-v1-..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={saveKey}>
            Save
          </button>
        </div>
        {hasKey && (
          <button className="btn btn-danger btn-sm" onClick={clearKey} style={{ marginTop: 10 }}>
            Remove Key
          </button>
        )}
        {status && <p className="hint" style={{ marginTop: 10 }}>{status}</p>}
      </div>

      <div id="backup" className="panel" style={{ padding: 18, marginTop: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>Backup &amp; Restore</h3>
        <p className="hint" style={{ marginBottom: 14 }}>
          Save everything — characters, acts, lorebooks, and avatars — into one file, or restore
          from one. Your API key is never included; re-enter it after a restore.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-sm"
            onClick={exportBackup}
            disabled={backingUp}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> {backingUp ? 'Saving…' : 'Save Backup'}
          </button>
          <button
            className="btn btn-sm"
            onClick={importBackup}
            disabled={restoring}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={14} /> {restoring ? 'Restoring…' : 'Restore from Backup'}
          </button>
        </div>
        {backupStatus && <p className="hint" style={{ marginTop: 10 }}>{backupStatus}</p>}
      </div>

      {stats && (
        <div id="stats" className="panel" style={{ padding: 18, marginTop: 18, scrollMarginTop: 12 }}>
          <h3 style={{ marginBottom: 4 }}>📊 Writing Stats</h3>
          <p className="hint" style={{ marginBottom: 14 }}>Just for fun — totals across every act.</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="panel" style={{ padding: '10px 16px', background: 'var(--bg-sunken)', flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.totalMessages}</div>
              <div className="hint">Messages</div>
            </div>
            <div className="panel" style={{ padding: '10px 16px', background: 'var(--bg-sunken)', flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.totalWords.toLocaleString()}</div>
              <div className="hint">Words</div>
            </div>
            <div className="panel" style={{ padding: '10px 16px', background: 'var(--bg-sunken)', flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {stats.streakDays} {stats.streakDays === 1 ? 'day' : 'days'}
              </div>
              <div className="hint">Current streak</div>
            </div>
          </div>
          {stats.perCharacter.length > 0 && (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)' }}>
                  <th style={{ padding: '4px 8px 4px 0' }}>Character</th>
                  <th style={{ padding: '4px 8px' }}>Messages</th>
                  <th style={{ padding: '4px 8px' }}>Words</th>
                </tr>
              </thead>
              <tbody>
                {stats.perCharacter
                  .slice()
                  .sort((a, b) => b.wordCount - a.wordCount)
                  .map((row) => (
                    <tr key={row.characterId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>{row.characterName}</td>
                      <td style={{ padding: '6px 8px' }}>{row.messageCount}</td>
                      <td style={{ padding: '6px 8px' }}>{row.wordCount.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div id="about" className="panel" style={{ padding: 18, marginTop: 18, scrollMarginTop: 12 }}>
        <h3 style={{ marginBottom: 4 }}>About</h3>
        <p className="hint" style={{ marginBottom: 14 }}>
          Autonym {appVersion ? `v${appVersion}` : ''} — a personal, structured-first alternative to
          raw AI chat for roleplay and story-writing. Free and open-source under the MIT license.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            className="btn btn-sm"
            onClick={() => window.api.app.openExternal('https://github.com/autonymapp/autonym')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Code2 size={14} /> View on GitHub
          </button>
          <button
            className="btn btn-sm"
            onClick={() => window.api.app.openExternal('https://github.com/autonymapp/autonym/issues')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ExternalLink size={14} /> Report an Issue
          </button>
          <button
            className="btn btn-sm"
            onClick={checkForUpdates}
            disabled={checkingUpdate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> {checkingUpdate ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
        {updateStatus && <p className="hint" style={{ marginBottom: 12 }}>{updateStatus}</p>}
        <p className="hint" style={{ margin: 0 }}>
          Headers set in{' '}
          <span
            role="button"
            tabIndex={0}
            onClick={() => window.api.app.openExternal('https://fonts.google.com/specimen/Fredoka')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') window.api.app.openExternal('https://fonts.google.com/specimen/Fredoka')
            }}
            style={{ textDecoration: 'underline', cursor: 'pointer', color: 'var(--text)' }}
          >
            Fredoka
          </span>
          , body text in{' '}
          <span
            role="button"
            tabIndex={0}
            onClick={() => window.api.app.openExternal('https://fonts.google.com/specimen/Manrope')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') window.api.app.openExternal('https://fonts.google.com/specimen/Manrope')
            }}
            style={{ textDecoration: 'underline', cursor: 'pointer', color: 'var(--text)' }}
          >
            Manrope
          </span>
          , courtesy of Google Fonts (SIL Open Font License).
        </p>
      </div>
      </div>
    </div>
  )
}
