import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { Page } from '../store/appStore'
import { useAppStore } from '../store/appStore'

interface TourStep {
  /** Page to navigate to for this step — omit (or null) to stay put, for the intro/outro cards
   *  that aren't about any one page. */
  page: Page | null
  /** data-tour value to spotlight — a nav icon (bare page id, e.g. "characters") or an in-page
   *  element (e.g. "character-card"). Omit for a centered card with no spotlight. */
  selector: string | null
  /** When true, also switches to the seeded tutorial Act (Nym) so this step has real content
   *  to point at instead of an empty "pick a character" screen. */
  openTutorialChat?: boolean
  title: string
  body: string
}

const TOUR_STEPS: TourStep[] = [
  {
    page: null,
    selector: null,
    title: "🦊Hi, it's Nym ✒️",
    body: "Welcome to Autonym — if you're here, it's because you want to think less about figuring out prompts and more about your lore. As its observing director, I'll show you how everything works here in The Between (you can skip anytime, of course)."
  },

  // Home
  {
    page: 'home',
    selector: 'home',
    title: '🦊Home',
    body: "This is your dashboard, home, headquarters, etc. — it's a snapshot of your writing statistics, including streaks and recent activity."
  },
  {
    page: 'home',
    selector: 'home-recent-acts',
    title: '🦊Recent Acts',
    body: "Every Act you've started shows up here, with the newest at the top. One click will bring you right back into the scene."
  },
  {
    page: 'home',
    selector: 'home-cast',
    title: '🦊Your Cast, Upfront',
    body: 'Skip the casting call and click your desired cast member right from Home.'
  },

  // Cast / Characters
  {
    page: 'characters',
    selector: 'characters',
    title: '🦊Cast',
    body: "Build your cast of characters from labeled fields like appearance, personality, speech style, and background. It feels more like filling in a character sheet than a lengthy prompt."
  },
  {
    page: 'characters',
    selector: 'character-card',
    title: "🦊That's me!",
    body: "My casting card was built the same way your characters will be. You can click into it to see each field and fill it in manually."
  },
  {
    page: 'characters',
    selector: 'new-character-btn',
    title: '🦊Build Someone New',
    body: "You can also paste in text or a Fandom wiki link and the app will structure it for you!"
  },

  // Universes
  {
    page: 'universes',
    selector: 'universes',
    title: '🦊Universes',
    body: 'Universes group your Cast by world or continuity. One Universe per character helps keep Lorebooks and linked variants scoped to the right story.'
  },
  {
    page: 'universes',
    selector: 'universe-detail',
    title: '🦊The Between',
    body: "This is my own Universe, made the same way yours will be. Link an AU or canon variant to a base character and they'll share personality automatically."
  },

  // Lorebooks
  {
    page: 'lorebooks',
    selector: 'lorebooks',
    title: '🦊Lorebooks',
    body: 'Lorebooks store lore entries that are triggered when certain words are mentioned during an Act. When an entry hears its cue, it\'s woven into the Act\'s context automatically.'
  },
  {
    page: 'lorebooks',
    selector: 'lorebook-entry',
    title: '🦊Cue Triggers',
    body: 'This entry fires whenever [threshold], [the gap], or [the between] is mentioned. Try it in your next reply to me!'
  },

  // Acts / Chat
  {
    page: 'chat',
    selector: 'chat',
    openTutorialChat: true,
    title: '🦊Acts',
    body: "This is where the actual writing begins. You're looking at the Act you and I already started — each conversation is called an Act."
  },
  {
    page: 'chat',
    selector: 'chat-input',
    openTutorialChat: true,
    title: '🦊And...Action! 🎬',
    body: "Type your reply here, then press Enter to send it. Scroll up and you'll see every formatting marker already in use — the toolbar can wrap a selection in any of them for you, too."
  },
  {
    page: 'chat',
    selector: 'chat-model-settings-btn',
    openTutorialChat: true,
    title: '🦊Model & Settings⚙️',
    body: "This holds the technical stuff like sampler controls, your Writing Style, a Rating, and a Beat Sheet if you attach one. It's also where you pick who you're playing as."
  },
  {
    page: 'chat',
    selector: 'chat-story-tools-btn',
    openTutorialChat: true,
    title: '🦊Story Tools',
    body: "This covers Director's Notes, exporting, Continue in New Act once things get long, and Compact Older Messages to free up context."
  },

  // Improvise
  {
    page: 'scenarios',
    selector: 'scenarios',
    title: '🦊Improvise🎲',
    body: 'This page holds reusable scene setups and unattended Skits — two ways to give a story shape without writing every beat yourself.'
  },
  {
    page: 'scenarios',
    selector: 'scenario-card',
    title: '🦊Beat Sheets',
    body: "These are loose roadmaps of milestones. I'll pace toward whichever one's current without rushing ahead. You can attach one to any Act from Model & Settings."
  },
  {
    page: 'scenarios',
    selector: 'skits-new-btn',
    title: '🦊Skits',
    body: 'Pick a Cast member and a length, and the AI writes the whole scene unattended, start to finish.'
  },

  // Settings
  {
    page: 'settings',
    selector: 'settings',
    title: '🦊Settings',
    body: "Important settings like your OpenRouter API key, accessibility, Persona presets, and theme colors can be found here."
  },

  {
    page: null,
    selector: null,
    title: '🦊I think that\'s everything! 🎉',
    body: "Time to pick your cast members and start an Act — have fun and enjoy the creative side!"
  }
]

const TOUR_SEEN_KEY = 'autonym:tourSeen'

export function shouldAutoStartTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) !== '1'
  } catch {
    return false
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1')
  } catch {
    // Ignore — worst case the tour offers to run again next launch.
  }
}

/** Spotlights one element at a time via a giant-box-shadow "cutout" trick, with a small card
 *  describing it. Each step actually navigates to the page it's about (and, for the Acts
 *  steps, opens the seeded Nym conversation) so there's always real content behind the card —
 *  never just a description of a nav link. Purely additive over the real app: it only ever
 *  reads/navigates, never edits data, so it's safe to skip, replay, or interrupt anytime. */
export default function TourOverlay(): JSX.Element | null {
  const {
    tourOpen,
    closeTour,
    pushEscapeHandler,
    popEscapeHandler,
    page,
    setPage,
    activeCharacterId,
    setActiveCharacterId,
    activeChatId,
    setActiveChatId
  } = useAppStore()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [tutorialChat, setTutorialChat] = useState<{ characterId: number; chatId: number } | null>(null)
  const preTourStateRef = useRef<{ page: Page; activeCharacterId: number | null; activeChatId: number | null } | null>(
    null
  )

  useEffect(() => {
    if (!tourOpen) return
    setStepIndex(0)
    preTourStateRef.current = { page, activeCharacterId, activeChatId }
    // Look up Nym's seeded Act once per tour run, so the Acts-page steps have something real
    // to open instead of landing on the "pick a character" screen.
    window.api.characters
      .list()
      .then(async (chars) => {
        const nym = chars.find((c) => c.tags.includes('tutorial'))
        if (!nym) return
        const chats = await window.api.chats.listByCharacter(nym.id)
        if (chats[0]) setTutorialChat({ characterId: nym.id, chatId: chats[0].id })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen])

  function finish(): void {
    markTourSeen()
    closeTour()
    const prev = preTourStateRef.current
    if (prev) {
      setPage(prev.page)
      setActiveCharacterId(prev.activeCharacterId)
      setActiveChatId(prev.activeChatId)
    }
  }

  useEffect(() => {
    if (!tourOpen) return
    pushEscapeHandler(finish)
    return () => popEscapeHandler(finish)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen])

  const step = TOUR_STEPS[stepIndex]

  // Navigate for this step. Deliberately separate from the measurement effect below — the
  // measurement effect also depends on the live `page`, so it re-fires once this navigation
  // actually lands and the new page's DOM exists, rather than racing it.
  useEffect(() => {
    if (!tourOpen) return
    if (step.page) setPage(step.page)
    if (step.openTutorialChat && tutorialChat) {
      setActiveCharacterId(tutorialChat.characterId)
      setActiveChatId(tutorialChat.chatId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, stepIndex, tutorialChat])

  useEffect(() => {
    if (!tourOpen || !step.selector) {
      setRect(null)
      return
    }
    let cancelled = false
    let attempts = 0
    function tryMeasure(): void {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.selector}"]`)
      if (el) {
        setRect(el.getBoundingClientRect())
      } else if (attempts < 40) {
        // The target page/chat may still be a render or two away (async data fetch on mount) —
        // retry across a few animation frames rather than giving up on the first miss.
        attempts++
        requestAnimationFrame(tryMeasure)
      } else {
        setRect(null)
      }
    }
    tryMeasure()
    function onResize(): void {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.selector}"]`)
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, stepIndex, page])

  if (!tourOpen) return null

  const isFirst = stepIndex === 0
  const isLast = stepIndex === TOUR_STEPS.length - 1
  const pad = 8

  // A target step actually navigates to (and opens real content on) that page, so the page
  // itself is what's being shown off — no page-wide dim here, just a highlight ring on the
  // spotlighted element. The intro/outro steps have no page to show, so those still dim the
  // background to focus on the centered card.
  const spotlightStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 10,
        boxShadow: '0 0 0 4px var(--accent), 0 0 16px 2px rgba(139, 147, 255, 0.45)',
        pointerEvents: 'none',
        zIndex: 2001,
        transition: 'top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease'
      }
    : {
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 9, 12, 0.72)',
        pointerEvents: 'none',
        zIndex: 2001
      }

  // Anchor the card below-right of the spotlighted element; center it when there's no target.
  const cardStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.min(Math.max(rect.bottom + pad + 10, 16), window.innerHeight - 200),
        left: Math.min(Math.max(rect.right + 16, 16), window.innerWidth - 320),
        zIndex: 2002
      }
    : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2002
      }

  return (
    <>
      <div style={spotlightStyle} />
      <div
        className="panel"
        style={{
          width: 300,
          padding: 18,
          boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
          ...cardStyle
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>{step.title}</h3>
          <button className="msg-action-btn" title="Skip tour" onClick={finish} style={{ flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 16, lineHeight: 1.5, fontSize: 13 }}>
          {step.body}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isFirst && (
              <button className="btn btn-sm" onClick={() => setStepIndex((i) => i - 1)}>
                <ArrowLeft size={13} /> Back
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}>
              {isLast ? 'Done' : 'Next'} {!isLast && <ArrowRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
