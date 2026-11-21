import type { DriveCommand } from './drive';
import type { DriveState } from './driveState';
import type { Controller } from './engine';
import type { ActuatorFaultState } from './faults';

export const REALIZED_FIELDS = [
  'geom_friction',
  'body_mass',
  'body_inertia',
  'actuator_forcerange',
  'actuator_gainprm',
  'actuator_biasprm',
  'actuator_delay',
  'dof_damping',
  'dof_armature',
  'dof_frictionloss',
  'jnt_stiffness',
  'qpos_spring',
  'geom_contype',
  'geom_conaffinity',
  'geom_rgba',
] as const;

type Realized = Record<(typeof REALIZED_FIELDS)[number], Float64Array>;

export interface EngineContinuationState {
  version: 1;
  mujoco: number;
  signature: number;
  modelVersion: number;
  modelHash: string;
  integration: Float64Array;
  realized: Realized;
  disableflags: number;
  controller: Controller;
  drive: DriveState | null;
  faults: ActuatorFaultState;
  peaks: Float64Array;
  saturated: Float64Array;
  fellAt: Array<[string, number]>;
  origins: Array<{ startZ: number; startXY: [number, number] }>;
  given: DriveCommand[];
}
