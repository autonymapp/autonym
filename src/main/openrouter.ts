import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { OpenRouterModel } from '@shared/types'

const KEY_FILE = () => join(app.getPath('userData'), 'openrouter.key')

export function hasApiKey(): boolean {
  return existsSync(KEY_FILE())
}

export function saveApiKey(plainKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available on this machine')
  }
  const encrypted = safeStorage.encryptString(plainKey)
  writeFileSync(KEY_FILE(), encrypted)
}

export function clearApiKey(): void {
  if (existsSync(KEY_FILE())) {
    writeFileSync(KEY_FILE(), '')
  }
}

function getApiKey(): string {
  if (!existsSync(KEY_FILE())) {
    throw new Error('No OpenRouter API key configured. Add one in Settings.')
  }
  const buf = readFileSync(KEY_FILE())
  if (buf.length === 0) {
    throw new Error('No OpenRouter API key configured. Add one in Settings.')
  }
  return safeStorage.decryptString(buf)
}

const API_BASE = 'https://openrouter.ai/api/v1'

let modelsCache: OpenRouterModel[] | null = null

/** Models with these terms in their id are moderation/safety-classifier tools, not conversational
 *  chat models — genuinely never a fit for roleplay, regardless of provider or price. Deliberately
 *  narrow: broader "is this good at RP" quality filtering isn't something OpenRouter's metadata can
 *  answer reliably (tested against real supported_parameters/description data — it false-positived
 *  on flagship models like Claude and GPT-5), so this list stays limited to genuine category
 *  mismatches rather than a subjective curation. */
const NON_CHAT_ID_PATTERN = /embed|rerank|\bguard\b|moderation|safeguard|safety|content-filter/i

/** Excludes `:batch` variants (OpenRouter's async bulk-job pricing tier — not usable through this
 *  app's live/streaming chat calls at all) and the handful of pure moderation/safety-classifier
 *  models, so the picker isn't padded with entries that can never actually be selected for an Act. */
export function isUsableForChat(m: any): boolean {
  if (typeof m.id === 'string' && m.id.endsWith(':batch')) return false
  const inputs: string[] = m.architecture?.input_modalities ?? []
  const outputs: string[] = m.architecture?.output_modalities ?? []
  if (!inputs.includes('text') || !outputs.includes('text')) return false
  if (NON_CHAT_ID_PATTERN.test(m.id ?? '')) return false
  return true
}

export async function fetchModels(forceRefresh = false): Promise<OpenRouterModel[]> {
  if (modelsCache && !forceRefresh) return modelsCache
  const key = getApiKey()
  const res = await fetch(`${API_BASE}/models`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { data: any[] }
  modelsCache = json.data.filter(isUsableForChat).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    contextLength: m.context_length ?? 0,
    promptPrice: m.pricing?.prompt ?? '0',
    completionPrice: m.pricing?.completion ?? '0'
  }))
  return modelsCache
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** OpenRouter/Anthropic's richer message-content shape, needed to attach a prompt-caching
 *  breakpoint to a specific block of text instead of the whole message. */
interface CacheableContentBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

interface OutgoingMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | CacheableContentBlock[]
}

/** Anthropic (via OpenRouter) supports explicit prompt-caching breakpoints: marking a block
 *  of message content as cacheable means later requests that repeat it are read back at a
 *  steep discount and noticeably faster, instead of being reprocessed from scratch every
 *  turn. The system prompt here is exactly that kind of stable, repeated content — it holds
 *  the character sheet, lorebook matches, and scenario, and barely changes turn to turn
 *  within one act, while only the conversation history grows. Restricted to the Claude
 *  family for now since that's OpenRouter's best-documented, most reliable support for it;
 *  other models will just receive their system prompt as a plain string, unaffected. */
function withCacheControl(modelId: string, messages: ChatCompletionMessage[]): OutgoingMessage[] {
  if (!modelId.startsWith('anthropic/')) return messages
  const systemIndex = messages.findIndex((m) => m.role === 'system')
  if (systemIndex === -1) return messages
  return messages.map((m, i) =>
    i === systemIndex
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : m
  )
}

export interface ChatCompletionOptions {
  temperature: number
  topP: number
  maxTokens: number
  topK?: number
  frequencyPenalty?: number
  presencePenalty?: number
  repetitionPenalty?: number
}

export async function streamChatCompletion(
  modelId: string,
  messages: ChatCompletionMessage[],
  options: ChatCompletionOptions,
  onDelta: (delta: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const key = getApiKey()
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://autonym.app',
      'X-Title': 'Autonym'
    },
    body: JSON.stringify({
      model: modelId,
      messages: withCacheControl(modelId, messages),
      stream: true,
      temperature: options.temperature,
      top_p: options.topP,
      max_tokens: options.maxTokens,
      ...(options.topK !== undefined ? { top_k: options.topK } : {}),
      ...(options.frequencyPenalty !== undefined ? { frequency_penalty: options.frequencyPenalty } : {}),
      ...(options.presencePenalty !== undefined ? { presence_penalty: options.presencePenalty } : {}),
      ...(options.repetitionPenalty !== undefined
        ? { repetition_penalty: options.repetitionPenalty }
        : {})
    }),
    signal
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter request failed: ${res.status} ${text}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch {
        // ignore malformed SSE keep-alive lines
      }
    }
  }
}

/** Like streamChatCompletion, but collects the full response instead of streaming it. */
export async function getCompletion(
  modelId: string,
  messages: ChatCompletionMessage[],
  options: ChatCompletionOptions
): Promise<string> {
  let full = ''
  await streamChatCompletion(modelId, messages, options, (delta) => {
    full += delta
  })
  return full
}
