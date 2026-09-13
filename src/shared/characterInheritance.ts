import type { Character } from './types'

/** A linked variant (e.g. a canon FF14 version of an original character) can leave its
 *  personality/speechStyle/relationships blank to inherit the base character's value instead of
 *  duplicating it — so editing the base updates every variant automatically. Everything else
 *  (appearance, background, scenario, etc.) is always the variant's own. Returns `character`
 *  unchanged when it has no base, or when the base can't be found. */
export function resolveCharacterInheritance(
  character: Character,
  allCharacters: Character[]
): Character {
  if (!character.baseCharacterId) return character
  const base = allCharacters.find((c) => c.id === character.baseCharacterId)
  if (!base) return character
  return {
    ...character,
    personality: character.personality || base.personality,
    speechStyle: character.speechStyle || base.speechStyle,
    relationships: character.relationships || base.relationships
  }
}
