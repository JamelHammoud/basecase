import type { Controller, SimEngine } from './engine';
import type { ContactForces, ForceChannel } from './contactForces';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

interface JawControl {
  actuator: number;
  address: number;
  sign: number;
  gain: number;
  rate: number;
  low: number;
  high: number;
  channel: number;
  target: number;
  force: number;
}

function closureDirections(controller: Controller): Map<string, number> {
  if (controller.kind !== 'drive') return new Map();

  const setup = controller.setup;
  const members = setup.kind === 'team' ? setup.members.map((member) => member.setup) : [setup];

  return new Map(
    members.flatMap((member) =>
      member.kind === 'arm'
        ? (member.grip?.jaws.map((jaw) => [jaw.joint, Math.sign(jaw.closed - jaw.open)] as const) ?? [])
        : [],
    ),
  );
}

export class ForceClosure {
  private readonly jaws: JawControl[];
  private readonly directions: Map<string, number>;
  private readonly engine: SimEngine;
  private readonly forces: ContactForces;

  constructor(engine: SimEngine, forces: ContactForces, controller: Controller) {
    this.engine = engine;
    this.directions = closureDirections(controller);
    this.forces = forces;
    this.jaws = forces.evidence.channels.flatMap((channel) => this.controls(channel));
  }

  private controls(channel: ForceChannel): JawControl[] {
    if (!channel.ceilingN) return [];

    const ceiling = channel.ceilingN;
    const { sim, data, model } = this.engine;
    const addresses = this.engine.jointAddresses();

    return channel.jaws.flatMap((body) => {
      const i = sim.joints.findIndex((joint) => joint.id === sim.bodies[body].joint);
      const joint = sim.joints[i];
      const channelIndex = this.forces.evidence.channels.findIndex(
        (c) => c.jaws.length === 1 && c.jaws[0] === body && JSON.stringify(c.target) === JSON.stringify(channel.target),
      );

      if (!joint?.range || joint.actuator < 0 || joint.drive !== 'position' || channelIndex < 0) return [];

      const unit = joint.type === 'prismatic' ? 0.001 : Math.PI / 180;
      const [low, high] = joint.range.map((n) => n * unit);
      const sign = this.directions.get(joint.id);

      if (!sign) return [];

      return [
        {
          actuator: joint.actuator,
          address: addresses[i],
          sign,
          gain: Math.max(1, model.actuator_gainprm[joint.actuator * 10]),
          rate: (joint.type === 'prismatic' ? 5 : 30) * unit,
          low,
          high,
          channel: channelIndex,
          target: data.qpos[addresses[i]],
          force: (ceiling * 0.35) / channel.jaws.length,
        },
      ];
    });
  }

  apply() {
    const { data, dt } = this.engine;
    const ctrl = data.ctrl;
    const qpos = data.qpos;

    for (const jaw of this.jaws) {
      const requested = ctrl[jaw.actuator];
      const opening = requested * jaw.sign <= qpos[jaw.address] * jaw.sign;

      if (opening) {
        jaw.target = clamp(requested, jaw.low, jaw.high);
        ctrl[jaw.actuator] = jaw.target;

        continue;
      }

      const measured = this.forces.values[jaw.channel];
      const error = jaw.force - measured;
      const change = measured === 0 ? jaw.rate * dt : clamp((error / jaw.gain) * 0.2, -jaw.rate * dt, jaw.rate * dt);
      const limit = requested * jaw.sign;

      jaw.target = clamp(Math.min(jaw.target * jaw.sign + change, limit) * jaw.sign, jaw.low, jaw.high);
      ctrl[jaw.actuator] = jaw.target;
    }
  }
}
