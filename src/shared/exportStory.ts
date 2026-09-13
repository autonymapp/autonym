import type { ChatMessage } from './types'

/** Strips OOC asides and converts the RP formatting convention to plain Markdown. */
function cleanMessageText(text: string): string {
  return text
    .replace(/\(\([^)]*\)\)/g, '') // drop out-of-character asides entirely
    .replace(/~([^~]+)~/g, '_$1_') // ~thought~ -> _thought_ (markdown italics)
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/**
 * Formats a chat's messages as a clean, Markdown-flavored story — suitable for
 * pasting into a draft or archive. Speaker names are kept as bold labels since a
 * two-character conversation reads ambiguously without them.
 */
export function formatChatAsStory(params: {
  title: string
  characterName: string
  impersonatingCharacterName: string | null
  messages: ChatMessage[]
}): string {
  const { title, characterName, impersonatingCharacterName, messages } = params
  const userLabel = impersonatingCharacterName ?? 'You'

  const body = messages
    .map((m) => {
      const text = cleanMessageText(m.content)
      if (!text) return null
      const speaker = m.role === 'assistant' ? characterName : userLabel
      return `**${speaker}:** ${text}`
    })
    .filter((line): line is string => line !== null)
    .join('\n\n')

  return `# ${title}\n\n${body}\n`
}
