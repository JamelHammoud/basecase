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

it.each([0.002, 0.001])('reuses exact sampled commands at timestep %s and falls back for other clocks', (dt) => {
  const targets = new ControlTargets(model, dt);
  const ctrl = new Float64Array([0, 0, 0, 7]);
  const controller: Controller = { kind: 'animation', animation };

  targets.set(controller);

  let time = 0;

  for (let i = 0; i < 4100; i++) {
    targets.apply(controller, time, ctrl);
    expect(Array.from(ctrl).slice(0, 3)).toEqual(reference(controller, time));
    expect(ctrl[3]).toBe(7);
    time += dt;
  }

  for (const time of [0.0001, -1, 1.000001, 1, 0, 100]) {
    targets.apply(controller, time, ctrl);
    expect(Array.from(ctrl).slice(0, 3)).toEqual(reference(controller, time));
  }

  targets.set(controllers[0]);
  targets.apply(controllers[0], 0.5, ctrl);
  expect(Array.from(ctrl).slice(0, 3)).toEqual(reference(controllers[0], 0.5));
});

it('bounds command sampling and keeps model-specific fallback coordinates separate', () => {
  const long: Controller = { kind: 'animation', animation: { ...animation, duration: 1e9 } };
  const first = new ControlTargets(model, 0.002);
  const changed = { ...model, initial: { values: { shoulder: -23, slide: 42 } } };
  const second = new ControlTargets(changed, 0.002);
  const controller: Controller = { kind: 'animation', animation };
  const a = new Float64Array(3);
  const b = new Float64Array(3);

  first.set(long);
  first.apply(long, 0.5, a);
  expect(Array.from(a)).toEqual(reference(long, 0.5));
  first.set(controller);
  second.set(controller);
  first.apply(controller, 1, a);
  second.apply(controller, 1, b);
  expect(a[0]).toBe(17 * (Math.PI / 180));
  expect(b[0]).toBe(-23 * (Math.PI / 180));
});
