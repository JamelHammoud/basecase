import { expect, it } from 'vitest';
import type { Controller } from './engine';
import type { SimJoint, SimModel } from './mjcfTypes';
import { ControlTargets, controlValues } from './controlValues';
import type { RobotAnimation } from '../types/robotics';

const joints: SimJoint[] = ['shoulder', 'slide', 'wheel', 'passive'].map((id, i) => ({
  id,
  name: id,
  type: i === 1 ? 'prismatic' : 'revolute',
  robot: 'arm',
  drive: i === 2 ? 'velocity' : 'position',
  actuator: i === 3 ? -1 : i,
  effort: 3,
  effortSource: 'estimate',
  dynamics: 'estimated',
}));
const model: Pick<SimModel, 'joints' | 'initial'> = { joints, initial: { values: { shoulder: 17, slide: 12 } } };
const animation: RobotAnimation = {
  id: 'reach',
  name: 'Reach',
  duration: 4,
  loop: false,
  interpolation: 'linear',
  keyframes: [
    { t: 0, values: { shoulder: -60, slide: 5 } },
    { t: 1, values: { shoulder: 15 }, root: { position: [1, 2, 3], rotation: [10, 20, 30] } },
    { t: 1, values: { slide: 30, wheel: 100 } },
    { t: 3, values: { shoulder: 60, slide: 10 } },
  ],
};

function reference(controller: Controller, time: number): number[] {
  const values = controlValues(controller, time);
  const out = [0, 0, 0];

  for (const joint of joints) {
    if (joint.actuator < 0) continue;

    const value = values?.[joint.id] ?? model.initial.values[joint.id] ?? 0;
    const scaled = joint.type === 'revolute' ? value * (Math.PI / 180) : value / 1000;

    out[joint.actuator] = joint.drive === 'velocity' ? 0 : scaled;
  }

  return out;
}

const controllers: Controller[] = [
  { kind: 'hold', values: { slide: 8 } },
  { kind: 'animation', animation },
  { kind: 'animation', animation: { ...animation, loop: true } },
  { kind: 'animation', animation: { ...animation, interpolation: 'smooth' } },
  { kind: 'animation', animation: { ...animation, duration: 0 } },
  { kind: 'animation', animation: { ...animation, keyframes: [] } },
  { kind: 'animation', animation: { ...animation, keyframes: animation.keyframes.slice(0, 1) } },
];

it.each(controllers)('writes exactly the existing sampler controls for controller %#', (controller) => {
  const targets = new ControlTargets(model);
  const ctrl = new Float64Array(3);

  targets.set(controller);

  for (let i = -10; i <= 500; i++) {
    const time = i / 100;

    targets.apply(controller, time, ctrl);
    expect(Array.from(ctrl)).toEqual(reference(controller, time));
  }
});

it('rebuilds controls when the controller changes and leaves passive actuators untouched', () => {
  const targets = new ControlTargets(model);
  const ctrl = new Float64Array([0, 0, 0, 7]);

  for (const controller of controllers) {
    targets.set(controller);
    targets.apply(controller, 1.5, ctrl);
    expect(Array.from(ctrl).slice(0, 3)).toEqual(reference(controller, 1.5));
    expect(ctrl[3]).toBe(7);
  }
});
