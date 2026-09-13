import { describe, expect, it } from 'vitest'
import { detectSpeaker, stripSpeakerCue } from './detectSpeaker'
import type { Character } from './types'

function character(id: number, name: string): Character {
  return {
    id,
    name,
    avatarType: 'monogram',
    avatarPath: null,
    avatarEmoji: null,
    universeId: null,
    baseCharacterId: null,
    isWorldbuildingAssistant: false,
    tags: [],
    appearance: '',
    personality: '',
    speechStyle: '',
    background: '',
    relationships: '',
    scenario: '',
    firstMessage: '',
    notes: '',
    createdAt: new Date().toISOString(),
    deletedAt: null
  }
}

describe('detectSpeaker', () => {
  const prompter = character(1, 'Prompter')
  const aria = character(2, 'Aria')
  const finn = character(3, 'Finn')

  it('returns null when there is no group cast', () => {
    expect(detectSpeaker('**Aria:** Hello there.', prompter, [])).toBeNull()
  })

  it('matches a bolded speaker cue', () => {
    expect(detectSpeaker('**Aria:** Hello there, welcome back.', prompter, [aria, finn])).toBe(2)
  })

  it('matches a plain (non-bolded) speaker cue', () => {
    expect(detectSpeaker('Aria: Hello there.', prompter, [aria, finn])).toBe(2)
  })

  it('does not match a name appearing mid-sentence', () => {
    expect(detectSpeaker('*Aria looks up* "Hello."', prompter, [aria, finn])).toBeNull()
    expect(detectSpeaker('Hello, Aria: welcome.', prompter, [aria, finn])).toBeNull()
  })

  it('returns null when the cue names the primary character', () => {
    expect(detectSpeaker('**Prompter:** As always, welcome.', prompter, [aria])).toBeNull()
  })

  it('handles hyphenated names', () => {
    const anneMarie = character(4, 'Anne-Marie')
    expect(detectSpeaker('**Anne-Marie:** Good morning.', prompter, [anneMarie])).toBe(4)
  })

  it('returns null for content with no colon-delimited cue at all', () => {
    expect(detectSpeaker('"Hi there," she said.', prompter, [aria])).toBeNull()
  })
})

describe('stripSpeakerCue', () => {
  const prompter = character(1, 'Prompter')
  const aria = character(2, 'Aria')
  const finn = character(3, 'Finn')

  it('strips a bolded speaker cue naming a group cast member', () => {
    expect(stripSpeakerCue('**Aria:** Hello there.', prompter, [aria, finn])).toBe('Hello there.')
  })

  it('strips a plain (non-bolded) speaker cue', () => {
    expect(stripSpeakerCue('Aria: Hello there.', prompter, [aria, finn])).toBe('Hello there.')
  })

  it('strips a cue naming the primary character too, since it is still redundant', () => {
    expect(stripSpeakerCue('**Prompter:** As always, welcome.', prompter, [aria])).toBe('As always, welcome.')
  })

  it('leaves content unchanged when there is no group cast', () => {
    expect(stripSpeakerCue('Aria: Hello there.', prompter, [])).toBe('Aria: Hello there.')
  })

  it('leaves content unchanged when the leading name matches no cast member', () => {
    expect(stripSpeakerCue('Warning: this cave is dangerous.', prompter, [aria])).toBe(
      'Warning: this cave is dangerous.'
    )
  })

  it('leaves content unchanged when there is no cue at all', () => {
    expect(stripSpeakerCue('"Hi there," she said.', prompter, [aria])).toBe('"Hi there," she said.')
  })
})
