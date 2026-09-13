import type { Lorebook, LorebookInput, LoreEntry, LoreEntryInput } from './types'
import { COMMON_MISTAKES_FIELD_KEY, LORE_ENTRY_TYPES } from './loreEntryTypes'

export interface StarterPack {
  id: string
  label: string
  description: string
  lorebook: LorebookInput
  entries: Omit<LoreEntryInput, 'lorebookId'>[]
}

/** Turns an existing lorebook + its entries into a portable starter-pack file. */
export function buildStarterPackFile(lorebook: Lorebook, entries: LoreEntry[]): StarterPack {
  return {
    id: lorebook.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'starter-pack',
    label: lorebook.name,
    description: lorebook.description,
    lorebook: {
      name: lorebook.name,
      description: lorebook.description,
      isCanonSetting: lorebook.isCanonSetting,
      universeId: null
    },
    entries: entries.map((e) => ({
      title: e.title,
      entryType: e.entryType,
      keywords: e.keywords,
      description: e.description,
      fields: e.fields,
      enabled: e.enabled
    }))
  }
}

/** Parses a starter-pack JSON file (your own export, or one someone shared with you). */
export function parseStarterPackFile(raw: any): {
  lorebook: LorebookInput
  entries: Omit<LoreEntryInput, 'lorebookId'>[]
} {
  if (!raw || typeof raw !== 'object' || !raw.lorebook || !Array.isArray(raw.entries)) {
    throw new Error('Not a valid starter pack file.')
  }

  const lorebook: LorebookInput = {
    name:
      typeof raw.lorebook.name === 'string' && raw.lorebook.name.trim()
        ? raw.lorebook.name.trim()
        : 'Imported Starter Pack',
    description: typeof raw.lorebook.description === 'string' ? raw.lorebook.description : '',
    isCanonSetting: !!raw.lorebook.isCanonSetting,
    // A pack is portable/shareable — a universeId from wherever it was exported wouldn't
    // correspond to anything real in this install, so it's never carried over.
    universeId: null
  }

  const entries = raw.entries.map((e: any, i: number) => ({
    title: typeof e.title === 'string' && e.title.trim() ? e.title.trim() : `Entry ${i + 1}`,
    entryType: typeof e.entryType === 'string' && e.entryType in LORE_ENTRY_TYPES ? e.entryType : 'other',
    keywords: Array.isArray(e.keywords) ? e.keywords.filter((k: unknown) => typeof k === 'string') : [],
    description: typeof e.description === 'string' ? e.description : '',
    fields:
      e.fields && typeof e.fields === 'object'
        ? Object.entries(e.fields as Record<string, unknown>).reduce<Record<string, string>>(
            (acc, [key, value]) => {
              if (typeof value === 'string') acc[key] = value
              return acc
            },
            {}
          )
        : {},
    enabled: e.enabled !== false
  }))

  return { lorebook, entries }
}

/**
 * A reference pack of well-known, high-level facts — meant to stop a model from
 * inventing wrong specifics (the classic "gave an Au Ra visible animal ears" problem),
 * not to be an exhaustive wiki. Review and correct/expand entries for your own use;
 * treat this as a starting point rather than ground truth for newer expansion content.
 */
export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'ffxiv',
    label: 'Final Fantasy XIV',
    description: 'Core playable races and major regions of Eorzea, for FFXIV original-character RP.',
    lorebook: {
      name: 'Final Fantasy XIV',
      description: 'Core playable races and major regions of Eorzea (FFXIV).',
      isCanonSetting: true,
      universeId: null
    },
    entries: [
      {
        title: 'Au Ra',
        entryType: 'species',
        keywords: ['au ra', 'raen', 'xaela'],
        description: 'A playable race descended from a draconic people, split into the Raen and Xaela clans.',
        fields: {
          physicalTraits:
            'Patches of scales on skin (forearms, collarbone, temples, etc.), small horns on the head, and a tail. They have no external ears at all — no ear shape of any kind on the sides of the head. Raen tend toward paler scales/hair and East Asian-inspired dress; Xaela are a collection of nomadic steppe clans with more varied, often brighter horn/scale coloring.',
          culture:
            'Raen historically settled and reserved; Xaela organized into many distinct nomadic tribes on the Azim Steppe with their own customs.',
          abilities: 'Having no external ears, they hear via vibrations picked up through their horns rather than through ear canals.',
          notableExamples: '',
          [COMMON_MISTAKES_FIELD_KEY]:
            'Do NOT give Au Ra any external ears at all — not human-shaped, not pointed, not animal-shaped. They simply have no visible ears, and hear through vibrations in their horns instead.'
        },
        enabled: true
      },
      {
        title: 'Miqo\'te',
        entryType: 'species',
        keywords: ["miqo'te", 'miqote', 'seeker of the sun', 'keeper of the moon'],
        description: 'A playable race with cat-like features, split into Seekers of the Sun and Keepers of the Moon.',
        fields: {
          physicalTraits:
            'Prominent cat-like ears on top of the head (not human ears), a tail, and slit pupils. No scales, no horns.',
          culture:
            'Seekers of the Sun are diurnal and traditionally tribal; Keepers of the Moon are nocturnal and traditionally more solitary/reserved. Individual personalities vary widely regardless of clan.',
          abilities: '',
          notableExamples: '',
          [COMMON_MISTAKES_FIELD_KEY]:
            'Do not give them scales, horns, or a Viera-length ear — their ears are cat-shaped but shorter than a Viera\'s rabbit ears.'
        },
        enabled: true
      },
      {
        title: 'Hyur',
        entryType: 'species',
        keywords: ['hyur', 'midlander', 'highlander'],
        description: 'The most populous playable race, visually closest to ordinary humans, split into Midlander and Highlander clans.',
        fields: {
          physicalTraits:
            'Look like ordinary humans — no ears, tails, horns, or scales. Highlanders tend to be taller and more muscular than Midlanders on average, but this is a soft trend, not a strict rule.',
          culture: 'The dominant population across most of Eorzea\'s city-states.',
          abilities: '',
          notableExamples: ''
        },
        enabled: true
      },
      {
        title: 'Elezen',
        entryType: 'species',
        keywords: ['elezen', 'wildwood', 'duskwight'],
        description: 'A tall, slender playable race with long, pointed ears, split into Wildwood and Duskwight clans.',
        fields: {
          physicalTraits: 'Tall and slender build, long pointed ears, elongated facial features. No tail, scales, or horns.',
          culture: 'Wildwood traditionally associated with forests (e.g. Gridania); Duskwight with underground/cave-dwelling backgrounds.',
          abilities: '',
          notableExamples: ''
        },
        enabled: true
      },
      {
        title: 'Lalafell',
        entryType: 'species',
        keywords: ['lalafell', 'plainsfolk', 'dunesfolk'],
        description: 'A small-statured playable race (adults are child-sized), split into Plainsfolk and Dunesfolk clans.',
        fields: {
          physicalTraits:
            'Notably short and small-framed as adults — not children, but full-grown adults with mature personalities and lives. Rounded ears, large eyes. No tail, scales, or horns.',
          culture: 'Plainsfolk traditionally associated with Ul\'dah/plains; Dunesfolk with desert regions.',
          abilities: '',
          notableExamples: '',
          [COMMON_MISTAKES_FIELD_KEY]:
            'Do not write or treat them as literal children — they are full-grown adults with adult lives, jobs, and relationships despite their small stature.'
        },
        enabled: true
      },
      {
        title: 'Roegadyn',
        entryType: 'species',
        keywords: ['roegadyn', 'sea wolf', 'hellsguard'],
        description: 'A large, powerfully-built seafaring playable race, split into Sea Wolf and Hellsguard clans.',
        fields: {
          physicalTraits:
            'Tall and heavily muscled — this applies to Roegadyn women too, who are notably larger and stronger than the "petite" default for other races, not dainty. No tail, scales, or horns.',
          culture: 'Sea Wolves are traditionally seafaring; Hellsguard traditionally associated with volcanic/mountainous regions and heat resistance.',
          abilities: '',
          notableExamples: '',
          [COMMON_MISTAKES_FIELD_KEY]:
            'Do not make female Roegadyn petite, dainty, or notably smaller than males — they share the same large, muscular build.'
        },
        enabled: true
      },
      {
        title: 'Viera',
        entryType: 'species',
        keywords: ['viera'],
        description: 'A tall, slender playable race with very long rabbit-like ears.',
        fields: {
          physicalTraits:
            'Extremely long, prominent rabbit-like ears (much longer than a Miqo\'te\'s cat ears) and a slender build. Both male and female Viera are playable.',
          culture: 'Traditionally reclusive forest-dwelling background in their lore origins.',
          abilities: '',
          notableExamples: '',
          [COMMON_MISTAKES_FIELD_KEY]:
            'Do not shorten their ears to Miqo\'te cat-ear length — Viera ears are much longer and more rabbit-like.'
        },
        enabled: true
      },
      {
        title: 'Hrothgar',
        entryType: 'species',
        keywords: ['hrothgar'],
        description: 'A large, lion-like beastman playable race.',
        fields: {
          physicalTraits:
            'Large, muscular build with a lion/beast-like face and mane, fully furred. Both male and female Hrothgar are playable.',
          culture: '',
          abilities: '',
          notableExamples: ''
        },
        enabled: true
      },
      {
        title: 'Eorzea (Overview)',
        entryType: 'location',
        keywords: ['eorzea'],
        description: 'The broad region most of FFXIV\'s story takes place in, made up of several city-states.',
        fields: {
          whereItIs: 'A region containing the city-states of Limsa Lominsa, Gridania, Ul\'dah, and Ishgard, among others.',
          climate: 'Varies significantly by region — coastal, forest, desert, and mountainous areas all exist within Eorzea.',
          importance: 'The main setting for the base game and much of the ongoing story.',
          associatedCharacters: '',
          notableFeatures: ''
        },
        enabled: true
      },
      {
        title: 'Limsa Lominsa',
        entryType: 'location',
        keywords: ['limsa lominsa', 'limsa'],
        description: 'A seafaring city-state built on and around a series of coastal cliffs and a harbor.',
        fields: {
          whereItIs: 'On the coast of La Noscea.',
          climate: 'Coastal, oceanic.',
          importance: 'One of the three main starting city-states; a hub for sailors and pirates-turned-citizens.',
          associatedCharacters: '',
          notableFeatures: 'Built around a large natural harbor; strong seafaring/pirate heritage.'
        },
        enabled: true
      },
      {
        title: 'Gridania',
        entryType: 'location',
        keywords: ['gridania'],
        description: 'A city-state built within and protected by the Black Shroud, a vast forest.',
        fields: {
          whereItIs: 'Within the Black Shroud forest.',
          climate: 'Temperate forest.',
          importance: 'One of the three main starting city-states, closely tied to nature/forest themes.',
          associatedCharacters: '',
          notableFeatures: 'Built into and around the forest itself; strong connection to elemental spirits in its lore.'
        },
        enabled: true
      },
      {
        title: 'Ul\'dah',
        entryType: 'location',
        keywords: ["ul'dah", 'uldah'],
        description: 'A wealthy desert city-state built around trade, commerce, and gladiatorial history.',
        fields: {
          whereItIs: 'In the desert region of Thanalan.',
          climate: 'Hot, arid desert.',
          importance: 'One of the three main starting city-states; a center of commerce and politics.',
          associatedCharacters: '',
          notableFeatures: 'Known for its wealth, merchant houses, and gladiator arenas.'
        },
        enabled: true
      },
      {
        title: 'Ishgard',
        entryType: 'location',
        keywords: ['ishgard', 'ishgardian'],
        description: 'A mountain city-state historically isolated from the rest of Eorzea, with a strong knightly/religious culture.',
        fields: {
          whereItIs: 'In the mountainous Coerthas region.',
          climate: 'Cold, snowy, mountainous.',
          importance: 'A major city-state introduced as a central location in the Heavensward story arc.',
          associatedCharacters: '',
          notableFeatures: 'Gothic architecture, historically closed off to outsiders, strong knightly orders.'
        },
        enabled: true
      },
      {
        title: 'Aether & The Echo',
        entryType: 'concept',
        keywords: ['aether', 'the echo', 'echo'],
        description: 'Core setting concepts: Aether is the fundamental energy underlying magic and life; the Echo is a rare ability to perceive visions of the past or communicate across the aetherial barrier.',
        fields: {
          explanation:
            'Aether is the setting\'s "magic energy" — used for spellcasting, crystals, and tied to life force. The Echo is a rare gift (the player character has it) that lets someone witness visions of past events or understand any language/receive visions from otherwise-imperceptible sources.',
          significance: 'Both are frequently referenced in the story; the Echo in particular is closely tied to the protagonist\'s role as the "Warrior of Light/Darkness."'
        },
        enabled: true
      }
    ]
  }
]
