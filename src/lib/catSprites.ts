import { BREEDS, BREED_ICONS, type Breed } from './catspeak'

/**
 * The cats.
 *
 * Drawn by hand and kept in cats/, then trimmed and sized into public/cats by
 * scripts/build-cat-sprites.mjs. They are top-down with the nose pointing up,
 * which is what lets `icon-rotate` take an aircraft's track unmodified — 0° is
 * north for both the cat and the aeroplane.
 *
 * Each drawing already carries its own cyan outline, so the map needs no glow
 * behind them: that outline is what makes a 40px cat findable over a dark
 * basemap.
 */

/** Rasterised sprite height, matching SPRITE_HEIGHT in the build script. */
export const SPRITE_HEIGHT = 200
/** Sprites are drawn at 2× and halved on screen, so they stay crisp zoomed in. */
export const SPRITE_PIXEL_RATIO = 2

/**
 * How far down to nudge the drawing so the aircraft's reported position sits
 * under the cat's shoulders rather than halfway along its tail. In icon-size
 * units against a 100px-tall icon, so ~20% of the height.
 */
export const ICON_OFFSET: [number, number] = [0, 18]

export function spriteId(breed: Breed): string {
  return BREED_ICONS[breed]
}

/** Every sprite the map needs, with the URL to load it from. */
export function allSprites(): { id: string; url: string }[] {
  return BREEDS.map((breed) => ({
    id: spriteId(breed),
    url: `/cats/${BREED_ICONS[breed]}.png`,
  }))
}
