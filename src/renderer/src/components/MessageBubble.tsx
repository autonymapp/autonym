import { useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FastForward,
  GitFork,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  Users
} from 'lucide-react'
import type { Character, ChatMessage, LoreEntry } from '@shared/types'
import Avatar from './Avatar'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import FormattedMessage from './FormattedMessage'

export default function MessageBubble({
  message,
  isUser,
  speaker,
  matchedLore,
  isStreaming,
  showSwipeControls,
  busyAction,
  groupCast,
  onSetActiveVariant,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
  onToggleBookmark,
  onSetSpeaker,
  onFork
}: {
  message: ChatMessage
  isUser: boolean
  speaker: Character | null
  matchedLore: LoreEntry[]
  isStreaming: boolean
  /** Only the most recent assistant message shows regenerate/continue/swipe. */
  showSwipeControls: boolean
  busyAction: 'regenerate' | 'continue' | null
  /** Every cast member (primary first) when this is a Group Scene reply, so the speaker can
   *  be corrected by hand if it was misattributed — empty otherwise (menu item hidden). */
  groupCast: Character[]
  onSetActiveVariant: (index: number) => void
  onRegenerate: () => void
  onContinue: () => void
  onEdit: (newContent: string) => void
  onDelete: () => void
  onToggleBookmark: () => void
  onSetSpeaker: (characterId: number | null) => void
  onFork: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const busy = busyAction !== null
  /** Messages get a temporary id (<= 0) until the server confirms them a moment later —
   *  actions that reference the id by number would silently fail or misbehave until then. */
  const isPending = message.id <= 0

  function startEdit(): void {
    setDraft(message.content)
    setEditing(true)
  }

  function saveEdit(): void {
    if (draft.trim() && draft !== message.content) onEdit(draft)
    setEditing(false)
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(message.content)
  }

  const currentSpeakerId = message.speakerCharacterId ?? groupCast[0]?.id ?? null

  const contextMenuItems: ContextMenuItem[] = [
    ...(showSwipeControls
      ? [
          { label: 'Regenerate', icon: RefreshCw, onClick: onRegenerate },
          { label: 'Continue Writing', icon: FastForward, onClick: onContinue }
        ]
      : []),
    { label: 'Edit', icon: Pencil, onClick: startEdit },
    { label: 'Copy', icon: Copy, onClick: copy },
    ...(!isPending && groupCast.length > 0
      ? groupCast.map((c) => ({
          label: `Set speaker: ${c.name}`,
          icon: c.id === currentSpeakerId ? Check : Users,
          onClick: () => onSetSpeaker(c.id === groupCast[0]?.id ? null : c.id)
        }))
      : []),
    ...(!isPending
      ? [
          { label: message.bookmarked ? 'Remove Bookmark' : 'Bookmark', icon: Star, onClick: onToggleBookmark },
          { label: 'Fork From Here', icon: GitFork, onClick: onFork }
        ]
      : []),
    { label: 'Delete', icon: Trash2, onClick: onDelete, danger: true }
  ]

  return (
    <div
      className="msg-row"
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 10,
        alignItems: 'flex-end',
        marginBottom: 14
      }}
    >
      {speaker && (
        <Avatar
          avatarType={speaker.avatarType}
          src={speaker.avatarPath}
          emoji={speaker.avatarEmoji}
          name={speaker.name}
          size={30}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '68%' }}>
        <div
          className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}
          style={{ maxWidth: '100%' }}
          onContextMenu={(e) => {
            if (editing) return
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }}
        >
          {(speaker || matchedLore.length > 0) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
                fontSize: 11,
                fontWeight: 700,
                color: isUser
                  ? 'color-mix(in srgb, var(--accent-contrast) 85%, transparent)'
                  : 'var(--text-dim)'
              }}
            >
              {speaker && <span>{speaker.name}</span>}
              {matchedLore.length > 0 && (
                <span
                  title={`Lore referenced: ${matchedLore.map((e) => e.title).join(', ')}`}
                  style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.8, cursor: 'help' }}
                >
                  <BookOpen size={11} />
                </span>
              )}
            </div>
          )}
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.max(2, Math.ceil(draft.length / 60))}
                style={{ minWidth: 240, color: 'var(--text)' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                  Save
                </button>
                <button className="btn btn-sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : message.content ? (
            <FormattedMessage text={message.content} onAccent={isUser} />
          ) : isStreaming ? (
            '…'
          ) : (
            ''
          )}
        </div>

        {!editing && (
          <div className="msg-actions">
            {showSwipeControls && message.variants.length > 1 && (
              <>
                <button
                  className="msg-action-btn"
                  disabled={busy || message.activeVariantIndex === 0}
                  onClick={() => onSetActiveVariant(message.activeVariantIndex - 1)}
                  title="Previous version"
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {message.activeVariantIndex + 1}/{message.variants.length}
                </span>
                <button
                  className="msg-action-btn"
                  disabled={busy}
                  onClick={() =>
                    message.activeVariantIndex + 1 < message.variants.length
                      ? onSetActiveVariant(message.activeVariantIndex + 1)
                      : onRegenerate()
                  }
                  title={
                    message.activeVariantIndex + 1 < message.variants.length
                      ? 'Next version'
                      : 'Generate a new version'
                  }
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            {showSwipeControls && (
              <button className="msg-action-btn" disabled={busy} onClick={onRegenerate} title="Regenerate">
                <RefreshCw size={14} className={busyAction === 'regenerate' ? 'spin' : undefined} />
              </button>
            )}
            {showSwipeControls && (
              <button className="msg-action-btn" disabled={busy} onClick={onContinue} title="Continue writing">
                <FastForward size={14} className={busyAction === 'continue' ? 'spin' : undefined} />
              </button>
            )}
            <button className="msg-action-btn" onClick={startEdit} disabled={isPending} title={isPending ? 'Still sending…' : 'Edit'}>
              <Pencil size={14} />
            </button>
            <button className="msg-action-btn" onClick={copy} title="Copy">
              <Copy size={14} />
            </button>
            <button
              className="msg-action-btn"
              onClick={onToggleBookmark}
              disabled={isPending}
              title={isPending ? 'Still sending…' : message.bookmarked ? 'Remove bookmark' : 'Bookmark this message'}
            >
              <Star size={14} fill={message.bookmarked ? 'currentColor' : 'none'} color={message.bookmarked ? 'var(--accent)' : 'currentColor'} />
            </button>
            <button
              className="msg-action-btn"
              onClick={onFork}
              disabled={isPending}
              title={isPending ? 'Still sending…' : 'Fork a new act from here'}
            >
              <GitFork size={14} />
            </button>
            <button className="msg-action-btn" onClick={onDelete} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />
      )}
    </div>
  )
}
