import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { SITTING, WALKING } from '../hooks/caravan'

const COLUMNS = 84

const BAND = {
  plugin: 'rakuda-theme',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: COLUMNS,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const BACKDROP = {
  plugin: 'rakuda-theme',
  component: 'Backdrop',
  requestId: 'backdrop',
  surface: 'desktop',
  // Under both names, as the hook reads it: `scene` on the newest engines.
  props: {
    scene: 'rakuda-caravan',
    id: 'rakuda-caravan',
    plugin: 'rakuda-theme',
    glass: false,
  },
} as const

/** A Raster's cells as text, a row per line. */
const textOf = (cells: string): string[] => {
  const bytes = Uint8Array.from(atob(cells), one => one.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const rows: string[] = []
  for (let at = 0; at < bytes.length; at += 12 * COLUMNS) {
    let row = ''
    for (let cell = 0; cell < COLUMNS; cell++) {
      row += String.fromCodePoint(view.getUint32(at + cell * 12, true))
    }
    rows.push(row)
  }

  return rows
}

const setUp = (
  on: On,
  animations: 'True' | 'False',
  commands: string[] = [],
) => {
  const blits: string[] = []
  const ran: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'rakuda-theme' } }))
  on('command.list', () => ({
    value: commands.map(name => ({
      name,
      description: '',
      source: 'plugin' as const,
    })),
  }))
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`)

    return { text: '' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: 'Windows_NT' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: `${animations}\r\n`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'no window' } }))
  on('ui.blit', (_, e) => {
    if ('cells' in e) blits.push(e.cells)

    return { value: {} }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // A Bash command named `fail` errors; every other call answers.
  on('tool.call', (_, e) =>
    e.tool === 'Bash' && e.command === 'fail'
      ? { result: 'boom', isError: true as const }
      : { result: {} },
  )

  return { blits, ran, clock }
}

const DONE = {
  reason: 'answer',
  answer: 'done',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
} as const

test('the camel is sixteen dots by twelve, walking and sitting', () => {
  for (const frame of [...WALKING, SITTING]) {
    expect(frame.length).toBe(12)
    expect(frame.every(row => row.length === 16)).toBe(true)
  }
})

test('the caravan carries what the running tool stands for', async ($, on) => {
  const { blits, ran, clock } = setUp(on, 'True', ['ari-theme'])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // Its first load puts the other walking theme away.
  expect(ran).toEqual(['ari-theme off'])

  const ui = await $.ui.mount(BAND)
  const rowsNow = async () =>
    textOf(String((await ui.find({ type: 'Raster' }))?.props?.cells))

  let rows = await rowsNow()
  expect(rows.length).toBe(4)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: 'a', old_string: 'b', new_string: 'c' })
  rows = await rowsNow()
  expect(rows[0]).toContain('{}')

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  rows = await rowsNow()
  expect(rows[0]).toContain('*')
  expect(rows[0]).not.toContain('{}')

  // They walk: a tick repaints the band without a redraw.
  const before = blits.length
  await clock.advance(5_000)
  expect(blits.length).toBeGreaterThan(before)

  // The answer is back: loads go to the oasis, then the camels sit.
  await $.turn.complete(DONE)
  await clock.advance(81_000)
  rows = await rowsNow()
  expect(rows[0]).not.toContain('*')
  // At rest the stars still twinkle.
  const rested = blits.length
  await clock.advance(5_000)
  expect(blits.length).toBeGreaterThan(rested)
  await ui.unmount()
})

test('a tool that fails turns the loads to "!" for a while', async ($, on) => {
  const { clock } = setUp(on, 'True')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)
  const rowsNow = async () =>
    textOf(String((await ui.find({ type: 'Raster' }))?.props?.cells))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  let rows = await rowsNow()
  expect(rows[0]).toContain('*')
  expect(rows[0]).not.toContain('!')

  await $.tool.call({ tool: 'Bash', command: 'fail' })
  rows = await rowsNow()
  expect(rows[0]).toContain('!')
  expect(rows[0]).not.toContain('*')

  // The mark passes: the loads are the running tool's again.
  await clock.advance(7_000)
  rows = await rowsNow()
  expect(rows[0]).not.toContain('!')
  expect(rows[0]).toContain('*')
  await ui.unmount()
})

test('with animations off in the OS nothing moves',async ($, on) => {
  const { blits, clock } = setUp(on, 'False')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  await clock.advance(10_000)
  expect(blits.length).toBe(0)
  await ui.unmount()
})

test('the desktop backdrop is one night scene that honours reduced motion', async ($, on) => {
  setUp(on, 'True')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: 'a' })

  const ui = await $.ui.mount(BACKDROP)
  const source = String((await ui.find({ type: 'Svg' }))?.props?.source)
  expect(source.startsWith('<svg')).toBe(true)
  expect(source.length).toBeLessThan(131072)
  expect(source).toContain('prefers-reduced-motion: reduce')
  expect(source.match(/class="camel"/g)?.length).toBe(6)
  expect(source.match(/class="cargo"/g)?.length).toBe(6)
  expect(source.match(/class="star"/g)?.length).toBe(70)
  await ui.unmount()
})
