import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Store } from './webDb'

const SUPABASE_URL_KEY = 'autonym:supabase_url'
const SUPABASE_KEY_KEY = 'autonym:supabase_anon_key'
const SUPABASE_SYNC_ENABLED_KEY = 'autonym:supabase_sync_enabled'

let supabaseInstance: SupabaseClient | null = null
let currentConfigKey = ''

export function getStoredSupabaseConfig(): { url: string; key: string; enabled: boolean } {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || ''
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''
  const localUrl = localStorage.getItem(SUPABASE_URL_KEY) || ''
  const localKey = localStorage.getItem(SUPABASE_KEY_KEY) || ''
  const storedEnabled = localStorage.getItem(SUPABASE_SYNC_ENABLED_KEY)

  const url = localUrl || envUrl
  const key = localKey || envKey
  // Default to enabled if url and key are provided, unless explicitly set to '0'
  const enabled = storedEnabled !== '0' && Boolean(url && key)

  return { url, key, enabled }
}

export function saveSupabaseConfig(url: string, key: string, enabled = true): void {
  localStorage.setItem(SUPABASE_URL_KEY, url.trim())
  localStorage.setItem(SUPABASE_KEY_KEY, key.trim())
  localStorage.setItem(SUPABASE_SYNC_ENABLED_KEY, enabled ? '1' : '0')
  supabaseInstance = null
  currentConfigKey = ''
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(SUPABASE_URL_KEY)
  localStorage.removeItem(SUPABASE_KEY_KEY)
  localStorage.removeItem(SUPABASE_SYNC_ENABLED_KEY)
  supabaseInstance = null
  currentConfigKey = ''
}

export function getSupabase(): SupabaseClient | null {
  const { url, key, enabled } = getStoredSupabaseConfig()
  if (!enabled || !url || !key) return null

  const configKey = `${url}::${key}`
  if (supabaseInstance && currentConfigKey === configKey) {
    return supabaseInstance
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: false }
    })
    currentConfigKey = configKey
    return supabaseInstance
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err)
    return null
  }
}

export function isCloudSyncEnabled(): boolean {
  return getSupabase() !== null
}

/**
 * Result of reading the cloud copy. `unavailable` means sync is off or not configured;
 * `empty` means the cloud was reached and holds no data yet; `error` means the cloud could not
 * be read, so its contents are unknown and must not be overwritten.
 */
export type CloudLoadResult =
  | { status: 'unavailable' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ok'; store: Store; updatedAt: string }

export async function loadStoreFromCloud(): Promise<CloudLoadResult> {
  const supabase = getSupabase()
  if (!supabase) return { status: 'unavailable' }

  try {
    const { data, error } = await supabase
      .from('autonym_store')
      .select('data, updated_at')
      .eq('id', 'default')
      .maybeSingle()

    if (error) {
      console.warn('Supabase fetch store warning/error:', error.message)
      return { status: 'error' }
    }

    if (data && data.data && typeof data.data === 'object' && (data.data as Store).nextId) {
      return { status: 'ok', store: data.data as Store, updatedAt: data.updated_at as string }
    }
    return { status: 'empty' }
  } catch (err) {
    console.error('Error loading store from cloud:', err)
    return { status: 'error' }
  }
}

/**
 * Writes the store only if the cloud copy is still the one this device last read
 * (`expectedUpdatedAt`, or null when the cloud was empty). Returns `conflict` when another device
 * wrote in between, so the caller can merge the newer copy and try again.
 */
export async function saveStoreToCloud(
  store: Store,
  expectedUpdatedAt: string | null
): Promise<'ok' | 'conflict' | 'error'> {
  const supabase = getSupabase()
  if (!supabase) return 'error'

  try {
    const row = { id: 'default', data: store, updated_at: new Date().toISOString() }
    if (expectedUpdatedAt === null) {
      const { error } = await supabase.from('autonym_store').insert(row)
      if (!error) return 'ok'
      // 23505 = unique violation: another device created the row first.
      if (error.code === '23505') return 'conflict'
      console.error('Failed to save store to Supabase:', error.message)
      return 'error'
    }

    const { data, error } = await supabase
      .from('autonym_store')
      .update({ data: row.data, updated_at: row.updated_at })
      .eq('id', 'default')
      .eq('updated_at', expectedUpdatedAt)
      .select('id')
    if (error) {
      console.error('Failed to save store to Supabase:', error.message)
      return 'error'
    }
    return data && data.length > 0 ? 'ok' : 'conflict'
  } catch (err) {
    console.error('Error saving store to cloud:', err)
    return 'error'
  }
}

export async function uploadAvatarToCloud(dataUrlOrBlob: string | Blob, fileName: string): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  try {
    let blob: Blob
    let contentType = 'image/png'

    if (typeof dataUrlOrBlob === 'string') {
      if (!dataUrlOrBlob.startsWith('data:')) {
        return dataUrlOrBlob // already a remote URL
      }
      const parts = dataUrlOrBlob.split(',')
      const mimeMatch = parts[0].match(/:(.*?);/)
      if (mimeMatch) contentType = mimeMatch[1]
      const binary = atob(parts[1])
      const array = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i)
      }
      blob = new Blob([array], { type: contentType })
    } else {
      blob = dataUrlOrBlob
      contentType = blob.type || 'image/png'
    }

    const cleanExt = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
    const path = `${fileName}.${cleanExt}`

    const { error } = await supabase.storage.from('avatars').upload(path, blob, {
      contentType,
      upsert: true
    })

    if (error) {
      console.warn('Failed to upload avatar to Supabase:', error.message)
      return null
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)
    return publicUrlData.publicUrl
  } catch (err) {
    console.error('Error uploading avatar to cloud:', err)
    return null
  }
}

export function subscribeToCloudChanges(onRemoteUpdate: (remoteStore: Store) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  try {
    const channel = supabase
      .channel('autonym_store_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'autonym_store', filter: 'id=eq.default' },
        (payload: any) => {
          if (payload.new && payload.new.data) {
            onRemoteUpdate(payload.new.data as Store)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  } catch (err) {
    console.error('Failed to subscribe to Supabase realtime:', err)
    return () => {}
  }
}
