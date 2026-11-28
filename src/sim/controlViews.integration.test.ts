import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { SimEngine } from './engine';
import { forceFixture } from './fixtures/gripForce';

function expectControlViews(mj: MainModule, baseline: SimEngine) {
  const observed = new SimEngine(mj, forceFixture());

  try {
    let controlReads = 0;
    const data = new Proxy(observed.data, {
      get(target, key) {
        if (key === 'ctrl') controlReads++;

        return Reflect.get(target, key, target);
      },
    });

    Object.defineProperty(observed, 'data', { value: data });
    baseline.setController({ kind: 'hold', values: { left: 14, right: 14, otherLeft: 18, otherRight: 18 } });
    observed.setController({ kind: 'hold', values: { left: 14, right: 14, otherLeft: 18, otherRight: 18 } });
    baseline.step(baseline.dt);
    controlReads = 0;
    observed.step(observed.dt);
    expect(controlReads).toBe(2);
    expect(observed.data.ctrl).toEqual(baseline.data.ctrl);
    expect(observed.data.qpos).toEqual(baseline.data.qpos);
    expect(observed.data.qvel).toEqual(baseline.data.qvel);
    expect(observed.contactPairs()).toEqual(baseline.contactPairs());
  } finally {
    observed.dispose();
  }
}

it('reads native controls once per hold update without changing solved physics', async () => {
  const mj = await loadMujoco();
  const baseline = new SimEngine(mj, forceFixture());

  try {
    expectControlViews(mj, baseline);
  } finally {
    baseline.dispose();
  }
});
