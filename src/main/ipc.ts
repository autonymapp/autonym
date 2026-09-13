import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { randomUUID } from 'crypto'
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { extname, join, resolve, sep } from 'path'
import { logError, logInfo } from './logger'
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
  universeRepo
} from './db'
import { clearApiKey, fetchModels, getCompletion, hasApiKey, saveApiKey, streamChatCompletion } from './openrouter'
import { extractCharacterCardFromPng } from './pngMeta'
import { fetchUrlAsText, structureLoreText } from './loreImport'
import { extractCharacterFromChat } from './characterExtract'
import { structureCharacterText } from './characterImport'
import { lookupSynonyms, remixPassage } from './writingTools'
import type { RemixDirection } from './writingTools'
import { exportBackup, importBackup } from './backup'
import { exportStoryAsPdf } from './pdfExport'
import { exportStoryAsEpub } from './epubExport'
import { CHAT_PRESETS, CLERICAL_MODEL_ID } from '@shared/presets'
import { assemblePrompt } from '@shared/assemble'
import { detectSpeaker } from '@shared/detectSpeaker'
import { assertExists } from '@shared/assertExists'
import { resolveCharacterInheritance } from '@shared/characterInheritance'
import { parseCharacterImport, parseLorebookImport, parsePresetImport } from '@shared/importers'
import { buildStarterPackFile, parseStarterPackFile } from '@shared/starterPacks'
import type {
  Character,
  CharacterInput,
  CharacterRelationshipInput,
  Chat,
  ChatInput,
  CustomPreset,
  CustomPresetInput,
  Lorebook,
  LoreEntryInput,
  LoreEntryType,
  LorebookInput,
  PersonaInput,
  RpMode,
  SamplerSettings,
  ScenarioInput,
  StorylineInput,
  UniverseInput
} from '@shared/types'

const activeStreams = new Map<string, AbortController>()

/** Target assistant-turn count for a Skit's generation run, by length preset. */
const SKIT_TURN_TARGETS: Record<'short' | 'medium', number> = { short: 8, medium: 14 }

/** Low-temperature sampling for clerical (summarization) tasks run on CLERICAL_MODEL_ID — these
 *  aren't creative writing, so a low, consistent temperature suits them better than whatever the
 *  user tuned their roleplay model to. */
const CLERICAL_SAMPLER_OPTIONS = { temperature: 0.3, topP: 1, maxTokens: 500 }
/** One shared abort controller per in-progress Skit run (spans multiple turns), keyed by chatId. */
const activeSkitRuns = new Map<number, AbortController>()

/** Paths the user has explicitly selected via a native file dialog this session — lets
 *  characters:readImageAsDataUrl preview a newly-picked avatar before it's saved into
 *  userData, without allowing arbitrary unrelated file reads. */
const dialogPickedPaths = new Set<string>()

/** Wraps an ipcMain.handle callback so a thrown/rejected error is logged before it propagates
 *  back to the renderer as a rejected promise (ipcMain.handle already does that conversion
 *  safely on its own — this only adds a persistent diagnostic trail on top). */
function logged<Args extends unknown[], R>(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: Args) => R | Promise<R>
) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: Args): Promise<R> => {
    try {
      return await fn(event, ...args)
    } catch (err) {
      logError(channel, err)
      throw err
    }
  }
}

interface ImportCharactersResult {
  imported: Character[]
  failed: { file: string; error: string }[]
}

function saveImportedAvatar(sourcePath: string): string {
  const avatarsDir = join(app.getPath('userData'), 'avatars')
  if (!existsSync(avatarsDir)) mkdirSync(avatarsDir, { recursive: true })
  const dest = join(avatarsDir, `${randomUUID()}.png`)
  copyFileSync(sourcePath, dest)
  return dest
}

function buildChatContext(chatId: number) {
  const chat = chatRepo.get(chatId)
  if (!chat) throw new Error('Chat not found')
  const rawCharacter = characterRepo.get(chat.characterId)
  if (!rawCharacter) throw new Error('Character not found')
  // A linked variant can leave personality/speechStyle/relationships blank to inherit them from
  // its base character — resolve that here, once, so nothing downstream needs to know variants exist.
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
  const lorebookIds = characterRepo.getLorebookIds(chat.characterId)
  const loreEntries = loreEntryRepo.listByLorebooks(lorebookIds)
  const lorebooks = lorebookIds.map((id) => lorebookRepo.get(id)).filter((lb): lb is Lorebook => !!lb)
  const groupCharacters = chat.groupCharacterIds
    .map((id) => characterRepo.get(id))
    .filter((c): c is Character => !!c)
    .map((c) => resolveCharacterInheritance(c, allCharacters))
  return {
    chat,
    character,
    persona,
    impersonatingCharacter,
    relationship,
    scenario,
    loreEntries,
    lorebooks,
    groupCharacters
  }
}


function samplerOptions(chat: ReturnType<typeof buildChatContext>['chat']) {
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

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // Characters
  ipcMain.handle('characters:list', () => characterRepo.list())
  ipcMain.handle('characters:get', (_e, id: number) => characterRepo.get(id))
  ipcMain.handle('characters:create', (_e, input: CharacterInput) => characterRepo.create(input))
  ipcMain.handle('characters:update', (_e, id: number, input: CharacterInput) =>
    characterRepo.update(id, input)
  )
  ipcMain.handle('characters:delete', (_e, id: number) => characterRepo.delete(id))
  ipcMain.handle('characters:listTrashed', () => characterRepo.listTrashed())
  ipcMain.handle('characters:restore', (_e, id: number) => characterRepo.restore(id))
  ipcMain.handle('characters:permanentlyDelete', (_e, id: number) =>
    characterRepo.permanentlyDelete(id)
  )
  ipcMain.handle('characters:linkLorebook', (_e, characterId: number, lorebookId: number) => {
    assertExists(characterRepo.get(characterId), 'Character')
    assertExists(lorebookRepo.get(lorebookId), 'Lorebook')
    return characterRepo.linkLorebook(characterId, lorebookId)
  })
  ipcMain.handle('characters:unlinkLorebook', (_e, characterId: number, lorebookId: number) =>
    characterRepo.unlinkLorebook(characterId, lorebookId)
  )
  ipcMain.handle('characters:getLorebookIds', (_e, characterId: number) =>
    characterRepo.getLorebookIds(characterId)
  )
  ipcMain.handle('characters:extractFromChat', async (_e, chatId: number) => {
    const { chat, character } = buildChatContext(chatId)
    if (!chat.modelId) throw new Error('Pick a model before saving a character from this chat.')
    const history = messageRepo.listByChat(chatId)
    if (history.length === 0) throw new Error('This chat has no messages yet.')
    return extractCharacterFromChat(history, chat.modelId, character)
  })
  ipcMain.handle('characters:structureText', (_e, rawText: string) => structureCharacterText(rawText))

  // Personas
  ipcMain.handle('personas:list', () => personaRepo.list())
  ipcMain.handle('personas:create', (_e, input: PersonaInput) => personaRepo.create(input))
  ipcMain.handle('personas:update', (_e, id: number, input: PersonaInput) =>
    personaRepo.update(id, input)
  )
  ipcMain.handle('personas:delete', (_e, id: number) => personaRepo.delete(id))

  // Lorebooks
  ipcMain.handle('lorebooks:list', () => lorebookRepo.list())
  ipcMain.handle('lorebooks:create', (_e, input: LorebookInput) => lorebookRepo.create(input))
  ipcMain.handle('lorebooks:update', (_e, id: number, input: LorebookInput) =>
    lorebookRepo.update(id, input)
  )
  ipcMain.handle('lorebooks:delete', (_e, id: number) => lorebookRepo.delete(id))
  ipcMain.handle('lorebooks:listTrashed', () => lorebookRepo.listTrashed())
  ipcMain.handle('lorebooks:restore', (_e, id: number) => lorebookRepo.restore(id))
  ipcMain.handle('lorebooks:permanentlyDelete', (_e, id: number) =>
    lorebookRepo.permanentlyDelete(id)
  )

  // Universes
  ipcMain.handle('universes:list', () => universeRepo.list())
  ipcMain.handle('universes:create', (_e, input: UniverseInput) => universeRepo.create(input))
  ipcMain.handle('universes:update', (_e, id: number, input: UniverseInput) =>
    universeRepo.update(id, input)
  )
  ipcMain.handle('universes:delete', (_e, id: number) => universeRepo.delete(id))
  ipcMain.handle('universes:listTrashed', () => universeRepo.listTrashed())
  ipcMain.handle('universes:restore', (_e, id: number) => universeRepo.restore(id))
  ipcMain.handle('universes:permanentlyDelete', (_e, id: number) =>
    universeRepo.permanentlyDelete(id)
  )
  // Opens (creating if needed) a Collaborative Mode Act for brainstorming this Universe's cast —
  // a lazily-created, hidden "co-writer" character plays the AI's side so the existing chat
  // pipeline (system prompt, streaming, extraction) needs no special-casing for a "no character
  // yet" chat.
  ipcMain.handle('universes:startWorldbuildingSession', (_e, universeId: number) => {
    const universe = assertExists(universeRepo.get(universeId), 'Universe')
    let coWriterId = universe.coWriterCharacterId
    if (!coWriterId) {
      const coWriter = characterRepo.create({
        name: `${universe.name} Co-Writer`,
        avatarType: 'emoji',
        avatarPath: null,
        avatarEmoji: '🌐',
        universeId,
        baseCharacterId: null,
        isWorldbuildingAssistant: true,
        tags: [],
        appearance: '',
        personality:
          'A creative collaborator helping the user brainstorm and flesh out original characters ' +
          `and NPCs for the world of "${universe.name}". Asks questions, offers ideas, and builds ` +
          "on whatever the user contributes, rather than dictating the world on its own.",
        speechStyle: 'Conversational and encouraging, like a co-writer thinking out loud with you.',
        background: '',
        relationships: '',
        scenario: universe.description || `Brainstorming original characters for "${universe.name}".`,
        firstMessage: `Let's build out some characters for ${universe.name}. What's on your mind — a role you need filled, a vibe you're going for, or a character who's already half-formed in your head?`,
        notes: ''
      })
      coWriterId = coWriter.id
      universeRepo.setCoWriterCharacterId(universeId, coWriterId)
    }
    return chatRepo.create({
      characterId: coWriterId,
      personaId: null,
      impersonatingCharacterId: null,
      scenarioId: null,
      scenarioMilestoneIndex: 0,
      priorSummary: null,
      storylineId: null,
      collaborativeMode: true,
      tags: [],
      directorsNotes: '',
      inFictionDate: null,
      groupCharacterIds: [],
      universeId,
      isSkit: false,
      skitLength: null,
      moodPreset: null,
      contentIntensity: 'standard',
      title: `${universe.name} Worldbuilding`,
      modelId: CHAT_PRESETS[0].modelId,
      rpMode: 'narrative',
      samplerSettings: CHAT_PRESETS[0].samplerSettings
    })
  })

  // Lore entries
  ipcMain.handle('loreEntries:listByLorebook', (_e, lorebookId: number) =>
    loreEntryRepo.listByLorebook(lorebookId)
  )
  ipcMain.handle('loreEntries:create', (_e, input: LoreEntryInput) => {
    assertExists(lorebookRepo.get(input.lorebookId), 'Lorebook')
    return loreEntryRepo.create(input)
  })
  ipcMain.handle('loreEntries:update', (_e, id: number, input: LoreEntryInput) =>
    loreEntryRepo.update(id, input)
  )
  ipcMain.handle('loreEntries:delete', (_e, id: number) => loreEntryRepo.delete(id))

  // AI-assisted "fill from wiki/text" for lore entries
  ipcMain.handle('lore:fetchUrlText', (_e, url: string) => fetchUrlAsText(url))
  ipcMain.handle('lore:structureText', (_e, entryType: LoreEntryType, rawText: string) =>
    structureLoreText(entryType, rawText)
  )

  // Starter packs: export any lorebook as a portable file, or import one back in
  ipcMain.handle('starterPacks:export', async (_e, lorebookId: number): Promise<boolean> => {
    const win = getWindow()
    if (!win) return false
    const lorebook = lorebookRepo.get(lorebookId)
    if (!lorebook) throw new Error('Lorebook not found')
    const entries = loreEntryRepo.listByLorebook(lorebookId)
    const packFile = buildStarterPackFile(lorebook, entries)
    const safeName = lorebook.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'starter-pack'
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${safeName}.json`,
      filters: [{ name: 'Starter Pack JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    writeFileSync(result.filePath, JSON.stringify(packFile, null, 2), 'utf-8')
    return true
  })
  ipcMain.handle('starterPacks:importFile', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Starter Pack JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const raw = JSON.parse(readFileSync(result.filePaths[0], 'utf-8'))
    return parseStarterPackFile(raw)
  })

  // Character relationships (map)
  ipcMain.handle('relationships:list', () => relationshipRepo.list())
  ipcMain.handle('relationships:listForCharacter', (_e, characterId: number) =>
    relationshipRepo.listForCharacter(characterId)
  )
  ipcMain.handle('relationships:upsert', (_e, input: CharacterRelationshipInput) =>
    relationshipRepo.upsert(input)
  )
  ipcMain.handle('relationships:delete', (_e, id: number) => relationshipRepo.delete(id))

  // Chats
  ipcMain.handle('chats:listByCharacter', (_e, characterId: number) =>
    chatRepo.listByCharacter(characterId)
  )
  ipcMain.handle('chats:listAll', () => chatRepo.listAll())
  ipcMain.handle('chats:get', (_e, id: number) => chatRepo.get(id))
  ipcMain.handle('chats:create', (_e, input: ChatInput) => {
    const character = assertExists(characterRepo.get(input.characterId), 'Character')
    const chat = chatRepo.create(input)
    if (character.firstMessage && !input.priorSummary) {
      messageRepo.create({ chatId: chat.id, role: 'assistant', content: character.firstMessage })
    }
    return chat
  })
  ipcMain.handle(
    'chats:updateSettings',
    (_e, id: number, modelId: string, samplerSettings: SamplerSettings, rpMode: RpMode) =>
      chatRepo.updateSettings(id, modelId, samplerSettings, rpMode)
  )
  ipcMain.handle('chats:rename', (_e, id: number, title: string) => chatRepo.rename(id, title))
  ipcMain.handle(
    'chats:setImpersonation',
    (_e, id: number, impersonatingCharacterId: number | null) =>
      chatRepo.setImpersonation(id, impersonatingCharacterId)
  )
  ipcMain.handle('chats:setPersona', (_e, id: number, personaId: number | null) => {
    if (personaId !== null) assertExists(personaRepo.get(personaId), 'Persona')
    return chatRepo.setPersona(id, personaId)
  })
  ipcMain.handle('chats:setScenario', (_e, id: number, scenarioId: number | null) =>
    chatRepo.setScenario(id, scenarioId)
  )
  ipcMain.handle('chats:setMilestoneIndex', (_e, id: number, index: number) =>
    chatRepo.setMilestoneIndex(id, index)
  )
  ipcMain.handle('chats:setStoryline', (_e, id: number, storylineId: number | null) =>
    chatRepo.setStoryline(id, storylineId)
  )
  ipcMain.handle('chats:setCollaborativeMode', (_e, id: number, collaborativeMode: boolean) =>
    chatRepo.setCollaborativeMode(id, collaborativeMode)
  )
  ipcMain.handle('chats:setTags', (_e, id: number, tags: string[]) => chatRepo.setTags(id, tags))
  ipcMain.handle('chats:setDirectorsNotes', (_e, id: number, notes: string) =>
    chatRepo.setDirectorsNotes(id, notes)
  )
  ipcMain.handle('chats:setMood', (_e, id: number, moodPreset: Chat['moodPreset']) =>
    chatRepo.setMood(id, moodPreset)
  )
  ipcMain.handle('chats:setContentIntensity', (_e, id: number, contentIntensity: Chat['contentIntensity']) =>
    chatRepo.setContentIntensity(id, contentIntensity)
  )
  ipcMain.handle('chats:setFictionalDate', (_e, id: number, date: string | null) =>
    chatRepo.setFictionalDate(id, date)
  )
  ipcMain.handle('chats:setGroupCharacterIds', (_e, id: number, ids: number[]) =>
    chatRepo.setGroupCharacterIds(id, ids)
  )
  ipcMain.handle('chats:delete', (_e, id: number) => chatRepo.delete(id))
  ipcMain.handle('chats:listTrashed', () => chatRepo.listTrashed())
  ipcMain.handle('chats:restore', (_e, id: number) => chatRepo.restore(id))
  ipcMain.handle('chats:permanentlyDelete', (_e, id: number) => chatRepo.permanentlyDelete(id))

  // Fork a chat: whole-chat (uptoMessageId omitted/null) or up to a specific message
  ipcMain.handle('chats:fork', (_e, chatId: number, uptoMessageId: number | null) => {
    const source = chatRepo.get(chatId)
    if (!source) throw new Error('Chat not found')
    const sourceMessages = messageRepo.listByChat(chatId)
    let messagesToCopy = sourceMessages
    if (uptoMessageId !== null) {
      const cutIndex = sourceMessages.findIndex((m) => m.id === uptoMessageId)
      if (cutIndex === -1) throw new Error('That message no longer exists in this chat.')
      messagesToCopy = sourceMessages.slice(0, cutIndex + 1)
    }

    const forked = chatRepo.create({
      characterId: source.characterId,
      personaId: source.personaId,
      impersonatingCharacterId: source.impersonatingCharacterId,
      scenarioId: source.scenarioId,
      scenarioMilestoneIndex: source.scenarioMilestoneIndex,
      priorSummary: source.priorSummary,
      storylineId: source.storylineId,
      collaborativeMode: source.collaborativeMode,
      tags: source.tags,
      directorsNotes: source.directorsNotes,
      inFictionDate: source.inFictionDate,
      groupCharacterIds: source.groupCharacterIds,
      universeId: source.universeId,
      isSkit: source.isSkit,
      skitLength: source.skitLength,
      moodPreset: source.moodPreset,
      contentIntensity: source.contentIntensity,
      title: `${source.title} (Fork)`,
      modelId: source.modelId,
      rpMode: source.rpMode,
      samplerSettings: source.samplerSettings
    })
    for (const m of messagesToCopy) {
      messageRepo.create({
        chatId: forked.id,
        role: m.role,
        content: m.content,
        variants: m.variants,
        activeVariantIndex: m.activeVariantIndex,
        bookmarked: false,
        speakerCharacterId: m.speakerCharacterId
      })
    }
    return forked
  })

  // Scenarios
  ipcMain.handle('scenarios:list', () => scenarioRepo.list())
  ipcMain.handle('scenarios:create', (_e, input: ScenarioInput) => scenarioRepo.create(input))
  ipcMain.handle('scenarios:update', (_e, id: number, input: ScenarioInput) =>
    scenarioRepo.update(id, input)
  )
  ipcMain.handle('scenarios:delete', (_e, id: number) => scenarioRepo.delete(id))

  // Storylines
  ipcMain.handle('storylines:listForCharacter', (_e, characterId: number) =>
    storylineRepo.listForCharacter(characterId)
  )
  ipcMain.handle('storylines:create', (_e, input: StorylineInput) => storylineRepo.create(input))
  ipcMain.handle('storylines:rename', (_e, id: number, name: string) => storylineRepo.rename(id, name))
  ipcMain.handle('storylines:delete', (_e, id: number) => storylineRepo.delete(id))

  // Character journal
  ipcMain.handle('journal:listForCharacter', (_e, characterId: number) =>
    journalRepo.listForCharacter(characterId)
  )
  ipcMain.handle('journal:generateForChat', async (_e, chatId: number) => {
    const context = buildChatContext(chatId)
    const { chat, character } = context

    const history = messageRepo.listByChat(chatId)
    if (history.length === 0) throw new Error('This chat has no messages yet.')

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
    messages.push({
      role: 'system',
      content:
        `Summarize what has happened to ${character.name} in this specific chat, from ${character.name}'s ` +
        'perspective, in 1-2 short paragraphs — key events, how relationships have developed, and their ' +
        'current situation. Plain backstory notes, not dialogue, no formatting markup.'
    })
    const summary = await getCompletion(CLERICAL_MODEL_ID, messages, CLERICAL_SAMPLER_OPTIONS)
    return journalRepo.upsertForChat({
      characterId: character.id,
      chatId,
      chatTitle: chat.title,
      summary: summary.trim()
    })
  })
  ipcMain.handle('journal:delete', (_e, id: number) => journalRepo.delete(id))

  // Cross-chat search & bookmarks
  ipcMain.handle('messages:search', (_e, query: string) => {
    const results = messageRepo.searchAll(query)
    return results.map((message) => {
      const chat = chatRepo.get(message.chatId)
      const character = chat ? characterRepo.get(chat.characterId) ?? null : null
      return { message, chat: chat ?? null, character }
    })
  })
  ipcMain.handle('messages:listBookmarked', () => {
    const results = messageRepo.listBookmarked()
    return results.map((message) => {
      const chat = chatRepo.get(message.chatId)
      const character = chat ? characterRepo.get(chat.characterId) ?? null : null
      return { message, chat: chat ?? null, character }
    })
  })
  ipcMain.handle('messages:toggleBookmark', (_e, id: number) => messageRepo.toggleBookmark(id))

  // Writing stats
  ipcMain.handle('stats:overview', () => {
    const allChats = chatRepo.listAll()
    const allCharacters = characterRepo.list()
    const perCharacter = allCharacters.map((c) => {
      const chatIds = allChats.filter((ch) => ch.characterId === c.id).map((ch) => ch.id)
      const msgs = chatIds.flatMap((id) => messageRepo.listByChat(id))
      const wordCount = msgs.reduce((sum, m) => sum + m.content.trim().split(/\s+/).filter(Boolean).length, 0)
      return { characterId: c.id, characterName: c.name, messageCount: msgs.length, wordCount }
    })
    const totalMessages = perCharacter.reduce((sum, c) => sum + c.messageCount, 0)
    const totalWords = perCharacter.reduce((sum, c) => sum + c.wordCount, 0)

    const allMessages = allChats.flatMap((c) => messageRepo.listByChat(c.id)).filter((m) => m.role === 'user')
    const days = new Set(allMessages.map((m) => m.createdAt.slice(0, 10)))
    let streakDays = 0
    const cursor = new Date()
    for (;;) {
      const key = cursor.toISOString().slice(0, 10)
      if (!days.has(key)) break
      streakDays++
      cursor.setDate(cursor.getDate() - 1)
    }

    return { totalMessages, totalWords, perCharacter, streakDays }
  })

  // Custom presets (built from imported gen presets)
  ipcMain.handle('customPresets:list', () => customPresetRepo.list())
  ipcMain.handle('customPresets:update', (_e, id: number, input: Partial<CustomPresetInput>) =>
    customPresetRepo.update(id, input)
  )
  ipcMain.handle('customPresets:delete', (_e, id: number) => customPresetRepo.delete(id))

  // Messages
  ipcMain.handle('messages:listByChat', (_e, chatId: number) => messageRepo.listByChat(chatId))
  ipcMain.handle('messages:delete', (_e, id: number) => messageRepo.delete(id))
  ipcMain.handle('messages:updateContent', (_e, id: number, content: string) => {
    messageRepo.updateContent(id, content)
    return messageRepo.get(id)
  })

  // Settings / API key
  ipcMain.handle('settings:hasApiKey', () => hasApiKey())
  ipcMain.handle('settings:saveApiKey', (_e, key: string) => saveApiKey(key))
  ipcMain.handle('settings:clearApiKey', () => clearApiKey())
  ipcMain.handle('settings:fetchModels', (_e, forceRefresh?: boolean) =>
    fetchModels(forceRefresh)
  )

  // About / Credits
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('app:checkForUpdates', async (): Promise<string> => {
    if (is.dev) return "Auto-update isn't available in a dev build."
    try {
      const result = await autoUpdater.checkForUpdatesAndNotify()
      if (result?.updateInfo && result.updateInfo.version !== app.getVersion()) {
        logInfo(`Update available: ${result.updateInfo.version}`)
        return `Update available: v${result.updateInfo.version} — downloading now.`
      }
      return "You're on the latest version."
    } catch (err) {
      logError('app:checkForUpdates', err)
      throw new Error("Couldn't check for updates — try again later.")
    }
  })

  // Backup / restore — a single portable file with characters, chats, lorebooks, and
  // avatars. Deliberately excludes the API key (see backup.ts).
  ipcMain.handle(
    'backup:export',
    logged('backup:export', async (): Promise<boolean> => {
      const win = getWindow()
      if (!win) return false
      const result = await dialog.showSaveDialog(win, {
        defaultPath: `autonym-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'Autonym Backup', extensions: ['zip'] }]
      })
      if (result.canceled || !result.filePath) return false
      exportBackup(result.filePath)
      return true
    })
  )
  ipcMain.handle(
    'backup:import',
    logged('backup:import', async (): Promise<boolean> => {
      const win = getWindow()
      if (!win) return false
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Autonym Backup', extensions: ['zip'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return false
      importBackup(result.filePaths[0])
      app.relaunch()
      app.exit()
      return true
    })
  )

  // Send message + stream response
  ipcMain.handle('chat:sendMessage', async (_e, chatId: number, userContent: string) => {
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
    const streamId = randomUUID()
    const controller = new AbortController()
    activeStreams.set(streamId, controller)

    const win = getWindow()
    let fullContent = ''

    try {
      await streamChatCompletion(
        chat.modelId,
        messages,
        samplerOptions(chat),
        (delta) => {
          fullContent += delta
          win?.webContents.send('chat:stream-chunk', {
            chatId,
            messageId: assistantMessage.id,
            delta,
            done: false
          })
        },
        controller.signal
      )
      messageRepo.updateContent(assistantMessage.id, fullContent)
      messageRepo.setSpeaker(assistantMessage.id, detectSpeaker(fullContent, character, groupCharacters))
      win?.webContents.send('chat:stream-chunk', {
        chatId,
        messageId: assistantMessage.id,
        delta: '',
        done: true
      })
    } catch (err: any) {
      logError('chat:sendMessage', err)
      messageRepo.updateContent(assistantMessage.id, fullContent)
      win?.webContents.send('chat:stream-chunk', {
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
  })

  // Draft a suggested next line for the user (or their impersonated character) to send.
  // Returns plain text to populate the composer — never posts it as a message itself.
  ipcMain.handle('chat:suggestReply', async (_e, chatId: number): Promise<string> => {
    const context = buildChatContext(chatId)
    const { chat, character, impersonatingCharacter } = context
    if (!chat.modelId) throw new Error('Pick a model before requesting a suggestion.')

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

    const speakerName = impersonatingCharacter?.name ?? 'the user'
    messages.push({
      role: 'system',
      content:
        `Do not respond as ${character.name}. Instead, write only the next single message that ` +
        `${speakerName} would send in this conversation, continuing naturally from where it left ` +
        'off. Follow the same formatting convention already established. Output only that message\'s ' +
        'text — no labels, prefixes, or meta-commentary.'
    })

    const text = await getCompletion(chat.modelId, messages, samplerOptions(chat))
    return text.trim()
  })

  // Regenerate the last assistant message: rebuild the prompt as it looked before that
  // message existed, get a fresh completion, and keep it as a new swipeable variant.
  ipcMain.handle(
    'chat:regenerateMessage',
    logged('chat:regenerateMessage', async (_e, chatId: number, messageId: number) => {
    const context = buildChatContext(chatId)
    const { chat, character, groupCharacters } = context
    if (!chat.modelId) throw new Error('Pick a model before regenerating.')

    const history = messageRepo.listByChat(chatId).filter((m) => m.id !== messageId)
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

    const text = await getCompletion(chat.modelId, messages, samplerOptions(chat))
    const updated = messageRepo.addVariant(messageId, text.trim())
    const speakerCharacterId = detectSpeaker(text.trim(), character, groupCharacters)
    messageRepo.setSpeaker(messageId, speakerCharacterId)
    const matchedLoreEntryIds = matchedLoreEntries.map((e) => e.id)
    messageRepo.setMatchedLoreEntries(messageId, matchedLoreEntryIds)
      return { ...updated, speakerCharacterId, matchedLoreEntryIds }
    })
  )

  // Ask the model to keep writing the same message from where it left off, rather than
  // starting a new turn.
  ipcMain.handle(
    'chat:continueMessage',
    logged('chat:continueMessage', async (_e, chatId: number, messageId: number) => {
    const context = buildChatContext(chatId)
    const { chat } = context
    if (!chat.modelId) throw new Error('Pick a model before continuing.')

    const target = messageRepo.get(messageId)
    if (!target) throw new Error('Message not found')

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

    messages.push({
      role: 'system',
      content:
        'Continue your last message from exactly where it left off. Do not repeat any of it and do ' +
        "not start a new turn — just keep writing more of the same message, in the same style and " +
        'formatting convention.'
    })

      const text = await getCompletion(chat.modelId, messages, samplerOptions(chat))
      const combined = `${target.content}${target.content.endsWith(' ') ? '' : ' '}${text.trim()}`
      messageRepo.updateContent(messageId, combined)
      return messageRepo.get(messageId)
    })
  )

  // Writing tools: a word thesaurus (always the hidden clerical model — it's a lookup, not
  // creative writing) and a passage "remix" that rewrites a draft to be more detailed or more
  // concise using the Act's own model, so the rewrite still sounds like the same scene.
  ipcMain.handle('writing:synonyms', (_e, word: string, context: string) => lookupSynonyms(word, context))
  ipcMain.handle(
    'writing:remix',
    logged('writing:remix', async (_e, chatId: number, passage: string, direction: RemixDirection) => {
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
    })
  )

  ipcMain.handle('chat:setActiveVariant', (_e, messageId: number, index: number) =>
    messageRepo.setActiveVariant(messageId, index)
  )

  // Skits: an unattended-generation Act. Each turn reuses chat:sendMessage's exact
  // assemble/stream/persist pipeline, but the "user" side of the turn is an ephemeral cue that's
  // never persisted — so a Skit's saved messages are pure assistant prose, ready to read or
  // export as a short story with no chat scaffolding in it.
  ipcMain.handle(
    'skits:generate',
    logged('skits:generate', async (_e, chatId: number) => {
      const chat = assertExists(chatRepo.get(chatId), 'Chat')
      if (!chat.isSkit || !chat.skitLength) throw new Error('This Act is not a Skit.')
      if (!chat.modelId) throw new Error('Pick a model before generating.')

      const targetTurns = SKIT_TURN_TARGETS[chat.skitLength]
      const controller = new AbortController()
      activeSkitRuns.set(chatId, controller)
      const win = getWindow()

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
                win?.webContents.send('chat:stream-chunk', {
                  chatId,
                  messageId: assistantMessage.id,
                  delta,
                  done: false
                })
              },
              controller.signal
            )
            messageRepo.updateContent(assistantMessage.id, fullContent)
            messageRepo.setSpeaker(assistantMessage.id, detectSpeaker(fullContent, character, groupCharacters))
            win?.webContents.send('chat:stream-chunk', {
              chatId,
              messageId: assistantMessage.id,
              delta: '',
              done: true
            })
          } catch (err: any) {
            messageRepo.updateContent(assistantMessage.id, fullContent)
            win?.webContents.send('chat:stream-chunk', {
              chatId,
              messageId: assistantMessage.id,
              delta: '',
              done: true,
              error: err?.message ?? String(err)
            })
            throw err
          }
          turnsSoFar++
        }
      } finally {
        activeSkitRuns.delete(chatId)
      }
    })
  )

  ipcMain.handle('skits:cancel', (_e, chatId: number) => {
    activeSkitRuns.get(chatId)?.abort()
    activeSkitRuns.delete(chatId)
  })

  ipcMain.handle('skits:regenerate', (_e, chatId: number) => {
    assertExists(chatRepo.get(chatId), 'Chat')
    messageRepo.deleteAllForChat(chatId)
  })

  // Summarize a chat so a new "continuation" chat can carry its history forward
  // without replaying the entire message log into every future prompt.
  ipcMain.handle('chat:summarizeForContinuation', async (_e, chatId: number): Promise<string> => {
    const context = buildChatContext(chatId)
    const { chat } = context

    const history = messageRepo.listByChat(chatId)
    if (history.length === 0) throw new Error('This chat has no messages to summarize yet.')

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

    messages.push({
      role: 'system',
      content:
        'Summarize this roleplay so far in 1-2 short paragraphs: key events, how the characters\' ' +
        'relationship has developed, and the current situation. Write it as plain backstory notes for ' +
        'continuing the story later — not as dialogue, not in character, no formatting markup.'
    })

    const text = await getCompletion(CLERICAL_MODEL_ID, messages, { ...CLERICAL_SAMPLER_OPTIONS, maxTokens: 400 })
    return text.trim()
  })

  // Save arbitrary text (a story export) to a user-chosen file.
  ipcMain.handle(
    'chat:saveStoryFile',
    async (_e, defaultFilename: string, content: string): Promise<boolean> => {
      const win = getWindow()
      if (!win) return false
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultFilename,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] }
        ]
      })
      if (result.canceled || !result.filePath) return false
      writeFileSync(result.filePath, content, 'utf-8')
      return true
    }
  )

  ipcMain.handle(
    'chat:exportPdf',
    async (_e, defaultFilename: string, title: string, storyBody: string): Promise<boolean> => {
      const win = getWindow()
      if (!win) return false
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultFilename,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return false
      const buffer = await exportStoryAsPdf(title, storyBody)
      writeFileSync(result.filePath, buffer)
      return true
    }
  )

  ipcMain.handle(
    'chat:exportEpub',
    async (_e, defaultFilename: string, title: string, storyBody: string): Promise<boolean> => {
      const win = getWindow()
      if (!win) return false
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultFilename,
        filters: [{ name: 'EPUB', extensions: ['epub'] }]
      })
      if (result.canceled || !result.filePath) return false
      const buffer = exportStoryAsEpub(title, storyBody)
      writeFileSync(result.filePath, buffer)
      return true
    }
  )

  // Avatar upload
  ipcMain.handle('characters:pickAvatar', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = resolve(result.filePaths[0])
    dialogPickedPaths.add(picked)
    return picked
  })

  const IMAGE_MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  }

  // Reads an avatar off disk as a data URL. Necessary because <img src="file://...">
  // gets blocked by Chromium when the renderer itself isn't loaded from file:// (true in
  // dev, where it's served from the Vite dev server) — a data URL works everywhere.
  ipcMain.handle('characters:readImageAsDataUrl', (_e, filePath: string): string | null => {
    // Restricted to userData (where saved avatars live) or a path the user just picked via the
    // native file dialog below (for previewing before the character is saved) — so this IPC
    // method can't be used to read arbitrary, unrelated files elsewhere on disk. Resolve first
    // so a "../.." can't escape the userData check.
    const userDataDir = resolve(app.getPath('userData'))
    const resolved = resolve(filePath)
    const underUserData = resolved === userDataDir || resolved.startsWith(userDataDir + sep)
    if (!underUserData && !dialogPickedPaths.has(resolved)) return null
    if (!existsSync(resolved)) return null
    const mime = IMAGE_MIME_TYPES[extname(resolved).toLowerCase()] ?? 'application/octet-stream'
    const base64 = readFileSync(resolved).toString('base64')
    return `data:${mime};base64,${base64}`
  })

  // Import characters from Agnaistic / Character Card V2-V3 / SillyTavern-style files
  ipcMain.handle('import:characters', async (): Promise<ImportCharactersResult> => {
    const win = getWindow()
    const result: ImportCharactersResult = { imported: [], failed: [] }
    if (!win) return result

    const picked = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Character cards', extensions: ['json', 'png'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (picked.canceled) return result

    for (const filePath of picked.filePaths) {
      try {
        const ext = extname(filePath).toLowerCase()
        let raw: any
        if (ext === '.png') {
          const buffer = readFileSync(filePath)
          raw = extractCharacterCardFromPng(buffer)
          if (!raw) throw new Error('No embedded character data found in this PNG')
        } else {
          raw = JSON.parse(readFileSync(filePath, 'utf-8'))
        }

        const parsed = parseCharacterImport(raw)
        if (ext === '.png') {
          parsed.character.avatarPath = saveImportedAvatar(filePath)
          parsed.character.avatarType = 'image'
        }

        const character = characterRepo.create(parsed.character)

        if (parsed.lorebook && parsed.lorebook.entries.length > 0) {
          const lorebook = lorebookRepo.create(parsed.lorebook.lorebook)
          for (const entry of parsed.lorebook.entries) {
            loreEntryRepo.create({ ...entry, lorebookId: lorebook.id })
          }
          characterRepo.linkLorebook(character.id, lorebook.id)
        }

        result.imported.push(character)
      } catch (err: any) {
        result.failed.push({ file: filePath, error: err?.message ?? String(err) })
      }
    }

    return result
  })

  // Import a standalone lorebook / memory book / World Info file
  ipcMain.handle('import:lorebook', async (): Promise<Lorebook | null> => {
    const win = getWindow()
    if (!win) return null

    const picked = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Lorebook JSON', extensions: ['json'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return null

    const raw = JSON.parse(readFileSync(picked.filePaths[0], 'utf-8'))
    const parsed = parseLorebookImport(raw)
    const lorebook = lorebookRepo.create(parsed.lorebook)
    for (const entry of parsed.entries) {
      loreEntryRepo.create({ ...entry, lorebookId: lorebook.id })
    }
    return lorebook
  })

  // Import a generation preset (Agnaistic Gen Preset / SillyTavern-style sampler config)
  ipcMain.handle('import:preset', async (): Promise<CustomPreset | null> => {
    const win = getWindow()
    if (!win) return null

    const picked = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Preset JSON', extensions: ['json'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return null

    const raw = JSON.parse(readFileSync(picked.filePaths[0], 'utf-8'))
    const parsed = parsePresetImport(raw)
    return customPresetRepo.create(parsed)
  })
}
