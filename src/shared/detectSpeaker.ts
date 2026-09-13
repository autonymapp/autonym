import type { Character } from './types'

const SPEAKER_CUE_REGEX = /^\s*\*{0,2}([A-Za-z][\w' -]{0,40}?)\*{0,2}\s*:\*{0,2}\s*/

/** Matches a "**Name:**" (or plain "Name:") speaker cue at the very start of a Group Scene
 *  reply, so the message can be attributed to whichever cast member actually spoke it.
 *  Falls back to the act's primary character when no cue is found or it doesn't match anyone. */
export function detectSpeaker(content: string, character: Character, groupCharacters: Character[]): number | null {
  if (groupCharacters.length === 0) return null
  const match = content.match(SPEAKER_CUE_REGEX)
  if (!match) return null
  const name = match[1].trim().toLowerCase()
  const speaker = [character, ...groupCharacters].find((c) => c.name.toLowerCase() === name)
  return speaker && speaker.id !== character.id ? speaker.id : null
}

/** The speaker cue is redundant with the name already shown above the bubble, and its
 *  double asterisks collide with FormattedMessage's *action* markers, mangling the
 *  rendered text. Strip it once it's been used to attribute the line — but only when it
 *  actually names a cast member, so a coincidental "Word:" opener in solo narration
 *  (no group cast) or unrelated text is never touched. */
export function stripSpeakerCue(content: string, character: Character, groupCharacters: Character[]): string {
  if (groupCharacters.length === 0) return content
  const match = content.match(SPEAKER_CUE_REGEX)
  if (!match) return content
  const name = match[1].trim().toLowerCase()
  const isCastMember = [character, ...groupCharacters].some((c) => c.name.toLowerCase() === name)
  return isCastMember ? content.slice(match[0].length) : content
}
