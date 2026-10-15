import { create } from 'zustand'
import type { CharacterInput } from '@shared/types'

export type Page = 'home' | 'chat' | 'characters' | 'lorebooks' | 'universes' | 'scenarios' | 'settings'

interface AppState {
  page: Page
  setPage: (page: Page) => void
  activeCharacterId: number | null
  setActiveCharacterId: (id: number | null) => void
  activeChatId: number | null
  setActiveChatId: (id: number | null) => void
  /** An AI-extracted character draft handed from a Collaborative Mode chat to the
   *  Characters page, to be reviewed and saved (or discarded) there. */
  pendingCharacterDraft: Partial<CharacterInput> | null
  setPendingCharacterDraft: (draft: Partial<CharacterInput> | null) => void
  /** Set to jump the Cast page straight into editing a specific character (e.g. from the
   *  Universes page) instead of landing on the character list. */
  pendingEditCharacterId: number | null
  setPendingEditCharacterId: (id: number | null) => void
  /** Stack of "close me" callbacks pushed by whatever page-level trash view/modal is
   *  currently open, so a single global Escape handler can dismiss the topmost one. */
  escapeHandlers: (() => void)[]
  pushEscapeHandler: (fn: () => void) => void
  popEscapeHandler: (fn: () => void) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'home',
  setPage: (page) => set({ page }),
  activeCharacterId: null,
  setActiveCharacterId: (id) => set({ activeCharacterId: id, activeChatId: null }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
  pendingCharacterDraft: null,
  setPendingCharacterDraft: (draft) => set({ pendingCharacterDraft: draft }),
  pendingEditCharacterId: null,
  setPendingEditCharacterId: (id) => set({ pendingEditCharacterId: id }),
  escapeHandlers: [],
  pushEscapeHandler: (fn) => set({ escapeHandlers: [...get().escapeHandlers, fn] }),
  popEscapeHandler: (fn) =>
    set({ escapeHandlers: get().escapeHandlers.filter((h) => h !== fn) })
}))
