import type { Caravan, Cargo } from '../types'

// A caravan under a desert night, drawn for both surfaces: where each camel
// is and what it carries is a function of the milliseconds walked, so a
// redraw never moves one. The stars twinkle by the clock.

/** Milliseconds a camel takes from the left edge to the right one. */
export const CROSSING_MS = 80_000
/** How far along the crossing the oasis stands, 0 to 1. */
export const OASIS_AT = 0.9
/** Milliseconds the loads show a red "!" for after a tool fails. */
export const ALERT_MS = 6_000

export const RESTING: Caravan = {
  isOn: true,
  isReduced: null,
  phase: 'resting',
  cargo: 'none',
  walkedMs: 0,
  resumedAt: null,
  deliverAt: 0,
  alertUntil: 0,
}

const fraction = (value: number): number => value - Math.floor(value)

/** The milliseconds walked as of `now`. */
export const walked = (caravan: Caravan, now: number): number =>
  caravan.walkedMs + (caravan.resumedAt === null ? 0 : now - caravan.resumedAt)

export const setOff = (caravan: Caravan, now: number): Caravan =>
  caravan.resumedAt === null ? { ...caravan, resumedAt: now } : caravan

export const stop = (caravan: Caravan, now: number): Caravan => ({
  ...caravan,
  walkedMs: walked(caravan, now),
  resumedAt: null,
})

/** How far camel `index` of `count` is along the crossing, 0 to 1. */
export const along = (walkedMs: number, index: number, count: number): number =>
  fraction(walkedMs / CROSSING_MS + index / count)

/**
 * The milliseconds camel `index` still carries its load for, from `walkedMs`:
 * for good while a turn runs, as far as the oasis once the answer is back.
 */
export const carriesFor = (
  caravan: Caravan,
  walkedMs: number,
  index: number,
  count: number,
): number => {
  if (caravan.cargo === 'none' || caravan.phase === 'resting') return 0
  if (caravan.phase === 'working') return Infinity
  const toOasis =
    fraction(OASIS_AT - along(caravan.deliverAt, index, count)) * CROSSING_MS

  return Math.max(0, toOasis - (walkedMs - caravan.deliverAt))
}

/** The load to draw at `now`: a red "!" for a while after a tool failed. */
export const shownCargo = (caravan: Caravan, now: number): Cargo =>
  now < caravan.alertUntil ? 'alert' : caravan.cargo

/** The load that stands for a tool, by its name. */
export const cargoOf = (tool: string): Cargo => {
  const name = tool.toLowerCase()
  if (/grep|glob|search|find/.test(name)) return 'lens'
  if (/^(read|notebookread)$|fetch|read_|get_page/.test(name)) return 'paper'
  if (/edit|write/.test(name)) return 'code'
  if (/bash|powershell|shell/.test(name)) return 'gear'

  return 'chest'
}

// --- The camel -------------------------------------------------------------

// Sixteen dots across and twelve down (eight cells by three rows of braille),
// facing right: two humps, a long neck, a small head with one ear.
const BODY = [
  '..............#.',
  '.............###',
  '...##...##...##.',
  '..####.####..##.',
  '.###########.##.',
  '.#############..',
  '##############..',
  '#.###########...',
] as const
const LEGS = [
  ['#.##......##....', '..##......##....', '..#.#.....#.#...', '..#.#.....#.#...'],
  ['#.##......##....', '..##......##....', '.#..#....#..#...', '.#..#....#..#...'],
] as const
/** The camel walking, a frame for each step of its legs. */
export const WALKING: readonly (readonly string[])[] = LEGS.map(legs => [
  ...BODY,
  ...legs,
])
/** The camel at rest: legs folded under, the body down on the sand. */
export const SITTING: readonly string[] = [
  '................',
  '................',
  '................',
  ...BODY,
  '..###.....###...',
]
const CAMEL_WIDTH = 16

// --- The terminal: four rows of cells above the prompt ----------------------

const DEFAULT = 0x01000000
const CAMEL_COLOR = 0xc9a66b
const SAND_COLOR = 0x7d6c4a
const MOON_COLOR = 0xf5e9a0
const PALM_COLOR = 0x7fb77e
const TRUNK_COLOR = 0x9c7a4d
const WATER_COLOR = 0x5aa9d6
const STAR_COLORS = [0x4a4a5e, 0x8a8aa6, 0xe8e8ff] as const
const CARGO_COLOR: Readonly<Record<Cargo, number>> = {
  none: DEFAULT,
  paper: 0xf0ead6,
  lens: 0x7fb2d6,
  code: 0x8fce84,
  gear: 0xb0bec5,
  chest: 0xe57373,
  alert: 0xff3b30,
}

const MOON = ['.##.', '#...', '#...', '.##.'] as const
// A palm over a pool: fronds, trunk, water, a row of cells each.
const PALM = ['.##..##.', '#.####.#', '#..##..#', '...##...'] as const
const TRUNK = ['...#....', '...#....', '..#.....', '..#.....'] as const
const POOL = ['..#.....', '..#.....', '.##.####', '########'] as const
// Loads drawn in dots, four across; the others are a glyph per cell.
const DOT_CARGO: Readonly<Partial<Record<Cargo, readonly string[]>>> = {
  paper: ['###.', '#.#.', '#.#.', '###.'],
  lens: ['.##.', '#..#', '.##.', '...#'],
  chest: ['....', '.##.', '####', '####'],
}
const GLYPH_CARGO: Readonly<Partial<Record<Cargo, string>>> = {
  code: '{}',
  gear: '*',
  alert: '!',
}

// Braille's bit for the dot at (x, y) of a cell two dots wide, four high.
const DOT_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const
// One dot of a cell, for a star: its place is the star's own.
const STAR_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20] as const
/** Milliseconds a star holds one brightness. */
const TWINKLE_MS = 700
// A star's brightness over its cycle: mostly faint, a slow rise and fall.
const TWINKLE = [0, 0, 1, 2, 1, 0, 0, 1] as const

const noise = (x: number, y: number): number =>
  (Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663)) >>> 0

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const toBase64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += BASE64[a >> 2]
    out += BASE64[((a & 3) << 4) | (b >> 4)]
    out += i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '='
    out += i + 2 < bytes.length ? BASE64[c & 63] : '='
  }

  return out
}

export const BAND_ROWS = 4

/** How many camels a band `columns` wide holds. */
export const camelsFor = (columns: number): number =>
  Math.max(2, Math.round(columns / 28))

/**
 * The band's glyphs and colors, row-major: what `bandCells` packs. Row 0 is
 * sky, with the moon and the loads; rows 1 to 3 hold the camels and the
 * oasis, and the sand runs along the foot of row 3.
 */
export const bandRows = (
  caravan: Caravan,
  columns: number,
  now: number,
): { glyphs: number[]; colors: number[] } => {
  const glyphs = new Array<number>(columns * BAND_ROWS).fill(0x20)
  const colors = new Array<number>(columns * BAND_ROWS).fill(DEFAULT)
  const bits = new Array<number>(columns * BAND_ROWS).fill(0)
  // `y` counts dots down from the top of `row`; past four it is the next row.
  const dot = (x: number, y: number, row: number, color: number): void => {
    if (x < 0 || x >= columns * 2) return
    const cell = (row + (y >> 2)) * columns + (x >> 1)
    bits[cell] = (bits[cell] ?? 0) | (DOT_BITS[y & 3]?.[x & 1] ?? 0)
    colors[cell] = color
  }
  const stamp = (
    sprite: readonly string[],
    left: number,
    row: number,
    color: number,
  ): void => {
    sprite.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        if (line[x] === '#') dot(left + x, y, row, color)
      }
    })
  }
  // The camels stay where they stopped while motion is reduced or unread.
  const isStill = caravan.isReduced !== false
  const walkedMs = isStill ? caravan.walkedMs : walked(caravan, now)
  const span = columns * 2 + CAMEL_WIDTH
  const count = camelsFor(columns)

  // The sand: a broken line of dots along the foot of the band.
  for (let x = 0; x < columns * 2; x++) {
    if (noise(x, 0) % 3 !== 0) dot(x, 3, 3, SAND_COLOR)
  }
  stamp(MOON, 4, 0, MOON_COLOR)
  const oasis = Math.floor(OASIS_AT * span) - CAMEL_WIDTH + 4
  stamp(PALM, oasis, 1, PALM_COLOR)
  stamp(TRUNK, oasis, 2, TRUNK_COLOR)
  stamp(POOL, oasis, 3, WATER_COLOR)

  for (let index = 0; index < count; index++) {
    const left =
      Math.floor(along(walkedMs, index, count) * span) - CAMEL_WIDTH
    const frame =
      caravan.phase === 'resting'
        ? SITTING
        : (WALKING[isStill ? 0 : Math.abs(left) % 2] ?? SITTING)
    stamp(frame, left, 1, CAMEL_COLOR)
    const isCarrying = isStill
      ? caravan.phase === 'working' && caravan.cargo !== 'none'
      : carriesFor(caravan, walkedMs, index, count) > 0
    if (!isCarrying) continue
    // The load rides over the humps, in the row above the camel.
    const cargo = shownCargo(caravan, now)
    const color = CARGO_COLOR[cargo]
    const dots = DOT_CARGO[cargo]
    if (dots !== undefined) stamp(dots, left + 4, 0, color)
    const glyph = GLYPH_CARGO[cargo]
    if (glyph !== undefined) {
      const cell = (left + 5) >> 1
      for (let i = 0; i < glyph.length; i++) {
        if (cell + i < 0 || cell + i >= columns) continue
        glyphs[cell + i] = glyph.charCodeAt(i)
        colors[cell + i] = color
        bits[cell + i] = 0
      }
    }
  }

  // The stars: a dot here and there in the two upper rows, where nothing
  // else is, each with its own beat.
  const beat = isStill ? 0 : Math.floor(now / TWINKLE_MS)
  for (let cell = 0; cell < columns * 2; cell++) {
    const seed = noise(cell % columns, 40 + Math.floor(cell / columns))
    const isFree = bits[cell] === 0 && glyphs[cell] === 0x20
    if (seed % 6 !== 0 || !isFree) continue
    const level = isStill
      ? 1
      : (TWINKLE[(beat + (seed >>> 4)) % TWINKLE.length] ?? 0)
    bits[cell] = STAR_BITS[(seed >>> 8) % STAR_BITS.length] ?? 0x01
    colors[cell] = STAR_COLORS[level] ?? STAR_COLORS[0]
  }
  bits.forEach((value, cell) => {
    if (value !== 0) glyphs[cell] = 0x2800 + value
  })

  return { glyphs, colors }
}

/** The band packed as a Raster's `cells`. */
export const bandCells = (
  caravan: Caravan,
  columns: number,
  now: number,
): string => {
  const { glyphs, colors } = bandRows(caravan, columns, now)
  const bytes = new Uint8Array(glyphs.length * 12)
  const view = new DataView(bytes.buffer)
  glyphs.forEach((glyph, cell) => {
    view.setUint32(cell * 12, glyph, true)
    view.setUint32(cell * 12 + 4, colors[cell] ?? DEFAULT, true)
    view.setUint32(cell * 12 + 8, DEFAULT, true)
  })

  return toBase64(bytes)
}

// --- The desktop app: one SVG behind the chat -------------------------------

const SVG_CAMELS = 6
// The crossing, in percent of the window's width: from off one edge to off
// the other.
const WALK_FROM = -6
const WALK_TO = 106
const SVG_STARS = 70
/**
 * How far above the foot of the window the camels' feet stand, in CSS pixels:
 * the one number to tune. The scene cannot read where the message box is, so
 * this is set to clear that box while it is empty; the sand, the oasis and the
 * caravan keep this height whatever the window's size, and never scale.
 */
export const CARAVAN_BOTTOM_PX = 155
// The dunes are drawn 1600 wide and stretched to the window's width alone;
// the line the camels walk is this far down that drawing, in pixels.
const DUNE_FEET = 88
const CARGO_SVG: Readonly<Record<Cargo, string>> = {
  none: '',
  // A slip of paper with a folded corner.
  paper:
    '<path d="M-4 -19h5l3 3v9h-8z" fill="#f0ead6"/><path d="M-2 -13h4M-2 -10h4" stroke="#8d8672" stroke-width="1" fill="none"/>',
  // A magnifying glass.
  lens: '<circle cx="-1" cy="-14" r="4" fill="none" stroke="#7fb2d6" stroke-width="1.8"/><path d="M2 -11l4 4" stroke="#7fb2d6" stroke-width="2" stroke-linecap="round"/>',
  code: '<text x="0" y="-8" text-anchor="middle" font-size="12" font-weight="bold" fill="#8fce84">{ }</text>',
  // A small gear: a toothed ring.
  gear: '<circle cx="0" cy="-13" r="4.2" fill="none" stroke="#b0bec5" stroke-width="3" stroke-dasharray="2.2 2.2"/><circle cx="0" cy="-13" r="2.6" fill="none" stroke="#b0bec5" stroke-width="1.4"/>',
  // A small chest with a band across it.
  chest:
    '<rect x="-5" y="-16" width="10" height="8" rx="1.5" fill="#e57373"/><path d="M-5 -13h10" stroke="#8c3b3b" stroke-width="1.2"/>',
  // A tool failed: a red exclamation mark.
  alert:
    '<text x="0" y="-6" text-anchor="middle" font-size="16" font-weight="bold" fill="#ff3b30">!</text>',
}

// The terminal's silhouettes, two units to the dot, feet at y = 0.
const pathOf = (frame: readonly string[]): string =>
  `<path d="${frame
    .flatMap((row, y) =>
      [...row].map((mark, x) =>
        mark === '#' ? `M${x * 2 - 16} ${y * 2 - 24}h2v2h-2z` : '',
      ),
    )
    .join('')}"/>`

/** The same stars every time: a dice by a fixed seed. */
const starsSvg = (): string => {
  let state = 20260214
  const roll = (below: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0

    return (state >>> 8) % below
  }
  let stars = ''
  for (let index = 0; index < SVG_STARS; index++) {
    const x = roll(1600)
    const y = roll(820)
    const radius = (8 + roll(10)) / 10
    const seconds = 3 + roll(40) / 10
    const delay = -roll(60) / 10
    stars += `<circle class="star" cx="${x}" cy="${y}" r="${radius}" style="animation-duration:${seconds}s;animation-delay:${delay}s"/>`
  }

  return stars
}

/**
 * The backdrop: a night sky with a crescent moon and slow stars, which fills
 * the window and scales with it, and over it the dunes, an oasis at the right
 * and a caravan, which stand a fixed number of pixels above the window's foot
 * (CARAVAN_BOTTOM_PX) and do not scale. Positions come from the milliseconds
 * walked, through negative animation delays, so a new load redraws without a
 * jump.
 */
export const backdropSvg = (caravan: Caravan, now: number): string => {
  const walkedMs = walked(caravan, now)
  const isWalking = caravan.resumedAt !== null
  const percentAt = (at: number): string =>
    (WALK_FROM + at * (WALK_TO - WALK_FROM)).toFixed(2)
  const camel = pathOf(
    caravan.phase === 'resting' ? SITTING : (WALKING[0] ?? SITTING),
  )
  let camels = ''
  for (let index = 0; index < SVG_CAMELS; index++) {
    const at = along(walkedMs, index, SVG_CAMELS)
    const delay = (-at * CROSSING_MS).toFixed(0)
    const carriesMs = carriesFor(caravan, walkedMs, index, SVG_CAMELS)
    // A load is set down at the oasis: its fade starts when the camel gets there.
    const drop = Number.isFinite(carriesMs)
      ? ` class="cargo drop" style="animation-delay:${carriesMs.toFixed(0)}ms"`
      : ' class="cargo"'
    const cargo =
      carriesMs > 0
        ? `<g transform="translate(-4 -13)"><g${drop}>${CARGO_SVG[shownCargo(caravan, now)]}</g></g>`
        : ''
    // A percentage in an SVG transform is a share of the window's width (the
    // nearest svg's box), so the walk spans any window; the drawing stays in
    // pixels.
    camels += `<g class="camel" style="transform:translateX(${percentAt(at)}%);animation-delay:${delay}ms">${camel}${cargo}</g>`
  }
  const duneHeight = DUNE_FEET + CARAVAN_BOTTOM_PX + 4
  const style = `
.camel{animation:walk ${CROSSING_MS}ms linear infinite;animation-play-state:${isWalking ? 'running' : 'paused'}}
.cargo{opacity:.9}
.drop{animation:drop 600ms ease-in forwards}
.star{fill:#e8e8ff;opacity:.75;animation:twinkle 4s ease-in-out infinite}
@keyframes walk{from{transform:translateX(${WALK_FROM}%)}to{transform:translateX(${WALK_TO}%)}}
@keyframes drop{to{opacity:0;transform:translateY(8px)}}
@keyframes twinkle{50%{opacity:.2}}
@media (prefers-reduced-motion: reduce){.camel,.drop,.star{animation:none!important}.drop{display:none}}`

  // No viewBox on the root: its units are the window's own pixels. The sky
  // scales inside a nested svg; the land hangs from the window's foot.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" font-family="monospace" color="#888"><style>${style}</style>
<svg viewBox="0 0 1600 1000" width="100%" height="100%" preserveAspectRatio="xMidYMax slice"><defs>
<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0e22"/><stop offset="1" stop-color="#1a1d3a"/></linearGradient></defs>
<rect width="1600" height="1000" fill="url(#night)"/>
${starsSvg()}
<g opacity=".85"><circle cx="1330" cy="150" r="44" fill="#f5e9a0"/><circle cx="1350" cy="138" r="40" fill="#0c1026"/></g>
</svg>
<svg class="land" y="100%" overflow="visible"><g transform="translate(0 -${CARAVAN_BOTTOM_PX})">
<svg y="-${DUNE_FEET}" width="100%" height="${duneHeight}" viewBox="0 0 1600 ${duneHeight}" preserveAspectRatio="none">
<path d="M0 60Q200 20 400 55T800 50T1200 60T1600 45V${duneHeight}H0z" fill="#262036"/>
<path d="M0 92Q300 72 600 90T1200 88T1600 92V${duneHeight}H0z" fill="#1b1728"/>
<path d="M0 150Q400 128 800 146T1600 140V${duneHeight}H0z" fill="#171322"/>
</svg>
<svg x="${percentAt(OASIS_AT)}%" overflow="visible"><g transform="translate(0 2)" opacity=".8"><ellipse cx="34" cy="2" rx="40" ry="5" fill="#2c5f7a"/><path d="M0 0q-6 -30 4 -58" fill="none" stroke="#5c4a34" stroke-width="5" stroke-linecap="round"/><path d="M4 -58q-22 -14 -36 2M4 -58q-10 -24 -30 -22M4 -58q8 -24 30 -20M4 -58q24 -12 36 6M4 -58q16 2 22 20" fill="none" stroke="#2f6b4a" stroke-width="4" stroke-linecap="round"/></g></svg>
<g fill="#e8c88e">${camels}</g>
</g></svg>
</svg>`
}
