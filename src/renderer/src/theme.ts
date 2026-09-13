export type ThemeId = 'indigo' | 'slate' | 'amber' | 'oled' | 'rose'

export interface ThemeInfo {
  id: ThemeId
  label: string
  /** [background, elevated background, default accent] */
  swatch: [string, string, string]
}

export const THEMES: ThemeInfo[] = [
  { id: 'indigo', label: 'Midnight Indigo', swatch: ['#14151a', '#1c1e25', '#8b93ff'] },
  { id: 'slate', label: 'Slate Blue', swatch: ['#12161c', '#1a1f28', '#5b9dff'] },
  { id: 'amber', label: 'Warm Charcoal', swatch: ['#181513', '#211c19', '#e0a34a'] },
  { id: 'oled', label: 'OLED Black', swatch: ['#000000', '#0d0f12', '#2dd4bf'] },
  { id: 'rose', label: 'Rose & Plum', swatch: ['#17131a', '#201a24', '#e05c8a'] }
]

const THEME_STORAGE_KEY = 'autonym:theme'
const ACCENT_STORAGE_KEY = 'autonym:accentColor'

export function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : 'indigo'
}

export function applyTheme(theme: ThemeId): void {
  if (theme === 'indigo') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function defaultAccentFor(theme: ThemeId): string {
  return THEMES.find((t) => t.id === theme)?.swatch[2] ?? '#8b93ff'
}

export function getStoredAccent(): string | null {
  return localStorage.getItem(ACCENT_STORAGE_KEY)
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** WCAG relative luminance, used to decide black-vs-white text on the accent color. */
function contrastTextColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? '#0b0b0d' : '#ffffff'
}

export function applyAccent(hex: string | null): void {
  const root = document.documentElement.style
  if (!hex) {
    root.removeProperty('--accent')
    root.removeProperty('--accent-hover')
    root.removeProperty('--accent-soft')
    root.removeProperty('--accent-contrast')
    localStorage.removeItem(ACCENT_STORAGE_KEY)
    return
  }
  root.setProperty('--accent', hex)
  root.setProperty('--accent-hover', darken(hex, 0.12))
  root.setProperty('--accent-soft', toRgba(hex, 0.16))
  root.setProperty('--accent-contrast', contrastTextColor(hex))
  localStorage.setItem(ACCENT_STORAGE_KEY, hex)
}

/* ---------- Typography & Accessibility ---------- */

export type FontFamilyId = 'default' | 'serif' | 'dyslexic'
export type ChatTextSizeId = 'small' | 'medium' | 'large' | 'xlarge'
export type LineSpacingId = 'compact' | 'comfortable' | 'relaxed'

export const FONT_FAMILIES: { id: FontFamilyId; label: string; stack: string }[] = [
  { id: 'default', label: 'System Default', stack: 'inherit' },
  { id: 'serif', label: 'Serif', stack: "Georgia, Cambria, 'Times New Roman', serif" },
  { id: 'dyslexic', label: 'Dyslexia-Friendly', stack: "'Comic Sans MS', 'Comic Sans', cursive" }
]

export const CHAT_TEXT_SIZES: { id: ChatTextSizeId; label: string; px: number }[] = [
  { id: 'small', label: 'Small', px: 13 },
  { id: 'medium', label: 'Medium', px: 15 },
  { id: 'large', label: 'Large', px: 17 },
  { id: 'xlarge', label: 'Extra Large', px: 19 }
]

export const LINE_SPACINGS: { id: LineSpacingId; label: string; value: number }[] = [
  { id: 'compact', label: 'Compact', value: 1.35 },
  { id: 'comfortable', label: 'Comfortable', value: 1.6 },
  { id: 'relaxed', label: 'Relaxed', value: 1.9 }
]

const FONT_FAMILY_KEY = 'autonym:fontFamily'
const CHAT_TEXT_SIZE_KEY = 'autonym:chatTextSize'
const LINE_SPACING_KEY = 'autonym:lineSpacing'
const HIGH_CONTRAST_KEY = 'autonym:highContrast'
const REDUCE_MOTION_KEY = 'autonym:reduceMotion'
const BOLD_FORMATTING_KEY = 'autonym:boldFormatting'

export function getStoredFontFamily(): FontFamilyId {
  const stored = localStorage.getItem(FONT_FAMILY_KEY)
  return FONT_FAMILIES.some((f) => f.id === stored) ? (stored as FontFamilyId) : 'default'
}
export function applyFontFamily(id: FontFamilyId): void {
  const stack = FONT_FAMILIES.find((f) => f.id === id)?.stack ?? 'inherit'
  document.documentElement.style.setProperty('--chat-font-family', stack)
  localStorage.setItem(FONT_FAMILY_KEY, id)
}

export function getStoredChatTextSize(): ChatTextSizeId {
  const stored = localStorage.getItem(CHAT_TEXT_SIZE_KEY)
  return CHAT_TEXT_SIZES.some((s) => s.id === stored) ? (stored as ChatTextSizeId) : 'medium'
}
export function applyChatTextSize(id: ChatTextSizeId): void {
  const px = CHAT_TEXT_SIZES.find((s) => s.id === id)?.px ?? 15
  document.documentElement.style.setProperty('--chat-font-size', `${px}px`)
  localStorage.setItem(CHAT_TEXT_SIZE_KEY, id)
}

export function getStoredLineSpacing(): LineSpacingId {
  const stored = localStorage.getItem(LINE_SPACING_KEY)
  return LINE_SPACINGS.some((s) => s.id === stored) ? (stored as LineSpacingId) : 'comfortable'
}
export function applyLineSpacing(id: LineSpacingId): void {
  const value = LINE_SPACINGS.find((s) => s.id === id)?.value ?? 1.6
  document.documentElement.style.setProperty('--chat-line-height', `${value}`)
  localStorage.setItem(LINE_SPACING_KEY, id)
}

export function getStoredHighContrast(): boolean {
  return localStorage.getItem(HIGH_CONTRAST_KEY) === '1'
}
export function applyHighContrast(enabled: boolean): void {
  if (enabled) document.documentElement.setAttribute('data-contrast', 'high')
  else document.documentElement.removeAttribute('data-contrast')
  localStorage.setItem(HIGH_CONTRAST_KEY, enabled ? '1' : '0')
}

export function getStoredReduceMotion(): boolean {
  return localStorage.getItem(REDUCE_MOTION_KEY) === '1'
}
export function applyReduceMotion(enabled: boolean): void {
  if (enabled) document.documentElement.setAttribute('data-reduce-motion', 'true')
  else document.documentElement.removeAttribute('data-reduce-motion')
  localStorage.setItem(REDUCE_MOTION_KEY, enabled ? '1' : '0')
}

export function getStoredBoldFormatting(): boolean {
  return localStorage.getItem(BOLD_FORMATTING_KEY) === '1'
}
export function applyBoldFormatting(enabled: boolean): void {
  if (enabled) document.documentElement.setAttribute('data-bold-formatting', 'true')
  else document.documentElement.removeAttribute('data-bold-formatting')
  localStorage.setItem(BOLD_FORMATTING_KEY, enabled ? '1' : '0')
}
