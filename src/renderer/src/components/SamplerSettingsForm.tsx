import type { SamplerSettings } from '@shared/types'

export default function SamplerSettingsForm({
  value,
  onChange,
  maxContextLength
}: {
  value: SamplerSettings
  onChange: (settings: SamplerSettings) => void
  /** The selected model's real context window, when known — caps the Scene Memory field so it
   *  can't be set past what the model actually supports. */
  maxContextLength?: number
}): JSX.Element {
  function set<K extends keyof SamplerSettings>(key: K, val: SamplerSettings[K]): void {
    onChange({ ...value, [key]: val })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Creativity (Temperature): {value.temperature.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={value.temperature}
          onChange={(e) => set('temperature', parseFloat(e.target.value))}
        />
        <span className="hint">
          Higher lets the AI take more unpredictable, surprising turns; lower keeps it more focused
          and consistent.
        </span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Word Variety (Top P): {value.topP.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value.topP}
          onChange={(e) => set('topP', parseFloat(e.target.value))}
        />
        <span className="hint">
          Controls how many different word choices the AI considers at each step. Lower narrows it
          to safer, more predictable phrasing.
        </span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Max Reply Length (Max Tokens)</span>
        <input
          type="number"
          min={16}
          max={8192}
          value={value.maxTokens}
          onChange={(e) => set('maxTokens', parseInt(e.target.value) || 16)}
        />
        <span className="hint">The longest a single response can be.</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Scene Memory (Context Length)</span>
        <input
          type="number"
          min={512}
          max={maxContextLength ?? 200000}
          value={value.contextLength}
          onChange={(e) =>
            set(
              'contextLength',
              Math.min(parseInt(e.target.value) || 512, maxContextLength ?? 200000)
            )
          }
        />
        <span className="hint">
          {maxContextLength
            ? `How much of the conversation the AI can recall at once. This model supports up to ${maxContextLength.toLocaleString()} tokens — switching models resets this to match.`
            : 'How much of the conversation the AI can recall at once. Higher remembers more, but costs more per message.'}
        </span>
      </label>

      <div className="section-title">Advanced (Optional)</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Vocabulary Limit (Top K)</span>
        <input
          type="number"
          min={0}
          placeholder="unset"
          value={value.topK ?? ''}
          onChange={(e) => set('topK', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <span className="hint">
          Restricts the AI to its top N most-likely next words. Leave unset for no limit.
        </span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Avoid Repeats (Repetition Penalty)</span>
        <input
          type="number"
          step={0.01}
          placeholder="unset"
          value={value.repetitionPenalty ?? ''}
          onChange={(e) =>
            set('repetitionPenalty', e.target.value ? parseFloat(e.target.value) : undefined)
          }
        />
        <span className="hint">
          Discourages the AI from repeating words or phrases it's already used.
        </span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Avoid Overused Words (Frequency Penalty)</span>
        <input
          type="number"
          step={0.01}
          placeholder="unset"
          value={value.frequencyPenalty ?? ''}
          onChange={(e) =>
            set('frequencyPenalty', e.target.value ? parseFloat(e.target.value) : undefined)
          }
        />
        <span className="hint">Reduces how often the AI leans on words it already uses a lot.</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>Encourage New Topics (Presence Penalty)</span>
        <input
          type="number"
          step={0.01}
          placeholder="unset"
          value={value.presencePenalty ?? ''}
          onChange={(e) =>
            set('presencePenalty', e.target.value ? parseFloat(e.target.value) : undefined)
          }
        />
        <span className="hint">
          Nudges the AI toward introducing new ideas instead of sticking to what's already been said.
        </span>
      </label>
    </div>
  )
}
