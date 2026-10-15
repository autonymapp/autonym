/** The app's mark: two speech bubbles, you and a character, writing together. Reused everywhere
 *  the app icon shows up (sidebar, headers). Colors come from the active theme tokens, so it
 *  reads correctly under every theme and accent preset. */
export default function AutonymMark({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" style={{ flexShrink: 0 }} aria-hidden="true">
      <path
        d="M9 9h17a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-9l-5 4v-4H9a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4z"
        fill="none"
        stroke="var(--text-faint)"
        strokeWidth="2.4"
      />
      <path
        d="M18 16h17a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-2v4l-5-4H18a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4z"
        fill="var(--accent)"
      />
    </svg>
  )
}
