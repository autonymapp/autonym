import { useEffect, useState } from 'react'
import { FastForward, KeyRound } from 'lucide-react'
import type { Character, Chat } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { getStoredProfileName } from '../profile'
import { friendlyError } from '../friendlyError'
import Avatar from '../components/Avatar'
import AutonymMark from '../components/AutonymMark'

interface StatsOverview {
  totalMessages: number
  totalWords: number
  perCharacter: { characterId: number; characterName: string; messageCount: number; wordCount: number }[]
  streakDays: number
}

const RECENT_ACTS_LIMIT = 8

export default function HomePage(): JSX.Element {
  const { setPage, setActiveCharacterId, setActiveChatId } = useAppStore()
  const [characters, setCharacters] = useState<Character[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [hasKey, setHasKey] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.characters.list().then(setCharacters),
      window.api.chats.listAll().then(setChats),
      window.api.stats.overview().then(setStats),
      window.api.settings.hasApiKey().then(setHasKey)
    ])
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false))
  }, [])

  function jumpToAct(chat: Chat): void {
    setActiveCharacterId(chat.characterId)
    setActiveChatId(chat.id)
    setPage('chat')
  }

  function jumpToCharacter(c: Character): void {
    setActiveCharacterId(c.id)
    setPage('chat')
  }

  const recentActs = chats.slice(0, RECENT_ACTS_LIMIT)

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <AutonymMark size={26} />
        <h2 style={{ margin: 0 }}>Welcome back{getStoredProfileName() ? `, ${getStoredProfileName()}` : ''}</h2>
      </div>
      <p className="hint" style={{ marginBottom: 20 }}>
        Jump back into a recent act, or pick up with a cast member.
      </p>

      {error && (
        <p className="hint" style={{ color: 'var(--danger)', marginBottom: 20 }}>
          Couldn't load your dashboard: {error}
        </p>
      )}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
      {!hasKey && (
        <button
          className="panel interactive"
          onClick={() => setPage('settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 14,
            marginBottom: 20,
            width: '100%',
            textAlign: 'left',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            color: 'var(--text)'
          }}
        >
          <KeyRound size={18} style={{ flexShrink: 0, color: 'var(--accent)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Add your OpenRouter key to start chatting</div>
            <div className="hint">Nothing will send until a key is set — takes a minute in Settings.</div>
          </div>
        </button>
      )}

      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
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
      )}

      <div className="section-title" data-tour="home-recent-acts">Recent Acts</div>
      {recentActs.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: 24 }}>
          No acts yet — pick a cast member below to start one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, marginBottom: 24 }}>
          {recentActs.map((chat) => {
            const character = characters.find((c) => c.id === chat.characterId)
            return (
              <button
                key={chat.id}
                className="card interactive"
                onClick={() => jumpToAct(chat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  padding: 10,
                  background: 'transparent',
                  color: 'var(--text)'
                }}
              >
                <Avatar
                  avatarType={character?.avatarType}
                  src={character?.avatarPath ?? null}
                  emoji={character?.avatarEmoji}
                  name={character?.name ?? '?'}
                  size={34}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{chat.title}</div>
                  <div className="hint">with {character?.name ?? 'Unknown'}</div>
                </div>
                <FastForward size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}

      <div className="section-title" data-tour="home-cast">Cast</div>
      {characters.length === 0 ? (
        <div className="empty-state">No cast members yet — create one on the Cast page.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            marginTop: 10
          }}
        >
          {characters.map((c) => (
            <button
              key={c.id}
              className="card interactive"
              onClick={() => jumpToCharacter(c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                textAlign: 'left',
                background: 'transparent',
                color: 'var(--text)'
              }}
            >
              <Avatar avatarType={c.avatarType} src={c.avatarPath} emoji={c.avatarEmoji} name={c.name} size={32} />
              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
            </button>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}
