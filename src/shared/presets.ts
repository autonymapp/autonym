import type { SamplerSettings } from './types'

/** Fixed model for clerical, non-creative AI tasks (structuring wiki/text into form fields) —
 *  these don't need the user's chosen roleplay model, and Claude models are particularly
 *  reliable at strict JSON output. Cheap/fast tier since the task is simple extraction. */
export const CLERICAL_MODEL_ID = 'anthropic/claude-haiku-4.5'

export interface ChatPreset {
  id: string
  label: string
  description: string
  modelId: string
  samplerSettings: SamplerSettings
}

export const CHAT_PRESETS: ChatPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced RP',
    description:
      'Well-rounded roleplay: coherent, in-character, moderately creative. A good default for most characters.',
    modelId: 'anthropic/claude-sonnet-5',
    samplerSettings: { temperature: 0.9, topP: 1, maxTokens: 600, contextLength: 16000 }
  },
  {
    id: 'vivid',
    label: 'Vivid & Creative',
    description:
      'Higher temperature for more unpredictable, colorful responses. Great for chaotic, whimsical, or highly expressive characters.',
    modelId: 'anthracite-org/magnum-v4-72b',
    samplerSettings: { temperature: 1.15, topP: 0.95, maxTokens: 700, contextLength: 16000 }
  },
  {
    id: 'dedicated-rp',
    label: 'Dedicated RP Model (Budget)',
    description:
      'A model fine-tuned specifically for roleplay and character chat, and inexpensive to run.',
    modelId: 'sao10k/l3.3-euryale-70b',
    samplerSettings: { temperature: 1.0, topP: 1, maxTokens: 500, contextLength: 16000 }
  },
  {
    id: 'fast-cheap',
    label: 'Fast & Cheap',
    description: 'Small, fast, low-cost model. Good for quick chats or trying out a new character.',
    modelId: 'openai/gpt-5-nano',
    samplerSettings: { temperature: 0.85, topP: 1, maxTokens: 400, contextLength: 16000 }
  }
]
