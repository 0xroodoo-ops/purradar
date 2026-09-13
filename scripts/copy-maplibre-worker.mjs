/**
 * MapLibre 6 finds its web worker by resolving `maplibre-gl-worker.mjs`
 * relative to `import.meta.url`. Turbopack rewrites that to the bundled chunk
 * URL, where no such file exists — the worker then fails to start, no vector
 * tiles are ever fetched, and the map stays blank with no error.
 *
 * So the worker (and the shared chunk it imports) are copied into public/ and
 * handed to setWorkerUrl. Copied at build time rather than committed, so the
 * files can never drift from the installed version.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dist = path.dirname(require.resolve('maplibre-gl/package.json')) + '/dist'
const out = path.resolve('public/maplibre')

await mkdir(out, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(path.join(dist, file), path.join(out, file))
}
console.log(`maplibre worker copied to ${out}`)
