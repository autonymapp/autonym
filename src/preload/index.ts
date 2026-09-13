import { contextBridge, ipcRenderer } from 'electron'
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
  LoreEntryInput,
  LoreEntryType,
  LorebookInput,
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

const api = {
  characters: {
    list: () => ipcRenderer.invoke('characters:list'),
    get: (id: number) => ipcRenderer.invoke('characters:get', id),
    create: (input: CharacterInput) => ipcRenderer.invoke('characters:create', input),
    update: (id: number, input: CharacterInput) =>
      ipcRenderer.invoke('characters:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('characters:delete', id),
    listTrashed: (): Promise<Character[]> => ipcRenderer.invoke('characters:listTrashed'),
    restore: (id: number) => ipcRenderer.invoke('characters:restore', id),
    permanentlyDelete: (id: number) => ipcRenderer.invoke('characters:permanentlyDelete', id),
    linkLorebook: (characterId: number, lorebookId: number) =>
      ipcRenderer.invoke('characters:linkLorebook', characterId, lorebookId),
    unlinkLorebook: (characterId: number, lorebookId: number) =>
      ipcRenderer.invoke('characters:unlinkLorebook', characterId, lorebookId),
    getLorebookIds: (characterId: number) =>
      ipcRenderer.invoke('characters:getLorebookIds', characterId),
    pickAvatar: () => ipcRenderer.invoke('characters:pickAvatar'),
    readImageAsDataUrl: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('characters:readImageAsDataUrl', filePath),
    extractFromChat: (chatId: number): Promise<Partial<CharacterInput>> =>
      ipcRenderer.invoke('characters:extractFromChat', chatId),
    structureText: (rawText: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('characters:structureText', rawText)
  },
  personas: {
    list: () => ipcRenderer.invoke('personas:list'),
    create: (input: PersonaInput) => ipcRenderer.invoke('personas:create', input),
    update: (id: number, input: PersonaInput) => ipcRenderer.invoke('personas:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('personas:delete', id)
  },
  lorebooks: {
    list: () => ipcRenderer.invoke('lorebooks:list'),
    create: (input: LorebookInput) => ipcRenderer.invoke('lorebooks:create', input),
    update: (id: number, input: LorebookInput) =>
      ipcRenderer.invoke('lorebooks:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('lorebooks:delete', id),
    listTrashed: (): Promise<Lorebook[]> => ipcRenderer.invoke('lorebooks:listTrashed'),
    restore: (id: number) => ipcRenderer.invoke('lorebooks:restore', id),
    permanentlyDelete: (id: number) => ipcRenderer.invoke('lorebooks:permanentlyDelete', id)
  },
  universes: {
    list: (): Promise<Universe[]> => ipcRenderer.invoke('universes:list'),
    create: (input: UniverseInput): Promise<Universe> => ipcRenderer.invoke('universes:create', input),
    update: (id: number, input: UniverseInput): Promise<Universe> =>
      ipcRenderer.invoke('universes:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('universes:delete', id),
    listTrashed: (): Promise<Universe[]> => ipcRenderer.invoke('universes:listTrashed'),
    restore: (id: number) => ipcRenderer.invoke('universes:restore', id),
    permanentlyDelete: (id: number) => ipcRenderer.invoke('universes:permanentlyDelete', id),
    startWorldbuildingSession: (universeId: number): Promise<Chat> =>
      ipcRenderer.invoke('universes:startWorldbuildingSession', universeId)
  },
  loreEntries: {
    listByLorebook: (lorebookId: number) =>
      ipcRenderer.invoke('loreEntries:listByLorebook', lorebookId),
    create: (input: LoreEntryInput) => ipcRenderer.invoke('loreEntries:create', input),
    update: (id: number, input: LoreEntryInput) =>
      ipcRenderer.invoke('loreEntries:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('loreEntries:delete', id)
  },
  lore: {
    fetchUrlText: (url: string): Promise<string> => ipcRenderer.invoke('lore:fetchUrlText', url),
    structureText: (
      entryType: LoreEntryType,
      rawText: string
    ): Promise<{ title: string; description: string; keywords: string[]; fields: Record<string, string> }> =>
      ipcRenderer.invoke('lore:structureText', entryType, rawText)
  },
  starterPacks: {
    export: (lorebookId: number): Promise<boolean> =>
      ipcRenderer.invoke('starterPacks:export', lorebookId),
    importFile: (): Promise<{ lorebook: LorebookInput; entries: Omit<LoreEntryInput, 'lorebookId'>[] } | null> =>
      ipcRenderer.invoke('starterPacks:importFile')
  },
  relationships: {
    list: (): Promise<CharacterRelationship[]> => ipcRenderer.invoke('relationships:list'),
    listForCharacter: (characterId: number): Promise<CharacterRelationship[]> =>
      ipcRenderer.invoke('relationships:listForCharacter', characterId),
    upsert: (input: CharacterRelationshipInput): Promise<CharacterRelationship> =>
      ipcRenderer.invoke('relationships:upsert', input),
    delete: (id: number) => ipcRenderer.invoke('relationships:delete', id)
  },
  chats: {
    listByCharacter: (characterId: number) =>
      ipcRenderer.invoke('chats:listByCharacter', characterId),
    listAll: () => ipcRenderer.invoke('chats:listAll'),
    get: (id: number) => ipcRenderer.invoke('chats:get', id),
    create: (input: ChatInput) => ipcRenderer.invoke('chats:create', input),
    updateSettings: (id: number, modelId: string, samplerSettings: SamplerSettings, rpMode: RpMode) =>
      ipcRenderer.invoke('chats:updateSettings', id, modelId, samplerSettings, rpMode),
    rename: (id: number, title: string) => ipcRenderer.invoke('chats:rename', id, title),
    setImpersonation: (id: number, impersonatingCharacterId: number | null) =>
      ipcRenderer.invoke('chats:setImpersonation', id, impersonatingCharacterId),
    setPersona: (id: number, personaId: number | null) =>
      ipcRenderer.invoke('chats:setPersona', id, personaId),
    setScenario: (id: number, scenarioId: number | null) =>
      ipcRenderer.invoke('chats:setScenario', id, scenarioId),
    setMilestoneIndex: (id: number, index: number) =>
      ipcRenderer.invoke('chats:setMilestoneIndex', id, index),
    setStoryline: (id: number, storylineId: number | null) =>
      ipcRenderer.invoke('chats:setStoryline', id, storylineId),
    setCollaborativeMode: (id: number, collaborativeMode: boolean) =>
      ipcRenderer.invoke('chats:setCollaborativeMode', id, collaborativeMode),
    setTags: (id: number, tags: string[]): Promise<Chat> =>
      ipcRenderer.invoke('chats:setTags', id, tags),
    setDirectorsNotes: (id: number, notes: string): Promise<Chat> =>
      ipcRenderer.invoke('chats:setDirectorsNotes', id, notes),
    setMood: (id: number, moodPreset: Chat['moodPreset']): Promise<Chat> =>
      ipcRenderer.invoke('chats:setMood', id, moodPreset),
    setContentIntensity: (id: number, contentIntensity: Chat['contentIntensity']): Promise<Chat> =>
      ipcRenderer.invoke('chats:setContentIntensity', id, contentIntensity),
    setFictionalDate: (id: number, date: string | null): Promise<Chat> =>
      ipcRenderer.invoke('chats:setFictionalDate', id, date),
    setGroupCharacterIds: (id: number, ids: number[]): Promise<Chat> =>
      ipcRenderer.invoke('chats:setGroupCharacterIds', id, ids),
    fork: (chatId: number, uptoMessageId: number | null): Promise<Chat> =>
      ipcRenderer.invoke('chats:fork', chatId, uptoMessageId),
    delete: (id: number) => ipcRenderer.invoke('chats:delete', id),
    listTrashed: (): Promise<Chat[]> => ipcRenderer.invoke('chats:listTrashed'),
    restore: (id: number) => ipcRenderer.invoke('chats:restore', id),
    permanentlyDelete: (id: number) => ipcRenderer.invoke('chats:permanentlyDelete', id)
  },
  scenarios: {
    list: (): Promise<Scenario[]> => ipcRenderer.invoke('scenarios:list'),
    create: (input: ScenarioInput): Promise<Scenario> => ipcRenderer.invoke('scenarios:create', input),
    update: (id: number, input: ScenarioInput): Promise<Scenario> =>
      ipcRenderer.invoke('scenarios:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('scenarios:delete', id)
  },
  storylines: {
    listForCharacter: (characterId: number): Promise<Storyline[]> =>
      ipcRenderer.invoke('storylines:listForCharacter', characterId),
    create: (input: StorylineInput): Promise<Storyline> => ipcRenderer.invoke('storylines:create', input),
    rename: (id: number, name: string): Promise<Storyline> =>
      ipcRenderer.invoke('storylines:rename', id, name),
    delete: (id: number) => ipcRenderer.invoke('storylines:delete', id)
  },
  journal: {
    listForCharacter: (characterId: number): Promise<JournalEntry[]> =>
      ipcRenderer.invoke('journal:listForCharacter', characterId),
    generateForChat: (chatId: number): Promise<JournalEntry> =>
      ipcRenderer.invoke('journal:generateForChat', chatId),
    delete: (id: number) => ipcRenderer.invoke('journal:delete', id)
  },
  stats: {
    overview: (): Promise<StatsOverview> => ipcRenderer.invoke('stats:overview')
  },
  customPresets: {
    list: (): Promise<CustomPreset[]> => ipcRenderer.invoke('customPresets:list'),
    update: (id: number, input: Partial<CustomPresetInput>): Promise<CustomPreset> =>
      ipcRenderer.invoke('customPresets:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('customPresets:delete', id)
  },
  messages: {
    listByChat: (chatId: number) => ipcRenderer.invoke('messages:listByChat', chatId),
    delete: (id: number) => ipcRenderer.invoke('messages:delete', id),
    updateContent: (id: number, content: string): Promise<ChatMessage> =>
      ipcRenderer.invoke('messages:updateContent', id, content),
    search: (query: string): Promise<MessageSearchResult[]> => ipcRenderer.invoke('messages:search', query),
    listBookmarked: (): Promise<MessageSearchResult[]> => ipcRenderer.invoke('messages:listBookmarked'),
    toggleBookmark: (id: number): Promise<ChatMessage> => ipcRenderer.invoke('messages:toggleBookmark', id)
  },
  settings: {
    hasApiKey: () => ipcRenderer.invoke('settings:hasApiKey'),
    saveApiKey: (key: string) => ipcRenderer.invoke('settings:saveApiKey', key),
    clearApiKey: () => ipcRenderer.invoke('settings:clearApiKey'),
    fetchModels: (forceRefresh?: boolean) =>
      ipcRenderer.invoke('settings:fetchModels', forceRefresh)
  },
  chat: {
    sendMessage: (chatId: number, content: string) =>
      ipcRenderer.invoke('chat:sendMessage', chatId, content),
    suggestReply: (chatId: number): Promise<string> =>
      ipcRenderer.invoke('chat:suggestReply', chatId),
    summarizeForContinuation: (chatId: number): Promise<string> =>
      ipcRenderer.invoke('chat:summarizeForContinuation', chatId),
    saveStoryFile: (defaultFilename: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('chat:saveStoryFile', defaultFilename, content),
    exportPdf: (defaultFilename: string, title: string, storyBody: string): Promise<boolean> =>
      ipcRenderer.invoke('chat:exportPdf', defaultFilename, title, storyBody),
    exportEpub: (defaultFilename: string, title: string, storyBody: string): Promise<boolean> =>
      ipcRenderer.invoke('chat:exportEpub', defaultFilename, title, storyBody),
    regenerateMessage: (chatId: number, messageId: number): Promise<ChatMessage> =>
      ipcRenderer.invoke('chat:regenerateMessage', chatId, messageId),
    continueMessage: (chatId: number, messageId: number): Promise<ChatMessage> =>
      ipcRenderer.invoke('chat:continueMessage', chatId, messageId),
    setActiveVariant: (messageId: number, index: number): Promise<ChatMessage> =>
      ipcRenderer.invoke('chat:setActiveVariant', messageId, index),
    onStreamChunk: (callback: (event: StreamChunkEvent) => void) => {
      const listener = (_e: unknown, data: StreamChunkEvent) => callback(data)
      ipcRenderer.on('chat:stream-chunk', listener)
      return () => {
        ipcRenderer.removeListener('chat:stream-chunk', listener)
      }
    }
  },
  import: {
    characters: (): Promise<ImportCharactersResult> => ipcRenderer.invoke('import:characters'),
    lorebook: (): Promise<Lorebook | null> => ipcRenderer.invoke('import:lorebook'),
    preset: (): Promise<CustomPreset | null> => ipcRenderer.invoke('import:preset')
  },
  backup: {
    export: (): Promise<boolean> => ipcRenderer.invoke('backup:export'),
    import: (): Promise<boolean> => ipcRenderer.invoke('backup:import')
  },
  skits: {
    generate: (chatId: number): Promise<void> => ipcRenderer.invoke('skits:generate', chatId),
    cancel: (chatId: number): Promise<void> => ipcRenderer.invoke('skits:cancel', chatId),
    regenerate: (chatId: number): Promise<void> => ipcRenderer.invoke('skits:regenerate', chatId)
  },
  writing: {
    synonyms: (word: string, context: string): Promise<string[]> =>
      ipcRenderer.invoke('writing:synonyms', word, context),
    remix: (chatId: number, passage: string, direction: 'detailed' | 'concise'): Promise<string> =>
      ipcRenderer.invoke('writing:remix', chatId, passage, direction)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    checkForUpdates: (): Promise<string> => ipcRenderer.invoke('app:checkForUpdates')
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
