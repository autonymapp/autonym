import { useEffect, useState } from 'react'
import type { Scenario, ScenarioInput } from '@shared/types'
import MilestoneEditor from '../components/MilestoneEditor'
import AutoGrowTextarea from '../components/AutoGrowTextarea'
import { useConfirm } from '../components/ConfirmDialog'
import ContextMenu from '../components/ContextMenu'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'

export default function ScenarioMakerPage(): JSX.Element {
  const confirm = useConfirm()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scenarioContextMenu, setScenarioContextMenu] = useState<{ scenarioId: number; x: number; y: number } | null>(
    null
  )
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [milestones, setMilestones] = useState<string[]>([])

  async function refresh(): Promise<void> {
    setScenarios(await window.api.scenarios.list())
  }

  useEffect(() => {
    refresh()
  }, [])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Scenario Maker</h2>
        <button className="btn btn-primary" onClick={() => startEdit('new')}>
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
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="card"
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
    </div>
  )
}
