/**
 * What the camels carry: nothing, or the load that stands for the running
 * tool. `alert` is only ever drawn (a red "!" after a tool failed), never kept.
 */
export type Cargo =
  | 'none'
  | 'paper'
  | 'lens'
  | 'code'
  | 'gear'
  | 'chest'
  | 'alert'

export type Caravan = {
  /** False once the person put the theme away with /rakuda-theme off. */
  isOn: boolean
  /**
   * Whether the OS (or the `prefersReducedMotion` setting) asks for less
   * motion; null until it has been read, and nothing moves until then.
   */
  isReduced: boolean | null
  /**
   * `working`: a turn runs and every camel carries `cargo`. `delivering`: the
   * answer is back, each camel carries its load as far as the oasis.
   * `resting`: the camels sit, unloaded.
   */
  phase: 'resting' | 'working' | 'delivering'
  cargo: Cargo
  /** Milliseconds the caravan had walked when it last stopped. */
  walkedMs: number
  /** The clock when it last set off; null while it rests. */
  resumedAt: number | null
  /** The walked milliseconds at which the delivery began. */
  deliverAt: number
  /** The clock until which the loads show a red "!": a tool failed. 0 for none. */
  alertUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    'rakuda-theme': { caravan: Shaped<Caravan> }
  }
}
