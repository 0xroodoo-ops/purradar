// Confirms that prefers-reduced-motion actually stops the cats moving.
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  defaultViewport: { width: 1200, height: 800 },
})

for (const reduce of [false, true]) {
  const page = await browser.newPage()
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' },
  ])
  await page.goto('http://localhost:3111/#8.5/51.47/-0.45', { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 15000))

  // Sample repeatedly inside one poll interval. Interpolated cats move on
  // almost every sample; frozen ones only move when the feed reports, which
  // can happen at most once in this window.
  const shots = []
  for (let i = 0; i < 6; i++) {
    shots.push(
      await page.screenshot({
        encoding: 'base64',
        clip: { x: 300, y: 250, width: 500, height: 300 },
      }),
    )
    await new Promise((r) => setTimeout(r, 250))
  }
  const changes = shots.slice(1).filter((s, i) => s !== shots[i]).length
  console.log(
    `prefers-reduced-motion: ${(reduce ? 'reduce' : 'no-preference').padEnd(14)} → ${changes}/5 samples moved`,
  )
  await page.close()
}

await browser.close()
