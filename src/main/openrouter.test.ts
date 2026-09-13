import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/${name}` },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

const { isUsableForChat } = await import('./openrouter')

function model(overrides: Record<string, unknown>): any {
  return {
    id: 'some-provider/some-model',
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    ...overrides
  }
}

describe('isUsableForChat', () => {
  it('keeps a normal text-in/text-out chat model', () => {
    expect(isUsableForChat(model({}))).toBe(true)
  })

  it('keeps real flagship models regardless of missing supported_parameters metadata', () => {
    // Regression guard: an earlier filter design excluded these based on `supported_parameters`
    // not listing "temperature", which turned out to false-positive on real flagship models.
    expect(isUsableForChat(model({ id: 'anthropic/claude-sonnet-5', supported_parameters: [] }))).toBe(true)
    expect(isUsableForChat(model({ id: 'openai/gpt-5-nano', supported_parameters: [] }))).toBe(true)
  })

  it('excludes :batch pricing-tier duplicates', () => {
    expect(isUsableForChat(model({ id: 'anthropic/claude-sonnet-5:batch' }))).toBe(false)
  })

  it('excludes models with no text output (e.g. embeddings)', () => {
    expect(isUsableForChat(model({ architecture: { input_modalities: ['text'], output_modalities: ['embedding'] } }))).toBe(
      false
    )
  })

  it('excludes moderation/guard/safety-classifier models by id', () => {
    expect(isUsableForChat(model({ id: 'meta-llama/llama-guard-4-12b' }))).toBe(false)
    expect(isUsableForChat(model({ id: 'nvidia/nemotron-3.5-content-safety' }))).toBe(false)
    expect(isUsableForChat(model({ id: 'openai/gpt-oss-safeguard-20b' }))).toBe(false)
    expect(isUsableForChat(model({ id: 'cohere/rerank-v3' }))).toBe(false)
  })
})
