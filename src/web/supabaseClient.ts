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

export async function loadStoreFromCloud(): Promise<Store | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('autonym_store')
      .select('data, updated_at')
      .eq('id', 'default')
      .maybeSingle()

    if (error) {
      console.warn('Supabase fetch store warning/error:', error.message)
      return null
    }

    if (data && data.data && typeof data.data === 'object') {
      return data.data as Store
    }
    return null
  } catch (err) {
    console.error('Error loading store from cloud:', err)
    return null
  }
}

export async function saveStoreToCloud(store: Store): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false

  try {
    const { error } = await supabase.from('autonym_store').upsert(
      {
        id: 'default',
        data: store,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    )

    if (error) {
      console.error('Failed to save store to Supabase:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Error saving store to cloud:', err)
    return false
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
