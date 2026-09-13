# PURRADAR

**REAL PLANES. CATS INSTEAD.**

A live aircraft tracker where every aircraft is drawn as a cat. The positions,
headings, altitudes and callsigns are real ADS-B data, updated every few
seconds. The cats are not.

---

## The one rule

**Every cat on the map is a real aircraft that is really flying.** There is no
mock data, no demo mode, no seeded fixtures. If the feed fails, the app shows
`CAT TRAFFIC OFFLINE` and an empty map. If the view is zoomed out further than
one upstream query can honestly cover, it says `ZOOM IN FOR CATS` rather than
showing a fraction of the sky as though it were all of it.

Two places deliberately show nothing instead of something:

| State | Cause | What the user sees |
|---|---|---|
| `ZOOM IN FOR CATS` | zoom < 5.2, where one 250nm circle cannot fill the viewport | branded panel explaining the limit |
| `CAT TRAFFIC OFFLINE` | every provider failed and the cache is empty | branded panel, retrying every 4s |
| `SHOWING LAST KNOWN CATS` | every provider failed but a recent answer is cached | the cached cats, explicitly labelled stale |

If you are tempted to add a fallback that invents positions, don't.

---

## Running it

```bash
npm install          # also generates sprites + copies the maplibre worker
npm run dev          # http://localhost:3000
npm run build && npm start
```

No API keys, no `.env`. Both the basemap and the ADS-B feeds are open.

### Generated assets

`npm run dev`, `npm run build` and `npm install` all run two generators first:

| Script | Writes | Why |
|---|---|---|
| `scripts/build-cat-sprites.mjs` | `public/cats/*.png` | trims and sizes the drawings in `cats/` |
| `scripts/copy-maplibre-worker.mjs` | `public/maplibre/*.mjs` | see *MapLibre's worker* below |

Both outputs are gitignored. `cats/` is the source of truth.

---

## Architecture

```
browser                      server                       upstream
───────                      ──────                       ────────
CatMap                       /api/cats                    adsb.fi
  poll every 4s  ──bbox──▶     quantised cache key          (1 req/sec)
  CatTracker                   in-flight dedupe           adsb.lol
  rAF @ ~12fps                 paced provider queue         (fallback)
  GeoJSON → symbol layer       stale-serve on failure
```

### Why the proxy exists

Neither feed has a bounding-box endpoint — both answer a **circle**, capped at
**250 nautical miles** — and both rate-limit per IP. Because every visitor's
request would leave from this server's single IP, naive per-client polling
would trip the limit the moment two people opened the site.

[`src/app/api/cats/route.ts`](src/app/api/cats/route.ts) keeps it inside the
limits regardless of traffic:

- **Quantised cache keys** — viewport centres round to a 0.25°/1° grid and radii
  bucket into 25/60/120/200/250nm, so a hundred people looking at London are one
  upstream query.
- **In-flight dedupe** — simultaneous misses on one key await a single promise
  instead of each starting their own request.
- **A paced queue** — upstream calls are spaced by each provider's published
  minimum interval, globally rather than per request.
- **Stale-serve** — when every provider fails, the last good answer is returned
  with `stale: true` rather than an error. Only an empty cache is an outage.

### Client-side interpolation

The feed answers every few seconds; without interpolation the cats teleport.
[`src/lib/interpolate.ts`](src/lib/interpolate.ts) keeps, per aircraft, the fix
it was last drawn at and the fix it is heading to, and walks between them.

- Past the known fix it **dead-reckons** along the track at ground speed rather
  than freezing — closer to the truth, since the aircraft did not stop — capped
  at 20 seconds so a cat that has gone quiet stops inventing distance.
- Roughly a quarter of traffic reports **no `track` field at all**, so heading is
  derived from the bearing between successive fixes and eased 0.5 toward the
  target, which stops a cat spinning the long way round.
- `tracker.frozen` disables all of this for `prefers-reduced-motion`: positions
  still update as the feed reports them, but nothing glides.

### Rendering

One GeoJSON source feeding one symbol layer — **not** DOM markers. Thousands of
DOM nodes would make panning unusable; MapLibre draws symbols on the GPU.

- The **poll loop** (4s) and the **render loop** (rAF, throttled to ~12fps) are
  independent. Anything that only changes when the feed does — trails, cat piles
  — is built on the poll, not the frame.
- Filters are **layer expressions**, so changing one costs no JavaScript.
- `icon-rotate` takes the aircraft's track unmodified, because the drawings are
  nose-up and 0° is north for both.

Measured on an M-series Mac, real GPU, labels on, via `scripts/perf.mjs`:

| Cats | Median frame | p95 | Frames over 16.7ms |
|---|---|---|---|
| 2,134 | 8.3 ms | 9.0 ms | 0.2% |
| 4,244 | 8.3 ms | 9.2 ms | 0.7% |
| 8,584 | 8.3 ms | 10.0 ms | 1.6% |

Since no real 250nm circle holds that many aircraft, `scripts/perf.mjs` inflates
the real API response through CDP — the app renders them through exactly its
production path, with no test-only code shipped.

---

## Adding a data source

Implement [`AircraftProvider`](src/lib/providers/types.ts) and add it to the
array in [`src/lib/providers/index.ts`](src/lib/providers/index.ts). Order is
priority: the first that answers wins, the rest are fallbacks.

```ts
export interface AircraftProvider {
  readonly id: string
  /** Shown in the UI. Required by every provider's terms. */
  readonly attribution: string
  /** Minimum ms between upstream calls, per their published limits. */
  readonly minIntervalMs: number
  fetchAround(lat, lon, radiusNm, signal?): Promise<FeedResult>
  /** Optional. Without it, share pages cannot resolve that provider. */
  fetchByHex?(hex, signal?): Promise<Cat | null>
}
```

`normalize()` in the same file converts a readsb-family aircraft record into the
app's `Cat`. Its field handling comes from live responses, not from memory:

| Field | Reality |
|---|---|
| `flight` | padded with trailing spaces |
| `alt_baro` | the **string** `"ground"` when on the deck, otherwise feet |
| `track` | **absent on much traffic** — fall back to `true_heading`, `mag_heading`, then derive |
| `r` / `t` | registration / ICAO type code |
| `category` | ADS-B emitter category; `A4`/`A5` heavy, `A7` rotorcraft |

There is no `on_ground` field. Ground state is `alt_baro === "ground"`.

---

## Callsign → cat

[`src/lib/catspeak.ts`](src/lib/catspeak.ts) holds every cat-ification rule.
Nothing is random: **breed and callsign are both derived from the ICAO hex**,
which is fixed to the airframe, so a given aircraft is always the same cat.

```
UAL1487  →  MEOW 1487      operator prefix mapped, flight number kept
BAW83A   →  HISS 83A
N680BA   →  CAT N680BA     private registration keeps its identity
(no callsign) → CAT A1B2C3  falls back to the hex
```

- `AIRLINE_CAT` maps real ICAO operator codes to cat words, so an aviation
  person reads `MEOW1487` and knows it is United.
- `breedFor(hex)` is FNV-1a over the hex, modulo the breed list — **adding a
  breed reshuffles which aircraft is which cat.** That is harmless but not
  silent.
- Helicopters (`A7`) are always forced to Gray Tabby; a rotorcraft reading as an
  airliner loses the joke.
- `scaleFor()` carries what a separate silhouette used to: heavies draw 1.3×,
  helicopters 0.78×.

### Adding a cat

1. Draw it **top-down, nose pointing up**, on transparency, roughly 0.41 aspect.
   The cyan sticker outline is what makes it findable on a dark basemap.
2. Save it as `cats/<slug>.png`.
3. Add the breed to `BREEDS` and `BREED_ICONS` in `src/lib/catspeak.ts`.

The build trims and sizes it automatically. Sprite height is fixed, not width,
so every breed matches on the map regardless of how much tail it has.

---

## Swapping the basemap

The style URL is in [`src/components/CatMap.tsx`](src/components/CatMap.tsx):

```ts
style: 'https://tiles.openfreemap.org/styles/dark',
```

Any MapLibre style JSON works. Three things to carry over:

1. **Attribution.** OpenFreeMap's style supplies its own; the adsb.fi credit is
   added via `customAttribution` and is required with a link.
2. **The tint pass.** The `m.on('load')` handler recolours background, water and
   label layers toward the brand palette. It is wrapped in try/catch — an
   upstream style change must never stop the cats rendering.
3. **Glyphs.** The cat labels use `'text-font': ['Noto Sans Regular']`. If the
   new style's glyph endpoint does not serve that face, labels silently vanish.

For a keyed provider, put the key in an env var and read it server-side; do not
inline it into the client bundle.

---

## Things that will bite you

**MapLibre's stylesheet loads after Tailwind.** It is imported from the map
component, so on equal specificity its rules win. Two bugs came from this:
`.maplibregl-map { position: relative }` beat `absolute inset-0` and collapsed
the map container to zero height; and `.maplibregl-ctrl-bottom-right { bottom: 0 }`
beat the mobile override that keeps attribution clear of the controls. Every
map-chrome rule in `globals.css` is prefixed with `.maplibregl-map` to outrank
the library.

**MapLibre's worker.** MapLibre 6 resolves `maplibre-gl-worker.mjs` relative to
`import.meta.url`, which Turbopack rewrites to the bundled chunk URL. The worker
then 404s, **no vector tiles are ever fetched, and the map stays blank with no
error raised at all.** `scripts/copy-maplibre-worker.mjs` copies the worker and
its shared chunk into `public/maplibre/` at build time and `setWorkerUrl` points
at them. Copied rather than committed so they cannot drift from the installed
version.

**`backdrop-filter` creates a stacking context.** Every `.glass` panel is
therefore its own stacking context, and a later sibling paints over an earlier
sibling's absolutely-positioned children regardless of their `z-index`. The
search dropdown needs `z-20` on its own panel, not just on the dropdown.

**Satori is stricter than a browser.** In `/api/share/[hex]`, any `<div>` with
more than one child must state its `display`. `{a} · {b}` is three children.

**Zoom expressions cannot nest.** `icon-size` multiplies each cat's own scale
inside the `interpolate` outputs, because the style spec only allows a zoom
expression at the top level of a property.

---

## Data sources, terms and limits

| Source | Role | Limit | Terms |
|---|---|---|---|
| [adsb.fi](https://adsb.fi) | primary ADS-B | 1 req/sec (published) | attribution **with a link** required; **personal, non-commercial use only** |
| [adsb.lol](https://adsb.lol) | fallback ADS-B | undocumented; measured ~50% 429 at 0.5 req/s from one IP | ODbL; API key required in future; contact them for production use |
| [OpenFreeMap](https://openfreemap.org) | basemap | none | free, commercial use allowed, attribution required |

> ⚠️ **adsb.fi is personal, non-commercial use only.** If PURRADAR ever carries
> advertising or a paid tier, the feed has to be renegotiated. adsb.lol asks to
> be contacted for production use as well. This is the first thing to sort out
> before monetising anything.

Flightradar24 is **not** used, scraped, or referenced. No layout, icon, colour
or name is taken from any existing tracker.

### Known limitations

- **Route information is unavailable.** `adsb.lol`'s `routeset` endpoint returned
  empty for live callsigns, so origin and destination are not shown — the card
  says `HEADED TO: CAT BUSINESS`, which is honest rather than blank.
- **Coverage is uneven.** A 250nm circle over Frankfurt returns ~660 aircraft;
  over Orlando it returns ~50, half of them on the ground. Sparse views are the
  feed, not a bug.
- **Search covers loaded cats only.** The feeds answer circles, not queries, so
  search filters what is already in memory for the current view.

---

## Accessibility

Lighthouse: **accessibility 100, best practices 100, SEO 100**. Performance is
70 desktop / 53 mobile-emulated — dominated by MapLibre's parse and execute
under 4× CPU throttling with software WebGL. Real-world frame times are in the
table above.

`prefers-reduced-motion: reduce` freezes interpolation entirely, stops the
header ticker and the pulsing status dot, and makes `easeTo` instant. Verified
by `scripts/check-reduced-motion.mjs`.

**Audio is off until asked for.** Chaos Mode's meows are synthesised with the
Web Audio API — no audio files, no licence — and the `AudioContext` is only
created on the user gesture that turns the mode on.

---

## Scripts

| Command | What it does |
|---|---|
| `node scripts/shoot.mjs` | screenshots Florida / Europe / London / zoomed-out |
| `node scripts/shoot-ui.mjs` | exercises search, card, trails, piles, mobile |
| `HEADFUL=1 MULTIPLY=5 node scripts/perf.mjs` | frame-time profile under load |
| `node scripts/check-reduced-motion.mjs` | proves reduced-motion actually stops motion |

They drive the installed Chrome via `puppeteer-core` and need `npm start`
running on port 3111 (override with `BASE=`).

---

## Licence

Code: MIT. The cat drawings in `cats/` are the project's own artwork. Aircraft
data belongs to its respective feeds under their terms above.
