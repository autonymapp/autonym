import { useEffect, useState } from 'react'
import type { Chat, Character, Scenario, ScenarioInput } from '@shared/types'
import { CHAT_PRESETS } from '@shared/presets'
import MilestoneEditor from '../components/MilestoneEditor'
import AutoGrowTextarea from '../components/AutoGrowTextarea'
import Avatar from '../components/Avatar'
import { useConfirm } from '../components/ConfirmDialog'
import ContextMenu from '../components/ContextMenu'
import { useAppStore } from '../store/appStore'
import { ArrowLeft, Pencil, Sparkles, Trash2 } from 'lucide-react'

type SkitLength = 'short' | 'medium'

export default function ScenarioMakerPage(): JSX.Element {
  const { setPage, setActiveCharacterId, setActiveChatId } = useAppStore()
  const confirm = useConfirm()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scenarioContextMenu, setScenarioContextMenu] = useState<{ scenarioId: number; x: number; y: number } | null>(
    null
  )
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [milestones, setMilestones] = useState<string[]>([])

  const [characters, setCharacters] = useState<Character[]>([])
  const [skits, setSkits] = useState<Chat[]>([])
  const [creatingSkit, setCreatingSkit] = useState(false)
  const [skitCharacterId, setSkitCharacterId] = useState<number | null>(null)
  const [skitLength, setSkitLength] = useState<SkitLength>('short')

  async function refresh(): Promise<void> {
    setScenarios(await window.api.scenarios.list())
  }

  async function refreshSkits(): Promise<void> {
    const [chats, chars] = await Promise.all([window.api.chats.listAll(), window.api.characters.list()])
    setSkits(chats.filter((c) => c.isSkit))
    setCharacters(chars)
    if (skitCharacterId === null && chars.length > 0) setSkitCharacterId(chars[0].id)
  }

  useEffect(() => {
    refresh()
    refreshSkits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createSkit(): Promise<void> {
    if (!skitCharacterId) return
    const preset = CHAT_PRESETS[0]
    const chat = await window.api.chats.create({
      characterId: skitCharacterId,
      personaId: null,
      impersonatingCharacterId: null,
      scenarioId: null,
      scenarioMilestoneIndex: 0,
      priorSummary: null,
      storylineId: null,
      collaborativeMode: false,
      tags: [],
      directorsNotes: '',
      inFictionDate: null,
      groupCharacterIds: [],
      universeId: null,
      isSkit: true,
      skitLength,
      moodPreset: null,
      contentIntensity: 'standard',
      title: `Skit ${skits.length + 1}`,
      modelId: preset.modelId,
      rpMode: 'narrative',
      samplerSettings: preset.samplerSettings
    })
    setCreatingSkit(false)
    openSkit(chat)
  }

  function openSkit(chat: Chat): void {
    setActiveCharacterId(chat.characterId)
    setActiveChatId(chat.id)
    setPage('chat')
  }

  async function deleteSkit(chat: Chat): Promise<void> {
    if (!(await confirm(`Delete "${chat.title}"? This can't be undone.`, { title: 'Delete this Skit?' }))) return
    await window.api.chats.delete(chat.id)
    setSkits((prev) => prev.filter((c) => c.id !== chat.id))
  }

  function startEdit(s: Scenario | 'new'): void {
    if (s === 'new') {
      setName('')
      setDescription('')
      setMilestones([])
    } else {
      setName(s.name)
      setDescription(s.description)
      setMilestones(s.milestones)
    }
    setEditing(s)
  }

  async function save(): Promise<void> {
    const input: ScenarioInput = {
      name,
      description,
      milestones: milestones.map((m) => m.trim()).filter(Boolean)
    }
    if (editing === 'new') {
      await window.api.scenarios.create(input)
    } else if (editing) {
      await window.api.scenarios.update(editing.id, input)
    }
    setEditing(null)
    refresh()
  }

  async function remove(s: Scenario): Promise<void> {
    if (!(await confirm(`Acts using "${s.name}" will just be detached from it — they aren't deleted.`, { title: 'Delete this scenario?' })))
      return
    await window.api.scenarios.delete(s.id)
    refresh()
  }

  if (editing) {
    return (
      <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(null)}
          style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h2 style={{ marginBottom: 4 }}>{editing === 'new' ? 'New Scenario' : `Edit ${editing.name}`}</h2>
        <p className="hint" style={{ marginBottom: 18 }}>
          Describe the scene, then loosely lay out the story beats you want the roleplay to work
          toward — the AI will pace itself toward the current one without rushing or skipping ahead.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
          <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label className="field">
              <span className="label">Scenario Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First Meeting at the Academy" />
            </label>

            <label className="field">
              <span className="label">Scene</span>
              <span className="hint">Set the stage — where things start and what's true at the outset.</span>
              <AutoGrowTextarea
                rows={4}
                value={description}
                onChange={setDescription}
                placeholder="e.g. My character meets yours for the first time at a crowded market square."
              />
            </label>

            <div className="field">
              <span className="label">Beat Sheet</span>
              <span className="hint">
                Loose, ordered milestones. The AI treats earlier ones as already-happened backstory and
                paces toward the current one — it won't skip ahead or reveal later beats outright.
              </span>
              <MilestoneEditor milestones={milestones} onChange={setMilestones} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={!name.trim() || !description.trim()}>
              Save
            </button>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: 4 }}>Improvise</h2>
      <p className="hint" style={{ marginBottom: 24 }}>
        Reusable scene setups and unattended Skits — the two ways to hand a story some shape
        without writing every beat of it yourself.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-title" style={{ margin: 0 }}>Scenarios</div>
        <button className="btn btn-primary btn-sm" onClick={() => startEdit('new')}>
          + New Scenario
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8, marginBottom: 20 }}>
        Reusable scene setups with a loose roadmap of milestones. Attach one to any act from its
        Model & Settings panel.
      </p>

      {scenarios.length === 0 ? (
        <div className="empty-state">No scenarios yet. Create one to get started.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {scenarios.map((s, i) => (
            <div
              key={s.id}
              className="card"
              data-tour={i === 0 ? 'scenario-card' : undefined}
              onContextMenu={(e) => {
                e.preventDefault()
                setScenarioContextMenu({ scenarioId: s.id, x: e.clientX, y: e.clientY })
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <p
                className="hint"
                style={{
                  marginTop: 6,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}
              >
                {s.description}
              </p>
              <div className="hint" style={{ marginTop: 8 }}>
                {s.milestones.length} milestone{s.milestones.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button className="btn btn-sm" onClick={() => startEdit(s)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(s)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {scenarioContextMenu &&
        (() => {
          const menuScenario = scenarios.find((s) => s.id === scenarioContextMenu.scenarioId)
          if (!menuScenario) return null
          return (
            <ContextMenu
              x={scenarioContextMenu.x}
              y={scenarioContextMenu.y}
              onClose={() => setScenarioContextMenu(null)}
              items={[
                { label: 'Edit', icon: Pencil, onClick: () => startEdit(menuScenario) },
                { label: 'Delete', icon: Trash2, onClick: () => remove(menuScenario), danger: true }
              ]}
            />
          )
        })()}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
        <div className="section-title" style={{ margin: 0 }}>Skits</div>
        {!creatingSkit && (
          <button
            className="btn btn-primary btn-sm"
            data-tour="skits-new-btn"
            onClick={() => setCreatingSkit(true)}
            disabled={characters.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={13} /> New Skit
          </button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8, marginBottom: 20 }}>
        Unattended short-story generation — pick a Cast member and a length, and the AI writes a
        complete scene end to end. {characters.length === 0 && 'Add a Cast member first to create one.'}
      </p>

      {creatingSkit && (
        <div className="panel" style={{ padding: 14, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
          <label className="field">
            <span className="label">Cast member</span>
            <select
              value={skitCharacterId ?? ''}
              onChange={(e) => setSkitCharacterId(parseInt(e.target.value))}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented">
            <button className={skitLength === 'short' ? 'active' : ''} onClick={() => setSkitLength('short')}>
              Short
            </button>
            <button className={skitLength === 'medium' ? 'active' : ''} onClick={() => setSkitLength('medium')}>
              Medium
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={createSkit} disabled={!skitCharacterId}>
              Create Skit
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreatingSkit(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {skits.length === 0 ? (
        <div className="empty-state">No Skits yet. Create one to get started.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {skits.map((skit) => {
            const skitCharacter = characters.find((c) => c.id === skit.characterId)
            return (
              <div key={skit.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openSkit(skit)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar
                    avatarType={skitCharacter?.avatarType}
                    src={skitCharacter?.avatarPath ?? null}
                    emoji={skitCharacter?.avatarEmoji}
                    name={skitCharacter?.name ?? '?'}
                    size={26}
                  />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{skit.title}</div>
                </div>
                <div className="hint" style={{ marginTop: 8 }}>
                  {skitCharacter?.name ?? 'Unknown'} · {skit.skitLength === 'medium' ? 'Medium' : 'Short'}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openSkit(skit) }}>
                    Open
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSkit(skit)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
