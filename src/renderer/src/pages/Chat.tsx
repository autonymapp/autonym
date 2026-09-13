import { useEffect, useState } from 'react'
import type {
  Chat,
  ChatMessage,
  Character,
  ContentIntensity,
  CustomPreset,
  MoodPreset,
  Persona,
  RpMode,
  SamplerSettings,
  Scenario,
  Storyline,
  Universe
} from '@shared/types'
import { MOOD_PRESET_HINTS, MOOD_PRESET_LABELS, RP_MODE_LABELS } from '@shared/types'
import { CHAT_PRESETS } from '@shared/presets'
import { formatChatAsStory } from '@shared/exportStory'
import { friendlyError } from '../friendlyError'
import { useAppStore } from '../store/appStore'
import ChatWindow from '../components/ChatWindow'
import ModelPicker from '../components/ModelPicker'
import SamplerSettingsForm from '../components/SamplerSettingsForm'
import PresetPicker from '../components/PresetPicker'
import Avatar from '../components/Avatar'
import { useConfirm } from '../components/ConfirmDialog'
import ContextMenu from '../components/ContextMenu'
import TagInput from '../components/TagInput'
import AutoGrowTextarea from '../components/AutoGrowTextarea'
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Download,
  FastForward,
  Flame,
  Gauge,
  GitFork,
  MessageCircle,
  NotebookPen,
  Package,
  Pencil,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  UserCircle,
  UserPlus,
  Users,
  Wrench,
  X,
  Map as MapIcon
} from 'lucide-react'

type SettingsView = 'simple' | 'advanced'
type SkitLength = 'short' | 'medium'

interface MessageSearchResult {
  message: ChatMessage
  chat: Chat | null
  character: Character | null
}

export default function ChatPage(): JSX.Element {
  const {
    activeCharacterId,
    setActiveCharacterId,
    activeChatId,
    setActiveChatId,
    setPage,
    setPendingCharacterDraft,
    pushEscapeHandler,
    popEscapeHandler
  } = useAppStore()
  const confirm = useConfirm()
  const [characters, setCharacters] = useState<Character[]>([])
  const [universes, setUniverses] = useState<Universe[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'story' | 'cast' | 'model'>('story')
  const [settingsView, setSettingsView] = useState<SettingsView>('simple')
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([])
  const [importingPreset, setImportingPreset] = useState(false)
  const [presetImportError, setPresetImportError] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [continuing, setContinuing] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)
  const [allChats, setAllChats] = useState<Chat[]>([])
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [modeFilter, setModeFilter] = useState<number | null>(null)
  const [newActTitleDraft, setNewActTitleDraft] = useState('')
  const [creatingSkit, setCreatingSkit] = useState(false)
  const [skitLengthDraft, setSkitLengthDraft] = useState<SkitLength>('short')
  const [skitGenerating, setSkitGenerating] = useState(false)
  const [skitError, setSkitError] = useState<string | null>(null)
  const [directorsNotesDraft, setDirectorsNotesDraft] = useState('')
  const [fictionalDateDraft, setFictionalDateDraft] = useState('')
  const [storylines, setStorylines] = useState<Storyline[]>([])
  const [newStorylineName, setNewStorylineName] = useState('')
  const [addingStoryline, setAddingStoryline] = useState(false)
  const [forking, setForking] = useState(false)
  const [journaling, setJournaling] = useState(false)
  const [journalStatus, setJournalStatus] = useState<string | null>(null)
  const [exportingStoryline, setExportingStoryline] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findTab, setFindTab] = useState<'search' | 'bookmarks'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([])
  const [bookmarkResults, setBookmarkResults] = useState<MessageSearchResult[]>([])
  const [renamingStorylineId, setRenamingStorylineId] = useState<number | null>(null)
  const [storylineRenameDraft, setStorylineRenameDraft] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [addingPersona, setAddingPersona] = useState(false)
  const [newPersonaName, setNewPersonaName] = useState('')
  const [newPersonaDescription, setNewPersonaDescription] = useState('')
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [extractingCharacter, setExtractingCharacter] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [chatContextMenu, setChatContextMenu] = useState<{ chatId: number; x: number; y: number } | null>(null)
  const [allChatsContextMenu, setAllChatsContextMenu] = useState<{ chatId: number; x: number; y: number } | null>(
    null
  )
  const [storylineContextMenu, setStorylineContextMenu] = useState<{ storylineId: number; x: number; y: number } | null>(
    null
  )
  const [showChatTrash, setShowChatTrash] = useState(false)
  const [trashedChats, setTrashedChats] = useState<Chat[]>([])
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    () => localStorage.getItem('autonym:chatSidebarCollapsed') === '1'
  )
  function setSidebarCollapsed(value: boolean): void {
    localStorage.setItem('autonym:chatSidebarCollapsed', value ? '1' : '0')
    setSidebarCollapsedState(value)
  }

  useEffect(() => {
    if (showChatTrash) window.api.chats.listTrashed().then(setTrashedChats)
  }, [showChatTrash])

  useEffect(() => {
    if (!showChatTrash) return
    const close = (): void => setShowChatTrash(false)
    pushEscapeHandler(close)
    return () => popEscapeHandler(close)
  }, [showChatTrash])

  async function restoreChat(c: Chat): Promise<void> {
    await window.api.chats.restore(c.id)
    setTrashedChats((prev) => prev.filter((t) => t.id !== c.id))
    if (activeCharacterId === c.characterId) {
      window.api.chats.listByCharacter(c.characterId).then(setChats)
    }
    window.api.chats.listAll().then(setAllChats)
  }

  async function permanentlyDeleteChat(c: Chat): Promise<void> {
    if (
      !(await confirm(`"${c.title}" and every message in it will be gone for good — this cannot be undone.`, {
        title: 'Delete forever?'
      }))
    )
      return
    await window.api.chats.permanentlyDelete(c.id)
    setTrashedChats((prev) => prev.filter((t) => t.id !== c.id))
  }

  useEffect(() => {
    Promise.all([
      window.api.characters.list().then(setCharacters),
      window.api.universes.list().then(setUniverses),
      window.api.scenarios.list().then(setScenarios),
      window.api.chats.listAll().then(setAllChats),
      window.api.personas.list().then(setPersonas),
      refreshCustomPresets()
    ]).catch((err) => setLoadError(friendlyError(err)))
  }, [])

  useEffect(() => {
    if (activeCharacterId) {
      window.api.storylines
        .listForCharacter(activeCharacterId)
        .then(setStorylines)
        .catch((err) => setLoadError(friendlyError(err)))
    } else {
      setStorylines([])
    }
  }, [activeCharacterId])

  useEffect(() => {
    if (findOpen && findTab === 'bookmarks') {
      window.api.messages.listBookmarked().then(setBookmarkResults).catch((err) => setLoadError(friendlyError(err)))
    }
  }, [findOpen, findTab])

  async function refreshCustomPresets(): Promise<void> {
    setCustomPresets(await window.api.customPresets.list())
  }

  async function handleImportPreset(): Promise<void> {
    setImportingPreset(true)
    setPresetImportError(null)
    try {
      const preset = await window.api.import.preset()
      if (preset) await refreshCustomPresets()
    } catch (err: any) {
      setPresetImportError(friendlyError(err))
    } finally {
      setImportingPreset(false)
    }
  }

  async function deleteCustomPreset(id: number): Promise<void> {
    const preset = customPresets.find((p) => p.id === id)
    if (!(await confirm(`"${preset?.name ?? 'This style'}" will be gone for good.`, { title: 'Delete this style?' })))
      return
    await window.api.customPresets.delete(id)
    refreshCustomPresets()
  }

  async function saveCustomPreset(id: number): Promise<void> {
    if (!activeChat) return
    const preset = customPresets.find((p) => p.id === id)
    if (!preset) return
    if (
      !(await confirm(`"${preset.name}" will be overwritten with this act's current model and performance settings.`, {
        title: 'Save changes to this style?'
      }))
    )
      return
    await window.api.customPresets.update(id, {
      modelId: activeChat.modelId,
      samplerSettings: activeChat.samplerSettings
    })
    refreshCustomPresets()
  }

  useEffect(() => {
    if (activeCharacterId) {
      window.api.chats
        .listByCharacter(activeCharacterId)
        .then((list) => {
          setChats(list)
          if (list.length > 0 && !activeChatId) setActiveChatId(list[0].id)
        })
        .catch((err) => setLoadError(friendlyError(err)))
    } else {
      setChats([])
    }
  }, [activeCharacterId])

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) ?? null
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null

  useEffect(() => {
    setDirectorsNotesDraft(activeChat?.directorsNotes ?? '')
    setFictionalDateDraft(activeChat?.inFictionDate ?? '')
  }, [activeChat?.id])
  const impersonatingCharacter =
    characters.find((c) => c.id === activeChat?.impersonatingCharacterId) ?? null
  const activePersona = personas.find((p) => p.id === activeChat?.personaId) ?? null
  const otherCharacters = characters.filter((c) => c.id !== activeCharacterId)
  const attachedScenario = scenarios.find((s) => s.id === activeChat?.scenarioId) ?? null
  const groupCharacters = (activeChat?.groupCharacterIds ?? [])
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c)

  async function updateGroupCharacterIds(ids: number[]): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setGroupCharacterIds(activeChat.id, ids)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function newChat(rpMode: RpMode, skitLength?: SkitLength): Promise<void> {
    if (!activeCharacterId) return
    const defaultPreset = CHAT_PRESETS[0]
    const chat = await window.api.chats.create({
      characterId: activeCharacterId,
      personaId: null,
      impersonatingCharacterId: null,
      scenarioId: null,
      scenarioMilestoneIndex: 0,
      priorSummary: null,
      storylineId: null,
      collaborativeMode: false,
      tags: [],
      directorsNotes: '',
      inFictionDate: null,
      groupCharacterIds: [],
      universeId: null,
      isSkit: !!skitLength,
      skitLength: skitLength ?? null,
      moodPreset: null,
      contentIntensity: 'standard',
      title:
        newActTitleDraft.trim() ||
        (skitLength ? `Skit ${chats.length + 1}` : `${RP_MODE_LABELS[rpMode]} ${chats.length + 1}`),
      modelId: defaultPreset.modelId,
      rpMode,
      samplerSettings: defaultPreset.samplerSettings
    })
    setChats((prev) => [chat, ...prev])
    setActiveChatId(chat.id)
    setShowSettings(true)
    setNewActTitleDraft('')
  }

  const SKIT_TURN_TARGETS: Record<SkitLength, number> = { short: 8, medium: 14 }

  async function generateSkit(): Promise<void> {
    if (!activeChat) return
    setSkitGenerating(true)
    setSkitError(null)
    try {
      await window.api.skits.generate(activeChat.id)
    } catch (err: any) {
      setSkitError(friendlyError(err))
    } finally {
      setSkitGenerating(false)
    }
  }

  async function stopSkit(): Promise<void> {
    if (!activeChat) return
    await window.api.skits.cancel(activeChat.id)
  }

  async function regenerateSkit(): Promise<void> {
    if (!activeChat) return
    if (
      !(await confirm('Every turn in this Skit will be deleted and a fresh one generated from scratch.', {
        title: 'Regenerate this Skit?'
      }))
    )
      return
    await window.api.skits.regenerate(activeChat.id)
    await generateSkit()
  }

  async function continueInNewChat(): Promise<void> {
    if (!activeChat || !activeCharacterId) return
    setContinuing(true)
    setContinueError(null)
    try {
      const summary = await window.api.chat.summarizeForContinuation(activeChat.id)
      const chat = await window.api.chats.create({
        characterId: activeChat.characterId,
        personaId: activeChat.personaId,
        impersonatingCharacterId: activeChat.impersonatingCharacterId,
        scenarioId: activeChat.scenarioId,
        scenarioMilestoneIndex: activeChat.scenarioMilestoneIndex,
        priorSummary: summary,
        storylineId: activeChat.storylineId,
        collaborativeMode: activeChat.collaborativeMode,
        tags: activeChat.tags,
        directorsNotes: activeChat.directorsNotes,
        inFictionDate: activeChat.inFictionDate,
        groupCharacterIds: activeChat.groupCharacterIds,
        universeId: activeChat.universeId,
        isSkit: activeChat.isSkit,
        skitLength: activeChat.skitLength,
        moodPreset: activeChat.moodPreset,
        contentIntensity: activeChat.contentIntensity,
        title: `${activeChat.title} (Continued)`,
        modelId: activeChat.modelId,
        rpMode: activeChat.rpMode,
        samplerSettings: activeChat.samplerSettings
      })
      setChats((prev) => [chat, ...prev])
      setActiveChatId(chat.id)
    } catch (err: any) {
      setContinueError(friendlyError(err))
    } finally {
      setContinuing(false)
    }
  }

  async function updateImpersonation(impersonatingCharacterId: number | null): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setImpersonation(activeChat.id, impersonatingCharacterId)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateScenario(scenarioId: number | null): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setScenario(activeChat.id, scenarioId)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateMilestoneIndex(index: number): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setMilestoneIndex(activeChat.id, index)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function deleteChat(chat: Chat): Promise<void> {
    if (!(await confirm(`"${chat.title}" and every message in it will be gone for good.`, { title: 'Delete this act?' })))
      return
    await window.api.chats.delete(chat.id)
    setChats((prev) => prev.filter((c) => c.id !== chat.id))
    setAllChats((prev) => prev.filter((c) => c.id !== chat.id))
    if (activeChatId === chat.id) setActiveChatId(null)
  }

  function startRename(chat: Chat): void {
    setRenamingChatId(chat.id)
    setRenameDraft(chat.title)
  }

  async function commitRename(): Promise<void> {
    if (renamingChatId === null) return
    const title = renameDraft.trim()
    const id = renamingChatId
    setRenamingChatId(null)
    if (!title) return
    const updated = await window.api.chats.rename(id, title)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setAllChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  function switchToChatsScreen(): void {
    window.api.chats.listAll().then(setAllChats)
    setActiveCharacterId(null)
  }

  function jumpToChat(chat: Chat): void {
    setActiveCharacterId(chat.characterId)
    setActiveChatId(chat.id)
    setFindOpen(false)
  }

  async function forkChat(uptoMessageId: number | null, sourceChatId?: number): Promise<void> {
    const chatId = sourceChatId ?? activeChat?.id
    if (!chatId) return
    setForking(true)
    try {
      const forked = await window.api.chats.fork(chatId, uptoMessageId)
      setChats((prev) => (forked.characterId === activeCharacterId ? [forked, ...prev] : prev))
      setAllChats((prev) => [forked, ...prev])
      setActiveCharacterId(forked.characterId)
      setActiveChatId(forked.id)
    } finally {
      setForking(false)
    }
  }

  async function addToJournal(): Promise<void> {
    if (!activeChat) return
    setJournaling(true)
    setJournalStatus(null)
    try {
      await window.api.journal.generateForChat(activeChat.id)
      setJournalStatus('Journal updated.')
      setTimeout(() => setJournalStatus(null), 2500)
    } catch (err: any) {
      setJournalStatus(friendlyError(err))
    } finally {
      setJournaling(false)
    }
  }

  async function createStoryline(): Promise<void> {
    const name = newStorylineName.trim()
    if (!name || !activeCharacterId) return
    const storyline = await window.api.storylines.create({ characterId: activeCharacterId, name })
    setStorylines((prev) => [...prev, storyline])
    setNewStorylineName('')
    setAddingStoryline(false)
  }

  async function deleteStoryline(storyline: Storyline): Promise<void> {
    if (
      !(await confirm(`Acts in "${storyline.name}" are kept, just ungrouped — only the storyline folder goes away.`, {
        title: 'Delete this storyline?'
      }))
    )
      return
    await window.api.storylines.delete(storyline.id)
    setStorylines((prev) => prev.filter((s) => s.id !== storyline.id))
    setChats((prev) => prev.map((c) => (c.storylineId === storyline.id ? { ...c, storylineId: null } : c)))
  }

  function startRenameStoryline(storyline: Storyline): void {
    setRenamingStorylineId(storyline.id)
    setStorylineRenameDraft(storyline.name)
  }

  async function commitRenameStoryline(): Promise<void> {
    if (renamingStorylineId === null) return
    const name = storylineRenameDraft.trim()
    const id = renamingStorylineId
    setRenamingStorylineId(null)
    if (!name) return
    const updated = await window.api.storylines.rename(id, name)
    setStorylines((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function updateStoryline(storylineId: number | null): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setStoryline(activeChat.id, storylineId)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateChatTags(tags: string[]): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setTags(activeChat.id, tags)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateDirectorsNotes(notes: string): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setDirectorsNotes(activeChat.id, notes)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateFictionalDate(date: string): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setFictionalDate(activeChat.id, date || null)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateMood(moodPreset: MoodPreset | null): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setMood(activeChat.id, moodPreset)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateContentIntensity(contentIntensity: ContentIntensity): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setContentIntensity(activeChat.id, contentIntensity)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function updateCollaborativeMode(collaborativeMode: boolean): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setCollaborativeMode(activeChat.id, collaborativeMode)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function saveCharacterFromChat(): Promise<void> {
    if (!activeChat) return
    setExtractingCharacter(true)
    setExtractError(null)
    try {
      const draft = await window.api.characters.extractFromChat(activeChat.id)
      setPendingCharacterDraft({ ...draft, universeId: activeChat.universeId })
      setPage('characters')
    } catch (err: any) {
      setExtractError(friendlyError(err))
    } finally {
      setExtractingCharacter(false)
    }
  }

  async function createPersona(): Promise<void> {
    const name = newPersonaName.trim()
    if (!name) return
    const persona = await window.api.personas.create({ name, description: newPersonaDescription.trim() })
    setPersonas((prev) => [...prev, persona])
    setNewPersonaName('')
    setNewPersonaDescription('')
    setAddingPersona(false)
    if (activeChat) await updatePersona(persona.id)
  }

  async function deletePersona(persona: Persona): Promise<void> {
    if (!(await confirm(`"${persona.name}" will be gone for good.`, { title: 'Delete this persona?' }))) return
    await window.api.personas.delete(persona.id)
    setPersonas((prev) => prev.filter((p) => p.id !== persona.id))
  }

  async function updatePersona(personaId: number | null): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.setPersona(activeChat.id, personaId)
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function exportStoryline(storyline: Storyline, format: 'md' | 'pdf' | 'epub' = 'md'): Promise<void> {
    const storylineChats = chats
      .filter((c) => c.storylineId === storyline.id)
      .sort((a, b) => a.id - b.id)
    if (storylineChats.length === 0) return
    setExportingStoryline(true)
    try {
      const sections = await Promise.all(
        storylineChats.map(async (c) => {
          const msgs: ChatMessage[] = await window.api.messages.listByChat(c.id)
          const imp = characters.find((ch) => ch.id === c.impersonatingCharacterId) ?? null
          return formatChatAsStory({
            title: c.title,
            characterName: activeCharacter?.name ?? 'Character',
            impersonatingCharacterName: imp?.name ?? null,
            messages: msgs
          })
        })
      )
      const safeTitle = storyline.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'storyline'
      if (format === 'md') {
        const combined = `# ${storyline.name}\n\n${sections.join('\n\n---\n\n')}`
        await window.api.chat.saveStoryFile(`${safeTitle}.md`, combined)
      } else {
        const body = sections.join('\n\n---\n\n')
        if (format === 'pdf') await window.api.chat.exportPdf(`${safeTitle}.pdf`, storyline.name, body)
        else await window.api.chat.exportEpub(`${safeTitle}.epub`, storyline.name, body)
      }
    } finally {
      setExportingStoryline(false)
    }
  }

  async function runSearch(): Promise<void> {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    setSearchResults(await window.api.messages.search(q))
  }

  async function toggleBookmarkFromFind(messageId: number): Promise<void> {
    await window.api.messages.toggleBookmark(messageId)
    setBookmarkResults((prev) => prev.filter((r) => r.message.id !== messageId))
    setSearchResults((prev) =>
      prev.map((r) => (r.message.id === messageId ? { ...r, message: { ...r.message, bookmarked: !r.message.bookmarked } } : r))
    )
  }

  async function updateSettings(
    modelId: string,
    samplerSettings: SamplerSettings,
    rpMode: RpMode
  ): Promise<void> {
    if (!activeChat) return
    const updated = await window.api.chats.updateSettings(
      activeChat.id,
      modelId,
      samplerSettings,
      rpMode
    )
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  if (!activeCharacterId) {
    const usedUniverseIds = new Set(characters.map((c) => c.universeId).filter((id): id is number => id !== null))
    const modes = universes.filter((u) => usedUniverseIds.has(u.id))
    const visibleCharacters =
      modeFilter === null ? characters : characters.filter((c) => c.universeId === modeFilter)

    return (
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Choose Your Scene Partner</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              Pick who takes the stage — you'll cast yourself next, inside the scene.
            </p>
            {loadError && <p className="hint" style={{ color: 'var(--danger)' }}>{loadError}</p>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setFindOpen((o) => !o)}>
              {findOpen ? (
                'Close Find'
              ) : (
                <>
                  <Search size={14} /> Find
                </>
              )}
            </button>
            <button className="btn btn-sm" onClick={() => setShowChatTrash((s) => !s)}>
              <Trash2 size={14} /> {showChatTrash ? 'Close Trash' : 'Trash'}
            </button>
          </div>
        </div>

        {showChatTrash && (
          <div className="panel" style={{ padding: 16, marginBottom: 20, maxWidth: 560 }}>
            {trashedChats.length === 0 ? (
              <div className="empty-state">Trash is empty.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trashedChats.map((c) => {
                  const owner = characters.find((ch) => ch.id === c.characterId)
                  return (
                    <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.title}
                        </div>
                        <div className="hint">
                          {owner?.name ?? 'Unknown character'} · Deleted {new Date(c.deletedAt as string).toLocaleString()}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={() => restoreChat(c)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <RotateCcw size={13} /> Restore
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => permanentlyDeleteChat(c)}>
                        Delete Forever
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {findOpen && (
          <div className="panel" style={{ padding: 16, marginBottom: 20, maxWidth: 560 }}>
            <div className="segmented" style={{ marginBottom: 12 }}>
              <button className={findTab === 'search' ? 'active' : ''} onClick={() => setFindTab('search')}>
                Search
              </button>
              <button className={findTab === 'bookmarks' ? 'active' : ''} onClick={() => setFindTab('bookmarks')}>
                Bookmarks
              </button>
            </div>
            {findTab === 'search' ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    placeholder="Search every message across every act…"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={runSearch}>
                    Search
                  </button>
                </div>
                {searchResults.length === 0 ? (
                  <p className="hint">No results yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                    {searchResults.map((r) => (
                      <FindResultRow
                        key={r.message.id}
                        result={r}
                        onJump={() => r.chat && jumpToChat(r.chat)}
                        onToggleBookmark={() => toggleBookmarkFromFind(r.message.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : bookmarkResults.length === 0 ? (
              <p className="hint">No bookmarked messages yet — star a message in any act to save it here.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {bookmarkResults.map((r) => (
                  <FindResultRow
                    key={r.message.id}
                    result={r}
                    onJump={() => r.chat && jumpToChat(r.chat)}
                    onToggleBookmark={async () => {
                      await window.api.messages.toggleBookmark(r.message.id)
                      setBookmarkResults((prev) => prev.filter((x) => x.message.id !== r.message.id))
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {modes.length > 0 && (
          <div className="segmented" style={{ maxWidth: 480, marginBottom: 16 }}>
            <button className={modeFilter === null ? 'active' : ''} onClick={() => setModeFilter(null)}>
              All
            </button>
            {modes.map((universe) => (
              <button
                key={universe.id}
                className={modeFilter === universe.id ? 'active' : ''}
                onClick={() => setModeFilter(universe.id)}
              >
                {universe.name}
              </button>
            ))}
          </div>
        )}
        {characters.length === 0 ? (
          <div className="empty-state">No characters yet — create one on the Characters page.</div>
        ) : visibleCharacters.length === 0 ? (
          <div className="empty-state">
            No characters in "{modes.find((u) => u.id === modeFilter)?.name}" yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {visibleCharacters.map((c) => (
              <button
                key={c.id}
                className="card interactive"
                onClick={() => setActiveCharacterId(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
              >
                <Avatar avatarType={c.avatarType} src={c.avatarPath} emoji={c.avatarEmoji} name={c.name} size={34} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {allChats.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 28 }}>All Acts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 520 }}>
              {allChats
                .filter((c) => {
                  if (modeFilter === null) return true
                  const owner = characters.find((ch) => ch.id === c.characterId)
                  return owner?.universeId === modeFilter
                })
                .map((c) => {
                const owner = characters.find((ch) => ch.id === c.characterId)
                return (
                  <button
                    key={c.id}
                    className="card interactive"
                    onClick={() => jumpToChat(c)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setAllChatsContextMenu({ chatId: c.id, x: e.clientX, y: e.clientY })
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: 10 }}
                  >
                    {owner && (
                      <Avatar avatarType={owner.avatarType} src={owner.avatarPath} emoji={owner.avatarEmoji} name={owner.name} size={26} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </div>
                      <div className="hint">{owner?.name ?? 'Unknown character'}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
        {allChatsContextMenu &&
          (() => {
            const menuChat = allChats.find((c) => c.id === allChatsContextMenu.chatId)
            if (!menuChat) return null
            return (
              <ContextMenu
                x={allChatsContextMenu.x}
                y={allChatsContextMenu.y}
                onClose={() => setAllChatsContextMenu(null)}
                items={[
                  { label: 'Open', icon: MessageCircle, onClick: () => jumpToChat(menuChat) },
                  { label: 'Fork Act', icon: GitFork, onClick: () => forkChat(null, menuChat.id) },
                  { label: 'Delete', icon: Trash2, onClick: () => deleteChat(menuChat), danger: true }
                ]}
              />
            )
          })()}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {sidebarCollapsed ? (
        <div
          style={{
            width: 32,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 12
          }}
        >
          <button
            className="msg-action-btn"
            onClick={() => setSidebarCollapsed(false)}
            title="Show act list"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
      <div
        style={{
          width: 230,
          borderRight: '1px solid var(--border)',
          padding: 16,
          overflowY: 'auto',
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={switchToChatsScreen} style={{ alignSelf: 'flex-start' }}>
            <ArrowLeft size={14} /> Switch Character
          </button>
          <button
            className="msg-action-btn"
            onClick={() => setSidebarCollapsed(true)}
            title="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
        <div className="section-title" style={{ marginTop: 0 }}>Your Scene Partner</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Avatar
            avatarType={activeCharacter?.avatarType}
            src={activeCharacter?.avatarPath ?? null}
            emoji={activeCharacter?.avatarEmoji}
            name={activeCharacter?.name ?? '?'}
            size={30}
          />
          <div style={{ fontWeight: 700, fontSize: 14 }}>{activeCharacter?.name}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <input
            value={newActTitleDraft}
            onChange={(e) => setNewActTitleDraft(e.target.value)}
            placeholder="Act name (optional)"
            style={{ fontSize: 12.5 }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => newChat('narrative')}>
            + Story/Narrative RP
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => newChat('dm')}>
            + Dialogue/Direct Message RP
          </button>
          {creatingSkit ? (
            <div className="panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="hint">
                A Skit writes itself — pick a length, add cast and a premise once it's created,
                then hit Generate.
              </span>
              <div className="segmented">
                <button className={skitLengthDraft === 'short' ? 'active' : ''} onClick={() => setSkitLengthDraft('short')}>
                  Short
                </button>
                <button className={skitLengthDraft === 'medium' ? 'active' : ''} onClick={() => setSkitLengthDraft('medium')}>
                  Medium
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    newChat('narrative', skitLengthDraft)
                    setCreatingSkit(false)
                  }}
                >
                  Create Skit
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setCreatingSkit(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => setCreatingSkit(true)}>
              <Sparkles size={13} style={{ marginRight: 6 }} /> + New Skit
            </button>
          )}
        </div>
        <div className="section-title">Acts</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(() => {
            function renderChat(c: Chat): JSX.Element {
              return renamingChatId === c.id ? (
                <input
                  key={c.id}
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingChatId(null)
                  }}
                  style={{ fontSize: 13, padding: '8px 10px' }}
                />
              ) : (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveChatId(c.id)
                    setShowSettings(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActiveChatId(c.id)
                      setShowSettings(false)
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setChatContextMenu({ chatId: c.id, x: e.clientX, y: e.clientY })
                  }}
                  className={`sidebar-item${activeChatId === c.id ? ' active' : ''}`}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </span>
                  <span className="row-delete" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(c)
                      }}
                      style={{
                        fontSize: 12,
                        color: 'var(--text-dim)',
                        background: 'transparent',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteChat(c)
                      }}
                      style={{
                        fontSize: 12,
                        color: 'var(--danger)',
                        background: 'transparent',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}
                      title="Delete"
                    >
                      <X size={13} />
                    </button>
                  </span>
                </div>
              )
            }

            const ungrouped = chats.filter((c) => c.storylineId === null)
            return (
              <>
                {storylines.map((s) => {
                  const storylineChats = chats.filter((c) => c.storylineId === s.id)
                  return (
                    <div key={s.id} style={{ marginBottom: 6 }}>
                      {renamingStorylineId === s.id ? (
                        <input
                          autoFocus
                          value={storylineRenameDraft}
                          onChange={(e) => setStorylineRenameDraft(e.target.value)}
                          onBlur={commitRenameStoryline}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRenameStoryline()
                            if (e.key === 'Escape') setRenamingStorylineId(null)
                          }}
                          style={{ fontSize: 11, padding: '4px 8px', margin: '2px 8px', width: 'calc(100% - 16px)' }}
                        />
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px 2px',
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-dim)'
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setStorylineContextMenu({ storylineId: s.id, x: e.clientX, y: e.clientY })
                          }}
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => startRenameStoryline(s)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                startRenameStoryline(s)
                              }
                            }}
                            title="Click to rename"
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          >
                            📦 {s.name}
                          </span>
                          <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={() => exportStoryline(s)}
                              disabled={exportingStoryline || storylineChats.length === 0}
                              style={{
                                fontSize: 11,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-dim)',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Export this storyline as one combined story file"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              onClick={() => deleteStoryline(s)}
                              style={{
                                fontSize: 11,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--danger)',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Delete storyline"
                            >
                              <X size={13} />
                            </button>
                          </span>
                        </div>
                      )}
                      {storylineChats.length === 0 ? (
                        <div className="hint" style={{ padding: '2px 10px 4px' }}>No acts yet.</div>
                      ) : (
                        storylineChats.map(renderChat)
                      )}
                    </div>
                  )
                })}
                {ungrouped.map(renderChat)}
              </>
            )
          })()}
        </div>
      </div>
      )}

      {storylineContextMenu &&
        (() => {
          const menuStoryline = storylines.find((s) => s.id === storylineContextMenu.storylineId)
          if (!menuStoryline) return null
          return (
            <ContextMenu
              x={storylineContextMenu.x}
              y={storylineContextMenu.y}
              onClose={() => setStorylineContextMenu(null)}
              items={[
                { label: 'Rename', icon: Pencil, onClick: () => startRenameStoryline(menuStoryline) },
                { label: 'Export as Markdown', icon: Download, onClick: () => exportStoryline(menuStoryline, 'md') },
                { label: 'Export as PDF', icon: Download, onClick: () => exportStoryline(menuStoryline, 'pdf') },
                { label: 'Export as EPUB', icon: Download, onClick: () => exportStoryline(menuStoryline, 'epub') },
                { label: 'Delete', icon: Trash2, onClick: () => deleteStoryline(menuStoryline), danger: true }
              ]}
            />
          )
        })()}

      {chatContextMenu &&
        (() => {
          const menuChat = chats.find((c) => c.id === chatContextMenu.chatId)
          if (!menuChat) return null
          return (
            <ContextMenu
              x={chatContextMenu.x}
              y={chatContextMenu.y}
              onClose={() => setChatContextMenu(null)}
              items={[
                { label: 'Rename', icon: Pencil, onClick: () => startRename(menuChat) },
                { label: 'Fork Act', icon: GitFork, onClick: () => forkChat(null, menuChat.id) },
                { label: 'Delete', icon: Trash2, onClick: () => deleteChat(menuChat), danger: true }
              ]}
            />
          )
        })()}

      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        {activeChat && activeCharacter ? (
          <>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="top-bar">
                <div>
                  {renamingChatId === activeChat.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingChatId(null)
                      }}
                      style={{ fontSize: 14, fontWeight: 700 }}
                    />
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: 14 }}>{activeChat.title}</strong>
                      <button
                        className="msg-action-btn"
                        title="Rename this act"
                        onClick={() => startRename(activeChat)}
                      >
                        <Pencil size={12} />
                      </button>
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="pill" style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}>
                      🎭 You: {impersonatingCharacter?.name ?? activePersona?.name ?? 'Yourself'}
                    </span>
                    <span style={{ color: 'var(--text-faint)', display: 'inline-flex' }}>
                      <ArrowLeftRight size={12} />
                    </span>
                    <span className="pill">💬 Them: {activeCharacter.name}</span>
                    <span className="pill" style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}>
                      {RP_MODE_LABELS[activeChat.rpMode]}
                    </span>
                    {attachedScenario && (
                      <span className="pill" style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}>
                        🗺️ {attachedScenario.name} ({activeChat.scenarioMilestoneIndex + 1}/
                        {attachedScenario.milestones.length})
                      </span>
                    )}
                    {activeChat.priorSummary && (
                      <span
                        className="pill"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}
                        title={activeChat.priorSummary}
                      >
                        📜 Continued story
                      </span>
                    )}
                    {activeChat.collaborativeMode && (
                      <span
                        className="pill"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-dim)' }}
                        title="The AI is collaborating on setting/backstory here instead of assuming this character's usual canon"
                      >
                        🧬 Collaborative
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, position: 'relative' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => setToolsMenuOpen((o) => !o)}
                    disabled={continuing || forking || journaling || extractingCharacter}
                  >
                    {continuing ? (
                      'Summarizing…'
                    ) : forking ? (
                      'Forking…'
                    ) : journaling ? (
                      'Saving…'
                    ) : extractingCharacter ? (
                      'Extracting…'
                    ) : (
                      <>
                        <Wrench size={14} /> Story Tools ▾
                      </>
                    )}
                  </button>
                  {toolsMenuOpen && (
                    <div
                      className="panel"
                      style={{
                        position: 'absolute',
                        top: '110%',
                        right: 80,
                        zIndex: 20,
                        width: 230,
                        padding: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                      }}
                      onMouseLeave={() => setToolsMenuOpen(false)}
                    >
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start' }}
                        title="Summarize this act and start a fresh one that remembers it, without replaying the whole history"
                        onClick={() => {
                          setToolsMenuOpen(false)
                          continueInNewChat()
                        }}
                      >
                        <FastForward size={14} /> Continue in New Act
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start' }}
                        title="Duplicate this whole act into a new one you can take in a different direction"
                        onClick={() => {
                          setToolsMenuOpen(false)
                          forkChat(null)
                        }}
                      >
                        <GitFork size={14} /> Fork From Here
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start' }}
                        title="Summarize this act into this character's journal"
                        onClick={() => {
                          setToolsMenuOpen(false)
                          addToJournal()
                        }}
                      >
                        <NotebookPen size={14} /> Add to Journal
                      </button>
                      {activeChat.collaborativeMode && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ justifyContent: 'flex-start' }}
                          title="Use AI to pull a character profile out of this conversation, saved as a new character card"
                          onClick={() => {
                            setToolsMenuOpen(false)
                            saveCharacterFromChat()
                          }}
                        >
                          <UserPlus size={14} /> Save Character From Act
                        </button>
                      )}
                    </div>
                  )}
                  <button className="btn btn-sm" onClick={() => setShowSettings((s) => !s)}>
                    {showSettings ? (
                      'Hide Settings'
                    ) : (
                      <>
                        <SettingsIcon size={14} /> Model & Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
              {continueError && (
                <div style={{ padding: '6px 20px', color: 'var(--danger)', fontSize: 12 }}>{continueError}</div>
              )}
              {loadError && (
                <div style={{ padding: '6px 20px', color: 'var(--danger)', fontSize: 12 }}>{loadError}</div>
              )}
              {journalStatus && (
                <div style={{ padding: '6px 20px', fontSize: 12 }} className="hint">{journalStatus}</div>
              )}
              {extractError && (
                <div style={{ padding: '6px 20px', color: 'var(--danger)', fontSize: 12 }}>{extractError}</div>
              )}
              {activeChat.isSkit && (
                <div
                  className="panel"
                  style={{
                    margin: '0 20px 10px',
                    padding: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap'
                  }}
                >
                  <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                  <span className="hint" style={{ flex: 1 }}>
                    {skitGenerating
                      ? `Writing this ${activeChat.skitLength} Skit unattended — about ${SKIT_TURN_TARGETS[activeChat.skitLength ?? 'short']} turns total.`
                      : 'Hit Generate to write this Skit unattended, or Regenerate to start it over.'}
                  </span>
                  {skitError && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{skitError}</span>}
                  {skitGenerating ? (
                    <button className="btn btn-danger btn-sm" onClick={stopSkit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Square size={13} /> Stop
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={generateSkit}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Sparkles size={13} /> Generate
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={regenerateSkit}>
                        Regenerate Whole Skit
                      </button>
                    </>
                  )}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ChatWindow
                  chat={activeChat}
                  character={activeCharacter}
                  impersonatingCharacter={impersonatingCharacter}
                  groupCharacters={groupCharacters}
                  onForkFromMessage={(messageId) => forkChat(messageId)}
                />
              </div>
            </div>
            {showSettings && (
              <div
                style={{
                  width: 270,
                  borderLeft: '1px solid var(--border)',
                  padding: 16,
                  overflowY: 'auto',
                  background: 'var(--bg-elevated)'
                }}
              >
                <div className="panel" style={{ padding: 10, marginBottom: 14, background: 'var(--bg-sunken)' }}>
                  <div style={{ fontSize: 12 }}>
                    🎭 You're in a scene with <strong>{activeCharacter.name}</strong>
                  </div>
                </div>

                <div className="segmented" style={{ marginBottom: 16 }}>
                  <button
                    className={settingsTab === 'story' ? 'active' : ''}
                    onClick={() => setSettingsTab('story')}
                  >
                    Story
                  </button>
                  <button
                    className={settingsTab === 'cast' ? 'active' : ''}
                    onClick={() => setSettingsTab('cast')}
                  >
                    Cast
                  </button>
                  <button
                    className={settingsTab === 'model' ? 'active' : ''}
                    onClick={() => setSettingsTab('model')}
                  >
                    Model
                  </button>
                </div>

                {settingsTab === 'cast' && (
                <details open style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ marginTop: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <UserCircle size={14} style={{ color: 'var(--accent)' }} /> Who You're Playing As
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    This is your side of the conversation — one of your own characters (OC vs. OC), a
                    lightweight persona, or just yourself.
                  </p>
                  <select
                    value={
                      activeChat.impersonatingCharacterId
                        ? `char:${activeChat.impersonatingCharacterId}`
                        : activeChat.personaId
                          ? `persona:${activeChat.personaId}`
                          : ''
                    }
                    onChange={(e) => {
                      const [kind, idStr] = e.target.value.split(':')
                      if (kind === 'char') updateImpersonation(parseInt(idStr))
                      else if (kind === 'persona') updatePersona(parseInt(idStr))
                      else {
                        updateImpersonation(null)
                        updatePersona(null)
                      }
                    }}
                    style={{ width: '100%', marginBottom: 8 }}
                  >
                    <option value="">— None, I'll write as myself —</option>
                    {otherCharacters.length > 0 && (
                      <optgroup label="My Characters">
                        {otherCharacters.map((c) => (
                          <option key={`char:${c.id}`} value={`char:${c.id}`}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {personas.length > 0 && (
                      <optgroup label="Personas">
                        {personas.map((p) => (
                          <option key={`persona:${p.id}`} value={`persona:${p.id}`}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {activePersona && (
                    <button
                      className="msg-action-btn"
                      style={{ float: 'right', marginTop: -6 }}
                      title="Delete this persona"
                      onClick={() => deletePersona(activePersona)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {addingPersona ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                      <input
                        autoFocus
                        value={newPersonaName}
                        onChange={(e) => setNewPersonaName(e.target.value)}
                        placeholder="Persona name"
                        style={{ fontSize: 12 }}
                      />
                      <AutoGrowTextarea
                        rows={2}
                        value={newPersonaDescription}
                        onChange={setNewPersonaDescription}
                        placeholder="A few words about them (optional)"
                        style={{ fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" onClick={createPersona} disabled={!newPersonaName.trim()}>
                          Add
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setAddingPersona(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setAddingPersona(true)}>
                      + Persona
                    </button>
                  )}
                </details>
                )}

                {settingsTab === 'story' && (
                <>
                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Package size={14} style={{ color: 'var(--accent)' }} /> Storyline
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    Group this act with others into a named arc, so you can export the whole thing as
                    one combined story later.
                  </p>
                  <select
                    value={activeChat.storylineId ?? ''}
                    onChange={(e) => updateStoryline(e.target.value ? parseInt(e.target.value) : null)}
                    style={{ width: '100%', marginBottom: 8 }}
                  >
                    <option value="">— None —</option>
                    {storylines.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {addingStoryline ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        autoFocus
                        value={newStorylineName}
                        onChange={(e) => setNewStorylineName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createStoryline()
                          if (e.key === 'Escape') setAddingStoryline(false)
                        }}
                        placeholder="Storyline name"
                        style={{ flex: 1, fontSize: 12 }}
                      />
                      <button className="btn btn-sm" onClick={createStoryline}>
                        Add
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setAddingStoryline(true)}>
                      + Storyline
                    </button>
                  )}
                </details>

                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <MapIcon size={14} style={{ color: 'var(--accent)' }} /> Scenario
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    Attach a scene setup and milestone roadmap from Scenario Maker to guide where this
                    act heads.
                  </p>
                  <select
                    value={activeChat.scenarioId ?? ''}
                    onChange={(e) => updateScenario(e.target.value ? parseInt(e.target.value) : null)}
                    style={{ width: '100%', marginBottom: attachedScenario ? 10 : 0 }}
                  >
                    <option value="">— None —</option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {attachedScenario && attachedScenario.milestones.length > 0 && (
                    <div className="panel" style={{ padding: 10, background: 'var(--bg-sunken)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>
                          Beat {activeChat.scenarioMilestoneIndex + 1} of {attachedScenario.milestones.length}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-icon btn-sm"
                            disabled={activeChat.scenarioMilestoneIndex === 0}
                            onClick={() => updateMilestoneIndex(activeChat.scenarioMilestoneIndex - 1)}
                            title="Previous beat"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            className="btn btn-icon btn-sm"
                            disabled={activeChat.scenarioMilestoneIndex >= attachedScenario.milestones.length - 1}
                            onClick={() => updateMilestoneIndex(activeChat.scenarioMilestoneIndex + 1)}
                            title="Next beat"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        {attachedScenario.milestones[activeChat.scenarioMilestoneIndex]}
                      </div>
                    </div>
                  )}
                </details>

                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Tag size={14} style={{ color: 'var(--accent)' }} /> Tags
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <TagInput tags={activeChat.tags} onChange={updateChatTags} />
                  </div>
                </details>

                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <CalendarClock size={14} style={{ color: 'var(--accent)' }} /> In-Story Date/Time
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    Where the story currently sits in fictional time (e.g. "Day 3, Morning" or "Two
                    weeks later"). Shown to the AI as current scene context.
                  </p>
                  <input
                    value={fictionalDateDraft}
                    onChange={(e) => setFictionalDateDraft(e.target.value)}
                    onBlur={() => updateFictionalDate(fictionalDateDraft)}
                    placeholder="e.g. Day 3, Morning"
                    style={{ width: '100%' }}
                  />
                </details>

                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Gauge size={14} style={{ color: 'var(--accent)' }} /> Mood & Pacing
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    One-click steering on top of the RP mode above — cures the AI's tendency to
                    resolve tension too fast. Leave unset for no extra steering.
                  </p>
                  <select
                    value={activeChat.moodPreset ?? ''}
                    onChange={(e) => updateMood(e.target.value ? (e.target.value as MoodPreset) : null)}
                    style={{ width: '100%' }}
                  >
                    <option value="">— None —</option>
                    {(Object.keys(MOOD_PRESET_LABELS) as MoodPreset[]).map((preset) => (
                      <option key={preset} value={preset}>
                        {MOOD_PRESET_LABELS[preset]}
                      </option>
                    ))}
                  </select>
                  {activeChat.moodPreset && (
                    <p className="hint" style={{ marginTop: 6 }}>{MOOD_PRESET_HINTS[activeChat.moodPreset]}</p>
                  )}
                </details>

                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Flame size={14} style={{ color: 'var(--accent)' }} /> Content Intensity
                  </summary>
                  <div className="segmented" style={{ marginBottom: 8 }}>
                    <button
                      className={activeChat.contentIntensity === 'standard' ? 'active' : ''}
                      onClick={() => updateContentIntensity('standard')}
                    >
                      Standard
                    </button>
                    <button
                      className={activeChat.contentIntensity === 'mature' ? 'active' : ''}
                      onClick={() => updateContentIntensity('mature')}
                    >
                      Mature
                    </button>
                    <button
                      className={activeChat.contentIntensity === 'explicit' ? 'active' : ''}
                      onClick={() => updateContentIntensity('explicit')}
                    >
                      Explicit
                    </button>
                  </div>
                  <p className="hint" style={{ margin: 0 }}>
                    This tells a willing model what's allowed — it can't force a model past its own
                    safety training. For mature content, pick one of the RP-tuned models (Vivid &
                    Creative, Dedicated RP Model) in the Model tab rather than relying on this alone.
                  </p>
                </details>

                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Clapperboard size={14} style={{ color: 'var(--accent)' }} />
                    {activeChat.isSkit ? 'Premise' : "Director's Notes"}
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    {activeChat.isSkit
                      ? "What this Skit is about — a scene, a setup, a mood. Sent to the AI as steering for the whole unattended run."
                      : 'Out-of-character instructions for how this act should play out. Sent to the AI alongside the character and scenario.'}
                  </p>
                  <AutoGrowTextarea
                    value={directorsNotesDraft}
                    onChange={setDirectorsNotesDraft}
                    onBlur={() => updateDirectorsNotes(directorsNotesDraft)}
                    placeholder={
                      activeChat.isSkit
                        ? 'e.g. A quiet evening at the tea house turns into a confession neither of them planned.'
                        : 'e.g. Keep the tone lighthearted. Introduce a plot twist involving the missing letter soon.'
                    }
                    rows={4}
                    style={{ width: '100%' }}
                  />
                </details>
                </>
                )}

                {settingsTab === 'cast' && (
                <details style={{ marginBottom: 10 }}>
                  <summary
                    className="section-title"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Users size={14} style={{ color: 'var(--accent)' }} /> Group Cast
                  </summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    Add other cast members to this act for a Group Scene. The AI plays one at a
                    time, prefixing each turn with a "Name:" cue so it's clear who's speaking.
                  </p>
                  {otherCharacters.filter((c) => c.id !== activeChat.impersonatingCharacterId).length === 0 ? (
                    <p className="hint">Create more cast members to add them here.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {otherCharacters
                        .filter((c) => c.id !== activeChat.impersonatingCharacterId)
                        .map((c) => {
                          const checked = activeChat.groupCharacterIds.includes(c.id)
                          return (
                            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  updateGroupCharacterIds(
                                    checked
                                      ? activeChat.groupCharacterIds.filter((id) => id !== c.id)
                                      : [...activeChat.groupCharacterIds, c.id]
                                  )
                                }
                              />
                              {c.name}
                            </label>
                          )
                        })}
                    </div>
                  )}
                </details>
                )}

                {settingsTab === 'model' && (
                <>
                <div className="section-title">RP Mode</div>
                <div className="segmented" style={{ marginBottom: 18 }}>
                  {(Object.keys(RP_MODE_LABELS) as RpMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={activeChat.rpMode === mode ? 'active' : ''}
                      onClick={() => updateSettings(activeChat.modelId, activeChat.samplerSettings, mode)}
                    >
                      {mode === 'narrative' ? 'Narrative' : 'Dialogue'}
                    </button>
                  ))}
                </div>

                <label
                  className="panel"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 10,
                    marginBottom: 18,
                    background: 'var(--bg-sunken)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={activeChat.collaborativeMode}
                    onChange={(e) => updateCollaborativeMode(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>🧬 Collaborative Mode</div>
                    <p className="hint" style={{ marginTop: 2 }}>
                      Brainstorm a story from scratch, or explore an AU for {activeCharacter.name} — the AI
                      keeps their personality but treats background/setting as open to develop together
                      instead of assuming their usual canon applies.
                    </p>
                  </div>
                </label>

                <div className="segmented" style={{ marginBottom: 16 }}>
                  <button
                    className={settingsView === 'simple' ? 'active' : ''}
                    onClick={() => setSettingsView('simple')}
                  >
                    Simple
                  </button>
                  <button
                    className={settingsView === 'advanced' ? 'active' : ''}
                    onClick={() => setSettingsView('advanced')}
                  >
                    Advanced
                  </button>
                </div>

                {settingsView === 'simple' ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="section-title" style={{ margin: 0 }}>RP-Ready Styles</div>
                      <button className="btn btn-sm" onClick={handleImportPreset} disabled={importingPreset}>
                        {importingPreset ? 'Importing…' : 'Import Style'}
                      </button>
                    </div>
                    {presetImportError && (
                      <p className="hint" style={{ color: 'var(--danger)', marginTop: 6 }}>{presetImportError}</p>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <PresetPicker
                        customPresets={customPresets}
                        currentModelId={activeChat.modelId}
                        currentSamplerSettings={activeChat.samplerSettings}
                        onApply={(modelId, samplerSettings) =>
                          updateSettings(
                            modelId || activeChat.modelId,
                            samplerSettings,
                            activeChat.rpMode
                          )
                        }
                        onSaveCustom={saveCustomPreset}
                        onDeleteCustom={deleteCustomPreset}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="section-title">Model</div>
                    {!activeChat.modelId && (
                      <p className="hint" style={{ color: 'var(--danger)' }}>No model selected yet.</p>
                    )}
                    <ModelPicker
                      value={activeChat.modelId}
                      onChange={(modelId) =>
                        updateSettings(modelId, activeChat.samplerSettings, activeChat.rpMode)
                      }
                    />
                    <div className="section-title" style={{ marginTop: 18 }}>Performance Controls</div>
                    <SamplerSettingsForm
                      value={activeChat.samplerSettings}
                      onChange={(settings) =>
                        updateSettings(activeChat.modelId, settings, activeChat.rpMode)
                      }
                    />
                  </>
                )}
                </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state" style={{ margin: 'auto' }}>Select or create an act.</div>
        )}
      </div>
    </div>
  )
}

function FindResultRow({
  result,
  onJump,
  onToggleBookmark
}: {
  result: MessageSearchResult
  onJump: () => void
  onToggleBookmark: () => void
}): JSX.Element {
  const { message, chat, character } = result
  return (
    <div className="card interactive" style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <button
        onClick={onToggleBookmark}
        title={message.bookmarked ? 'Remove bookmark' : 'Bookmark'}
        style={{
          background: 'transparent',
          border: 'none',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center'
        }}
      >
        <Star size={14} fill={message.bookmarked ? 'currentColor' : 'none'} color={message.bookmarked ? 'var(--accent)' : 'currentColor'} />
      </button>
      <button
        onClick={onJump}
        disabled={!chat}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: chat ? 'pointer' : 'default' }}
      >
        <div className="hint" style={{ marginBottom: 2 }}>
          {character?.name ?? 'Unknown'} · {chat?.title ?? 'Deleted act'}
        </div>
        <div
          style={{
            fontSize: 13,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {message.content}
        </div>
      </button>
    </div>
  )
}
