import type { MjData, MjModel } from '@mujoco/mujoco';
import { hashOf, sha256Hex } from '../skills/hash';
import { isRunnablePolicy } from '../skills/policyCheck';
import { createDrive, type ArmSetup, type DriveCommand, type DriveLoop } from './drive';
import type { Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { PolicySpec } from './policy';
import { stepPolicy, type PolicyState } from './policyStep';
import type { JointValues } from '../types/robotics';

export type ActionOwner = 'policy' | 'operator';
export type AppliedOwner = ActionOwner | 'context';

export interface TeachingSource {
  skill?: string;
  policy: string;
  model: string;
  robot: string;
  fingerprint: string;
  joints: string[];
  defaultPose: number[];
  actionScale: number;
  controlDt: number;
  physicsDt: number;
  command: [number, number, number];
}

interface TeachingInput {
  controller: Controller;
  state: PolicyState | null;
  setup: ArmSetup;
  sim: SimModel;
}

function supportedPolicy(controller: Extract<Controller, { kind: 'policy' }>) {
  const { policy } = controller;

  return (
    !controller.pose &&
    !controller.hold &&
    !policy.clock &&
    !policy.eyes?.length &&
    isRunnablePolicy(policy) &&
    policy.actionScale > 0
  );
}

function supportedJoints(sim: SimModel, policy: PolicySpec) {
  const joints = sim.joints.filter((joint) => joint.actuator >= 0);

  return (
    !sim.joints.some((joint) => joint.tendon || joint.loop) &&
    joints.length > 0 &&
    joints.every((joint, i) => joint.drive === 'position' && joint.id === policy.joints[i]) &&
    policy.joints.length === joints.length
  );
}

function supported(input: Omit<TeachingInput, 'state'>): input is Omit<TeachingInput, 'state'> & {
  controller: Extract<Controller, { kind: 'policy' }>;
} {
  const { controller, sim, setup } = input;
  const robot = sim.robots[0];

  if (controller.kind !== 'policy' || !robot || sim.robots.length !== 1) return false;

  const { policy } = controller;

  return (
    setup.kind === 'arm' &&
    setup.robot === robot.key &&
    controller.robot === robot.key &&
    !robot.floating &&
    robot.morphology === 'fixed' &&
    supportedPolicy(controller) &&
    supportedJoints(sim, policy) &&
    setup.joints.every((id) => policy.joints.includes(id))
  );
}

export function assertTeaching(input: Omit<TeachingInput, 'state'>, dt: number) {
  if (!supported(input) || input.controller.policy.controlDt < dt)
    throw new Error('Choose a fixed-arm policy with matching vector observations and joint order.');
}

export class TeachingControl {
  readonly source: TeachingSource;
  readonly previous: Float32Array;
  owner: ActionOwner = 'policy';
  private drive: DriveLoop | null = null;
  private readonly setup: ArmSetup;
  private readonly policy: PolicySpec;
  private readonly state: PolicyState;
  private readonly joints: SimModel['joints'];

  constructor(input: TeachingInput, physicsDt: number) {
    if (!supported(input) || !input.state || input.controller.policy.controlDt < physicsDt)
      throw new Error('Choose a fixed-arm policy with matching vector observations and joint order.');

    const { controller, state, sim, setup } = input;

    this.policy = controller.policy;
    this.state = state;
    this.setup = setup;
    this.joints = sim.joints.filter((joint) => joint.actuator >= 0);
    this.previous = new Float32Array(this.policy.joints.length);
    this.source = {
      policy: hashOf(this.policy),
      model: sha256Hex(sim.xml),
      robot: controller.robot,
      fingerprint: sim.robots[0].fingerprint,
      joints: [...this.policy.joints],
      defaultPose: [...this.policy.defaultPose],
      actionScale: this.policy.actionScale,
      controlDt: this.policy.controlDt,
      physicsDt,
      command: [...state.command],
    };
  }

  handoff(owner: ActionOwner, data: MjData) {
    if (owner === this.owner) return;

    const start = Object.fromEntries(
      this.joints.map((joint, i) => [
        joint.id,
        data.qpos[this.state.src.jointQpos[i]] / (joint.type === 'revolute' ? Math.PI / 180 : 0.001),
      ]),
    );

    this.drive = owner === 'operator' ? createDrive({ ...this.setup, start }) : null;
    this.state.nextAt = data.time;
    this.owner = owner;
  }

  initialize(data: MjData, model: MjModel) {
    this.applied(data, model);
  }

  command(command: DriveCommand, measured: JointValues) {
    this.drive?.command(command, measured);
  }

  apply(data: MjData) {
    this.previous.set(this.state.action);

    if (!this.drive) {
      stepPolicy(this.policy, this.state, data);
      this.state.actuators.forEach((actuator, i) => (data.ctrl[actuator] = this.state.targets[i]));

      return;
    }

    const { values } = this.drive.tick(data.time);

    this.joints.forEach((joint, i) => {
      const scale = joint.type === 'revolute' ? Math.PI / 180 : 0.001;

      data.ctrl[joint.actuator] = (values?.[joint.id] ?? this.setup.start[joint.id] ?? 0) * scale;
      this.state.targets[i] = data.ctrl[joint.actuator];
    });
    this.state.nextAt = data.time + this.policy.controlDt;
  }

  applied(data: MjData, model: MjModel) {
    this.state.actuators.forEach((actuator, i) => {
      const at = actuator * 2;
      const target = data.ctrl[actuator];
      const limited = model.actuator_ctrllimited[actuator]
        ? Math.max(model.actuator_ctrlrange[at], Math.min(model.actuator_ctrlrange[at + 1], target))
        : target;

      data.ctrl[actuator] = limited;
      this.state.action[i] = (limited - this.policy.defaultPose[i]) / this.policy.actionScale;
    });
  }
}
