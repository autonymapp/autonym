import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Archive, BookOpen, Copy, FileText, Info, Save, Wand2 } from 'lucide-react'
import type { Chat, ChatMessage, Character, LoreEntry, OpenRouterModel } from '@shared/types'
import { formatChatAsStory } from '@shared/exportStory'
import { estimateCost, formatCost } from '@shared/costEstimate'
import { friendlyError } from '../friendlyError'
import { useConfirm } from './ConfirmDialog'
import MessageBubble from './MessageBubble'
import AutoGrowTextarea from './AutoGrowTextarea'

const FORMAT_BUTTONS: { label: string; prefix: string; suffix: string; title: string }[] = [
  { label: '💬 Dialogue', prefix: '"', suffix: '"', title: 'Wrap as spoken dialogue: "like this"' },
  { label: '🎬 Action', prefix: '*', suffix: '*', title: 'Wrap as action/narration: *like this*' },
  { label: '💭 Thought', prefix: '~', suffix: '~', title: 'Wrap as an internal thought: ~like this~' },
  {
    label: '🛑 OOC',
    prefix: '((',
    suffix: '))',
    title: 'Wrap as an out-of-character note to the AI: ((like this)) — it will answer OOC too'
  }
]

export default function ChatWindow({
  chat,
  character,
  impersonatingCharacter,
  groupCharacters,
  onForkFromMessage,
  onContinueInNewChat,
  continuingInNewChat
}: {
  chat: Chat
  character: Character
  impersonatingCharacter: Character | null
  groupCharacters: Character[]
  onForkFromMessage: (messageId: number) => void
  onContinueInNewChat: () => void
  continuingInNewChat: boolean
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [busyMessageId, setBusyMessageId] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState<'regenerate' | 'continue' | null>(null)
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([])
  const [synonymTarget, setSynonymTarget] = useState<{ start: number; end: number; word: string } | null>(null)
  const [synonymOptions, setSynonymOptions] = useState<string[] | null>(null)
  const [lookingUpSynonyms, setLookingUpSynonyms] = useState(false)
  const [remixing, setRemixing] = useState<'detailed' | 'concise' | null>(null)
  const [wallNudgeDismissed, setWallNudgeDismissed] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const confirm = useConfirm()

  async function refresh(): Promise<void> {
    try {
      setMessages(await window.api.messages.listByChat(chat.id))
    } catch (err) {
      setErrorText(friendlyError(err))
    }
  }

  useEffect(() => {
    refresh()
    setWallNudgeDismissed(false)
  }, [chat.id])

  useEffect(() => {
    // A rejection here just means no API key is set yet — the Home dashboard already nudges
    // for that, so stay quiet here rather than duplicating the warning.
    window.api.settings.fetchModels().then(setModels).catch(() => {})
  }, [])

  useEffect(() => {
    window.api.characters
      .getLorebookIds(character.id)
      .then(async (lorebookIds: number[]) => {
        const lists = await Promise.all(lorebookIds.map((id) => window.api.loreEntries.listByLorebook(id)))
        setLoreEntries(lists.flat())
      })
      .catch((err) => setErrorText(friendlyError(err)))
  }, [character.id])

  useEffect(() => {
    const unsubscribe = window.api.chat.onStreamChunk((event) => {
      if (event.chatId !== chat.id) return
      setStreamingMessageId(event.messageId)
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === event.messageId)
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = { ...updated[idx], content: updated[idx].content + event.delta }
        return updated
      })
      if (event.done) {
        setSending(false)
        setStreamingMessageId(null)
        if (event.error) setErrorText(friendlyError(new Error(event.error)))
      }
    })
    return unsubscribe
  }, [chat.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function wrapSelection(prefix: string, suffix: string): void {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd, value } = textarea
    const selected = value.slice(selectionStart, selectionEnd)
    const before = value.slice(0, selectionStart)
    const after = value.slice(selectionEnd)
    const inserted = `${prefix}${selected}${suffix}`
    const newValue = before + inserted + after
    setInput(newValue)
    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = selected ? before.length + inserted.length : before.length + prefix.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  /** Selected text if it's a single word, otherwise the word touching the cursor — the target for
   *  the Thesaurus lookup. */
  function wordAtSelection(): { start: number; end: number; word: string } | null {
    const textarea = textareaRef.current
    if (!textarea) return null
    const { selectionStart, selectionEnd, value } = textarea
    if (selectionStart !== selectionEnd) {
      const word = value.slice(selectionStart, selectionEnd).trim()
      if (!word || /\s/.test(word)) return null
      return { start: selectionStart, end: selectionEnd, word }
    }
    const before = value.slice(0, selectionStart).match(/[\w'-]*$/)?.[0] ?? ''
    const after = value.slice(selectionStart).match(/^[\w'-]*/)?.[0] ?? ''
    const word = before + after
    if (!word) return null
    return { start: selectionStart - before.length, end: selectionStart + after.length, word }
  }

  async function lookupSynonyms(): Promise<void> {
    const target = wordAtSelection()
    if (!target) {
      setErrorText('Select a word (or place your cursor in one) to look up synonyms.')
      return
    }
    setErrorText(null)
    setLookingUpSynonyms(true)
    setSynonymOptions(null)
    try {
      const options = await window.api.writing.synonyms(target.word, input)
      setSynonymTarget(target)
      setSynonymOptions(options)
    } catch (err: any) {
      setErrorText(friendlyError(err))
    } finally {
      setLookingUpSynonyms(false)
    }
  }

  function applySynonym(word: string): void {
    if (!synonymTarget) return
    const { start, end } = synonymTarget
    setInput((prev) => prev.slice(0, start) + word + prev.slice(end))
    setSynonymTarget(null)
    setSynonymOptions(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  /** The selected text, or the whole draft when nothing's selected. */
  function selectionOrAll(): { text: string; start: number; end: number } {
    const textarea = textareaRef.current
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      return { text: input, start: 0, end: input.length }
    }
    return { text: input.slice(textarea.selectionStart, textarea.selectionEnd), start: textarea.selectionStart, end: textarea.selectionEnd }
  }

  async function remix(direction: 'detailed' | 'concise'): Promise<void> {
    const { text, start, end } = selectionOrAll()
    if (!text.trim()) return
    setErrorText(null)
    setRemixing(direction)
    try {
      const rewritten = await window.api.writing.remix(chat.id, text, direction)
      setInput((prev) => prev.slice(0, start) + rewritten + prev.slice(end))
    } catch (err: any) {
      setErrorText(friendlyError(err))
    } finally {
      setRemixing(null)
    }
  }

  async function suggestReply(): Promise<void> {
    if (!chat.modelId) {
      setErrorText('Pick a model in the settings panel before requesting a suggestion.')
      return
    }
    setErrorText(null)
    setSuggesting(true)
    try {
      const suggestion = await window.api.chat.suggestReply(chat.id)
      setInput(suggestion)
      requestAnimationFrame(() => textareaRef.current?.focus())
    } catch (err: any) {
      setErrorText(friendlyError(err))
    } finally {
      setSuggesting(false)
    }
  }

  function buildStoryText(): string {
    return formatChatAsStory({
      title: chat.title,
      characterName: character.name,
      impersonatingCharacterName: impersonatingCharacter?.name ?? null,
      messages
    })
  }

  async function copyStory(): Promise<void> {
    await navigator.clipboard.writeText(buildStoryText())
    setExportStatus('Copied to clipboard.')
    setTimeout(() => setExportStatus(null), 2500)
  }

  async function saveStory(): Promise<void> {
    const safeTitle = chat.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'story'
    const saved = await window.api.chat.saveStoryFile(`${safeTitle}.md`, buildStoryText())
    if (saved) {
      setExportStatus('Saved.')
      setTimeout(() => setExportStatus(null), 2500)
    }
  }

  function storyBodyOnly(): string {
    return buildStoryText().replace(/^# .+\n\n/, '')
  }

  async function exportPdf(): Promise<void> {
    const safeTitle = chat.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'story'
    const saved = await window.api.chat.exportPdf(`${safeTitle}.pdf`, chat.title, storyBodyOnly())
    if (saved) {
      setExportStatus('Saved.')
      setTimeout(() => setExportStatus(null), 2500)
    }
  }

  async function exportEpub(): Promise<void> {
    const safeTitle = chat.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'story'
    const saved = await window.api.chat.exportEpub(`${safeTitle}.epub`, chat.title, storyBodyOnly())
    if (saved) {
      setExportStatus('Saved.')
      setTimeout(() => setExportStatus(null), 2500)
    }
  }

  function replaceMessage(updated: ChatMessage): void {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  const COMPACT_KEEP_LAST_N = 20

  async function compactOlderMessages(): Promise<void> {
    const ok = await confirm(
      `Summarize everything except the most recent ${COMPACT_KEEP_LAST_N} messages into this Act's ` +
        "memory? The older messages stay visible in the transcript, but won't be sent to the AI anymore.",
      { title: 'Compact Older Messages?', danger: false, confirmLabel: 'Compact' }
    )
    if (!ok) return
    setCompacting(true)
    setErrorText(null)
    try {
      await window.api.chat.compactHistory(chat.id, COMPACT_KEEP_LAST_N)
      await refresh()
    } catch (err) {
      setErrorText(friendlyError(err))
    } finally {
      setCompacting(false)
    }
  }

  async function regenerate(messageId: number): Promise<void> {
    setErrorText(null)
    setBusyMessageId(messageId)
    setBusyAction('regenerate')
    try {
      const updated = await window.api.chat.regenerateMessage(chat.id, messageId)
      replaceMessage(updated)
    } catch (err: any) {
      setErrorText(friendlyError(err))
    } finally {
      setBusyMessageId(null)
      setBusyAction(null)
    }
  }

  async function continueMessage(messageId: number): Promise<void> {
    setErrorText(null)
    setBusyMessageId(messageId)
    setBusyAction('continue')
    try {
      const updated = await window.api.chat.continueMessage(chat.id, messageId)
      replaceMessage(updated)
    } catch (err: any) {
      setErrorText(friendlyError(err))
    } finally {
      setBusyMessageId(null)
      setBusyAction(null)
    }
  }

  async function setActiveVariant(messageId: number, index: number): Promise<void> {
    const updated = await window.api.chat.setActiveVariant(messageId, index)
    replaceMessage(updated)
  }

  async function editMessage(messageId: number, content: string): Promise<void> {
    const updated = await window.api.messages.updateContent(messageId, content)
    replaceMessage(updated)
  }

  async function deleteMessage(messageId: number): Promise<void> {
    if (!(await confirm('This message will be gone for good.', { title: 'Delete this message?' }))) return
    await window.api.messages.delete(messageId)
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }

  async function toggleBookmark(messageId: number): Promise<void> {
    const updated = await window.api.messages.toggleBookmark(messageId)
    replaceMessage(updated)
  }

  async function setSpeaker(messageId: number, speakerCharacterId: number | null): Promise<void> {
    const updated = await window.api.messages.setSpeaker(messageId, speakerCharacterId)
    replaceMessage(updated)
  }

  async function send(): Promise<void> {
    const content = input.trim()
    if (!content || sending) return
    if (!chat.modelId) {
      setErrorText('Pick a model in the settings panel before sending.')
      return
    }
    setErrorText(null)
    setInput('')
    setSending(true)
    setMessages((prev) => [
      ...prev,
      {
        id: -1,
        chatId: chat.id,
        role: 'user',
        content,
        variants: [content],
        activeVariantIndex: 0,
        bookmarked: false,
        speakerCharacterId: null,
        matchedLoreEntryIds: [],
        excludedFromContext: false,
        createdAt: new Date().toISOString()
      }
    ])
    try {
      await window.api.chat.sendMessage(chat.id, content)
      refresh()
    } catch (err: any) {
      setErrorText(friendlyError(err))
      setSending(false)
    }
  }

  const currentModel = models.find((m) => m.id === chat.modelId)
  const contextChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  const costEstimate = estimateCost(currentModel, contextChars + input.length, chat.samplerSettings.maxTokens)
  // Rough char-per-token approximation (matches costEstimate.ts) — doesn't account for the
  // system prompt's own size, so this reads a little low, but it's enough to warn before a
  // long scene actually hits the wall and the model starts forgetting earlier turns.
  const usedTokens = Math.ceil((contextChars + input.length) / 4)
  const contextPercent = Math.min(100, Math.round((usedTokens / chat.samplerSettings.contextLength) * 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        {exportStatus && <span className="hint">{exportStatus}</span>}
        <button
          className="btn btn-ghost btn-sm"
          title="Copy this act as clean, formatted story text"
          onClick={copyStory}
          disabled={messages.length === 0}
        >
          <Copy size={14} /> Copy Story
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Save this act as a Markdown story file"
          onClick={saveStory}
          disabled={messages.length === 0}
        >
          <Save size={14} /> Export Story
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Export this act as a PDF"
          onClick={exportPdf}
          disabled={messages.length === 0}
        >
          <FileText size={14} /> PDF
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Export this act as an EPUB e-book"
          onClick={exportEpub}
          disabled={messages.length === 0}
        >
          <FileText size={14} /> EPUB
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Summarize older messages into this Act's memory to free up context"
          onClick={compactOlderMessages}
          disabled={compacting || messages.length <= COMPACT_KEEP_LAST_N}
        >
          <Archive size={14} /> {compacting ? 'Compacting…' : 'Compact Older Messages'}
        </button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.map((m, i) => {
          const isUser = m.role === 'user'
          const speaker = isUser
            ? impersonatingCharacter
            : groupCharacters.find((c) => c.id === m.speakerCharacterId) ?? character
          const lastAssistantIndex = messages.map((x) => x.role).lastIndexOf('assistant')
          const matchedLore = loreEntries.filter((e) => m.matchedLoreEntryIds.includes(e.id))
          return (
            <MessageBubble
              key={m.id}
              message={m}
              isUser={isUser}
              speaker={speaker}
              matchedLore={matchedLore}
              isStreaming={m.id === streamingMessageId}
              showSwipeControls={!isUser && i === lastAssistantIndex && m.id > 0}
              busyAction={busyMessageId === m.id ? busyAction : null}
              groupCast={!isUser && groupCharacters.length > 0 ? [character, ...groupCharacters] : []}
              onSetActiveVariant={(index) => setActiveVariant(m.id, index)}
              onRegenerate={() => regenerate(m.id)}
              onContinue={() => continueMessage(m.id)}
              onEdit={(content) => editMessage(m.id, content)}
              onDelete={() => deleteMessage(m.id)}
              onToggleBookmark={() => toggleBookmark(m.id)}
              onSetSpeaker={(characterId) => setSpeaker(m.id, characterId)}
              onFork={() => onForkFromMessage(m.id)}
            />
          )
        })}
      </div>
      {errorText && (
        <div style={{ padding: '6px 24px', color: 'var(--danger)', fontSize: 12 }}>{errorText}</div>
      )}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {FORMAT_BUTTONS.map((b) => (
            <button
              key={b.label}
              className="btn btn-sm"
              title={b.title}
              onClick={() => wrapSelection(b.prefix, b.suffix)}
            >
              {b.label}
            </button>
          ))}
          <span
            className="msg-action-btn"
            style={{ display: 'inline-flex' }}
            title={'Formatting: "dialogue", *action*, ~thought~, ((OOC))'}
          >
            <Info size={14} style={{ color: 'var(--text-dim)' }} />
          </span>
          <button
            className="btn btn-sm"
            title="Look up synonyms for the selected word (or the word at your cursor)"
            onClick={lookupSynonyms}
            disabled={lookingUpSynonyms}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <BookOpen size={13} /> {lookingUpSynonyms ? 'Looking up…' : 'Thesaurus'}
          </button>
          {input.trim() && (
            <>
              <button
                className="btn btn-sm"
                title="Rewrite the selection (or whole draft) to be more detailed and descriptive"
                onClick={() => remix('detailed')}
                disabled={remixing !== null}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Wand2 size={13} /> {remixing === 'detailed' ? 'Remixing…' : 'More Detailed'}
              </button>
              <button
                className="btn btn-sm"
                title="Rewrite the selection (or whole draft) to be more concise"
                onClick={() => remix('concise')}
                disabled={remixing !== null}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Wand2 size={13} /> {remixing === 'concise' ? 'Remixing…' : 'More Concise'}
              </button>
            </>
          )}
          <button
            className="btn btn-sm"
            title="Have the AI draft your next line — review and edit before sending"
            onClick={suggestReply}
            disabled={suggesting}
            style={{ marginLeft: 'auto' }}
          >
            {suggesting ? '✨ Thinking…' : '✨ Auto-Reply'}
          </button>
        </div>
        {synonymOptions && (
          <div className="panel" style={{ padding: 8, marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span className="hint">Synonyms for "{synonymTarget?.word}":</span>
            {synonymOptions.length === 0 ? (
              <span className="hint">No synonyms found.</span>
            ) : (
              synonymOptions.map((word) => (
                <button key={word} className="pill" style={{ border: 'none', cursor: 'pointer' }} onClick={() => applySynonym(word)}>
                  {word}
                </button>
              ))
            )}
            <button className="msg-action-btn" title="Close" onClick={() => setSynonymOptions(null)} style={{ marginLeft: 'auto' }}>
              ✕
            </button>
          </div>
        )}
        {contextPercent >= 85 && !wallNudgeDismissed && (
          <div
            className="panel"
            style={{
              padding: '8px 10px',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderColor: 'var(--danger)'
            }}
          >
            <AlertTriangle size={14} color="var(--danger)" style={{ flexShrink: 0 }} />
            <span className="hint" style={{ flex: 1 }}>
              This Act is getting close to its memory limit — earlier turns will start dropping out
              of context soon.
            </span>
            <button
              className="btn btn-sm"
              onClick={onContinueInNewChat}
              disabled={continuingInNewChat}
            >
              {continuingInNewChat ? 'Starting…' : 'Continue in New Chat'}
            </button>
            <button
              className="msg-action-btn"
              title="Dismiss"
              onClick={() => setWallNudgeDismissed(true)}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <AutoGrowTextarea
            ref={textareaRef}
            data-tour="chat-input"
            rows={2}
            value={input}
            onChange={setInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={
              impersonatingCharacter ? `Type as ${impersonatingCharacter.name}...` : `Type as ${character.name}...`
            }
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={send} disabled={sending} style={{ padding: '0 22px' }}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {(costEstimate !== null || chat.samplerSettings.contextLength > 0) && (
          <div
            className="hint"
            style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12 }}
          >
            <span
              title={`~${usedTokens.toLocaleString()} of ${chat.samplerSettings.contextLength.toLocaleString()} tokens used (rough estimate)`}
              style={
                contextPercent >= 90
                  ? { color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }
                  : undefined
              }
            >
              {contextPercent >= 90 && <AlertTriangle size={12} />}
              Context: ~{contextPercent}% used
            </span>
            {costEstimate !== null && <span>Estimated cost: {formatCost(costEstimate)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
