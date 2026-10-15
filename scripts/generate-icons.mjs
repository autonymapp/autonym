// Rasterizes src/renderer/public/favicon.svg into:
//  - build/icon.ico (16/32/48/256px) and build/icon.png, for electron-builder and the dev window
//  - src/renderer/public/icon-192.png and icon-512.png, the PWA's regular icons
//  - src/renderer/public/icon-maskable-512.png, a full-bleed version with the mark inside the
//    maskable safe zone, so Android can crop it to any shape without clipping the bubbles
// Re-run this (`npm run icons`) whenever favicon.svg changes.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'src/renderer/public')
const buildDir = join(root, 'build')

mkdirSync(buildDir, { recursive: true })

const svg = readFileSync(join(publicDir, 'favicon.svg'), 'utf-8')
const render = (source, size) =>
  new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()

const sizes = [16, 32, 48, 256]
const pngBuffers = sizes.map((size) => render(svg, size))
writeFileSync(join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1])
writeFileSync(join(buildDir, 'icon.ico'), await pngToIco(pngBuffers))

writeFileSync(join(publicDir, 'icon-192.png'), render(svg, 192))
writeFileSync(join(publicDir, 'icon-512.png'), render(svg, 512))

// Maskable: square background, mark scaled to 60% so it sits inside the 80% safe-zone circle.
const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect[^>]*\/>/, '')
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44">
  <rect width="44" height="44" fill="#1c1e24" />
  <g transform="translate(22 22) scale(0.6) translate(-22 -22)">${inner}</g>
</svg>`
writeFileSync(join(publicDir, 'icon-maskable-512.png'), render(maskable, 512))

console.log('Wrote build/icon.ico, build/icon.png and the PWA icons in src/renderer/public/')
