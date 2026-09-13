/** The app's "Au" mark — same gradient badge used in the sidebar logo and app icon.
 *  Doubles as a nod to "AU" (alternate universe). Not tied to any particular
 *  character/lorebook's own identity. */
export default function AutonymMark({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontFamily: "'Fredoka', 'Century Gothic', 'Poppins', 'Segoe UI', sans-serif",
        fontWeight: 700,
        color: 'var(--accent-contrast)',
        flexShrink: 0
      }}
    >
      au
    </span>
  )
}
