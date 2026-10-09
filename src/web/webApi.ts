import type {
  Character,
  CharacterInput,
  CharacterRelationship,
  CharacterRelationshipInput,
  Chat,
  ChatInput,
  ChatMessage,
  CustomPreset,
  CustomPresetInput,
  JournalEntry,
  Lorebook,
  LoreEntry,
  LoreEntryInput,
  LoreEntryType,
  LorebookInput,
  Persona,
  PersonaInput,
  RpMode,
  SamplerSettings,
  Scenario,
  ScenarioInput,
  Storyline,
  StorylineInput,
  StreamChunkEvent,
  Universe,
  UniverseInput
} from '@shared/types'
import { assemblePrompt } from '@shared/assemble'
import { detectSpeaker, stripSpeakerCue } from '@shared/detectSpeaker'
import { resolveCharacterInheritance } from '@shared/characterInheritance'
import { assertExists } from '@shared/assertExists'
import { parseCharacterImport, parseLorebookImport, parsePresetImport } from '@shared/importers'
import { CHAT_PRESETS, CLERICAL_MODEL_ID } from '@shared/presets'
import {
  characterRepo,
  chatRepo,
  customPresetRepo,
  journalRepo,
  loreEntryRepo,
  lorebookRepo,
  messageRepo,
  personaRepo,
  relationshipRepo,
  scenarioRepo,
  storylineRepo,
  universeRepo,
  statsRepo,
  store,
  setStore
} from './webDb'
import {
  hasApiKey,
  saveApiKey,
  clearApiKey,
  fetchModels,
  streamChatCompletion,
  getCompletion,
  ChatCompletionOptions
} from './webOpenRouter'
import {
  exportWebBackup,
  importWebBackup,
  exportStoryMarkdown,
  exportStoryEpub,
  exportStoryPdf,
  exportStarterPackJson,
  importStarterPackJson,
  openFilePicker
} from './webExport'
import { extractCharacterCardFromPng } from './webPngMeta'
import { lookupSynonyms, remixPassage } from './webWritingTools'
import { structureCharacterText, extractCharacterFromChat } from './webCharacterTools'
import { fetchUrlAsText, structureLoreText } from './webLoreTools'
import { getLocalAvatar, saveLocalAvatar } from './webStorage'
import { uploadAvatarToCloud } from './supabaseClient'

interface ImportCharactersResult {
  imported: Character[]
  failed: { file: string; error: string }[]
}

interface MessageSearchResult {
  message: ChatMessage
  chat: Chat | null
  character: Character | null
}

interface StatsOverview {
  totalMessages: number
  totalWords: number
  perCharacter: { characterId: number; characterName: string; messageCount: number; wordCount: number }[]
  streakDays: number
}

const streamListeners = new Set<(event: StreamChunkEvent) => void>()
const activeStreams = new Map<string, AbortController>()
const activeSkitRuns = new Map<number, AbortController>()
const SKIT_TURN_TARGETS: Record<'short' | 'medium', number> = { short: 8, medium: 14 }
const CLERICAL_SAMPLER_OPTIONS = { temperature: 0.3, topP: 1, maxTokens: 500 }

function broadcastStreamChunk(event: StreamChunkEvent): void {
  streamListeners.forEach((listener) => {
    try {
      listener(event)
    } catch (e) {
      console.error('Error in stream listener:', e)
    }
  })
}

function samplerOptions(chat: Chat): ChatCompletionOptions {
  return {
    temperature: chat.samplerSettings.temperature,
    topP: chat.samplerSettings.topP,
    maxTokens: chat.samplerSettings.maxTokens,
    topK: chat.samplerSettings.topK,
    frequencyPenalty: chat.samplerSettings.frequencyPenalty,
    presencePenalty: chat.samplerSettings.presencePenalty,
    repetitionPenalty: chat.samplerSettings.repetitionPenalty
  }
}

function buildChatContext(chatId: number) {
  const chat = chatRepo.get(chatId)
  if (!chat) throw new Error('Chat not found')
  const rawCharacter = characterRepo.get(chat.characterId)
  if (!rawCharacter) throw new Error('Character not found')

  const allCharacters = characterRepo.list()
  const character = resolveCharacterInheritance(rawCharacter, allCharacters)
  const persona = chat.personaId ? personaRepo.get(chat.personaId) ?? null : null
  const impersonatingCharacter = chat.impersonatingCharacterId
    ? characterRepo.get(chat.impersonatingCharacterId) ?? null
    : null
  const relationship = impersonatingCharacter
    ? relationshipRepo.getForPair(chat.characterId, impersonatingCharacter.id) ?? null
    : null
  const scenario = chat.scenarioId ? scenarioRepo.get(chat.scenarioId) ?? null : null

  const groupCharacters = (chat.groupCharacterIds ?? [])
    .map((id) => characterRepo.get(id))
    .filter((c): c is Character => c !== undefined)
    .map((c) => resolveCharacterInheritance(c, allCharacters))

  const allCharacterIds = [chat.characterId, ...(chat.groupCharacterIds ?? [])]
  const allLorebookIds = Array.from(
    new Set(allCharacterIds.flatMap((id) => characterRepo.getLorebookIds(id)))
  )
  const activeLoreEntries = loreEntryRepo.listByLorebooks(allLorebookIds)
  const lorebooks = allLorebookIds
    .map((id) => lorebookRepo.get(id))
    .filter((l): l is Lorebook => l !== undefined)

  return {
    chat,
    character,
    groupCharacters,
    persona,
    impersonatingCharacter,
    relationship,
    scenario,
    loreEntries: activeLoreEntries,
    lorebooks
  }
}

export function createWebApi() {
  return {
    characters: {
      list: async (): Promise<Character[]> => characterRepo.list(),
      get: async (id: number): Promise<Character | null> => characterRepo.get(id) ?? null,
      create: async (input: CharacterInput): Promise<Character> => characterRepo.create(input),
      update: async (id: number, input: CharacterInput): Promise<Character> =>
        characterRepo.update(id, input),
      delete: async (id: number): Promise<void> => characterRepo.delete(id),
      listTrashed: async (): Promise<Character[]> => characterRepo.listTrashed(),
      restore: async (id: number): Promise<void> => characterRepo.restore(id),
      permanentlyDelete: async (id: number): Promise<void> => characterRepo.permanentlyDelete(id),
      linkLorebook: async (characterId: number, lorebookId: number): Promise<void> =>
        characterRepo.linkLorebook(characterId, lorebookId),
      unlinkLorebook: async (characterId: number, lorebookId: number): Promise<void> =>
        characterRepo.unlinkLorebook(characterId, lorebookId),
      getLorebookIds: async (characterId: number): Promise<number[]> =>
        characterRepo.getLorebookIds(characterId),
      pickAvatar: async (): Promise<string | null> => {
        const files = await openFilePicker('image/*')
        if (!files || files.length === 0) return null
        const file = files[0]
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const key = `avatar_${Date.now()}`
        await saveLocalAvatar(key, dataUrl)
        uploadAvatarToCloud(dataUrl, key).catch(() => {})
        return dataUrl
      },
      readImageAsDataUrl: async (filePath: string): Promise<string | null> => {
        if (!filePath) return null
        if (filePath.startsWith('data:') || filePath.startsWith('http:') || filePath.startsWith('https:')) {
          return filePath
        }
        const cached = await getLocalAvatar(filePath)
        return cached ?? filePath
      },
      extractFromChat: async (chatId: number): Promise<Partial<CharacterInput>> => {
        const chat = assertExists(chatRepo.get(chatId), 'Chat')
        const history = messageRepo.listByChat(chatId)
        const baseChar = chat.characterId ? characterRepo.get(chat.characterId) ?? null : null
        return extractCharacterFromChat(history, chat.modelId, baseChar)
      },
      structureText: async (rawText: string): Promise<Record<string, string>> =>
        structureCharacterText(rawText)
    },

    personas: {
      list: async (): Promise<Persona[]> => personaRepo.list(),
      create: async (input: PersonaInput): Promise<Persona> => personaRepo.create(input),
      update: async (id: number, input: PersonaInput): Promise<Persona> =>
        personaRepo.update(id, input),
      delete: async (id: number): Promise<void> => personaRepo.delete(id)
    },

    lorebooks: {
      list: async (): Promise<Lorebook[]> => lorebookRepo.list(),
      create: async (input: LorebookInput): Promise<Lorebook> => lorebookRepo.create(input),
      update: async (id: number, input: LorebookInput): Promise<Lorebook> =>
        lorebookRepo.update(id, input),
      delete: async (id: number): Promise<void> => lorebookRepo.delete(id),
      listTrashed: async (): Promise<Lorebook[]> => lorebookRepo.listTrashed(),
      restore: async (id: number): Promise<void> => lorebookRepo.restore(id),
      permanentlyDelete: async (id: number): Promise<void> => lorebookRepo.permanentlyDelete(id)
    },

    universes: {
      list: async (): Promise<Universe[]> => universeRepo.list(),
      create: async (input: UniverseInput): Promise<Universe> => universeRepo.create(input),
      update: async (id: number, input: UniverseInput): Promise<Universe> =>
        universeRepo.update(id, input),
      delete: async (id: number): Promise<void> => universeRepo.delete(id),
      listTrashed: async (): Promise<Universe[]> => universeRepo.listTrashed(),
      restore: async (id: number): Promise<void> => universeRepo.restore(id),
      permanentlyDelete: async (id: number): Promise<void> => universeRepo.permanentlyDelete(id),
      startWorldbuildingSession: async (universeId: number): Promise<Chat> => {
        const universe = assertExists(universeRepo.get(universeId), 'Universe')
        let assistant = universe.coWriterCharacterId
          ? characterRepo.get(universe.coWriterCharacterId)
          : undefined

        if (!assistant) {
          assistant = characterRepo.create({
            name: `${universe.name} Guide`,
            avatarType: 'monogram',
            avatarPath: null,
            avatarEmoji: null,
            universeId: universe.id,
            baseCharacterId: null,
            isWorldbuildingAssistant: true,
            tags: ['worldbuilding'],
            appearance: '',
            personality:
              "Helpful, creative worldbuilding partner. Specializes in asking probing questions, pointing out natural consequences of lore decisions, and helping flesh out settings, factions, and rules.",
            speechStyle: 'Encouraging, conversational, analytical when exploring lore mechanics.',
            background: `Dedicated co-writer and setting consultant for the universe "${universe.name}".`,
            relationships: '',
            scenario: `Collaborative worldbuilding session exploring the setting and lore of "${universe.name}".`,
            firstMessage: `Let's build out the world of "${universe.name}". What aspect of the setting should we focus on first?`,
            notes: ''
          })
          universeRepo.setCoWriterCharacterId(universe.id, assistant.id)
        }

        const preset = CHAT_PRESETS[0]
        const chat = chatRepo.create({
          characterId: assistant.id,
          personaId: null,
          impersonatingCharacterId: null,
          scenarioId: null,
          scenarioMilestoneIndex: 0,
          priorSummary: null,
          storylineId: null,
          collaborativeMode: true,
          tags: ['worldbuilding'],
          directorsNotes: `Worldbuilding session for universe: ${universe.name}. Description: ${universe.description}`,
          inFictionDate: null,
          groupCharacterIds: [],
          universeId: universe.id,
          isSkit: false,
          skitLength: null,
          moodPreset: null,
          contentIntensity: 'standard',
          title: `Worldbuilding: ${universe.name}`,
          modelId: preset.modelId,
          rpMode: 'narrative',
          samplerSettings: preset.samplerSettings
        })

        messageRepo.create({
          chatId: chat.id,
          role: 'assistant',
          content: assistant.firstMessage
        })

        return chat
      }
    },

    loreEntries: {
      listByLorebook: async (lorebookId: number): Promise<LoreEntry[]> =>
        loreEntryRepo.listByLorebook(lorebookId),
      create: async (input: LoreEntryInput): Promise<LoreEntry> => loreEntryRepo.create(input),
      update: async (id: number, input: LoreEntryInput): Promise<LoreEntry> =>
        loreEntryRepo.update(id, input),
      delete: async (id: number): Promise<void> => loreEntryRepo.delete(id)
    },

    lore: {
      fetchUrlText: async (url: string): Promise<string> => fetchUrlAsText(url),
      structureText: async (
        entryType: LoreEntryType,
        rawText: string
      ): Promise<{ title: string; description: string; keywords: string[]; fields: Record<string, string> }> =>
        structureLoreText(entryType, rawText)
    },

    starterPacks: {
      export: async (lorebookId: number): Promise<boolean> => {
        const lorebook = assertExists(lorebookRepo.get(lorebookId), 'Lorebook')
        const entries = loreEntryRepo.listByLorebook(lorebookId)
        return exportStarterPackJson(lorebook, entries)
      },
      importFile: async (): Promise<{
        lorebook: LorebookInput
        entries: Omit<LoreEntryInput, 'lorebookId'>[]
      } | null> => importStarterPackJson()
    },

    relationships: {
      list: async (): Promise<CharacterRelationship[]> => relationshipRepo.list(),
      listForCharacter: async (characterId: number): Promise<CharacterRelationship[]> =>
        relationshipRepo.listForCharacter(characterId),
      upsert: async (input: CharacterRelationshipInput): Promise<CharacterRelationship> =>
        relationshipRepo.upsert(input),
      delete: async (id: number): Promise<void> => relationshipRepo.delete(id)
    },

    chats: {
      listByCharacter: async (characterId: number): Promise<Chat[]> =>
        chatRepo.listByCharacter(characterId),
      listAll: async (): Promise<Chat[]> => chatRepo.listAll(),
      get: async (id: number): Promise<Chat | null> => chatRepo.get(id) ?? null,
      create: async (input: ChatInput): Promise<Chat> => chatRepo.create(input),
      updateSettings: async (
        id: number,
        modelId: string,
        samplerSettings: SamplerSettings,
        rpMode: RpMode
      ): Promise<Chat> => chatRepo.updateSettings(id, modelId, samplerSettings, rpMode),
      rename: async (id: number, title: string): Promise<Chat> => chatRepo.rename(id, title),
      setImpersonation: async (id: number, impersonatingCharacterId: number | null): Promise<Chat> =>
        chatRepo.setImpersonation(id, impersonatingCharacterId),
      setPersona: async (id: number, personaId: number | null): Promise<Chat> =>
        chatRepo.setPersona(id, personaId),
      setScenario: async (id: number, scenarioId: number | null): Promise<Chat> =>
        chatRepo.setScenario(id, scenarioId),
      setMilestoneIndex: async (id: number, index: number): Promise<Chat> =>
        chatRepo.setMilestoneIndex(id, index),
      setStoryline: async (id: number, storylineId: number | null): Promise<Chat> =>
        chatRepo.setStoryline(id, storylineId),
      setCollaborativeMode: async (id: number, collaborativeMode: boolean): Promise<Chat> =>
        chatRepo.setCollaborativeMode(id, collaborativeMode),
      setTags: async (id: number, tags: string[]): Promise<Chat> => chatRepo.setTags(id, tags),
      setDirectorsNotes: async (id: number, notes: string): Promise<Chat> =>
        chatRepo.setDirectorsNotes(id, notes),
      setMood: async (id: number, moodPreset: Chat['moodPreset']): Promise<Chat> =>
        chatRepo.setMood(id, moodPreset),
      setContentIntensity: async (
        id: number,
        contentIntensity: Chat['contentIntensity']
      ): Promise<Chat> => chatRepo.setContentIntensity(id, contentIntensity),
      setFictionalDate: async (id: number, date: string | null): Promise<Chat> =>
        chatRepo.setFictionalDate(id, date),
      setGroupCharacterIds: async (id: number, ids: number[]): Promise<Chat> =>
        chatRepo.setGroupCharacterIds(id, ids),
      fork: async (chatId: number, uptoMessageId: number | null): Promise<Chat> =>
        chatRepo.fork(chatId, uptoMessageId),
      delete: async (id: number): Promise<void> => chatRepo.delete(id),
      listTrashed: async (): Promise<Chat[]> => chatRepo.listTrashed(),
      restore: async (id: number): Promise<void> => chatRepo.restore(id),
      permanentlyDelete: async (id: number): Promise<void> => chatRepo.permanentlyDelete(id)
    },

    scenarios: {
      list: async (): Promise<Scenario[]> => scenarioRepo.list(),
      create: async (input: ScenarioInput): Promise<Scenario> => scenarioRepo.create(input),
      update: async (id: number, input: ScenarioInput): Promise<Scenario> =>
        scenarioRepo.update(id, input),
      delete: async (id: number): Promise<void> => scenarioRepo.delete(id)
    },

    storylines: {
      listForCharacter: async (characterId: number): Promise<Storyline[]> =>
        storylineRepo.listForCharacter(characterId),
      create: async (input: StorylineInput): Promise<Storyline> => storylineRepo.create(input),
      rename: async (id: number, name: string): Promise<Storyline> => storylineRepo.rename(id, name),
      delete: async (id: number): Promise<void> => storylineRepo.delete(id)
    },

    journal: {
      listForCharacter: async (characterId: number): Promise<JournalEntry[]> =>
        journalRepo.listForCharacter(characterId),
      generateForChat: async (chatId: number): Promise<JournalEntry> => {
        const chat = assertExists(chatRepo.get(chatId), 'Chat')
        const char = assertExists(characterRepo.get(chat.characterId), 'Character')
        const messages = messageRepo.listByChat(chatId)
        const transcript = messages
          .map((m) => `${m.role === 'user' ? 'User' : char.name}: ${m.content}`)
          .join('\n')
          .slice(-10000)

        const prompt =
          `Summarize the key events and emotional shifts in the conversation below for ${char.name}'s private journal or story notes. ` +
          `Write 2-4 sentences in third person focusing on what actually changed or happened between them.\n\n` +
          `Transcript:\n"""\n${transcript}\n"""`

        const summary = await getCompletion(
          CLERICAL_MODEL_ID,
          [{ role: 'user', content: prompt }],
          CLERICAL_SAMPLER_OPTIONS
        )

        return journalRepo.upsertForChat({
          characterId: char.id,
          chatId: chat.id,
          chatTitle: chat.title,
          summary: summary.trim()
        })
      },
      delete: async (id: number): Promise<void> => journalRepo.delete(id)
    },

    stats: {
      overview: async (): Promise<StatsOverview> => statsRepo.overview()
    },

    customPresets: {
      list: async (): Promise<CustomPreset[]> => customPresetRepo.list(),
      update: async (id: number, input: Partial<CustomPresetInput>): Promise<CustomPreset> =>
        customPresetRepo.update(id, input),
      delete: async (id: number): Promise<void> => customPresetRepo.delete(id)
    },

    messages: {
      listByChat: async (chatId: number): Promise<ChatMessage[]> => messageRepo.listByChat(chatId),
      delete: async (id: number): Promise<void> => messageRepo.delete(id),
      updateContent: async (id: number, content: string): Promise<ChatMessage> => {
        messageRepo.updateContent(id, content)
        return assertExists(messageRepo.get(id), 'Message')
      },
      search: async (query: string): Promise<MessageSearchResult[]> => {
        const msgs = messageRepo.searchAll(query)
        return msgs.map((m) => {
          const chat = chatRepo.get(m.chatId) ?? null
          const character = chat ? characterRepo.get(chat.characterId) ?? null : null
          return { message: m, chat, character }
        })
      },
      listBookmarked: async (): Promise<MessageSearchResult[]> => {
        const msgs = messageRepo.listBookmarked()
        return msgs.map((m) => {
          const chat = chatRepo.get(m.chatId) ?? null
          const character = chat ? characterRepo.get(chat.characterId) ?? null : null
          return { message: m, chat, character }
        })
      },
      toggleBookmark: async (id: number): Promise<ChatMessage> => messageRepo.toggleBookmark(id),
      setSpeaker: async (id: number, speakerCharacterId: number | null): Promise<ChatMessage> =>
        messageRepo.setSpeaker(id, speakerCharacterId)
    },

    settings: {
      hasApiKey: async (): Promise<boolean> => hasApiKey(),
      saveApiKey: async (key: string): Promise<void> => saveApiKey(key),
      clearApiKey: async (): Promise<void> => clearApiKey(),
      fetchModels: async (forceRefresh?: boolean): Promise<any[]> => fetchModels(forceRefresh)
    },

    chat: {
      sendMessage: async (chatId: number, userContent: string): Promise<{ messageId: number }> => {
        const context = buildChatContext(chatId)
        const { chat, character, groupCharacters } = context

        messageRepo.create({ chatId, role: 'user', content: userContent })
        const history = messageRepo.listByChat(chatId)

        const { messages, matchedLoreEntries } = assemblePrompt({
          ...context,
          scenarioMilestoneIndex: chat.scenarioMilestoneIndex,
          directorsNotes: chat.directorsNotes,
          inFictionDate: chat.inFictionDate,
          priorSummary: chat.priorSummary,
          history,
          contextLength: chat.samplerSettings.contextLength,
          rpMode: chat.rpMode,
          collaborativeMode: chat.collaborativeMode,
          moodPreset: chat.moodPreset,
          contentIntensity: chat.contentIntensity
        })

        const assistantMessage = messageRepo.create({
          chatId,
          role: 'assistant',
          content: '',
          matchedLoreEntryIds: matchedLoreEntries.map((e) => e.id)
        })

        const streamId = Math.random().toString(36).substring(2)
        const controller = new AbortController()
        activeStreams.set(streamId, controller)

        let fullContent = ''

        try {
          await streamChatCompletion(
            chat.modelId,
            messages,
            samplerOptions(chat),
            (delta) => {
              fullContent += delta
              broadcastStreamChunk({
                chatId,
                messageId: assistantMessage.id,
                delta,
                done: false
              })
            },
            controller.signal
          )
          const speakerCharacterId = detectSpeaker(fullContent, character, groupCharacters)
          fullContent = stripSpeakerCue(fullContent, character, groupCharacters)
          messageRepo.updateContent(assistantMessage.id, fullContent)
          messageRepo.setSpeaker(assistantMessage.id, speakerCharacterId)
          broadcastStreamChunk({
            chatId,
            messageId: assistantMessage.id,
            delta: '',
            done: true
          })
        } catch (err: any) {
          console.error('chat:sendMessage stream error:', err)
          messageRepo.updateContent(assistantMessage.id, fullContent)
          broadcastStreamChunk({
            chatId,
            messageId: assistantMessage.id,
            delta: '',
            done: true,
            error: err?.message ?? String(err)
          })
        } finally {
          activeStreams.delete(streamId)
        }

        return { messageId: assistantMessage.id }
      },

      suggestReply: async (chatId: number): Promise<string> => {
        const context = buildChatContext(chatId)
        const { chat, impersonatingCharacter, persona } = context
        const history = messageRepo.listByChat(chatId)
        const speakerName = impersonatingCharacter?.name || persona?.name || 'User'

        const prompt =
          `Based on the conversation so far, suggest 1 single realistic line or action for ${speakerName} to say or do next in response. ` +
          `Write ONLY the suggested line directly, matching the scene formatting without quotes or commentary.`

        const { messages } = assemblePrompt({
          ...context,
          scenarioMilestoneIndex: chat.scenarioMilestoneIndex,
          directorsNotes: chat.directorsNotes,
          inFictionDate: chat.inFictionDate,
          priorSummary: chat.priorSummary,
          history,
          contextLength: chat.samplerSettings.contextLength,
          rpMode: chat.rpMode,
          collaborativeMode: chat.collaborativeMode,
          moodPreset: chat.moodPreset,
          contentIntensity: chat.contentIntensity
        })

        messages.push({ role: 'user', content: prompt })
        const reply = await getCompletion(
          chat.modelId || CLERICAL_MODEL_ID,
          messages,
          { temperature: 0.7, topP: 0.95, maxTokens: 200 }
        )
        return reply.trim()
      },

      summarizeForContinuation: async (chatId: number): Promise<string> => {
        const chat = assertExists(chatRepo.get(chatId), 'Chat')
        const char = assertExists(characterRepo.get(chat.characterId), 'Character')
        const messages = messageRepo.listByChat(chatId)
        const transcript = messages
          .map((m) => `${m.role === 'user' ? 'User' : char.name}: ${m.content}`)
          .join('\n')
          .slice(-12000)

        const prompt =
          `Summarize the current situation and uncompleted threads of this roleplay scene so far so it can be continued seamlessly in a fresh Act. ` +
          `Include where they are, what just happened, and what's about to happen next.\n\n` +
          `Transcript:\n"""\n${transcript}\n"""`

        const summary = await getCompletion(
          CLERICAL_MODEL_ID,
          [{ role: 'user', content: prompt }],
          CLERICAL_SAMPLER_OPTIONS
        )
        return summary.trim()
      },

      compactHistory: async (
        chatId: number,
        keepLastN: number
      ): Promise<{ priorSummary: string; compactedCount: number }> => {
        const chat = assertExists(chatRepo.get(chatId), 'Chat')
        const char = assertExists(characterRepo.get(chat.characterId), 'Character')
        const all = messageRepo.listByChat(chatId)
        const uncompacted = all.filter((m) => !m.excludedFromContext)
        if (uncompacted.length <= keepLastN) {
          return { priorSummary: chat.priorSummary || '', compactedCount: 0 }
        }

        const toCompact = uncompacted.slice(0, uncompacted.length - keepLastN)
        const lastCompactId = toCompact[toCompact.length - 1].id

        const transcript = toCompact
          .map((m) => `${m.role === 'user' ? 'User' : char.name}: ${m.content}`)
          .join('\n')
          .slice(-12000)

        const prompt =
          `Summarize the earlier events from this roleplay scene into a concise recap (under 250 words) to preserve context while saving token space.\n\n` +
          (chat.priorSummary ? `Previous summary:\n${chat.priorSummary}\n\n` : '') +
          `Recent messages to fold in:\n"""\n${transcript}\n"""`

        const newSummary = await getCompletion(
          CLERICAL_MODEL_ID,
          [{ role: 'user', content: prompt }],
          CLERICAL_SAMPLER_OPTIONS
        )

        chatRepo.setPriorSummary(chatId, newSummary.trim())
        messageRepo.markExcludedFromContext(chatId, lastCompactId)

        return { priorSummary: newSummary.trim(), compactedCount: toCompact.length }
      },

      saveStoryFile: async (defaultFilename: string, content: string): Promise<boolean> => {
        return exportStoryMarkdown(defaultFilename, content)
      },

      exportPdf: async (_defaultFilename: string, title: string, storyBody: string): Promise<boolean> => {
        return exportStoryPdf(title, storyBody)
      },

      exportEpub: async (defaultFilename: string, title: string, storyBody: string): Promise<boolean> => {
        return exportStoryEpub(defaultFilename, title, storyBody)
      },

      regenerateMessage: async (chatId: number, messageId: number): Promise<ChatMessage> => {
        const msg = assertExists(messageRepo.get(messageId), 'Message')
        if (msg.role !== 'assistant') throw new Error('Can only regenerate assistant messages.')

        const context = buildChatContext(chatId)
        const { chat, character, groupCharacters } = context
        const allHistory = messageRepo.listByChat(chatId)
        const priorHistory = allHistory.filter((m) => m.id < messageId)

        const { messages } = assemblePrompt({
          ...context,
          scenarioMilestoneIndex: chat.scenarioMilestoneIndex,
          directorsNotes: chat.directorsNotes,
          inFictionDate: chat.inFictionDate,
          priorSummary: chat.priorSummary,
          history: priorHistory,
          contextLength: chat.samplerSettings.contextLength,
          rpMode: chat.rpMode,
          collaborativeMode: chat.collaborativeMode,
          moodPreset: chat.moodPreset,
          contentIntensity: chat.contentIntensity
        })

        const streamId = Math.random().toString(36).substring(2)
        const controller = new AbortController()
        activeStreams.set(streamId, controller)

        let newContent = ''

        try {
          await streamChatCompletion(
            chat.modelId,
            messages,
            samplerOptions(chat),
            (delta) => {
              newContent += delta
              broadcastStreamChunk({
                chatId,
                messageId: msg.id,
                delta,
                done: false
              })
            },
            controller.signal
          )
          const speakerCharacterId = detectSpeaker(newContent, character, groupCharacters)
          newContent = stripSpeakerCue(newContent, character, groupCharacters)
          const updated = messageRepo.addVariant(msg.id, newContent)
          messageRepo.setSpeaker(msg.id, speakerCharacterId)
          broadcastStreamChunk({
            chatId,
            messageId: msg.id,
            delta: '',
            done: true
          })
          return updated
        } finally {
          activeStreams.delete(streamId)
        }
      },

      continueMessage: async (chatId: number, messageId: number): Promise<ChatMessage> => {
        const msg = assertExists(messageRepo.get(messageId), 'Message')
        const context = buildChatContext(chatId)
        const { chat } = context
        const allHistory = messageRepo.listByChat(chatId)
        const historyUpTo = allHistory.filter((m) => m.id <= messageId)

        const { messages } = assemblePrompt({
          ...context,
          scenarioMilestoneIndex: chat.scenarioMilestoneIndex,
          directorsNotes: chat.directorsNotes,
          inFictionDate: chat.inFictionDate,
          priorSummary: chat.priorSummary,
          history: historyUpTo,
          contextLength: chat.samplerSettings.contextLength,
          rpMode: chat.rpMode,
          collaborativeMode: chat.collaborativeMode,
          moodPreset: chat.moodPreset,
          contentIntensity: chat.contentIntensity
        })

        messages.push({
          role: 'user',
          content: '(Continue directly from your last sentence without repeating it.)'
        })

        let continuedContent = msg.content
        await streamChatCompletion(
          chat.modelId,
          messages,
          samplerOptions(chat),
          (delta) => {
            continuedContent += delta
            broadcastStreamChunk({
              chatId,
              messageId: msg.id,
              delta,
              done: false
            })
          }
        )

        messageRepo.updateContent(msg.id, continuedContent)
        broadcastStreamChunk({
          chatId,
          messageId: msg.id,
          delta: '',
          done: true
        })

        return assertExists(messageRepo.get(msg.id), 'Message')
      },

      setActiveVariant: async (messageId: number, index: number): Promise<ChatMessage> => {
        return messageRepo.setActiveVariant(messageId, index)
      },

      onStreamChunk: (callback: (event: StreamChunkEvent) => void) => {
        streamListeners.add(callback)
        return () => {
          streamListeners.delete(callback)
        }
      }
    },

    import: {
      characters: async (): Promise<ImportCharactersResult> => {
        const files = await openFilePicker('.json,.png', true)
        const imported: Character[] = []
        const failed: { file: string; error: string }[] = []

        for (const file of files) {
          try {
            let cardData: any = null
            let avatarDataUrl: string | null = null

            if (file.name.toLowerCase().endsWith('.png')) {
              const arrayBuffer = await file.arrayBuffer()
              cardData = await extractCharacterCardFromPng(arrayBuffer)
              if (!cardData) {
                failed.push({ file: file.name, error: 'No character metadata found in PNG.' })
                continue
              }
              const blob = new Blob([arrayBuffer], { type: 'image/png' })
              avatarDataUrl = await new Promise<string>((res) => {
                const reader = new FileReader()
                reader.onload = () => res(reader.result as string)
                reader.readAsDataURL(blob)
              })
            } else {
              const text = await file.text()
              cardData = JSON.parse(text)
            }

            const parsed = parseCharacterImport(cardData)
            const created = characterRepo.create({
              ...parsed.character,
              avatarType: avatarDataUrl ? 'image' : 'monogram',
              avatarPath: avatarDataUrl
            })

            if (avatarDataUrl) {
              const key = `avatar_${created.id}`
              await saveLocalAvatar(key, avatarDataUrl)
              uploadAvatarToCloud(avatarDataUrl, key).catch(() => {})
            }

            imported.push(created)
          } catch (err: any) {
            failed.push({ file: file.name, error: err?.message || String(err) })
          }
        }

        return { imported, failed }
      },

      lorebook: async (): Promise<Lorebook | null> => {
        const files = await openFilePicker('.json')
        if (!files || files.length === 0) return null
        const text = await files[0].text()
        const parsed = parseLorebookImport(text)
        const lorebook = lorebookRepo.create(parsed.lorebook)
        for (const entry of parsed.entries) {
          loreEntryRepo.create({ ...entry, lorebookId: lorebook.id })
        }
        return lorebook
      },

      preset: async (): Promise<CustomPreset | null> => {
        const files = await openFilePicker('.json')
        if (!files || files.length === 0) return null
        const text = await files[0].text()
        const parsed = parsePresetImport(text)
        return customPresetRepo.create(parsed)
      }
    },

    backup: {
      export: async (): Promise<boolean> => {
        return exportWebBackup(store)
      },
      import: async (): Promise<boolean> => {
        const result = await importWebBackup()
        if (!result) return false
        setStore(result.store, true)
        window.location.reload()
        return true
      }
    },

    skits: {
      generate: async (chatId: number): Promise<void> => {
        const chat = assertExists(chatRepo.get(chatId), 'Chat')
        if (!chat.isSkit || !chat.skitLength) throw new Error('This Act is not a Skit.')
        if (!chat.modelId) throw new Error('Pick a model before generating.')

        const targetTurns = SKIT_TURN_TARGETS[chat.skitLength]
        const controller = new AbortController()
        activeSkitRuns.set(chatId, controller)

        try {
          let turnsSoFar = messageRepo.listByChat(chatId).filter((m) => m.role === 'assistant').length
          while (turnsSoFar < targetTurns && !controller.signal.aborted) {
            const context = buildChatContext(chatId)
            const { character, groupCharacters } = context
            const history = messageRepo.listByChat(chatId)
            const { messages, matchedLoreEntries } = assemblePrompt({
              ...context,
              scenarioMilestoneIndex: chat.scenarioMilestoneIndex,
              directorsNotes: chat.directorsNotes,
              inFictionDate: chat.inFictionDate,
              priorSummary: chat.priorSummary,
              history,
              contextLength: chat.samplerSettings.contextLength,
              rpMode: chat.rpMode,
              collaborativeMode: chat.collaborativeMode,
              moodPreset: chat.moodPreset,
              contentIntensity: chat.contentIntensity
            })

            const isFinalTurn = turnsSoFar >= targetTurns - 2
            messages.push({
              role: 'user',
              content: isFinalTurn
                ? "This is the final turn — bring the scene to a satisfying close. Don't introduce a new plot thread; resolve what's already in motion."
                : '(Continue the scene naturally from here.)'
            })

            const assistantMessage = messageRepo.create({
              chatId,
              role: 'assistant',
              content: '',
              matchedLoreEntryIds: matchedLoreEntries.map((e) => e.id)
            })

            let fullContent = ''
            try {
              await streamChatCompletion(
                chat.modelId,
                messages,
                samplerOptions(chat),
                (delta) => {
                  fullContent += delta
                  broadcastStreamChunk({
                    chatId,
                    messageId: assistantMessage.id,
                    delta,
                    done: false
                  })
                },
                controller.signal
              )
              const speakerCharacterId = detectSpeaker(fullContent, character, groupCharacters)
              fullContent = stripSpeakerCue(fullContent, character, groupCharacters)
              messageRepo.updateContent(assistantMessage.id, fullContent)
              messageRepo.setSpeaker(assistantMessage.id, speakerCharacterId)
              broadcastStreamChunk({
                chatId,
                messageId: assistantMessage.id,
                delta: '',
                done: true
              })
            } catch (err: any) {
              messageRepo.updateContent(assistantMessage.id, fullContent)
              broadcastStreamChunk({
                chatId,
                messageId: assistantMessage.id,
                delta: '',
                done: true,
                error: err?.message ?? String(err)
              })
              break
            }

            turnsSoFar++
            if (controller.signal.aborted) break
          }
        } finally {
          activeSkitRuns.delete(chatId)
        }
      },

      cancel: async (chatId: number): Promise<void> => {
        const controller = activeSkitRuns.get(chatId)
        if (controller) {
          controller.abort()
          activeSkitRuns.delete(chatId)
        }
      },

      regenerate: async (chatId: number): Promise<void> => {
        const chat = assertExists(chatRepo.get(chatId), 'Chat')
        const firstMessage = messageRepo.listByChat(chatId)[0]
        messageRepo.deleteAllForChat(chatId)
        if (firstMessage) {
          messageRepo.create({
            chatId,
            role: firstMessage.role,
            content: firstMessage.content
          })
        }
        await createWebApi().skits.generate(chat.id)
      }
    },

    writing: {
      synonyms: async (word: string, context: string): Promise<string[]> =>
        lookupSynonyms(word, context),
      remix: async (
        chatId: number,
        passage: string,
        direction: 'detailed' | 'concise'
      ): Promise<string> => {
        const context = buildChatContext(chatId)
        const { chat } = context
        const history = messageRepo.listByChat(chatId)
        const { messages } = assemblePrompt({
          ...context,
          scenarioMilestoneIndex: chat.scenarioMilestoneIndex,
          directorsNotes: chat.directorsNotes,
          inFictionDate: chat.inFictionDate,
          priorSummary: chat.priorSummary,
          history,
          contextLength: chat.samplerSettings.contextLength,
          rpMode: chat.rpMode,
          collaborativeMode: chat.collaborativeMode,
          moodPreset: chat.moodPreset,
          contentIntensity: chat.contentIntensity
        })
        return remixPassage(chat.modelId, messages, passage, direction)
      }
    },

    app: {
      getVersion: async (): Promise<string> => '0.1.0 (Web)',
      openExternal: async (url: string): Promise<void> => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
      checkForUpdates: async (): Promise<string> => 'Web version is always up to date.'
    }
  }
}
