import type { Character, CharacterRelationship, ChatMessage, ContentIntensity, LoreEntry, Lorebook, MoodPreset, Persona, RpMode, Scenario } from './types'
import { COMMON_MISTAKES_FIELD_KEY, LORE_ENTRY_TYPES } from './loreEntryTypes'

const CANON_SETTING_INSTRUCTION =
  'Some of the world knowledge below describes an established setting from an existing franchise (a game, show, book, etc.), not something original — treat those facts as strict canon. ' +
  "Don't invent additional species traits, geography, history, or world mechanics beyond what's stated below or is well-established general knowledge of that setting, and if unsure about a specific detail, stay vague rather than guessing something that could be wrong."

const LOREBOOK_SCAN_MESSAGES = 6

const RP_MODE_INSTRUCTIONS: Record<RpMode, string> = {
  narrative:
    'Write in a story/narrative roleplay style: descriptive prose with narration of actions, expressions, and surroundings, alongside dialogue. Use third person unless the character sheet says otherwise. ' +
    'Formatting convention — apply this consistently in every response: wrap spoken dialogue in "double quotes", wrap physical actions/narration in *asterisks*, and wrap internal thoughts in ~tildes~. ' +
    "If an action or thought beat interrupts a line of speech, close the open quote before it and open a fresh one after — never leave dialogue \"unclosed\" across an *action* or ~thought~ aside, since each marker must be self-contained and not nested inside another.",
  dm:
    'Write in a direct-message/texting style: short, casual chat lines only, like the character is texting the user. No narration, no scene-setting, no describing actions or surroundings in prose — just what they would actually type. ' +
    'Formatting convention: write dialogue as plain text (no quote marks needed, like a real text message); skip *asterisk* actions/narration entirely in this mode; if you want to reveal an internal thought, wrap it in ~tildes~.'
}

const COLLABORATIVE_MODE_INSTRUCTION_TEMPLATE = (name: string): string =>
  `Collaborative mode is on for this chat: treat ${name}'s background, scenario, and setting above as flexible rather than fixed canon — this may be a different time period, world, or life circumstance than their usual one. Their core personality, speech style, and relationships still apply as who they fundamentally are, but work together with the user to establish what's new: ask questions, suggest ideas, and build on what they contribute rather than assuming their default backstory carries over unless they say it does. Feel free to offer draft scene ideas or details to react to, but treat them as discussion points to revise together, not settled fact.`

const OOC_INSTRUCTION =
  'Out-of-character (OOC) notes: if a message contains text wrapped in ((double parentheses)), that\'s the user speaking to you directly, outside the roleplay — not something their character says or does. ' +
  'Answer it plainly and honestly, wrapped in ((double parentheses)) yourself, breaking character briefly to do so, then continue the roleplay normally.'

const MOOD_INSTRUCTIONS: Record<MoodPreset, string> = {
  'slow-burn':
    'Pacing for this scene: this is a slow burn. Prioritize subtext, physical boundaries, and emotional hesitation over resolution. ' +
    "Do not let the character offer a premature confession, a sudden reconciliation, or rush toward intimacy — let tension sit unresolved and build gradually across many turns rather than wrapping it up quickly.",
  'high-action':
    'Pacing for this scene: high action and grit. Favor shorter, punchier sentences. Focus heavily on physical positioning, momentum, and environmental danger. ' +
    'Keep dialogue fast, urgent, and clipped — this is not the moment for long introspective passages.',
  cinematic:
    'Pacing for this scene: cinematic and atmospheric. Emphasize sensory detail — sound, weather, light, texture. ' +
    'Slow the conversational pacing down and lean into evocative, atmospheric prose over quick back-and-forth exchanges.',
  'slice-of-life':
    'Pacing for this scene: slice of life / banter. Drop dramatic stakes. Focus on natural conversational flow, lighthearted humor, everyday interactions, and comfortable pauses rather than manufacturing tension.'
}

const CONTENT_INTENSITY_INSTRUCTIONS: Partial<Record<ContentIntensity, string>> = {
  mature:
    'Content intensity: this is adult fiction between consenting fictional characters. On-screen romantic/sexual content and graphic violence are permitted where the story calls for it, written with literary craft rather than gratuitously.',
  explicit:
    'Content intensity: this is adult fiction between consenting fictional characters. Explicit sexual content is permitted and should be depicted directly rather than fading to black or cutting away, when the story calls for it.'
}

function characterToSystemPrompt(character: Character, rpMode: RpMode): string {
  const parts: string[] = [`You are ${character.name}.`]
  if (character.appearance) parts.push(`Appearance: ${character.appearance}`)
  if (character.personality) parts.push(`Personality: ${character.personality}`)
  if (character.speechStyle) parts.push(`Speech style: ${character.speechStyle}`)
  if (character.background) parts.push(`Background: ${character.background}`)
  if (character.relationships) parts.push(`Relationships: ${character.relationships}`)
  if (character.scenario) parts.push(`Current scenario: ${character.scenario}`)
  if (character.notes) parts.push(character.notes)
  parts.push(
    `Stay in character as ${character.name} at all times. Respond naturally in character, never break the fourth wall unless explicitly asked to.`
  )
  parts.push(RP_MODE_INSTRUCTIONS[rpMode])
  parts.push(OOC_INSTRUCTION)
  return parts.join('\n')
}

function groupCastToPrompt(groupCharacters: Character[], primary: Character): string {
  const castList = groupCharacters
    .map((c) => {
      const traits = [
        c.appearance && `Appearance: ${c.appearance}`,
        c.personality && `Personality: ${c.personality}`,
        c.speechStyle && `Speech style: ${c.speechStyle}`,
        c.background && `Background: ${c.background}`
      ].filter(Boolean)
      return traits.length > 0 ? `${c.name} —\n${traits.join('\n')}` : c.name
    })
    .join('\n\n')
  const exampleName = groupCharacters[0]?.name ?? 'CharacterName'
  return (
    `This is a Group Scene: besides ${primary.name}, these other cast members are also present and may speak:\n${castList}\n\n` +
    `Only write one character's turn per response — pick whichever character would naturally speak or react next, and never speak for the user's own character. ` +
    `When you write as ${primary.name}, nothing changes from normal. When you write as anyone else in the scene, start that turn with a speaker cue in this exact format: **Name:** — for example "**${exampleName}:** ...".`
  )
}

function personaToPrompt(persona: Persona): string {
  return `The user is playing as ${persona.name}${persona.description ? `: ${persona.description}` : '.'}`
}

function impersonatedCharacterToPrompt(character: Character): string {
  const parts: string[] = [`The user is roleplaying as the character ${character.name}, not as themselves.`]
  if (character.appearance) parts.push(`${character.name}'s appearance: ${character.appearance}`)
  if (character.personality) parts.push(`${character.name}'s personality: ${character.personality}`)
  if (character.speechStyle) parts.push(`${character.name}'s speech style: ${character.speechStyle}`)
  if (character.background) parts.push(`${character.name}'s background: ${character.background}`)
  if (character.relationships) parts.push(`${character.name}'s relationships: ${character.relationships}`)
  parts.push(
    `Treat every user message in this chat as something ${character.name} says or does, and respond to ${character.name} accordingly — never address the user as a generic "user" or break the roleplay to acknowledge them outside of ${character.name}.`
  )
  return parts.join('\n')
}

function relationshipToPrompt(
  relationship: CharacterRelationship,
  character: Character,
  impersonatingCharacter: Character
): string {
  const label = relationship.label ? ` (${relationship.label})` : ''
  return `Relationship between ${character.name} and ${impersonatingCharacter.name}${label}: ${relationship.description}`
}

function priorSummaryToPrompt(summary: string): string {
  return `Previously, in this ongoing story:\n${summary}\n\nContinue from here, staying consistent with everything above.`
}

function inFictionDateToPrompt(date: string): string {
  return `Current in-story date/time: ${date}`
}

function directorsNotesToPrompt(notes: string): string {
  return `Director's notes for this act (out-of-character instructions from the user for how this story should play out):\n${notes}`
}

function scenarioToPrompt(scenario: Scenario, milestoneIndex: number): string {
  const parts: string[] = [`Scene: ${scenario.description}`]
  if (scenario.milestones.length > 0) {
    const clampedIndex = Math.min(milestoneIndex, scenario.milestones.length - 1)
    const lines = scenario.milestones.map((m, i) => {
      const tag = i < clampedIndex ? '(already happened)' : i === clampedIndex ? '← current focus' : ''
      return `${i + 1}. ${m}${tag ? '  ' + tag : ''}`
    })
    parts.push(
      'Story roadmap — a loose sequence of milestones for how this roleplay should unfold. ' +
        'Work toward the beat marked "current focus" naturally; do not rush to it or resolve it in a single message, ' +
        "and don't skip ahead to later beats or reveal them outright, though subtle foreshadowing is fine. " +
        'Treat earlier beats marked "already happened" as settled backstory for this conversation.\n' +
        lines.join('\n')
    )
  }
  return parts.join('\n\n')
}

function loreEntryToText(entry: LoreEntry): string {
  const parts: string[] = [`${entry.title}:`]
  if (entry.description) parts.push(entry.description)
  const spec = LORE_ENTRY_TYPES[entry.entryType]
  for (const field of spec.fields) {
    const value = entry.fields[field.key]
    if (value && value.trim()) parts.push(`${field.label}: ${value}`)
  }
  const commonMistakes = entry.fields[COMMON_MISTAKES_FIELD_KEY]
  if (commonMistakes && commonMistakes.trim()) {
    parts.push(`⚠️ Do NOT include/assume: ${commonMistakes}`)
  }
  return parts.join(' ')
}

export function matchLoreEntries(entries: LoreEntry[], recentText: string): LoreEntry[] {
  const haystack = recentText.toLowerCase()
  return entries.filter(
    (entry) =>
      entry.enabled &&
      entry.keywords.some((kw) => kw.trim().length > 0 && haystack.includes(kw.trim().toLowerCase()))
  )
}

/** Rough token estimate: ~4 chars per token for English text. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface AssembledPrompt {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  matchedLoreEntries: LoreEntry[]
}

export function assemblePrompt(params: {
  character: Character
  persona: Persona | null
  impersonatingCharacter: Character | null
  relationship: CharacterRelationship | null
  scenario: Scenario | null
  scenarioMilestoneIndex: number
  priorSummary: string | null
  directorsNotes: string
  inFictionDate: string | null
  groupCharacters: Character[]
  loreEntries: LoreEntry[]
  lorebooks: Lorebook[]
  history: ChatMessage[]
  contextLength: number
  rpMode: RpMode
  collaborativeMode: boolean
  moodPreset: MoodPreset | null
  contentIntensity: ContentIntensity
}): AssembledPrompt {
  const {
    character,
    persona,
    impersonatingCharacter,
    relationship,
    scenario,
    scenarioMilestoneIndex,
    priorSummary,
    directorsNotes,
    inFictionDate,
    groupCharacters,
    loreEntries,
    lorebooks,
    history,
    contextLength,
    rpMode,
    collaborativeMode,
    moodPreset,
    contentIntensity
  } = params

  // Messages folded into priorSummary by "Compact Older Messages" stay in the visible transcript
  // but no longer count against the context budget or feed lorebook keyword matching.
  const activeHistory = history.filter((m) => !m.excludedFromContext)

  const recentText = activeHistory
    .slice(-LOREBOOK_SCAN_MESSAGES)
    .map((m) => m.content)
    .join('\n')
  const matched = matchLoreEntries(loreEntries, recentText)
  const anyCanonSetting = matched.some(
    (entry) => lorebooks.find((lb) => lb.id === entry.lorebookId)?.isCanonSetting
  )

  let systemPrompt = characterToSystemPrompt(character, rpMode)
  if (groupCharacters.length > 0) {
    systemPrompt += `\n\n${groupCastToPrompt(groupCharacters, character)}`
  }
  if (directorsNotes) {
    systemPrompt += `\n\n${directorsNotesToPrompt(directorsNotes)}`
  }
  if (collaborativeMode) {
    systemPrompt += `\n\n${COLLABORATIVE_MODE_INSTRUCTION_TEMPLATE(character.name)}`
  }
  if (moodPreset) {
    systemPrompt += `\n\n${MOOD_INSTRUCTIONS[moodPreset]}`
  }
  const contentIntensityInstruction = CONTENT_INTENSITY_INSTRUCTIONS[contentIntensity]
  if (contentIntensityInstruction) {
    systemPrompt += `\n\n${contentIntensityInstruction}`
  }
  if (priorSummary) {
    systemPrompt += `\n\n${priorSummaryToPrompt(priorSummary)}`
  }
  if (scenario) {
    systemPrompt += `\n\n${scenarioToPrompt(scenario, scenarioMilestoneIndex)}`
  }
  if (inFictionDate) {
    systemPrompt += `\n\n${inFictionDateToPrompt(inFictionDate)}`
  }
  if (matched.length > 0) {
    systemPrompt += `\n\nRelevant world knowledge:\n${matched.map(loreEntryToText).join('\n')}`
    if (anyCanonSetting) {
      systemPrompt += `\n\n${CANON_SETTING_INSTRUCTION}`
    }
  }
  if (impersonatingCharacter) {
    systemPrompt += `\n\n${impersonatedCharacterToPrompt(impersonatingCharacter)}`
    if (relationship) {
      systemPrompt += `\n\n${relationshipToPrompt(relationship, character, impersonatingCharacter)}`
    }
  } else if (persona) {
    systemPrompt += `\n\n${personaToPrompt(persona)}`
  }

  const systemTokens = estimateTokens(systemPrompt)
  const budget = Math.max(contextLength - systemTokens - 512, 512) // reserve room for the reply

  const trimmedHistory: ChatMessage[] = []
  let used = 0
  for (let i = activeHistory.length - 1; i >= 0; i--) {
    const msg = activeHistory[i]
    const cost = estimateTokens(msg.content)
    if (used + cost > budget && trimmedHistory.length > 0) break
    trimmedHistory.unshift(msg)
    used += cost
  }

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory.map((m) => ({
        role: m.role === 'system' ? ('system' as const) : m.role,
        content: m.content
      }))
    ],
    matchedLoreEntries: matched
  }
}
