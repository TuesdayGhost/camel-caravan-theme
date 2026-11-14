import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Caravan } from '../types'
import {
  ALERT_MS,
  backdropSvg,
  BAND_ROWS,
  bandCells,
  cargoOf,
  CROSSING_MS,
  RESTING,
  setOff,
  stop,
  walked,
} from './caravan'

const PLUGIN = 'rakuda-theme'
const BACKDROP = 'rakuda-caravan'
// Not `theme`: that is the engine's own command (the terminal's color theme).
const COMMAND = 'rakuda-theme'
/** The other walking theme's command: turning this one on puts that one away. */
const OTHER_THEME = 'ari-theme'
const KEPT = 'isOn'
const RASTER = 'caravan'
const TICK_MS = 250
const RECHECK_MS = 10 * 60_000
const MIN_COLUMNS = 24
const MAX_COLUMNS = 512

// Change the tag when Caravan's fields change: it declines what an earlier
// version kept in the session, which outlives a reload.
const caravan = atom(
  { plugin: 'rakuda-theme', key: 'caravan' } as const,
  RESTING,
  { shape: 'caravan-2' },
)

const rest = (held: Caravan, now: number): Caravan => ({
  ...stop(held, now),
  phase: 'resting',
  cargo: 'none',
  alertUntil: 0,
})

// Reads Windows' "Animation effects" switch: False while it is off.
const WINDOWS_ANIMATIONS = [
  "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;",
  'public class RakudaMotion{[DllImport("user32.dll")]public static extern bool ',
  "SystemParametersInfo(uint a,uint b,ref bool c,uint d);}';",
  '$on=$false;[void][RakudaMotion]::SystemParametersInfo(0x1042,0,[ref]$on,0);$on',
].join('')

/** Whether the person asks for less motion: the setting, else the OS's own. */
const prefersLessMotion = async ($: EngineInterface): Promise<boolean> => {
  const setting = await $.settings.read({ key: 'prefersReducedMotion' })
  if (setting === true) return true
  const asks = async (
    argv: readonly string[],
    answer: string,
  ): Promise<boolean> => {
    try {
      const ran = await $.process.run(argv, { timeoutMs: 15_000 })

      return ran.exitCode === 0 && ran.stdout.trim().toLowerCase() === answer
    } catch {
      // No such command on this system: it is not the one to ask.
      return false
    }
  }
  if ((await $.env.get('OS')) === 'Windows_NT') {
    return asks(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        WINDOWS_ANIMATIONS,
      ],
      'false',
    )
  }

  return (
    (await asks(
      ['defaults', 'read', 'com.apple.universalaccess', 'reduceMotion'],
      '1',
    )) ||
    (await asks(
      ['gsettings', 'get', 'org.gnome.desktop.interface', 'enable-animations'],
      'false',
    ))
  )
}

// The module's own copy of the state, for the ticks between redraws; a
// reload starts it over and `session.start` reads it back.
let live: Caravan = RESTING
let band: { id: string; columns: number } | undefined
let drawn = ''
let restTimer: Timer | undefined
let alertTimer: Timer | undefined
let isTicking = false
let ticksToSkip = 0
let checkedAt = 0

const change = async (
  $: EngineInterface,
  fn: (held: Caravan) => Caravan,
): Promise<Caravan> => {
  live = await update($, caravan, fn)

  return live
}

const showTheme = async ($: EngineInterface): Promise<void> => {
  try {
    // The scene's name goes under two names, as theme-examples sets it: the
    // newest engines read `scene`, the ones before them `id`.
    const backdrop = {
      scene: BACKDROP,
      id: BACKDROP,
      // Dark panels and next to no blur: the text stays sharp, and the
      // camels stay camels where a panel lies over them.
      glass: { blur: 2, tint: '#12152b', opacity: 0.62 },
    }
    await $.theme.set({ backdrop })
  } catch {
    // A build with no themes: the band above the prompt still draws.
  }
}

/** Puts the other walking theme away, where it is installed: one at a time. */
const hushOther = async ($: EngineInterface): Promise<void> => {
  try {
    const commands = await $.command.list()
    if (commands.some(one => one.name === OTHER_THEME)) {
      await $.command.run({ command: OTHER_THEME, args: 'off' })
    }
  } catch {
    // It stays: the person can put it away by its own command.
  }
}

const recheckMotion = async ($: EngineInterface): Promise<void> => {
  try {
    checkedAt = await $.clock.now()
    const isReduced = await prefersLessMotion($)
    if (isReduced !== live.isReduced) {
      await change($, held => ({ ...held, isReduced }))
    }
  } catch {
    // Unread, nothing moves: the safe side.
  }
}

const tick = async ($: EngineInterface): Promise<void> => {
  // The stars twinkle by the clock, so the band is repainted at rest too.
  const isMoving =
    band !== undefined && live.isOn && live.isReduced === false
  if (!isMoving || band === undefined || isTicking) return
  if (ticksToSkip > 0) {
    ticksToSkip -= 1

    return
  }
  isTicking = true
  try {
    const cells = bandCells(live, band.columns, await $.clock.now())
    if (cells !== drawn) {
      const blit = await $.ui.blit({ requestId: band.id, key: RASTER, cells })
      // Not on screen (the band is folded away, or resizing): ease off.
      if (blit.deny === undefined) drawn = cells
      else ticksToSkip = 8
    }
  } catch {
    ticksToSkip = 8
  } finally {
    isTicking = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'ラクダのキャラバンのテーマを出す・しまう',
        argumentHint: '[on|off]',
        immediate: true,
      })
    } catch {
      // A refused name must not cost the session its theme.
    }
    // A turn or a delivery a reload cut short has lost its timer: the camels rest.
    const now = await $.clock.now()
    // On or off is the person's choice, kept between sessions.
    const kept = await $.store.get(KEPT)
    await change($, held => ({
      ...(held.phase === 'resting' ? held : rest(held, now)),
      isOn: typeof kept === 'boolean' ? kept : held.isOn,
    }))
    // The first time this theme loads it takes the stage from the other one.
    if (typeof kept !== 'boolean' && live.isOn) {
      await $.store.set(KEPT, true)
      await hushOther($)
    }
    if (live.isOn) await showTheme($)
    void recheckMotion($)
    $.clock.every(TICK_MS, () => {
      void tick($)
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    const isOn = asked === 'on' ? true : asked === 'off' ? false : !live.isOn
    await change($, held => ({ ...held, isOn }))
    await $.store.set(KEPT, isOn)
    if (isOn) {
      await hushOther($)
      await showTheme($)
      void recheckMotion($)

      return { text: 'キャラバンが出発したよ。' }
    }
    try {
      await $.theme.clear()
    } catch {
      // Nothing stood to clear.
    }

    return { text: 'キャラバンをしまったよ。' }
  })

  // Claude starts working: the caravan sets off, unloaded until a tool runs.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    try {
      restTimer?.cancel()
      const now = await $.clock.now()
      await change($, held =>
        setOff(
          { ...held, phase: 'working', cargo: 'none', alertUntil: 0 },
          now,
        ),
      )
      if (now - checkedAt > RECHECK_MS) void recheckMotion($)
    } catch {
      // The theme is a nicety: the turn goes on without it.
    }

    return next(e)
  })

  // The running tool decides the load; one that fails turns it to a red "!".
  on('tool.call', async ($, e, next) => {
    const cargo = cargoOf(String(e.tool))
    if (live.phase === 'working' && live.cargo !== cargo) {
      try {
        await change($, held =>
          held.phase === 'working' ? { ...held, cargo } : held,
        )
      } catch {
        // As above.
      }
    }
    const result = await next(e)
    if (result.isError === true) {
      try {
        const now = await $.clock.now()
        await change($, held =>
          held.phase === 'resting'
            ? held
            : { ...held, alertUntil: now + ALERT_MS },
        )
        // The write that ends the alert redraws the loads as they were.
        alertTimer?.cancel()
        alertTimer = $.clock.after(ALERT_MS, () => {
          void change($, held =>
            held.alertUntil === 0 ? held : { ...held, alertUntil: 0 },
          ).catch(() => {})
        })
      } catch {
        // As above.
      }
    }

    return result
  })

  // The answer is back: each camel carries its load to the oasis, then they rest.
  on('turn.complete', async ($, e, next) => {
    const answer = await next(e)
    if (e.agentId !== undefined) return answer
    try {
      const now = await $.clock.now()
      await change($, held => ({
        ...setOff(held, now),
        phase: 'delivering',
        deliverAt: walked(held, now),
      }))
      restTimer?.cancel()
      restTimer = $.clock.after(CROSSING_MS, () => {
        void (async () => {
          const at = await $.clock.now()
          await change($, held =>
            held.phase === 'delivering' ? rest(held, at) : held,
          )
        })().catch(() => {})
      })
    } catch {
      // As above.
    }

    return answer
  })

  // The desktop app: the scene behind the chat.
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    const props: { scene?: unknown; id?: unknown; plugin: string } = e.props
    const isMine =
      props.plugin === PLUGIN && (props.scene ?? props.id) === BACKDROP
    // Only a window has room behind the chat, and only its table has `Svg`.
    if (!isMine || e.surface !== 'desktop') return next(e)
    const { Svg } = $.ui.resolve(e)
    const held = await read($, caravan)

    return (
      <Svg
        isInteractive
        alt="星のまたたく月夜の沙漠を、ラクダのキャラバンが左から右へ歩いている"
        source={backdropSvg(held, await $.clock.now())}
      />
    )
  })

  // The terminal has nothing behind the text: the caravan walks above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const held = await read($, caravan)
    const columns = Math.min(MAX_COLUMNS, Math.floor(e.props.bodyColumns))
    if (!held.isOn || columns < MIN_COLUMNS) {
      band = undefined

      return next(e)
    }
    const { Raster } = $.ui.resolve(e)
    const cells = bandCells(held, columns, await $.clock.now())
    band = { id: e.requestId, columns }
    drawn = cells

    return <Raster key={RASTER} columns={columns} rows={BAND_ROWS} cells={cells} />
  })
}
