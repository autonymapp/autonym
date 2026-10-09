import { get, set, del } from 'idb-keyval'
import type { Store } from './webDb'

const LOCAL_STORAGE_BACKUP_KEY = 'autonym:app_store_backup'
const IDB_STORE_KEY = 'autonym:app_data'
const AVATAR_PREFIX = 'autonym:avatar:'

export async function loadLocalStore(): Promise<Store | null> {
  try {
    const idbData = await get<Store>(IDB_STORE_KEY)
    if (idbData && typeof idbData === 'object' && idbData.nextId) {
      return idbData
    }
  } catch (err) {
    console.warn('Failed to load from IndexedDB, trying localStorage fallback:', err)
  }

  try {
    const local = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY)
    if (local) {
      const parsed = JSON.parse(local)
      if (parsed && typeof parsed === 'object' && parsed.nextId) {
        return parsed as Store
      }
    }
  } catch (err) {
    console.error('Failed to parse localStorage backup:', err)
  }

  return null
}

export async function saveLocalStore(store: Store): Promise<void> {
  try {
    await set(IDB_STORE_KEY, store)
  } catch (err) {
    console.warn('Failed to save to IndexedDB:', err)
  }

  // Also keep a lightweight sync in localStorage (without heavy avatar data) if possible
  try {
    const serialized = JSON.stringify(store)
    if (serialized.length < 4_500_000) {
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, serialized)
    }
  } catch {
    // Exceeded localStorage quota, harmless since IndexedDB has gigabyte capacity
  }
}

export async function saveLocalAvatar(key: string, dataUrl: string): Promise<void> {
  try {
    await set(`${AVATAR_PREFIX}${key}`, dataUrl)
  } catch (err) {
    console.warn('Failed to save avatar to IndexedDB:', err)
  }
}

export async function getLocalAvatar(key: string): Promise<string | null> {
  try {
    const result = await get<string>(`${AVATAR_PREFIX}${key}`)
    return result ?? null
  } catch (err) {
    console.warn('Failed to get avatar from IndexedDB:', err)
    return null
  }
}

export async function deleteLocalAvatar(key: string): Promise<void> {
  try {
    await del(`${AVATAR_PREFIX}${key}`)
  } catch (err) {
    console.warn('Failed to delete avatar from IndexedDB:', err)
  }
}
