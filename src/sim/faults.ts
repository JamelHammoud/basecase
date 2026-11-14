import type { MjData, MjModel } from '@mujoco/mujoco';

export type FaultKind = 'limp' | 'weak' | 'stuck' | 'laggy';

export const FAULT_KINDS: readonly FaultKind[] = ['limp', 'weak', 'stuck', 'laggy'];

export const LAG_S = 0.06;

export interface RecordedFault {
  joint: string;
  kind: FaultKind;
  at: number;
  until?: number;
}

const STRENGTH: Record<FaultKind, number> = { limp: 0, weak: 0.5, stuck: 1, laggy: 1 };

interface Lag {
  line: Float64Array;
  at: number;
  primed: boolean;
}

export class ActuatorFaults {
  private readonly range: MjModel['actuator_forcerange'];
  private readonly lagSteps: number;
  private readonly nu: number;
  private readonly saved = new Map<number, [number, number]>();
  private readonly kinds = new Map<number, FaultKind>();
  private readonly held = new Map<number, number>();
  private readonly lags = new Map<number, Lag>();
  private limpAll = false;

  constructor(model: MjModel) {
    this.range = model.actuator_forcerange;
    this.nu = model.nu;
    this.lagSteps = Math.max(1, Math.round(LAG_S / model.opt.timestep));
  }

  kindOf(actuator: number): FaultKind | undefined {
    return this.kinds.get(actuator);
  }

  setLimpAll(limp: boolean) {
    if (limp === this.limpAll) return;

    this.limpAll = limp;

    for (let a = 0; a < this.nu; a++) this.syncRange(a);
  }

  set(actuator: number, kind: FaultKind | null, hold: number) {
    this.held.delete(actuator);
    this.lags.delete(actuator);

    if (kind) this.kinds.set(actuator, kind);
    else this.kinds.delete(actuator);

    if (kind === 'stuck') this.held.set(actuator, hold);

    if (kind === 'laggy') this.lags.set(actuator, { line: new Float64Array(this.lagSteps), at: 0, primed: false });

    this.syncRange(actuator);
  }

  rebase() {
    const held = [...this.saved.keys()];

    this.saved.clear();

    for (const a of held) this.syncRange(a);
  }

  reprime() {
    for (const lag of this.lags.values()) lag.primed = false;
  }

  apply(ctrl: MjData['ctrl']) {
    for (const [a, value] of this.held) ctrl[a] = value;

    for (const [a, lag] of this.lags) ctrl[a] = delayed(lag, ctrl[a]);
  }

  private strength(actuator: number): number {
    if (this.limpAll) return 0;

    const kind = this.kinds.get(actuator);

    return kind ? STRENGTH[kind] : 1;
  }

  private syncRange(actuator: number) {
    const scale = this.strength(actuator);
    const saved = this.saved.get(actuator);
    const at = actuator * 2;

    if (scale === 1) {
      this.restore(actuator, saved);

      return;
    }

    const base = saved ?? ([this.range[at], this.range[at + 1]] as [number, number]);

    this.saved.set(actuator, base);
    this.range[at] = base[0] * scale;
    this.range[at + 1] = base[1] * scale;
  }

  private restore(actuator: number, saved: [number, number] | undefined) {
    if (!saved) return;

    this.range[actuator * 2] = saved[0];
    this.range[actuator * 2 + 1] = saved[1];
    this.saved.delete(actuator);
  }
}

function delayed(lag: Lag, command: number): number {
  if (!lag.primed) {
    lag.line.fill(command);
    lag.primed = true;
  }

  const out = lag.line[lag.at];

  lag.line[lag.at] = command;
  lag.at = (lag.at + 1) % lag.line.length;

  return out;
}
