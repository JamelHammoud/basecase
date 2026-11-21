import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { ControlDelay } from './controlDelay';
import { SimEngine } from './engine';
import { ActuatorFaults, FAULT_KINDS } from './faults';
import { contactSliders } from './fixtures/contactRobots';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('continuation state outside MuJoCo', () => {
  it.each([0, 1, 20])('preserves a %i step control delay at startup and after wrapping', (steps) => {
    for (const checkpointAt of [0, 1, 19, 44]) {
      const original = new ControlDelay();
      const restored = new ControlDelay();
      const ctrl = Float64Array.from([1, -2, 3]);

      original.reset(steps);

      for (let tick = 0; tick < checkpointAt; tick++) {
        ctrl.fill(tick);
        original.apply(ctrl);
      }

      const state = original.snapshot();
      const unchanged = structuredClone(state);

      restored.restore(state);

      for (let tick = checkpointAt; tick < checkpointAt + 60; tick++) {
        const next = Float64Array.from([tick, -tick, tick / 2]);
        const copy = next.slice();

        original.apply(next);
        restored.apply(copy);
        expect(copy).toEqual(next);
      }

      expect(state).toEqual(unchanged);
      original.reset();
      expect(state).toEqual(unchanged);
    }
  });

  it.each(FAULT_KINDS)('retains %s fault state through commands, clearing and limp mode', (kind) => {
    const model = contactSliders(1);
    const original = new SimEngine(mj, model);
    const restored = new SimEngine(mj, model);
    const faults = new ActuatorFaults(original.model);
    const continued = new ActuatorFaults(restored.model);
    const baseline = Float64Array.from(original.model.actuator_forcerange);

    try {
      faults.set(0, kind, 0.17);

      for (let tick = 0; tick < 45; tick++) {
        original.data.ctrl[0] = tick / 100;
        faults.apply(original.data.ctrl);
      }

      const state = faults.snapshot();
      const unchanged = structuredClone(state);

      continued.restore(state);
      expect(continued.kindOf(0)).toBe(kind);
      expect(restored.model.actuator_forcerange).toEqual(original.model.actuator_forcerange);

      for (let tick = 45; tick < 100; tick++) {
        original.data.ctrl[0] = tick / 100;
        restored.data.ctrl[0] = tick / 100;
        faults.apply(original.data.ctrl);
        continued.apply(restored.data.ctrl);
        expect(restored.data.ctrl).toEqual(original.data.ctrl);
      }

      faults.setLimpAll(true);
      continued.setLimpAll(true);
      faults.set(0, null, 0);
      continued.set(0, null, 0);
      faults.setLimpAll(false);
      continued.setLimpAll(false);
      expect(restored.model.actuator_forcerange).toEqual(original.model.actuator_forcerange);
      expect(restored.model.actuator_forcerange).toEqual(baseline);
      expect(state).toEqual(unchanged);
    } finally {
      original.dispose();
      restored.dispose();
    }
  });
});
