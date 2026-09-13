// Exercises the interaction layer and captures what it looks like.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE ?? 'http://localhost:3111'
const OUT = process.env.OUT ?? '/tmp/purradar-shots'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
})

const page = await browser.newPage()
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
await page.goto(`${BASE}/#8.5/51.47/-0.45`, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 16000))

// Pick a cat through search, the same way a visitor would.
await page.type('input[aria-label="Search cats"]', 'HISS')
await new Promise((r) => setTimeout(r, 800))
const hit = await page.$('ul button')
if (!hit) throw new Error('search returned no cats')
await hit.click()
await new Promise((r) => setTimeout(r, 2500))
const callsign = await page.$eval('aside', (el) => el.textContent?.slice(0, 40))
console.log('card open for:', callsign)
await page.screenshot({ path: `${OUT}/ui-card.png` })

// Trails on.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'TRAILS')
  b?.click()
})
await new Promise((r) => setTimeout(r, 9000))
await page.screenshot({ path: `${OUT}/ui-trails.png` })

// Piles on, zoomed out where they earn their keep.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'PILES')
  b?.click()
})
await page.goto(`${BASE}/#6/50.90/4.90`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 14000))
await page.screenshot({ path: `${OUT}/ui-piles.png` })
await page.close()

// A phone.
const phone = await browser.newPage()
await phone.setViewport({ width: 375, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await phone.goto(`${BASE}/#8.5/51.47/-0.45`, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 16000))
const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
console.log('mobile horizontal overflow:', wide)
const attrib = await phone.evaluate(() => {
  const el = document.querySelector('.maplibregl-ctrl-attrib')
  if (!el) return 'missing'
  const r = el.getBoundingClientRect()
  const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return el.contains(mid) || mid === el ? 'visible' : `covered by ${mid?.className?.slice(0, 40)}`
})
console.log('mobile attribution:', attrib)
await phone.screenshot({ path: `${OUT}/ui-mobile.png` })

// And the card as a bottom sheet.
await phone.type('input[aria-label="Search cats"]', 'CAT')
await new Promise((r) => setTimeout(r, 800))
const pick = await phone.$('ul button')
if (pick) {
  await pick.click()
  await new Promise((r) => setTimeout(r, 2500))
  await phone.screenshot({ path: `${OUT}/ui-mobile-card.png` })
}

await browser.close()
