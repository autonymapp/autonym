// Rasterizes src/renderer/public/favicon.svg into the Windows .ico electron-builder
// expects at build/icon.ico (16/32/48/256px), plus a build/icon.png for the dev-mode
// BrowserWindow icon. Re-run this (`npm run icons`) whenever favicon.svg changes.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'src/renderer/public/favicon.svg')
// Icon rasterization uses the static Bold instance (resvg doesn't apply CSS font-weight
// to variable fonts) — extracted via `fonttools varLib.instancer Fredoka.ttf wght=700`.
const fontPath = join(root, 'src/renderer/src/assets/fonts/Fredoka-Bold.ttf')
const buildDir = join(root, 'build')

mkdirSync(buildDir, { recursive: true })

const svg = readFileSync(svgPath, 'utf-8')
const sizes = [16, 32, 48, 256]

const pngBuffers = sizes.map((size) => {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: 'Fredoka' }
  })
  return resvg.render().asPng()
})

writeFileSync(join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1])

const ico = await pngToIco(pngBuffers)
writeFileSync(join(buildDir, 'icon.ico'), ico)

console.log(`Wrote build/icon.ico (${sizes.join('/')}px) and build/icon.png`)
