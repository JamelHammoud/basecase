import { sampleAnimation } from '../utils/animation';
import type { Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import { timeIndex } from '../utils/timeIndex';

export const jointQposOf = (type: 'revolute' | 'prismatic', value: number) =>
  type === 'revolute' ? value * (Math.PI / 180) : value / 1000;

interface ControlSpan {
  from: Float64Array;
  to: Float64Array;
  present: Uint8Array;
}

export class ControlTargets {
  private readonly sim: Pick<SimModel, 'joints' | 'initial'>;
  private linear: RobotAnimation | null = null;
  private spans: ControlSpan[] = [];

  constructor(sim: Pick<SimModel, 'joints' | 'initial'>) {
    this.sim = sim;
  }

  set(controller: Controller) {
    const animation = controller.kind === 'animation' ? controller.animation : null;

    this.linear =
      animation && animation.interpolation !== 'smooth' && !animation.loop && animation.keyframes.length >= 2
        ? animation
        : null;
    this.spans =
      this.linear?.keyframes.slice(0, -1).map((a, i) => {
        const b = this.linear!.keyframes[i + 1];
        const present = Uint8Array.from(this.sim.joints.map((j) => Number(Object.hasOwn(a.values, j.id))));
        const from = Float64Array.from(this.sim.joints.map((j) => a.values[j.id]));
        const to = Float64Array.from(this.sim.joints.map((j) => b.values[j.id] ?? a.values[j.id]));

        return { present, from, to };
      }) ?? [];
  }

  targetFor(i: number, values?: Record<string, number>): number {
    const joint = this.sim.joints[i];

    if (joint.drive === 'velocity') return 0;

    return jointQposOf(joint.type, values?.[joint.id] ?? this.sim.initial.values[joint.id] ?? 0);
  }

  apply(controller: Controller, time: number, ctrl: Float64Array) {
    if (this.linear) {
      this.applyLinear(time, ctrl);

      return;
    }

    const values = controlValues(controller, time);

    this.sim.joints.forEach((joint, i) => {
      if (joint.actuator >= 0) ctrl[joint.actuator] = this.targetFor(i, values);
    });
  }

  private applyLinear(t: number, ctrl: Float64Array) {
    const animation = this.linear!;
    const keys = animation.keyframes;
    const time = Math.min(Math.max(t, 0), Math.max(animation.duration, keys.at(-1)!.t, 1e-3));
    const at = Math.min(Math.max(timeIndex(keys, time, 'after') - 1, 0), keys.length - 2);
    const duration = keys[at + 1].t - keys[at].t;
    const u = duration > 0 ? Math.min(Math.max((time - keys[at].t) / duration, 0), 1) : 0;
    const span = this.spans[at];

    this.sim.joints.forEach((joint, i) => {
      if (joint.actuator < 0) return;

      const value = span.from[i] + (span.to[i] - span.from[i]) * u;
      const target = span.present[i] && joint.drive !== 'velocity' ? jointQposOf(joint.type, value) : this.targetFor(i);

      ctrl[joint.actuator] = target;
    });
  }
}

export function controlValues(c: Controller, time: number): Record<string, number> | undefined {
  if (c.kind === 'hold') return c.values;

  if (c.kind === 'animation') return sampleAnimation(c.animation, time).values;

  return c.kind === 'policy' ? c.hold : undefined;
}
