/** The app's beacon mark — a signal in the dark, not a crest. Two rings and a glowing core,
 *  reused everywhere the app icon shows up (sidebar, app icon, press kit). Colors are drawn
 *  from the active theme's accent tokens, so it reads correctly under every accent preset. */
export default function AutonymMark({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.55" />
      <circle cx="16" cy="16" r="7.5" fill="var(--accent)" opacity="0.16" />
      <circle cx="16" cy="16" r="4" fill="var(--accent)" />
    </svg>
  )
}
