import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { hashOf } from '../skills/hash';
import { createDrive, type DriveCommand, type DriveLoop } from './drive';
import { continuationDriveClass } from './continuationDrive';
import type { Controller } from './engine';
import type { EngineRobot } from './engineReadout';
import { LAG_S, type ActuatorFaults } from './faults';
import { integrationState, restoreIntegrationState } from './integrationState';
import type { SimModel } from './mjcfTypes';
import { readEngineContinuation } from './continuationStateReader';
import { REALIZED_FIELDS, type EngineContinuationState } from './engineContinuationState';

export type { EngineContinuationState } from './engineContinuationState';

interface Runtime {
  controller: Controller;
  drive: DriveLoop | null;
  faults: ActuatorFaults;
  peaks: Float64Array;
  saturated: Float64Array;
  fellAt: Map<string, number>;
  robots: EngineRobot[];
  given: Map<number, DriveCommand>;
}

interface Host {
  mj: MainModule;
  sim: SimModel;
  model: MjModel;
  data: MjData;
  busy: () => boolean;
  runtime: () => Runtime;
  setController: (controller: Controller) => void;
}

const supported = (controller: Controller) =>
  controller.kind === 'hold' || controller.kind === 'limp' || continuationDriveClass(controller) !== null;

const finiteRow = (row: Float64Array, length: number) =>
  row instanceof Float64Array && row.length === length && row.every(Number.isFinite);

function faultStateFits(state: EngineContinuationState, model: MjModel): boolean {
  const { faults } = state;
  const kinds = new Map(faults.kinds);
  const held = new Map(faults.held);
  const lags = new Map(faults.lags);
  const steps = Math.max(1, Math.round(LAG_S / model.opt.timestep));
  const complete = faults.kinds.every(
    ([id, kind]) => (kind !== 'stuck' || held.has(id)) && (kind !== 'laggy' || lags.has(id)),
  );

  return (
    complete &&
    faults.held.every(([id]) => kinds.get(id) === 'stuck') &&
    faults.lags.every(([id, lag]) => kinds.get(id) === 'laggy' && lag.line.length === steps) &&
    faults.range.every((v, i) => state.realized.actuator_forcerange[i] === v)
  );
}

function driveStateFits(state: EngineContinuationState): boolean {
  if (state.controller.kind !== 'drive') return state.drive === null;

  try {
    return !!state.drive && !!createDrive(state.controller.setup).restore?.(state.drive);
  } catch {
    return false;
  }
}

function realizedStateFits(state: EngineContinuationState): boolean {
  const { realized } = state;
  const positive = [
    'body_mass',
    'body_inertia',
    'geom_friction',
    'actuator_delay',
    'dof_damping',
    'dof_armature',
    'dof_frictionloss',
    'jnt_stiffness',
  ] as const;
  const masks = ['geom_contype', 'geom_conaffinity'] as const;

  if (!positive.every((key) => realized[key].every((value) => value >= 0))) return false;

  if (
    !masks.every((key) => realized[key].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff))
  )
    return false;

  return (
    realized.geom_rgba.every((value) => value >= 0 && value <= 1) &&
    realized.actuator_forcerange.every((value, i, range) => i % 2 !== 0 || value <= range[i + 1])
  );
}

export class EngineContinuation {
  private readonly host: Host;
  private sourceHash: string | null = null;

  constructor(host: Host) {
    this.host = host;
  }

  private get modelHash(): string {
    this.sourceHash ??= hashOf(this.host.sim);

    return this.sourceHash;
  }

  capture(): EngineContinuationState | null {
    const { mj, model, data, sim } = this.host;
    const runtime = this.host.runtime();
    const drive = runtime.drive?.snapshot?.() ?? null;

    if (this.host.busy() || sim.robots.length !== 1 || !supported(runtime.controller)) return null;

    if (runtime.controller.kind === 'drive' && !drive) return null;

    return structuredClone({
      version: 1,
      mujoco: mj.mj_version(),
      signature: mj.mjtState.mjSTATE_INTEGRATION.value,
      modelVersion: sim.version,
      modelHash: this.modelHash,
      integration: integrationState(mj, model, data),
      realized: Object.fromEntries(
        REALIZED_FIELDS.map((key) => [key, Float64Array.from(model[key])]),
      ) as EngineContinuationState['realized'],
      disableflags: model.opt.disableflags,
      controller: runtime.controller,
      drive,
      faults: runtime.faults.snapshot(),
      peaks: runtime.peaks,
      saturated: runtime.saturated,
      fellAt: [...runtime.fellAt],
      origins: runtime.robots.map(({ startZ, startXY }) => ({ startZ, startXY })),
      given: [...runtime.given.values()],
    });
  }

  accepts(state: EngineContinuationState): boolean {
    const { mj, model, sim } = this.host;

    if (this.host.busy() || !readEngineContinuation(state)) return false;

    if (!this.identityMatches(state)) return false;

    if (!supported(state.controller) || !finiteRow(state.integration, mj.mj_stateSize(model, state.signature)))
      return false;

    if (!REALIZED_FIELDS.every((key) => finiteRow(state.realized[key], model[key].length))) return false;

    if (![state.peaks, state.saturated].every((row) => finiteRow(row, sim.joints.length))) return false;

    if (state.origins.length !== sim.robots.length || !finiteRow(state.faults.range, model.nu * 2)) return false;

    if (!faultStateFits(state, model) || !realizedStateFits(state)) return false;

    return driveStateFits(state);
  }

  private identityMatches(state: EngineContinuationState): boolean {
    const { mj, sim } = this.host;

    return (
      state.version === 1 &&
      state.mujoco === mj.mj_version() &&
      state.modelVersion === sim.version &&
      state.modelHash === this.modelHash &&
      state.signature === mj.mjtState.mjSTATE_INTEGRATION.value
    );
  }

  restore(state: EngineContinuationState): boolean {
    if (!this.accepts(state)) return false;

    const { mj, model, data } = this.host;
    const copy = structuredClone(state);

    this.host.setController(copy.controller);

    const runtime = this.host.runtime();

    for (const key of REALIZED_FIELDS) model[key].set(copy.realized[key]);

    model.opt.disableflags = copy.disableflags;
    mj.mj_setConst(model, data);
    runtime.drive?.restore?.(copy.drive!);
    runtime.faults.restore(copy.faults);
    runtime.peaks.set(copy.peaks);
    runtime.saturated.set(copy.saturated);
    runtime.fellAt.clear();
    runtime.given.clear();

    for (const [key, at] of copy.fellAt) runtime.fellAt.set(key, at);

    for (const command of copy.given) runtime.given.set(command.slot ?? 0, command);

    runtime.robots.forEach((robot, i) => Object.assign(robot, copy.origins[i]));
    restoreIntegrationState({ mj, model, data }, copy.integration);
    mj.mj_forward(model, data);
    restoreIntegrationState({ mj, model, data }, copy.integration);

    return true;
  }
}
