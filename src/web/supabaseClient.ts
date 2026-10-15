import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Store } from './webDb'

// Autonym's own Supabase project. The publishable key is meant to ship in the app: row level
// security only lets a signed-in owner read or write their own data.
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://vcxoomhjctrjtygejlzc.supabase.co'
const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjeG9vbWhqY3RyanR5Z2VqbHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTQ4MzgsImV4cCI6MjEwNzYzMDgzOH0.lrciuLTglizmxHsWLgoyMyu0J-L5qfc0X8llo6KgIZM'

let supabaseInstance: SupabaseClient | null = null
let userId: string | null = null

export function getSupabase(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance
  try {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'autonym:auth' }
    })
    return supabaseInstance
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err)
    return null
  }
}

/** Reads the saved sign-in, if any. Sync only runs while signed in. */
export async function loadSession(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    userId = data.session?.user.id ?? null
    return data.session?.user.email ?? null
  } catch {
    userId = null
    return null
  }
}

export async function getSignedInEmail(): Promise<string | null> {
  return loadSession()
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return 'Cloud sync is unavailable right now.'
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  return error ? error.message : null
}

/** Creates the account. Returns `confirm` when Supabase wants the email confirmed first. */
export async function signUp(email: string, password: string): Promise<{ error: string | null; confirm: boolean }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Cloud sync is unavailable right now.', confirm: false }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: typeof location !== 'undefined' ? location.origin : undefined }
  })
  if (error) return { error: error.message, confirm: false }
  return { error: null, confirm: !data.session }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (supabase) await supabase.auth.signOut()
  userId = null
}

export function isCloudSyncEnabled(): boolean {
  return userId !== null
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
  if (!supabase || !userId) return { status: 'unavailable' }

  try {
    const { data, error } = await supabase
      .from('autonym_store')
      .select('data, updated_at')
      .eq('id', userId)
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
  if (!supabase || !userId) return 'error'

  try {
    const row = { id: userId, data: store, updated_at: new Date().toISOString() }
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
      .eq('id', userId)
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
  if (!supabase || !userId) return null

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
  if (!supabase || !userId) return () => {}

  try {
    const channel = supabase
      .channel('autonym_store_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'autonym_store', filter: `id=eq.${userId}` },
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
