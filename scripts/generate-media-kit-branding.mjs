// One-off generator for press/branding/ assets — the app icon at media-kit sizes, plus a
// standalone "Autonym" wordmark (not used in-app; the app only ever pairs the AutonymMark
// badge with plain HTML text, so this renders that same look as an exportable PNG).
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'src/renderer/public/favicon.svg')
const fontPath = join(root, 'src/renderer/src/assets/fonts/Fredoka-Bold.ttf')
const outDir = join(root, 'press/branding')

mkdirSync(outDir, { recursive: true })

const iconSvg = readFileSync(svgPath, 'utf-8')

// App icon at media-kit sizes (transparent outside the rounded square, matching the in-app icon).
for (const size of [512, 1024]) {
  const resvg = new Resvg(iconSvg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: 'Fredoka' }
  })
  writeFileSync(join(outDir, `icon-${size}.png`), resvg.render().asPng())
}

// Standalone wordmark — "Autonym" plus the same quiet trailing dot the sidebar lockup uses,
// set in Fredoka Bold, transparent background, in both a dark-text (for light backgrounds) and
// white-text (for dark backgrounds) variant.
function wordmarkSvg(color, dotColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="200" viewBox="0 0 760 200">
  <text x="16" y="148" font-family="'Fredoka'" font-weight="700" font-size="130" fill="${color}">Autonym</text>
  <circle cx="730" cy="140" r="9" fill="${dotColor}" />
</svg>`
}

const variants = {
  dark: { text: '#14151a', dot: '#6b7280' },
  white: { text: '#ffffff', dot: '#9aa0ad' }
}
for (const [name, { text, dot }] of Object.entries(variants)) {
  const resvg = new Resvg(wordmarkSvg(text, dot), {
    fitTo: { mode: 'width', value: 1800 },
    font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: 'Fredoka' }
  })
  writeFileSync(join(outDir, `wordmark-${name}.png`), resvg.render().asPng())
}

console.log('Wrote press/branding/icon-512.png, icon-1024.png, wordmark-dark.png, wordmark-white.png')
