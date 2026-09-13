import type { CharacterInput } from './types'

/** The guided field set for a character sheet — shared between CharacterForm.tsx (the editing UI)
 *  and characterImport.ts (the wiki/text-to-fields extraction prompt), so both stay in sync. */
export const CHARACTER_FIELDS: { key: keyof CharacterInput; label: string; hint: string; multiline: boolean }[] = [
  { key: 'name', label: 'Name', hint: "The character's name", multiline: false },
  {
    key: 'appearance',
    label: 'Appearance',
    hint: 'What they look like, clothing, distinguishing features',
    multiline: true
  },
  {
    key: 'personality',
    label: 'Personality',
    hint: 'Traits, quirks, values, how they act',
    multiline: true
  },
  {
    key: 'speechStyle',
    label: 'Speech Style',
    hint: 'How they talk — tone, vocabulary, verbal tics',
    multiline: true
  },
  {
    key: 'background',
    label: 'Background / History',
    hint: 'Where they come from, key life events',
    multiline: true
  },
  {
    key: 'relationships',
    label: 'Relationships',
    hint: 'Family, friends, rivals, and how they feel about them',
    multiline: true
  },
  {
    key: 'scenario',
    label: 'Scenario',
    hint: 'The current situation/setting this character is in',
    multiline: true
  },
  {
    key: 'firstMessage',
    label: 'First Message',
    hint: 'What they say to open a new act',
    multiline: true
  },
  {
    key: 'notes',
    label: 'Extra Notes (Optional)',
    hint: 'Anything else the model should know, in plain sentences',
    multiline: true
  }
]
