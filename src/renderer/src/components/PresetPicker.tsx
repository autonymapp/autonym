import { Check, Save, X } from 'lucide-react'
import { CHAT_PRESETS } from '@shared/presets'
import type { CustomPreset, SamplerSettings } from '@shared/types'

function isActive(
  currentModelId: string,
  currentSamplerSettings: SamplerSettings,
  modelId: string,
  samplerSettings: SamplerSettings
): boolean {
  return (
    currentModelId === modelId &&
    JSON.stringify(currentSamplerSettings) === JSON.stringify(samplerSettings)
  )
}

export default function PresetPicker({
  customPresets,
  currentModelId,
  currentSamplerSettings,
  onApply,
  onSaveCustom,
  onDeleteCustom
}: {
  customPresets: CustomPreset[]
  currentModelId: string
  currentSamplerSettings: SamplerSettings
  onApply: (modelId: string, samplerSettings: SamplerSettings) => void
  onSaveCustom: (id: number) => void
  onDeleteCustom: (id: number) => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {customPresets.length > 0 && (
        <>
          <div className="section-title">Your Imported Styles</div>
          {customPresets.map((preset) => {
            const active = isActive(
              currentModelId,
              currentSamplerSettings,
              preset.modelId,
              preset.samplerSettings
            )
            return (
              <div
                key={preset.id}
                className={`card interactive${active ? ' active' : ''}`}
                style={{ display: 'flex', alignItems: 'stretch', gap: 4, padding: 0 }}
              >
                <button
                  onClick={() => onApply(preset.modelId, preset.samplerSettings)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    padding: 10,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {preset.name} {active && <Check size={13} style={{ color: 'var(--accent)' }} />}
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>
                    Model: {preset.modelId || '(unset — pick one in Advanced)'}
                  </div>
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => onSaveCustom(preset.id)}
                  title="Overwrite this style with your act's current model & performance settings"
                  style={{
                    border: 'none',
                    padding: '0 10px',
                    borderRadius: 0,
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  <Save size={14} />
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => onDeleteCustom(preset.id)}
                  title="Delete style"
                  style={{
                    border: 'none',
                    color: 'var(--danger)',
                    padding: '0 12px',
                    borderRadius: 0,
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
          <div className="section-title" style={{ marginTop: 6 }}>Built-In Styles</div>
        </>
      )}
      {CHAT_PRESETS.map((preset) => {
        const active = isActive(
          currentModelId,
          currentSamplerSettings,
          preset.modelId,
          preset.samplerSettings
        )
        return (
          <button
            key={preset.id}
            onClick={() => onApply(preset.modelId, preset.samplerSettings)}
            className={`card interactive${active ? ' active' : ''}`}
            style={{ textAlign: 'left', color: 'var(--text)' }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              {preset.label} {active && <Check size={13} style={{ color: 'var(--accent)' }} />}
            </div>
            <div className="hint" style={{ marginTop: 2 }}>{preset.description}</div>
            <div className="hint" style={{ marginTop: 4 }}>Model: {preset.modelId}</div>
          </button>
        )
      })}
      <p className="hint">
        If a style's model has been renamed or retired on OpenRouter, switch to Advanced to pick a
        different one.
      </p>
    </div>
  )
}
