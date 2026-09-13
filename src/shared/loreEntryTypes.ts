import type { LoreEntryType } from './types'

export interface LoreFieldSpec {
  key: string
  label: string
  hint: string
}

/** Shown on every entry type, in `fields`, alongside the type-specific questions —
 *  the direct fix for a model inventing details ("Au Ra don't have visible ears" etc.). */
export const COMMON_MISTAKES_FIELD_KEY = 'commonMistakes'

export interface LoreEntryTypeSpec {
  label: string
  icon: string
  fields: LoreFieldSpec[]
}

export const LORE_ENTRY_TYPES: Record<LoreEntryType, LoreEntryTypeSpec> = {
  location: {
    label: 'Location',
    icon: '📍',
    fields: [
      { key: 'whereItIs', label: 'Where It Is', hint: 'Geography, region, how it relates to other places' },
      { key: 'climate', label: 'Climate & Environment', hint: 'Weather, terrain, atmosphere' },
      { key: 'importance', label: 'Importance to the Story', hint: 'Why this place matters' },
      { key: 'associatedCharacters', label: 'Associated Characters', hint: 'Who lives there or is connected to it' },
      { key: 'notableFeatures', label: 'Notable Features', hint: 'Landmarks, secrets, distinguishing details' }
    ]
  },
  character: {
    label: 'Character (NPC)',
    icon: '🧑',
    fields: [
      { key: 'appearance', label: 'Appearance', hint: 'What they look like' },
      { key: 'personality', label: 'Personality', hint: 'Traits, quirks, how they act' },
      { key: 'role', label: 'Role in the Story', hint: 'How they fit into the world/plot' },
      { key: 'relationships', label: 'Relationships', hint: 'Connections to other characters' }
    ]
  },
  species: {
    label: 'Species / Race',
    icon: '🐾',
    fields: [
      { key: 'physicalTraits', label: 'Physical Traits', hint: 'Body, features, distinguishing traits — be specific about what they do and do NOT have' },
      { key: 'culture', label: 'Culture & Society', hint: 'Customs, values, how they typically live' },
      { key: 'abilities', label: 'Abilities / Traits', hint: 'Special capabilities, weaknesses, biology' },
      { key: 'notableExamples', label: 'Notable Examples', hint: 'Well-known individuals of this species/race' }
    ]
  },
  item: {
    label: 'Item / Artifact',
    icon: '🗝️',
    fields: [
      { key: 'appearance', label: 'Appearance', hint: 'What it looks like' },
      { key: 'powersOrProperties', label: 'Powers / Properties', hint: 'What it does, if anything' },
      { key: 'origin', label: 'Origin / History', hint: 'Where it came from' },
      { key: 'currentOwner', label: 'Current Owner / Location', hint: 'Who has it now, or where it is' }
    ]
  },
  organization: {
    label: 'Organization / Faction',
    icon: '🏛️',
    fields: [
      { key: 'purpose', label: 'Purpose / Goals', hint: 'What they want, why they exist' },
      { key: 'members', label: 'Key Members', hint: 'Notable people involved' },
      { key: 'reputation', label: 'Reputation', hint: 'How others see them' },
      { key: 'history', label: 'History', hint: 'How they formed, key past events' }
    ]
  },
  event: {
    label: 'Event',
    icon: '📅',
    fields: [
      { key: 'when', label: 'When It Happened', hint: 'Timing, relative to the story' },
      { key: 'whatHappened', label: 'What Happened', hint: 'A summary of events' },
      { key: 'whoWasInvolved', label: 'Who Was Involved', hint: 'Key participants' },
      { key: 'consequences', label: 'Consequences', hint: 'What changed afterward' }
    ]
  },
  concept: {
    label: 'Concept / Lore',
    icon: '📖',
    fields: [
      { key: 'explanation', label: 'Explanation', hint: 'What it is and how it works' },
      { key: 'significance', label: 'Significance', hint: 'Why it matters to the world or story' }
    ]
  },
  other: {
    label: 'Other / General',
    icon: '🔖',
    fields: [
      { key: 'appearance', label: 'Appearance', hint: 'Optional' },
      { key: 'history', label: 'History', hint: 'Optional' },
      { key: 'details', label: 'Other Details', hint: 'Anything else worth noting' }
    ]
  }
}
