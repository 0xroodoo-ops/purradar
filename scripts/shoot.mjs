// Screenshot harness. Drives the installed Chrome against a running server so
// the map can be captured with real traffic in it.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE ?? 'http://localhost:3111'
const OUT = process.env.OUT ?? '/tmp/purradar-shots'
const SETTLE = Number(process.env.SETTLE ?? 15000)

const VIEWS = [
  { name: 'florida', hash: '#7/28.40/-81.30' },
  { name: 'europe', hash: '#6.4/50.90/4.90' },
  { name: 'london', hash: '#8.5/51.47/-0.45' },
  { name: 'zoomed-out', hash: '#3.4/44.00/-20.00' },
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
})

for (const v of VIEWS) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log(`[${v.name}] pageerror:`, e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[${v.name}] console:`, m.text())
  })
  await page.goto(`${BASE}/${v.hash}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, SETTLE))
  const count = await page.evaluate(() => document.querySelector('.tabular')?.textContent ?? '?')
  console.log(`[${v.name}] cats tracked: ${count}`)
  await page.screenshot({ path: `${OUT}/${v.name}.png` })
  await page.close()
}

await browser.close()
