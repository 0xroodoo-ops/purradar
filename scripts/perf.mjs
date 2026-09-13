/**
 * Frame-time profile under load.
 *
 * The feeds cap a query at 250nm, so no real view ever holds the 2,000+ cats
 * the brief asks about. Rather than fake data inside the app, this intercepts
 * the /api/cats response and multiplies the real cats with small offsets — the
 * app then renders them through exactly the path it uses in production, with
 * no test-only code shipped.
 *
 *   node scripts/perf.mjs            software rendering (worst case)
 *   HEADFUL=1 node scripts/perf.mjs  real GPU
 */
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE ?? 'http://localhost:3111'
const MULTIPLY = Number(process.env.MULTIPLY ?? 4)
const HEADFUL = process.env.HEADFUL === '1'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADFUL ? false : 'new',
  args: HEADFUL
    ? ['--no-sandbox', '--window-size=1440,900']
    : ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  defaultViewport: { width: 1440, height: 900 },
})

const page = await browser.newPage()

/**
 * Intercept only the API.
 *
 * Puppeteer's own setRequestInterception is all-or-nothing and pausing every
 * request stops MapLibre's web worker from ever starting, which leaves the map
 * blank. CDP's Fetch domain takes a URL pattern, so nothing else is touched.
 */
const cdp = await page.createCDPSession()
await cdp.send('Fetch.enable', {
  patterns: [{ urlPattern: '*/api/cats*', requestStage: 'Response' }],
})
cdp.on('Fetch.requestPaused', async (event) => {
  try {
    const { body, base64Encoded } = await cdp.send('Fetch.getResponseBody', {
      requestId: event.requestId,
    })
    const original = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString() : body)
    const base = original.cats ?? []
    const cats = []
    for (let i = 0; i < MULTIPLY; i++) {
      for (const c of base) {
        cats.push(
          i === 0
            ? c
            : {
                ...c,
                hex: (parseInt(c.hex, 16) + i * 0x10000).toString(16).slice(-6),
                lat: c.lat + (Math.random() - 0.5) * 1.6,
                lon: c.lon + (Math.random() - 0.5) * 2.4,
              },
        )
      }
    }
    const payload = JSON.stringify({ ...original, cats, count: cats.length })
    await cdp.send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }],
      body: Buffer.from(payload).toString('base64'),
    })
  } catch (e) {
    console.log('intercept failed:', e.message)
    await cdp.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
  }
})

await page.goto(`${BASE}/#7/51.47/-0.45`, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 18000))

const count = await page.$eval('.tabular', (e) => e.textContent)
console.log(`rendering ${count} cats  (${HEADFUL ? 'real GPU' : 'software rendering'})`)

await page.evaluate(() => {
  window.__frames = []
  let last = performance.now()
  const tick = (t) => {
    window.__frames.push(t - last)
    last = t
    window.__raf = requestAnimationFrame(tick)
  }
  window.__raf = requestAnimationFrame(tick)
})

// Pan the way a person does: several drags across the map.
for (let i = 0; i < 6; i++) {
  await page.mouse.move(900, 500)
  await page.mouse.down()
  for (let s = 0; s <= 20; s++) {
    await page.mouse.move(900 - s * 18, 500 - s * 6)
    await new Promise((r) => setTimeout(r, 8))
  }
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 250))
}

const stats = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf)
  // Drop the first few: they include the drag starting up.
  const f = window.__frames.slice(5).sort((a, b) => a - b)
  const at = (p) => f[Math.floor(f.length * p)]
  return {
    frames: f.length,
    median: at(0.5),
    p95: at(0.95),
    worst: f[f.length - 1],
    over16: f.filter((x) => x > 16.7).length / f.length,
  }
})

console.log(
  `frames ${stats.frames}  median ${stats.median.toFixed(1)}ms  p95 ${stats.p95.toFixed(1)}ms  worst ${stats.worst.toFixed(1)}ms  over 16.7ms: ${(stats.over16 * 100).toFixed(1)}%`,
)

await browser.close()
