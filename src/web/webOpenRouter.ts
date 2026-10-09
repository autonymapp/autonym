import type { OpenRouterModel } from '@shared/types'

const KEY_STORAGE_KEY = 'autonym:openrouter_key'
const API_BASE = 'https://openrouter.ai/api/v1'

export function hasApiKey(): boolean {
  const key = localStorage.getItem(KEY_STORAGE_KEY)
  return Boolean(key && key.trim().length > 0)
}

export function saveApiKey(plainKey: string): void {
  localStorage.setItem(KEY_STORAGE_KEY, plainKey.trim())
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE_KEY)
}

export function getApiKey(): string {
  const key = localStorage.getItem(KEY_STORAGE_KEY)
  if (!key || !key.trim()) {
    throw new Error('No OpenRouter API key configured. Add one in Settings.')
  }
  return key.trim()
}

let modelsCache: OpenRouterModel[] | null = null

const NON_CHAT_ID_PATTERN = /embed|rerank|\bguard\b|moderation|safeguard|safety|content-filter/i

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

interface CacheableContentBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

interface OutgoingMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | CacheableContentBlock[]
}

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
      'HTTP-Referer': window.location.origin || 'https://autonym.app',
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
