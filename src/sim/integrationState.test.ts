import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimEngine } from './engine';
import { contactSliders } from './fixtures/contactRobots';
import { box } from './fixtures/parts';
import { integrationState, restoreIntegrationState } from './integrationState';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const control = (tick: number) => 0.003 + Math.sin(tick * 0.2) * 0.0015;

function delayedContactModel(delay: number) {
  const model = contactSliders(1, [{ ...box('stop', [39.8, 20, 0], [40, 40, 40], 100), behavior: 'static' }]);

  return {
    ...model,
    xml: model.xml.replace('<position ', `<position delay="${delay}" nsample="16" interp="linear" `),
  };
}

describe('MuJoCo integration state', () => {
  it.each([0, 0.006, 0.02])('continues contact physics through a %s second native servo delay', (delay) => {
    const model = delayedContactModel(delay);
    const original = new SimEngine(mj, model);
    const restored = new SimEngine(mj, model);

    try {
      for (let tick = 0; tick < 40; tick++) {
        original.data.ctrl[0] = control(tick);
        mj.mj_step(original.model, original.data);
      }

      const state = integrationState(mj, original.model, original.data);
      const unchanged = state.slice();

      expect(original.data.ncon).toBeGreaterThan(0);
      expect(restoreIntegrationState({ mj, model: restored.model, data: restored.data }, state)).toBe(true);
      expect(integrationState(mj, restored.model, restored.data)).toEqual(state);

      for (let tick = 40; tick < 140; tick++) {
        original.data.ctrl[0] = control(tick);
        restored.data.ctrl[0] = control(tick);
        mj.mj_step(original.model, original.data);
        mj.mj_step(restored.model, restored.data);
        expect(restored.data.qpos).toEqual(original.data.qpos);
        expect(restored.data.qvel).toEqual(original.data.qvel);
        expect(restored.data.history).toEqual(original.data.history);
        expect(restored.contactPairs()).toEqual(original.contactPairs());
        expect(integrationState(mj, restored.model, restored.data)).toEqual(
          integrationState(mj, original.model, original.data),
        );
      }

      expect(state).toEqual(unchanged);
    } finally {
      original.dispose();
      restored.dispose();
    }
  });

  it('rejects malformed state before changing the destination', () => {
    const engine = new SimEngine(mj, contactSliders(1));

    try {
      const state = integrationState(mj, engine.model, engine.data);
      const nonfinite = state.slice();

      nonfinite[0] = NaN;

      for (const malformed of [state.subarray(1), new Float64Array(state.length + 1), nonfinite]) {
        expect(restoreIntegrationState({ mj, model: engine.model, data: engine.data }, malformed)).toBe(false);
        expect(integrationState(mj, engine.model, engine.data)).toEqual(state);
      }
    } finally {
      engine.dispose();
    }
  });

  it('retains independent state after the source engine is disposed', () => {
    const model = contactSliders(1);
    const original = new SimEngine(mj, model);

    original.step(0.1);

    const state = integrationState(mj, original.model, original.data);
    const copy = state.slice();

    original.dispose();

    const restored = new SimEngine(mj, model);

    try {
      expect(restoreIntegrationState({ mj, model: restored.model, data: restored.data }, state)).toBe(true);
      expect(integrationState(mj, restored.model, restored.data)).toEqual(copy);
    } finally {
      restored.dispose();
    }
  });
});
