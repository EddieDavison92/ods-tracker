// Renders src/app/icon.svg to favicon.ico (16, 32, 48 px) and apple-icon.png (180 px).
// Usage: node scripts/make-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const svg = await readFile('src/app/icon.svg', 'utf8')
// iOS rounds corners itself and shows transparency as black, so the Apple icon is a full-bleed square.
const appleSvg = svg.replace('rx="7"', 'rx="0"').replace('translate(5 5) scale(0.9167)', 'translate(7 7) scale(0.75)')

const browser = await chromium.launch()
const page = await browser.newPage()
async function png(source, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${source}`)
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

// ICO with embedded PNGs: 6-byte header, 16-byte entry per image, then the image data.
const sizes = [16, 32, 48]
const images = []
for (const s of sizes) images.push(await png(svg, s))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((s, i) => {
  const e = 6 + 16 * i
  header.writeUInt8(s, e)
  header.writeUInt8(s, e + 1)
  header.writeUInt16LE(1, e + 4)
  header.writeUInt16LE(32, e + 6)
  header.writeUInt32LE(images[i].length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += images[i].length
})
await writeFile('src/app/favicon.ico', Buffer.concat([header, ...images]))
await writeFile('src/app/apple-icon.png', await png(appleSvg, 180))
// Large previews to check the artwork by eye.
await writeFile('.cache/icon-preview-32.png', images[1])
await writeFile('.cache/icon-preview-16.png', images[0])
await browser.close()
console.log('wrote src/app/favicon.ico and src/app/apple-icon.png')
