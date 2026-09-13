/**
 * Turns the drawings in cats/ into map sprites.
 *
 * Each source is a 1254² PNG with the cat occupying a narrow vertical strip,
 * so it is trimmed to its own bounds first — otherwise most of every sprite is
 * transparent padding and the cat draws far smaller than its icon-size implies.
 *
 * Sprite height is fixed, not width, so every breed ends up the same size on
 * the map regardless of how much tail it has.
 *
 * Add a breed by dropping `<slug>.png` in cats/ and adding it to BREEDS in
 * src/lib/catspeak.ts. Output is generated, not committed.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/** Rasterised height. Halved at pixelRatio 2, so ~100px on screen at size 1. */
const SPRITE_HEIGHT = 200

const src = path.resolve('cats')
const out = path.resolve('public/cats')

await mkdir(out, { recursive: true })

const files = (await readdir(src)).filter((f) => f.endsWith('.png')).sort()
if (files.length === 0) throw new Error(`no cat art found in ${src}`)

const manifest = []
for (const file of files) {
  const slug = path.basename(file, '.png')
  const { data, info } = await sharp(path.join(src, file))
    // threshold 1: trim anything fully transparent, keep the glow's soft edge.
    .trim({ threshold: 1 })
    .resize({ height: SPRITE_HEIGHT, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true })

  await writeFile(path.join(out, `${slug}.png`), data)
  manifest.push({ slug, width: info.width, height: info.height })
}

console.log(
  `cat sprites: ${manifest.map((m) => `${m.slug} ${m.width}x${m.height}`).join(', ')} → ${out}`,
)
