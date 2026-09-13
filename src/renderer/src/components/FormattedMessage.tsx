// Each alternative's content class excludes the other markers' delimiters, so a
// dialogue quote that never closes before an *action* beat or ~thought~ can't swallow
// that marker whole (turning its literal asterisks/tildes into "bold quoted text"
// instead of parsing them) — it just fails to match and falls through as plain text
// for that stray quote character, while the action/thought still parses correctly.
const FORMAT_REGEX = /\(\(([^)]+)\)\)|\*([^*"~]+)\*|"([^"*~]+)"|~([^~"*]+)~/g

/**
 * Renders RP text with the app's formatting convention styled distinctly:
 * ((double parentheses)) = out-of-character note, *asterisks* = action/narration,
 * "quotes" = dialogue, ~tildes~ = inner thought. Anything outside those markers
 * renders as plain text.
 *
 * `onAccent` is set when the bubble background is the solid accent color (the
 * user's own messages) rather than the dark elevated background (assistant
 * messages) — the action/thought colors need to swap to stay readable on each.
 */
export default function FormattedMessage({
  text,
  onAccent = false
}: {
  text: string
  onAccent?: boolean
}): JSX.Element {
  const nodes: JSX.Element[] = []
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  // On the user's bubble (solid accent background), tint relative to whichever text
  // color is readable there (--accent-contrast is black or white depending on the
  // chosen accent's brightness) rather than assuming white. Solid (non-transparent)
  // text is used deliberately — a translucent color-mix against a light/pastel accent
  // (e.g. default Midnight Indigo) doesn't have enough contrast to read comfortably.
  const actionStyle = onAccent
    ? {
        color: 'color-mix(in srgb, var(--accent-contrast) 88%, var(--accent) 12%)',
        fontStyle: 'italic' as const
      }
    : { color: 'var(--text-dim)', fontStyle: 'italic' as const }
  const thoughtStyle = onAccent
    ? {
        color: 'var(--accent-contrast)',
        fontStyle: 'italic' as const,
        textDecoration: 'underline dotted'
      }
    : { color: 'var(--accent-2)', fontStyle: 'italic' as const, opacity: 0.9 }
  const oocStyle = onAccent
    ? {
        color: 'var(--accent-contrast)',
        background: 'color-mix(in srgb, black 22%, transparent)'
      }
    : { color: 'var(--text-dim)', background: 'var(--bg-hover)' }

  FORMAT_REGEX.lastIndex = 0
  while ((match = FORMAT_REGEX.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }
    if (match[1] !== undefined) {
      nodes.push(
        <span
          key={key++}
          className="fmt-ooc"
          style={{
            ...oocStyle,
            fontFamily: 'monospace',
            fontSize: '0.9em',
            borderRadius: 4,
            padding: '1px 5px'
          }}
        >
          OOC: {match[1]}
        </span>
      )
    } else if (match[2] !== undefined) {
      nodes.push(
        <em key={key++} className="fmt-action" style={actionStyle}>
          {match[2]}
        </em>
      )
    } else if (match[3] !== undefined) {
      nodes.push(
        <span key={key++} style={{ fontWeight: 600 }}>
          &ldquo;{match[3]}&rdquo;
        </span>
      )
    } else if (match[4] !== undefined) {
      nodes.push(
        <em key={key++} className="fmt-thought" style={thoughtStyle}>
          {match[4]}
        </em>
      )
    }
    lastIndex = FORMAT_REGEX.lastIndex
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  return <>{nodes}</>
}
